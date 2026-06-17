use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::{path::PathBuf, time::Duration as StdDuration};

use crate::core::{
    CrawlerConfig, ReviewTarget, SourceConfig, SourceRun, SourceRunStatus, stable_id,
};
use crate::instances::CrawlerInstance;
use crate::instances::garbage::{EditorialFocus, NewsItem, ProjectQueryPlan};

pub static GREATHOUSE_CRAWLER_INSTANCE: GreathouseCrawlerInstance = GreathouseCrawlerInstance;

pub struct GreathouseCrawlerInstance;

impl CrawlerInstance for GreathouseCrawlerInstance {
    fn id(&self) -> &'static str {
        "greathouse"
    }

    fn verify_config(&self, config: &CrawlerConfig) -> Result<()> {
        verify_config(config)
    }

    fn read_editorial_focuses(&self, path: &PathBuf) -> Result<Vec<EditorialFocus>> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        crate::instances::garbage::read_editorial_focuses(path)
    }

    fn query_plans(
        &self,
        config: &CrawlerConfig,
        editorial_focuses: &[EditorialFocus],
    ) -> Vec<ProjectQueryPlan> {
        config
            .targets
            .iter()
            .map(|target| {
                let focus_terms = greathouse_focus_terms(target, editorial_focuses);
                ProjectQueryPlan {
                    project: target.name.clone(),
                    topic: target.topic.clone(),
                    hacker_news_query: greathouse_query(target, &focus_terms),
                    live_terms: greathouse_live_terms(target),
                    dev_to_tags: target.keywords.iter().take(3).cloned().collect(),
                    review_targets: review_targets(config, target),
                    focus_terms,
                }
            })
            .collect()
    }

    fn seed_items(&self, config: &CrawlerConfig) -> Result<Vec<NewsItem>> {
        greathouse_items(config)
    }

    fn seed_source_runs(&self, config: &CrawlerConfig, live: bool) -> Vec<SourceRun> {
        if live {
            return Vec::new();
        }
        config
            .sources
            .iter()
            .map(|source| SourceRun {
                source: source.name.clone(),
                kind: source.kind.clone(),
                status: SourceRunStatus::Skipped,
                item_count: 0,
                message: "run with --live to refresh this Greathouse source".to_string(),
                project_counts: Default::default(),
            })
            .collect()
    }

    fn collect_live_items(
        &self,
        config: &CrawlerConfig,
        _max_per_project: usize,
        _since: DateTime<Utc>,
        _editorial_focuses: &[EditorialFocus],
    ) -> Result<(Vec<NewsItem>, Vec<SourceRun>)> {
        let items = greathouse_items(config)?;
        let source_runs = source_runs_from_items(config, &items);
        Ok((items, source_runs))
    }

    fn dedupe_items(&self, items: Vec<NewsItem>) -> Vec<NewsItem> {
        let mut by_id = std::collections::BTreeMap::new();
        for item in items {
            by_id.entry(item.id.clone()).or_insert(item);
        }
        by_id.into_values().collect()
    }
}

fn verify_config(config: &CrawlerConfig) -> Result<()> {
    anyhow::ensure!(
        !config.targets.is_empty(),
        "Greathouse config must include search targets"
    );
    anyhow::ensure!(
        !config.sources.is_empty(),
        "Greathouse config must include listing or diagnostic sources"
    );
    for target in &config.targets {
        anyhow::ensure!(
            target.homepage.starts_with("https://"),
            "{} must have an https homepage",
            target.name
        );
        anyhow::ensure!(
            !target.keywords.is_empty(),
            "{} must have matching keywords",
            target.name
        );
    }
    for source in &config.sources {
        let adapter = source
            .adapter
            .as_deref()
            .with_context(|| format!("{} must configure adapter", source.name))?;
        anyhow::ensure!(
            matches!(
                adapter,
                "local-listing-json"
                    | "local-diagnostic-json"
                    | "http-listing-json"
                    | "http-diagnostic-json"
                    | "http-status-diagnostic"
                    | "redfin-listing-json"
            ),
            "{} uses unsupported Greathouse adapter {}",
            source.name,
            adapter
        );
        if adapter.starts_with("local-") || adapter == "redfin-listing-json" {
            let data_path = source.fixture_path.as_ref().with_context(|| {
                format!(
                    "{} must configure fixture_path for {}",
                    source.name, adapter
                )
            })?;
            anyhow::ensure!(
                data_path.exists(),
                "{} local adapter data file must exist at {}",
                source.name,
                data_path.display()
            );
        } else {
            anyhow::ensure!(
                source.url.starts_with("https://") || source.url.starts_with("http://127.0.0.1:"),
                "{} must have an https source URL, except loopback smoke adapters",
                source.name
            );
        }
    }
    Ok(())
}

fn greathouse_items(config: &CrawlerConfig) -> Result<Vec<NewsItem>> {
    let mut items = Vec::new();
    for source in &config.sources {
        items.extend(adapter_for_source(source)?.collect(config, source)?);
    }
    Ok(items)
}

fn greathouse_item(
    target: &crate::core::CollectionTarget,
    source: &SourceConfig,
    record: GreathouseLocalRecord,
    adapter: &str,
    index: usize,
) -> NewsItem {
    let observed_at = record.observed_at.unwrap_or_else(Utc::now);
    let evidence_url = record.url.clone();
    let is_diagnostic = source.kind == "diagnostic" || target.topic.contains("diagnostic");
    let title = record.title.unwrap_or_else(|| {
        if is_diagnostic {
            format!("{} source diagnostic", target.name)
        } else {
            format!("{} property candidate", target.name)
        }
    });
    let summary = record.summary.unwrap_or_else(|| {
        if is_diagnostic {
            format!(
                "{} records blocked-source evidence for retry and manual review.",
                target.name
            )
        } else {
            format!(
                "{} is a property-search candidate with comparable, location, and source-freshness signals.",
                target.name
            )
        }
    });
    let default_stage = if adapter.starts_with("http-") {
        "live_http"
    } else {
        "local_json"
    };
    let stage = record.stage.as_deref().unwrap_or(default_stage);
    let mut tags = record.tags;
    if tags.is_empty() {
        tags = target.keywords.iter().take(4).cloned().collect();
    }
    tags.push(source.kind.clone());
    NewsItem {
        id: stable_id("greathouse", &format!("{}:{evidence_url}", target.name)),
        title,
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: evidence_url.clone(),
        published_at: observed_at,
        project: target.name.clone(),
        topic: target.topic.clone(),
        summary,
        why_it_matters: if is_diagnostic {
            "Greathouse keeps blocked-source diagnostics as first-class collection records instead of hiding crawler failures.".to_string()
        } else {
            "Greathouse needs normalized listing evidence that can be compared, reviewed, and reloaded through Verdun's generic database contract.".to_string()
        },
        tags,
        score: record.score.unwrap_or(70 + (index as i32 * 5).min(20)),
        raw_json: serde_json::json!({
            "collection_stage": stage,
            "property": record.property_json,
            "provenance": {
                "stage": stage,
                "adapter": adapter,
                "source": source.name,
                "source_kind": source.kind,
                "source_url": source.url,
                "evidence_url": evidence_url,
                "subject": target.name,
                "matched_keywords": target.keywords,
            },
            "instance": "greathouse"
        }),
    }
}

trait GreathouseSourceAdapter {
    fn adapter_name(&self) -> &'static str;
    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>>;
}

struct LocalJsonSourceAdapter {
    adapter: &'static str,
}

struct HttpJsonSourceAdapter {
    adapter: &'static str,
}

struct HttpStatusDiagnosticAdapter;

struct RedfinListingJsonAdapter;

impl GreathouseSourceAdapter for LocalJsonSourceAdapter {
    fn adapter_name(&self) -> &'static str {
        self.adapter
    }

    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>> {
        let path = source
            .fixture_path
            .as_ref()
            .with_context(|| format!("{} has no fixture_path configured", source.name))?;
        let records: Vec<GreathouseLocalRecord> = serde_json::from_slice(
            &std::fs::read(path).with_context(|| format!("reading {}", path.display()))?,
        )
        .with_context(|| format!("parsing {}", path.display()))?;
        records
            .into_iter()
            .enumerate()
            .map(|(index, record)| {
                let target = config
                    .targets
                    .iter()
                    .find(|target| target.name == record.subject)
                    .with_context(|| {
                        format!(
                            "{} local adapter data references unknown subject {}",
                            source.name, record.subject
                        )
                    })?;
                Ok(greathouse_item(
                    target,
                    source,
                    record,
                    self.adapter_name(),
                    index,
                ))
            })
            .collect()
    }
}

impl GreathouseSourceAdapter for HttpJsonSourceAdapter {
    fn adapter_name(&self) -> &'static str {
        self.adapter
    }

    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>> {
        let client = Client::builder()
            .user_agent("verdun-crawler/0.1 greathouse")
            .timeout(StdDuration::from_secs(15))
            .build()?;
        let response = client
            .get(&source.url)
            .send()
            .with_context(|| format!("fetching {}", source.url))?;
        let status = response.status();
        anyhow::ensure!(
            status.is_success(),
            "{} HTTP adapter returned {}",
            source.name,
            status
        );
        let records: Vec<GreathouseLocalRecord> = response
            .json()
            .with_context(|| format!("parsing HTTP JSON from {}", source.url))?;
        records
            .into_iter()
            .enumerate()
            .map(|(index, record)| {
                let target = config
                    .targets
                    .iter()
                    .find(|target| target.name == record.subject)
                    .with_context(|| {
                        format!(
                            "{} HTTP adapter data references unknown subject {}",
                            source.name, record.subject
                        )
                    })?;
                Ok(greathouse_item(
                    target,
                    source,
                    record,
                    self.adapter_name(),
                    index,
                ))
            })
            .collect()
    }
}

impl GreathouseSourceAdapter for HttpStatusDiagnosticAdapter {
    fn adapter_name(&self) -> &'static str {
        "http-status-diagnostic"
    }

    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>> {
        let client = Client::builder()
            .user_agent("verdun-crawler/0.1 greathouse")
            .timeout(StdDuration::from_secs(15))
            .build()?;
        let target = diagnostic_target(config).with_context(|| {
            format!(
                "{} status diagnostic has no configured Greathouse target",
                source.name
            )
        })?;
        let observed_at = Utc::now();
        let record = match client.get(&source.url).send() {
            Ok(response) => {
                let status = response.status();
                let stage = if status.is_success() {
                    "live_http"
                } else {
                    "blocked_http"
                };
                GreathouseLocalRecord {
                    subject: target.name.clone(),
                    url: source.url.clone(),
                    title: Some(format!("{} HTTP status {}", source.name, status.as_u16())),
                    observed_at: Some(observed_at),
                    summary: Some(format!(
                        "{} returned HTTP {} during Greathouse source diagnostics.",
                        source.url, status
                    )),
                    tags: vec![
                        "http-status".to_string(),
                        if status.is_success() {
                            "reachable".to_string()
                        } else {
                            "blocked-source".to_string()
                        },
                    ],
                    score: Some(if status.is_success() { 50 } else { 82 }),
                    stage: Some(stage.to_string()),
                    property_json: serde_json::Value::Null,
                }
            }
            Err(error) => GreathouseLocalRecord {
                subject: target.name.clone(),
                url: source.url.clone(),
                title: Some(format!("{} HTTP status probe failed", source.name)),
                observed_at: Some(observed_at),
                summary: Some(format!(
                    "{} could not be reached during Greathouse source diagnostics: {}.",
                    source.url, error
                )),
                tags: vec!["http-status".to_string(), "blocked-source".to_string()],
                score: Some(84),
                stage: Some("blocked_http".to_string()),
                property_json: serde_json::Value::Null,
            },
        };
        Ok(vec![greathouse_item(
            target,
            source,
            record,
            self.adapter_name(),
            0,
        )])
    }
}

impl GreathouseSourceAdapter for RedfinListingJsonAdapter {
    fn adapter_name(&self) -> &'static str {
        "redfin-listing-json"
    }

    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>> {
        let path = source
            .fixture_path
            .as_ref()
            .with_context(|| format!("{} has no fixture_path configured", source.name))?;
        let records: Vec<RedfinListingRecord> = serde_json::from_slice(
            &std::fs::read(path).with_context(|| format!("reading {}", path.display()))?,
        )
        .with_context(|| format!("parsing Redfin listing JSON from {}", path.display()))?;
        records
            .into_iter()
            .enumerate()
            .map(|(index, record)| {
                let subject = record.subject.clone();
                let target = config
                    .targets
                    .iter()
                    .find(|target| target.name == subject)
                    .with_context(|| {
                        format!(
                            "{} Redfin adapter data references unknown subject {}",
                            source.name, subject
                        )
                    })?;
                Ok(greathouse_item(
                    target,
                    source,
                    record.into_local_record(),
                    self.adapter_name(),
                    index,
                ))
            })
            .collect()
    }
}

static LOCAL_LISTING_JSON_ADAPTER: LocalJsonSourceAdapter = LocalJsonSourceAdapter {
    adapter: "local-listing-json",
};
static LOCAL_DIAGNOSTIC_JSON_ADAPTER: LocalJsonSourceAdapter = LocalJsonSourceAdapter {
    adapter: "local-diagnostic-json",
};
static HTTP_LISTING_JSON_ADAPTER: HttpJsonSourceAdapter = HttpJsonSourceAdapter {
    adapter: "http-listing-json",
};
static HTTP_DIAGNOSTIC_JSON_ADAPTER: HttpJsonSourceAdapter = HttpJsonSourceAdapter {
    adapter: "http-diagnostic-json",
};
static HTTP_STATUS_DIAGNOSTIC_ADAPTER: HttpStatusDiagnosticAdapter = HttpStatusDiagnosticAdapter;
static REDFIN_LISTING_JSON_ADAPTER: RedfinListingJsonAdapter = RedfinListingJsonAdapter;

fn adapter_for_source(source: &SourceConfig) -> Result<&'static dyn GreathouseSourceAdapter> {
    match source.adapter.as_deref() {
        Some("local-listing-json") => Ok(&LOCAL_LISTING_JSON_ADAPTER),
        Some("local-diagnostic-json") => Ok(&LOCAL_DIAGNOSTIC_JSON_ADAPTER),
        Some("http-listing-json") => Ok(&HTTP_LISTING_JSON_ADAPTER),
        Some("http-diagnostic-json") => Ok(&HTTP_DIAGNOSTIC_JSON_ADAPTER),
        Some("http-status-diagnostic") => Ok(&HTTP_STATUS_DIAGNOSTIC_ADAPTER),
        Some("redfin-listing-json") => Ok(&REDFIN_LISTING_JSON_ADAPTER),
        Some(adapter) => anyhow::bail!(
            "{} uses unsupported Greathouse adapter {}",
            source.name,
            adapter
        ),
        None => anyhow::bail!("{} must configure adapter", source.name),
    }
}

fn source_runs_from_items(config: &CrawlerConfig, items: &[NewsItem]) -> Vec<SourceRun> {
    config
        .sources
        .iter()
        .map(|source| {
            let item_count = items
                .iter()
                .filter(|item| item.source == source.name)
                .count();
            SourceRun {
                source: source.name.clone(),
                kind: source.kind.clone(),
                status: if source.kind == "diagnostic" {
                    SourceRunStatus::Error
                } else {
                    SourceRunStatus::Ok
                },
                item_count,
                message: source_run_message(source),
                project_counts: project_counts_for_source(items, &source.name),
            }
        })
        .collect()
}

fn source_run_message(source: &SourceConfig) -> String {
    let adapter = source.adapter.as_deref().unwrap_or("missing-adapter");
    if adapter == "http-status-diagnostic" {
        "HTTP status diagnostic adapter retained source reachability evidence for retry".to_string()
    } else if adapter == "redfin-listing-json" {
        "Redfin listing adapter normalized property evidence from external crawler output"
            .to_string()
    } else if adapter.starts_with("http-") && source.kind == "diagnostic" {
        "HTTP diagnostic adapter retained blocked-source evidence for retry".to_string()
    } else if adapter.starts_with("http-") {
        "HTTP listing adapter loaded through the Greathouse crawler instance".to_string()
    } else if source.kind == "diagnostic" {
        "local diagnostic JSON retained blocked-source evidence for retry".to_string()
    } else {
        "local listing JSON loaded through the Greathouse crawler instance".to_string()
    }
}

fn project_counts_for_source(items: &[NewsItem], source_name: &str) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for item in items.iter().filter(|item| item.source == source_name) {
        *counts.entry(item.project.clone()).or_insert(0) += 1;
    }
    counts
}

fn diagnostic_target(config: &CrawlerConfig) -> Option<&crate::core::CollectionTarget> {
    config
        .targets
        .iter()
        .find(|target| target.topic.contains("diagnostic"))
        .or_else(|| config.targets.first())
}

fn review_targets(
    config: &CrawlerConfig,
    target: &crate::core::CollectionTarget,
) -> Vec<ReviewTarget> {
    config
        .sources
        .iter()
        .map(|source| ReviewTarget {
            source: source.name.clone(),
            label: format!("{}: {}", source.name, target.name),
            url: format!(
                "{}/search?q={}",
                source.url.trim_end_matches('/'),
                url_query(&target.name)
            ),
            adapter: source
                .adapter
                .clone()
                .unwrap_or_else(|| "missing-adapter".to_string()),
        })
        .collect()
}

fn greathouse_query(target: &crate::core::CollectionTarget, focus_terms: &[String]) -> String {
    target
        .keywords
        .iter()
        .take(3)
        .chain(focus_terms.iter().take(2))
        .cloned()
        .collect::<Vec<_>>()
        .join(" ")
}

fn greathouse_live_terms(target: &crate::core::CollectionTarget) -> Vec<String> {
    target.keywords.iter().take(4).cloned().collect()
}

fn greathouse_focus_terms(
    target: &crate::core::CollectionTarget,
    editorial_focuses: &[EditorialFocus],
) -> Vec<String> {
    let target_text = format!("{} {}", target.name, target.keywords.join(" ")).to_lowercase();
    editorial_focuses
        .iter()
        .filter(|focus| {
            focus
                .text
                .split_whitespace()
                .any(|term| target_text.contains(&term.to_lowercase()))
        })
        .flat_map(|focus| focus.text.split_whitespace().take(5).map(clean_focus_term))
        .filter(|term| term.len() >= 3)
        .collect()
}

fn clean_focus_term(value: &str) -> String {
    value
        .trim_matches(|character: char| !character.is_ascii_alphanumeric())
        .to_lowercase()
}

fn url_query(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join("+")
}

#[derive(Debug, Deserialize)]
struct GreathouseLocalRecord {
    subject: String,
    url: String,
    title: Option<String>,
    observed_at: Option<DateTime<Utc>>,
    summary: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    score: Option<i32>,
    stage: Option<String>,
    #[serde(default)]
    property_json: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct RedfinListingRecord {
    subject: String,
    url: String,
    address: String,
    city: Option<String>,
    state: Option<String>,
    price: Option<i64>,
    beds: Option<f32>,
    baths: Option<f32>,
    status: Option<String>,
    observed_at: Option<DateTime<Utc>>,
    days_on_market: Option<i64>,
    comparable_count: Option<i64>,
    source_status: Option<String>,
    tags: Option<Vec<String>>,
    score: Option<i32>,
}

impl RedfinListingRecord {
    fn into_local_record(self) -> GreathouseLocalRecord {
        let bedroom_label = self
            .beds
            .map(format_count)
            .unwrap_or_else(|| "unknown".to_string());
        let bathroom_label = self
            .baths
            .map(format_count)
            .unwrap_or_else(|| "unknown".to_string());
        let price_label = self
            .price
            .map(format_price)
            .unwrap_or_else(|| "unpriced".to_string());
        let location = [self.city.as_deref(), self.state.as_deref()]
            .into_iter()
            .flatten()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
        let title = if location.is_empty() {
            format!("Redfin listing: {}", self.address)
        } else {
            format!("Redfin listing: {} ({})", self.address, location)
        };
        let status = self
            .status
            .clone()
            .unwrap_or_else(|| "unknown status".to_string());
        let source_status = self
            .source_status
            .clone()
            .unwrap_or_else(|| "observed".to_string());
        let days_on_market = self
            .days_on_market
            .map(|days| format!("{days} days on market"))
            .unwrap_or_else(|| "unknown market age".to_string());
        let comparable_count = self.comparable_count.unwrap_or(0);
        let summary = format!(
            "{price_label} Redfin listing with {bedroom_label} beds, {bathroom_label} baths, {status}, {days_on_market}, and {comparable_count} comparable signals."
        );
        let mut tags = self.tags.unwrap_or_default();
        tags.push("redfin".to_string());
        tags.push(source_status.clone());
        GreathouseLocalRecord {
            subject: self.subject,
            url: self.url,
            title: Some(title),
            observed_at: self.observed_at,
            summary: Some(summary),
            tags,
            score: self.score,
            stage: Some("property_source".to_string()),
            property_json: serde_json::json!({
                "address": self.address,
                "city": self.city,
                "state": self.state,
                "price": self.price,
                "beds": self.beds,
                "baths": self.baths,
                "status": self.status,
                "days_on_market": self.days_on_market,
                "comparable_count": comparable_count,
                "source_status": source_status,
            }),
        }
    }
}

fn format_count(value: f32) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        format!("{value:.1}")
    }
}

fn format_price(value: i64) -> String {
    let digits = value.to_string();
    let mut formatted = String::new();
    for (index, character) in digits.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            formatted.push(',');
        }
        formatted.push(character);
    }
    format!("${}", formatted.chars().rev().collect::<String>())
}

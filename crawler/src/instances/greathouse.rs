use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::path::PathBuf;

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
        anyhow::ensure!(
            source.url.starts_with("https://"),
            "{} must have an https source URL",
            source.name
        );
        let fixture_path = source
            .fixture_path
            .as_ref()
            .with_context(|| format!("{} must configure fixture_path", source.name))?;
        anyhow::ensure!(
            fixture_path.exists(),
            "{} fixture file must exist at {}",
            source.name,
            fixture_path.display()
        );
    }
    Ok(())
}

fn greathouse_items(config: &CrawlerConfig) -> Result<Vec<NewsItem>> {
    let mut items = Vec::new();
    for source in &config.sources {
        items.extend(adapter_for_source(source).collect(config, source)?);
    }
    Ok(items)
}

fn greathouse_item(
    target: &crate::core::CollectionTarget,
    source: &SourceConfig,
    fixture: GreathouseFixtureRecord,
    index: usize,
) -> NewsItem {
    let observed_at = fixture.observed_at.unwrap_or_else(Utc::now);
    let evidence_url = fixture.url.clone();
    let is_diagnostic = source.kind == "diagnostic" || target.topic.contains("diagnostic");
    let title = fixture.title.unwrap_or_else(|| {
        if is_diagnostic {
            format!("{} source diagnostic", target.name)
        } else {
            format!("{} property candidate", target.name)
        }
    });
    let summary = fixture.summary.unwrap_or_else(|| {
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
    let adapter = fixture.adapter.unwrap_or_else(|| {
        if is_diagnostic {
            "blocked-source-diagnostic-fixture".to_string()
        } else {
            "property-listing-fixture".to_string()
        }
    });
    let mut tags = fixture.tags;
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
        score: fixture.score.unwrap_or(70 + (index as i32 * 5).min(20)),
        raw_json: serde_json::json!({
            "collection_stage": fixture.stage.as_deref().unwrap_or("fixture"),
            "provenance": {
                "stage": fixture.stage.as_deref().unwrap_or("fixture"),
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
    fn adapter_name(&self, source: &SourceConfig) -> &'static str;
    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>>;
}

struct FixtureSourceAdapter;

impl GreathouseSourceAdapter for FixtureSourceAdapter {
    fn adapter_name(&self, source: &SourceConfig) -> &'static str {
        if source.kind == "diagnostic" {
            "blocked-source-diagnostic-fixture"
        } else {
            "property-listing-fixture"
        }
    }

    fn collect(&self, config: &CrawlerConfig, source: &SourceConfig) -> Result<Vec<NewsItem>> {
        let path = source
            .fixture_path
            .as_ref()
            .with_context(|| format!("{} has no fixture_path configured", source.name))?;
        let fixtures: Vec<GreathouseFixtureRecord> = serde_json::from_slice(
            &std::fs::read(path).with_context(|| format!("reading {}", path.display()))?,
        )
        .with_context(|| format!("parsing {}", path.display()))?;
        fixtures
            .into_iter()
            .enumerate()
            .map(|(index, fixture)| {
                let target = config
                    .targets
                    .iter()
                    .find(|target| target.name == fixture.subject)
                    .with_context(|| {
                        format!(
                            "{} fixture references unknown subject {}",
                            source.name, fixture.subject
                        )
                    })?;
                Ok(greathouse_item(target, source, fixture, index))
            })
            .collect()
    }
}

static FIXTURE_SOURCE_ADAPTER: FixtureSourceAdapter = FixtureSourceAdapter;

fn adapter_for_source(source: &SourceConfig) -> &'static dyn GreathouseSourceAdapter {
    match source.kind.as_str() {
        "listing" | "diagnostic" => &FIXTURE_SOURCE_ADAPTER,
        _ => &FIXTURE_SOURCE_ADAPTER,
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
                message: if source.kind == "diagnostic" {
                    "fixture retained blocked-source evidence for retry".to_string()
                } else {
                    "fixture listing loaded through the Greathouse crawler instance".to_string()
                },
                project_counts: Default::default(),
            }
        })
        .collect()
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
            adapter: adapter_for_source(source).adapter_name(source).to_string(),
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
struct GreathouseFixtureRecord {
    subject: String,
    url: String,
    title: Option<String>,
    observed_at: Option<DateTime<Utc>>,
    summary: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    score: Option<i32>,
    adapter: Option<String>,
    stage: Option<String>,
}

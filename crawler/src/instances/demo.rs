use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::{fs, path::PathBuf, time::Duration as StdDuration};

use crate::core::{
    CrawlerCollection, CrawlerConfig, CrawlerSnapshot, EditorialFocus, NormalizedCollectionPlan,
    NormalizedRecord, ReviewTarget, SourceAdapter, SourceAdapterContext, SourceAdapterOutput,
    SourceConfig, SourceRun, stable_id,
};
use crate::http::{fetch_json, probe_http_status};
use crate::instances::CrawlerInstance;

pub static CRAWLER_INSTANCE: DemoCrawlerInstance = DemoCrawlerInstance;

pub struct DemoCrawlerInstance;

impl CrawlerInstance for DemoCrawlerInstance {
    fn id(&self) -> &'static str {
        "demo"
    }

    fn display_name(&self) -> &'static str {
        "Verdun Demo"
    }

    fn base_path(&self) -> &'static str {
        "/demo/"
    }

    fn default_config_path(&self) -> PathBuf {
        PathBuf::from("crawler/instances/demo/config.toml")
    }

    fn default_item_payload_path(&self) -> PathBuf {
        PathBuf::from("crawler/instances/demo/data/items.json")
    }

    fn default_source_runs_path(&self) -> PathBuf {
        PathBuf::from("crawler/instances/demo/data/source-runs.json")
    }

    fn default_public_snapshot_path(&self) -> PathBuf {
        PathBuf::from("public/data/demo-snapshot.json")
    }

    fn default_editorial_state_path(&self) -> PathBuf {
        PathBuf::from("crawler/instances/demo/data/editorial-state.json")
    }

    fn verify_config(&self, config: &CrawlerConfig) -> Result<()> {
        verify_config(config)
    }

    fn read_editorial_focuses(&self, path: &PathBuf) -> Result<Vec<EditorialFocus>> {
        read_editorial_focuses(path)
    }

    fn collection_plans(
        &self,
        config: &CrawlerConfig,
        editorial_focuses: &[EditorialFocus],
    ) -> Vec<NormalizedCollectionPlan> {
        config
            .targets
            .iter()
            .map(|target| {
                let focus_terms = demo_focus_terms(target, editorial_focuses);
                NormalizedCollectionPlan {
                    subject: target.name.clone(),
                    topic: target.topic.clone(),
                    query: demo_query(target, &focus_terms),
                    live_terms: demo_live_terms(target),
                    tags: target.keywords.iter().take(3).cloned().collect(),
                    review_targets: review_targets(config, target),
                    focus_terms,
                }
            })
            .collect()
    }

    fn collect(
        &self,
        config: &CrawlerConfig,
        live: bool,
        _max_per_project: usize,
        _since: DateTime<Utc>,
        editorial_focuses: &[EditorialFocus],
    ) -> Result<CrawlerCollection> {
        let (items, source_runs) = if live {
            demo_adapter_outputs(config, live, editorial_focuses)?
        } else {
            (Vec::new(), skipped_source_runs(config))
        };
        let records = dedupe_records(items);
        let snapshot = CrawlerSnapshot {
            generated_at: Utc::now(),
            theme: config.theme.clone(),
            records,
            source_runs,
            collection_plans: self.collection_plans(config, editorial_focuses),
        };
        Ok(CrawlerCollection {
            item_payload: serde_json::to_value(&snapshot.records)?,
            public_payload: serde_json::to_value(&snapshot)?,
            snapshot,
        })
    }
}

#[derive(Debug, Deserialize)]
struct DemoEditorialState {
    #[serde(default)]
    focuses: Vec<EditorialFocus>,
}

fn read_editorial_focuses(path: &PathBuf) -> Result<Vec<EditorialFocus>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let state: DemoEditorialState = serde_json::from_slice(
        &fs::read(path).with_context(|| format!("reading {}", path.display()))?,
    )
    .with_context(|| format!("parsing {}", path.display()))?;
    Ok(state.focuses)
}

fn verify_config(config: &CrawlerConfig) -> Result<()> {
    anyhow::ensure!(
        !config.targets.is_empty(),
        "demo config must include collection targets"
    );
    anyhow::ensure!(
        !config.sources.is_empty(),
        "demo config must include record or diagnostic sources"
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
                "local-record-json"
                    | "local-diagnostic-json"
                    | "http-record-json"
                    | "http-diagnostic-json"
                    | "http-status-diagnostic"
            ),
            "{} uses unsupported demo adapter {}",
            source.name,
            adapter
        );
        if adapter.starts_with("local-") {
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

fn demo_adapter_outputs(
    config: &CrawlerConfig,
    live: bool,
    editorial_focuses: &[EditorialFocus],
) -> Result<(Vec<NormalizedRecord>, Vec<SourceRun>)> {
    let mut records = Vec::new();
    let mut source_runs = Vec::new();
    for source in &config.sources {
        let output = adapter_for_source(source)?.collect(SourceAdapterContext {
            config,
            source,
            live,
            max_per_project: usize::MAX,
            since: Utc::now(),
            editorial_focuses,
        })?;
        records.extend(output.records);
        source_runs.push(output.source_run);
    }
    Ok((records, source_runs))
}

fn dedupe_records(records: Vec<NormalizedRecord>) -> Vec<NormalizedRecord> {
    let mut by_id = BTreeMap::new();
    for record in records {
        by_id.entry(record.id.clone()).or_insert(record);
    }
    by_id.into_values().collect()
}

fn skipped_source_runs(config: &CrawlerConfig) -> Vec<SourceRun> {
    config
        .sources
        .iter()
        .map(|source| SourceRun::skipped(source, "run with --live to refresh this demo source"))
        .collect()
}

fn demo_record(
    target: &crate::core::CollectionTarget,
    source: &SourceConfig,
    record: DemoLocalRecord,
    adapter: &str,
    cache: &crate::core::SourceAdapterCacheContext,
    index: usize,
) -> NormalizedRecord {
    let observed_at = record.observed_at.unwrap_or_else(Utc::now);
    let evidence_url = record.url.clone();
    let is_diagnostic = source.kind == "diagnostic" || target.topic.contains("diagnostic");
    let title = record.title.unwrap_or_else(|| {
        if is_diagnostic {
            format!("{} source diagnostic", target.name)
        } else {
            format!("{} collected record", target.name)
        }
    });
    let summary = record.summary.unwrap_or_else(|| {
        if is_diagnostic {
            format!(
                "{} records source-health evidence for retry and manual review.",
                target.name
            )
        } else {
            format!(
                "{} is a normalized record for reusable crawler validation.",
                target.name
            )
        }
    });
    let stage = record.stage.unwrap_or_else(|| {
        if adapter.starts_with("http-") {
            "live_http".to_string()
        } else {
            "local_json".to_string()
        }
    });
    let tags = if record.tags.is_empty() {
        target.keywords.iter().take(3).cloned().collect()
    } else {
        record.tags
    };
    let score = record.score.unwrap_or(if is_diagnostic { 60 } else { 80 });
    let provenance = serde_json::json!({
        "stage": stage,
        "adapter": adapter,
        "source": source.name,
        "source_kind": source.kind,
        "source_url": source.url,
        "evidence_url": evidence_url,
        "cache": {
            "namespace": cache.namespace,
            "keySeed": cache.key_seed,
            "cacheKey": cache.cache_key,
            "observedAfter": cache.observed_after,
            "maxAgeHours": cache.max_age_hours,
        },
        "subject": target.name,
        "matched_keywords": target.keywords,
    });
    let normalized = serde_json::json!({
        "subject": target.name,
        "topic": target.topic,
        "source": source.name,
        "adapter": adapter,
        "score": score,
    });
    let raw_json = serde_json::json!({
        "source": source.name,
        "record": record.raw,
        "provenance": provenance,
    });
    NormalizedRecord {
        id: stable_id(&target.name, &format!("{evidence_url}:{index}")),
        title,
        url: evidence_url.clone(),
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        observed_at,
        subject: target.name.clone(),
        topic: target.topic.clone(),
        summary,
        tags,
        score,
        status: if is_diagnostic {
            "diagnostic"
        } else {
            "candidate"
        }
        .to_string(),
        dedupe_key: evidence_url,
        provenance_json: provenance,
        normalized_json: normalized,
        raw_json,
    }
}

struct LocalJsonSourceAdapter;
struct HttpJsonSourceAdapter;
struct HttpStatusDiagnosticAdapter;

impl SourceAdapter for LocalJsonSourceAdapter {
    fn id(&self) -> &'static str {
        "local-json"
    }

    fn collect(&self, context: SourceAdapterContext<'_>) -> Result<SourceAdapterOutput> {
        let adapter_id = context.adapter_id().to_owned();
        let cache = context.cache_context(24);
        let fixture_path = context
            .source
            .fixture_path
            .as_ref()
            .with_context(|| format!("{} must configure fixture_path", context.source.name))?;
        let records: Vec<DemoLocalRecord> = serde_json::from_slice(
            &fs::read(fixture_path)
                .with_context(|| format!("reading {}", fixture_path.display()))?,
        )
        .with_context(|| format!("parsing {}", fixture_path.display()))?;
        let records = records
            .into_iter()
            .enumerate()
            .map(|(index, record)| {
                let target = target_for_record(context.config, &record)?;
                Ok(demo_record(
                    target,
                    context.source,
                    record,
                    &adapter_id,
                    &cache,
                    index,
                ))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(SourceAdapterOutput::from_records(
            context.source,
            records,
            format!(
                "local JSON adapter loaded through the demo crawler instance; cache namespace {}",
                cache.namespace
            ),
        ))
    }
}

impl SourceAdapter for HttpJsonSourceAdapter {
    fn id(&self) -> &'static str {
        "http-json"
    }

    fn collect(&self, context: SourceAdapterContext<'_>) -> Result<SourceAdapterOutput> {
        let adapter_id = context.adapter_id().to_owned();
        let cache = context.cache_context(1);
        let client = Client::builder()
            .timeout(StdDuration::from_secs(5))
            .user_agent("verdun-crawler/0.1 demo")
            .build()?;
        let records = fetch_json::<Vec<DemoLocalRecord>>(&client, &context.source.url)
            .with_context(|| format!("loading HTTP JSON source {}", context.source.name))?
            .body;
        let records = records
            .into_iter()
            .enumerate()
            .map(|(index, record)| {
                let target = target_for_record(context.config, &record)?;
                Ok(demo_record(
                    target,
                    context.source,
                    record,
                    &adapter_id,
                    &cache,
                    index,
                ))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(SourceAdapterOutput::from_records(
            context.source,
            records,
            format!(
                "HTTP JSON adapter loaded through the demo crawler instance; cache namespace {}",
                cache.namespace
            ),
        ))
    }
}

impl SourceAdapter for HttpStatusDiagnosticAdapter {
    fn id(&self) -> &'static str {
        "http-status-diagnostic"
    }

    fn collect(&self, context: SourceAdapterContext<'_>) -> Result<SourceAdapterOutput> {
        let adapter_id = context.adapter_id().to_owned();
        let cache = context.cache_context(1);
        let target = context
            .config
            .targets
            .iter()
            .find(|target| {
                let topic = target.topic.to_lowercase();
                topic.contains("diagnostic") || topic.contains("source")
            })
            .or_else(|| context.config.targets.first())
            .with_context(|| {
                format!(
                    "{} status diagnostic has no configured target",
                    context.source.name
                )
            })?;
        let client = Client::builder()
            .timeout(StdDuration::from_secs(5))
            .user_agent("verdun-crawler/0.1 demo")
            .build()?;
        let observed_at = Utc::now();
        let record = match probe_http_status(&client, &context.source.url) {
            Ok(metadata) => {
                let status = metadata.status;
                DemoLocalRecord {
                    subject: target.name.clone(),
                    url: context.source.url.clone(),
                    title: Some(format!("{} returned HTTP {}", context.source.name, status)),
                    observed_at: Some(observed_at),
                    summary: Some(format!(
                        "{} returned HTTP {} during source diagnostics.",
                        context.source.name, status
                    )),
                    tags: vec!["diagnostic".to_string(), "http-status".to_string()],
                    score: Some(if status >= 400 { 72 } else { 50 }),
                    stage: Some("blocked_http".to_string()),
                    raw: serde_json::json!({ "http": metadata }),
                }
            }
            Err(error) => DemoLocalRecord {
                subject: target.name.clone(),
                url: context.source.url.clone(),
                title: Some(format!("{} unreachable", context.source.name)),
                observed_at: Some(observed_at),
                summary: Some(format!(
                    "{} could not be reached during source diagnostics: {}.",
                    context.source.name, error
                )),
                tags: vec!["diagnostic".to_string(), "http-error".to_string()],
                score: Some(70),
                stage: Some("blocked_http".to_string()),
                raw: serde_json::json!({ "error": error.to_string() }),
            },
        };
        let records = vec![demo_record(
            target,
            context.source,
            record,
            &adapter_id,
            &cache,
            0,
        )];
        Ok(SourceAdapterOutput::from_records(
            context.source,
            records,
            format!(
                "HTTP status diagnostic adapter loaded through the demo crawler instance; cache namespace {}",
                cache.namespace
            ),
        ))
    }
}

fn adapter_for_source(source: &SourceConfig) -> Result<&'static dyn SourceAdapter> {
    match source.adapter.as_deref().unwrap_or("local-record-json") {
        "local-record-json" | "local-diagnostic-json" => Ok(&LocalJsonSourceAdapter),
        "http-record-json" | "http-diagnostic-json" => Ok(&HttpJsonSourceAdapter),
        "http-status-diagnostic" => Ok(&HttpStatusDiagnosticAdapter),
        adapter => anyhow::bail!("{} uses unsupported demo adapter {}", source.name, adapter),
    }
}

fn target_for_record<'a>(
    config: &'a CrawlerConfig,
    record: &DemoLocalRecord,
) -> Result<&'a crate::core::CollectionTarget> {
    config
        .targets
        .iter()
        .find(|target| target.name == record.subject)
        .with_context(|| format!("record references unknown subject {}", record.subject))
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
            url: format!("{}?q={}", source.url, target.keywords.join("+")),
            adapter: source
                .adapter
                .clone()
                .unwrap_or_else(|| "local-record-json".to_string()),
        })
        .collect()
}

fn demo_query(target: &crate::core::CollectionTarget, focus_terms: &[String]) -> String {
    let mut terms = target.keywords.clone();
    terms.extend(focus_terms.iter().cloned());
    terms.sort();
    terms.dedup();
    terms.join(" ")
}

fn demo_live_terms(target: &crate::core::CollectionTarget) -> Vec<String> {
    target.keywords.iter().take(4).cloned().collect()
}

fn demo_focus_terms(
    target: &crate::core::CollectionTarget,
    editorial_focuses: &[EditorialFocus],
) -> Vec<String> {
    let haystack = format!(
        "{} {} {}",
        target.name,
        target.topic,
        target.keywords.join(" ")
    )
    .to_lowercase();
    editorial_focuses
        .iter()
        .filter(|focus| {
            focus
                .text
                .split_whitespace()
                .any(|term| haystack.contains(&term.to_lowercase()))
        })
        .map(|focus| focus.text.clone())
        .collect()
}

#[derive(Debug, Deserialize)]
struct DemoLocalRecord {
    subject: String,
    url: String,
    title: Option<String>,
    observed_at: Option<DateTime<Utc>>,
    summary: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    score: Option<i32>,
    stage: Option<String>,
    #[serde(flatten)]
    raw: serde_json::Value,
}

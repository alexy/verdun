use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::core::{
    CollectionTarget, CrawlerConfig, CrawlerSnapshot, NormalizedCollectionPlan, NormalizedRecord,
    ReviewTarget, SourceConfig, SourceRun, SourceRunStatus, stable_id,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub source: String,
    pub source_kind: String,
    pub url: String,
    pub published_at: DateTime<Utc>,
    pub project: String,
    pub topic: String,
    pub summary: String,
    pub why_it_matters: String,
    pub tags: Vec<String>,
    pub score: i32,
    pub raw_json: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicSnapshot {
    pub generated_at: DateTime<Utc>,
    pub theme: String,
    pub items: Vec<NewsItem>,
    pub source_runs: Vec<SourceRun>,
    #[serde(default)]
    pub query_plans: Vec<ProjectQueryPlan>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectQueryPlan {
    pub project: String,
    pub topic: String,
    pub hacker_news_query: String,
    pub live_terms: Vec<String>,
    pub dev_to_tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub review_targets: Vec<ReviewTarget>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub focus_terms: Vec<String>,
}

pub struct ExportPayload {
    pub theme: String,
    pub items: Vec<NewsItem>,
    pub source_runs: Vec<SourceRun>,
    pub query_plans: Vec<ProjectQueryPlan>,
    pub generated_at: DateTime<Utc>,
}

impl ExportPayload {
    pub fn normalized_snapshot(&self) -> CrawlerSnapshot {
        CrawlerSnapshot {
            generated_at: self.generated_at,
            theme: self.theme.clone(),
            records: self.items.iter().map(news_item_record).collect(),
            source_runs: self.source_runs.clone(),
            collection_plans: self
                .query_plans
                .iter()
                .map(project_query_plan_record)
                .collect(),
        }
    }
}

pub fn item_dedupe_key(item: &NewsItem) -> String {
    if item_stage_rank(item) <= 1 {
        return format!("seed:{}", item.id);
    }
    canonical_url(&item.url).unwrap_or_else(|| item.id.clone())
}

pub fn dedupe_items(items: Vec<NewsItem>) -> Vec<NewsItem> {
    let mut by_key = BTreeMap::new();
    for item in items {
        let key = item_dedupe_key(&item);
        if let Some(existing) = by_key.get_mut(&key) {
            if should_replace_dedupe_item(&item, existing) {
                let previous = std::mem::replace(existing, item);
                record_duplicate(existing, &previous);
            } else {
                record_duplicate(existing, &item);
            }
        } else {
            by_key.insert(key, item);
        }
    }
    let mut items = by_key.into_values().collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.published_at.cmp(&left.published_at))
            .then_with(|| left.project.cmp(&right.project))
            .then_with(|| left.title.cmp(&right.title))
    });
    items
}

pub fn project_counts(items: &[NewsItem]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for item in items {
        *counts.entry(item.project.clone()).or_insert(0) += 1;
    }
    counts
}

pub fn ok_source_run(source: &SourceConfig, items: &[NewsItem], message: &str) -> SourceRun {
    SourceRun {
        source: source.name.clone(),
        kind: source.kind.clone(),
        status: SourceRunStatus::Ok,
        item_count: items.len(),
        message: message.to_string(),
        project_counts: project_counts(items),
    }
}

pub fn error_source_run(source: &SourceConfig, message: &str) -> SourceRun {
    SourceRun {
        source: source.name.clone(),
        kind: source.kind.clone(),
        status: SourceRunStatus::Error,
        item_count: 0,
        message: message.to_string(),
        project_counts: BTreeMap::new(),
    }
}

pub fn manual_source_run(
    source: &SourceConfig,
    items: &[NewsItem],
    post_count: usize,
    latest_published_at: Option<DateTime<Utc>>,
    since: DateTime<Utc>,
) -> SourceRun {
    if post_count == 0 {
        return error_source_run(source, "manual JSON import contains no reviewed posts");
    }
    if latest_published_at.is_some_and(|published_at| published_at < since) {
        return SourceRun {
            source: source.name.clone(),
            kind: source.kind.clone(),
            status: SourceRunStatus::Error,
            item_count: items.len(),
            message: format!(
                "manual JSON import is stale; latest reviewed post is older than {}",
                since.to_rfc3339()
            ),
            project_counts: project_counts(items),
        };
    }
    ok_source_run(
        source,
        items,
        &format!(
            "manual JSON import; {} reviewed post{}",
            post_count,
            if post_count == 1 { "" } else { "s" }
        ),
    )
}

pub fn seed_items(config: &CrawlerConfig) -> Vec<NewsItem> {
    let source = config
        .sources
        .iter()
        .find(|candidate| candidate.name == "Hacker News")
        .cloned()
        .unwrap_or_else(|| config.sources[0].clone());
    config
        .targets
        .iter()
        .enumerate()
        .map(|(index, project)| project_item(project, &source, index))
        .collect()
}

pub fn provenance(
    stage: &str,
    adapter: &str,
    source: &SourceConfig,
    project: &CollectionTarget,
    evidence_url: &str,
    focus_terms: &[String],
) -> serde_json::Value {
    serde_json::json!({
        "stage": stage,
        "adapter": adapter,
        "source": source.name,
        "source_kind": source.kind,
        "source_url": source.url,
        "evidence_url": evidence_url,
        "project": project.name,
        "matched_keywords": matched_keywords(project, focus_terms)
    })
}

fn project_item(project: &CollectionTarget, source: &SourceConfig, index: usize) -> NewsItem {
    let published_at = seed_base_time() - Duration::days(index as i64);
    let title = format!(
        "{} belongs in this week's typed AI/data systems watch",
        project.name
    );
    let summary = format!(
        "{} is being tracked for {} signals around {}.",
        project.name,
        project.topic,
        project.keywords.join(", ")
    );
    let why_it_matters = format!(
        "{} helps explain where typed contracts, local execution, and practical AI/data systems are converging.",
        project.name
    );
    let id = stable_id(&project.name, &project.homepage);
    NewsItem {
        id,
        title,
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: project.homepage.clone(),
        published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary,
        why_it_matters,
        tags: project.keywords.iter().take(4).cloned().collect(),
        score: 90 - (index as i32 * 3),
        raw_json: serde_json::json!({
            "homepage": project.homepage,
            "source_url": source.url,
            "collection_stage": "watchlist-seed",
            "provenance": provenance("watchlist-seed", "watchlist", source, project, &project.homepage, &[])
        }),
    }
}

fn seed_base_time() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-06-15T12:00:00Z")
        .expect("valid seed timestamp")
        .with_timezone(&Utc)
}

fn matched_keywords(project: &CollectionTarget, focus_terms: &[String]) -> Vec<String> {
    let mut keywords = project
        .keywords
        .iter()
        .take(5)
        .cloned()
        .chain(
            focus_terms
                .iter()
                .take(5)
                .map(|term| format!("focus:{term}")),
        )
        .collect::<Vec<_>>();
    keywords.sort();
    keywords.dedup();
    keywords
}

fn news_item_record(item: &NewsItem) -> NormalizedRecord {
    let provenance_json = item
        .raw_json
        .get("provenance")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    NormalizedRecord {
        id: item.id.clone(),
        title: item.title.clone(),
        url: item.url.clone(),
        source: item.source.clone(),
        source_kind: item.source_kind.clone(),
        observed_at: item.published_at,
        subject: item.project.clone(),
        topic: item.topic.clone(),
        summary: item.summary.clone(),
        tags: item.tags.clone(),
        score: item.score,
        status: "active".to_string(),
        dedupe_key: item_dedupe_key(item),
        provenance_json,
        normalized_json: serde_json::json!({
            "project": item.project,
            "why_it_matters": item.why_it_matters
        }),
        raw_json: item.raw_json.clone(),
    }
}

fn project_query_plan_record(plan: &ProjectQueryPlan) -> NormalizedCollectionPlan {
    NormalizedCollectionPlan {
        subject: plan.project.clone(),
        topic: plan.topic.clone(),
        query: plan.hacker_news_query.clone(),
        live_terms: plan.live_terms.clone(),
        tags: plan.dev_to_tags.clone(),
        review_targets: plan.review_targets.clone(),
        focus_terms: plan.focus_terms.clone(),
    }
}

fn should_replace_dedupe_item(candidate: &NewsItem, existing: &NewsItem) -> bool {
    item_stage_rank(candidate)
        .cmp(&item_stage_rank(existing))
        .then_with(|| candidate.score.cmp(&existing.score))
        .then_with(|| candidate.published_at.cmp(&existing.published_at))
        .is_gt()
}

fn item_stage_rank(item: &NewsItem) -> i32 {
    match item
        .raw_json
        .get("collection_stage")
        .and_then(|stage| stage.as_str())
    {
        Some("manual") => 3,
        Some("live") => 2,
        Some("watchlist-seed") => 1,
        _ => 0,
    }
}

fn record_duplicate(item: &mut NewsItem, duplicate: &NewsItem) {
    let duplicate_record = serde_json::json!({
        "id": duplicate.id,
        "title": duplicate.title,
        "source": duplicate.source,
        "url": duplicate.url,
        "project": duplicate.project,
        "score": duplicate.score,
        "collection_stage": duplicate.raw_json.get("collection_stage").and_then(|stage| stage.as_str())
    });
    if let Some(duplicates) = item
        .raw_json
        .get_mut("duplicates")
        .and_then(|value| value.as_array_mut())
    {
        duplicates.push(duplicate_record);
    } else if let Some(object) = item.raw_json.as_object_mut() {
        object.insert(
            "duplicates".to_string(),
            serde_json::Value::Array(vec![duplicate_record]),
        );
    }
}

fn canonical_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut normalized = trimmed.split('#').next().unwrap_or(trimmed).to_lowercase();
    if let Some(index) = normalized.find('?') {
        let query = &normalized[index + 1..];
        let meaningful_query = query
            .split('&')
            .filter(|part| {
                !part.starts_with("utm_")
                    && !part.starts_with("ref=")
                    && !part.starts_with("source=")
                    && !part.is_empty()
            })
            .collect::<Vec<_>>()
            .join("&");
        normalized.truncate(index);
        if !meaningful_query.is_empty() {
            normalized.push('?');
            normalized.push_str(&meaningful_query);
        }
    }
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Some(normalized.replace("://www.", "://"))
}

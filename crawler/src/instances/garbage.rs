use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::core::{
    CrawlerSnapshot, NormalizedCollectionPlan, NormalizedRecord, ReviewTarget, SourceRun,
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

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Debug, Deserialize)]
pub struct CrawlerConfig {
    pub theme: String,
    #[serde(rename = "projects")]
    pub targets: Vec<CollectionTarget>,
    pub sources: Vec<SourceConfig>,
}

#[derive(Debug, Deserialize)]
pub struct CollectionTarget {
    pub name: String,
    pub topic: String,
    pub homepage: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SourceConfig {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub adapter: Option<String>,
    pub feed_urls: Option<Vec<String>>,
    pub manual_path: Option<PathBuf>,
    pub fixture_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceRunStatus {
    Ok,
    Error,
    Pending,
    Skipped,
}

impl SourceRunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Error => "error",
            Self::Pending => "pending",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRun {
    pub source: String,
    pub kind: String,
    pub status: SourceRunStatus,
    pub item_count: usize,
    pub message: String,
    #[serde(default)]
    pub project_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewTarget {
    pub source: String,
    pub label: String,
    pub url: String,
    pub adapter: String,
}

#[derive(Debug, Deserialize)]
pub struct EditorialFocus {
    pub text: String,
    #[serde(default)]
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedRecord {
    pub id: String,
    pub title: String,
    pub url: String,
    pub source: String,
    pub source_kind: String,
    pub observed_at: DateTime<Utc>,
    pub subject: String,
    pub topic: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub score: i32,
    pub status: String,
    pub dedupe_key: String,
    pub provenance_json: serde_json::Value,
    pub normalized_json: serde_json::Value,
    pub raw_json: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedCollectionPlan {
    pub subject: String,
    pub topic: String,
    pub query: String,
    pub live_terms: Vec<String>,
    pub tags: Vec<String>,
    pub review_targets: Vec<ReviewTarget>,
    pub focus_terms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlerSnapshot {
    pub generated_at: DateTime<Utc>,
    pub theme: String,
    pub records: Vec<NormalizedRecord>,
    pub source_runs: Vec<SourceRun>,
    pub collection_plans: Vec<NormalizedCollectionPlan>,
}

pub fn stable_id(subject: &str, url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(subject.as_bytes());
    hasher.update(b"\n");
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    format!(
        "{}-{:x}",
        slug(subject),
        &digest[..6]
            .iter()
            .fold(0_u64, |acc, byte| (acc << 8) | u64::from(*byte))
    )
}

pub fn slug(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

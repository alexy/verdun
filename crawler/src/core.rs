use serde::{Deserialize, Serialize};
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
    pub feed_urls: Option<Vec<String>>,
    pub manual_path: Option<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceRun {
    pub source: String,
    pub kind: String,
    pub status: SourceRunStatus,
    pub item_count: usize,
    pub message: String,
    #[serde(default)]
    pub project_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewTarget {
    pub source: String,
    pub label: String,
    pub url: String,
    pub adapter: String,
}

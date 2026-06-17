use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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

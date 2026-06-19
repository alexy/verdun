use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

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

impl SourceRun {
    pub fn new(
        source: impl Into<String>,
        kind: impl Into<String>,
        status: SourceRunStatus,
        item_count: usize,
        message: impl Into<String>,
        project_counts: BTreeMap<String, usize>,
    ) -> Self {
        Self {
            source: source.into(),
            kind: kind.into(),
            status,
            item_count,
            message: message.into(),
            project_counts,
        }
    }

    pub fn with_counts(
        source: &SourceConfig,
        status: SourceRunStatus,
        item_count: usize,
        message: impl Into<String>,
        project_counts: BTreeMap<String, usize>,
    ) -> Self {
        Self::new(
            source.name.clone(),
            source.kind.clone(),
            status,
            item_count,
            message,
            project_counts,
        )
    }

    pub fn from_records(
        source: &SourceConfig,
        records: &[NormalizedRecord],
        message: impl Into<String>,
    ) -> Self {
        Self::with_counts(
            source,
            if records.is_empty() {
                SourceRunStatus::Error
            } else {
                SourceRunStatus::Ok
            },
            records.len(),
            message,
            project_counts_for_records(records),
        )
    }

    pub fn error(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self::with_counts(source, SourceRunStatus::Error, 0, message, BTreeMap::new())
    }

    pub fn skipped(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self::with_counts(
            source,
            SourceRunStatus::Skipped,
            0,
            message,
            BTreeMap::new(),
        )
    }
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

pub struct SourceAdapterContext<'a> {
    pub config: &'a CrawlerConfig,
    pub source: &'a SourceConfig,
    pub live: bool,
    pub max_per_project: usize,
    pub since: DateTime<Utc>,
    pub editorial_focuses: &'a [EditorialFocus],
}

pub struct SourceAdapterOutput {
    pub records: Vec<NormalizedRecord>,
    pub source_run: SourceRun,
}

pub trait SourceAdapter {
    fn id(&self) -> &'static str;
    fn collect(&self, context: SourceAdapterContext<'_>) -> anyhow::Result<SourceAdapterOutput>;
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

pub struct CrawlerCollection {
    pub snapshot: CrawlerSnapshot,
    pub item_payload: serde_json::Value,
    pub public_payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlerOutputPaths {
    pub item_payload: String,
    pub source_runs: String,
    pub public_snapshot: String,
    pub generic_snapshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactSpec {
    pub label: String,
    pub kind: String,
    pub path: String,
    pub required: bool,
}

impl ArtifactSpec {
    pub fn new(
        label: impl Into<String>,
        kind: impl Into<String>,
        path: impl AsRef<Path>,
        required: bool,
    ) -> Self {
        Self {
            label: label.into(),
            kind: kind.into(),
            path: path.as_ref().to_string_lossy().into_owned(),
            required,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactInventoryEntry {
    pub label: String,
    pub kind: String,
    pub path: String,
    pub required: bool,
    pub exists: bool,
    pub bytes: Option<u64>,
    pub modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactInventorySummary {
    pub total: usize,
    pub existing: usize,
    pub missing_required: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactInventory {
    pub generated_at: DateTime<Utc>,
    pub summary: ArtifactInventorySummary,
    pub artifacts: Vec<ArtifactInventoryEntry>,
}

impl ArtifactInventory {
    pub fn inspect(generated_at: DateTime<Utc>, specs: &[ArtifactSpec]) -> Self {
        let artifacts = specs
            .iter()
            .map(|spec| {
                let metadata = fs::metadata(&spec.path).ok();
                let modified_at = metadata
                    .as_ref()
                    .and_then(|metadata| metadata.modified().ok())
                    .map(DateTime::<Utc>::from);
                ArtifactInventoryEntry {
                    label: spec.label.clone(),
                    kind: spec.kind.clone(),
                    path: spec.path.clone(),
                    required: spec.required,
                    exists: metadata.is_some(),
                    bytes: metadata.as_ref().map(fs::Metadata::len),
                    modified_at,
                }
            })
            .collect::<Vec<_>>();
        let summary = ArtifactInventorySummary {
            total: artifacts.len(),
            existing: artifacts.iter().filter(|artifact| artifact.exists).count(),
            missing_required: artifacts
                .iter()
                .filter(|artifact| artifact.required && !artifact.exists)
                .count(),
            total_bytes: artifacts.iter().filter_map(|artifact| artifact.bytes).sum(),
        };
        Self {
            generated_at,
            summary,
            artifacts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRunSummary {
    pub total: usize,
    pub ok: usize,
    pub error: usize,
    pub pending: usize,
    pub skipped: usize,
    pub item_count: usize,
}

impl SourceRunSummary {
    pub fn from_source_runs(source_runs: &[SourceRun]) -> Self {
        let mut summary = Self {
            total: source_runs.len(),
            ok: 0,
            error: 0,
            pending: 0,
            skipped: 0,
            item_count: 0,
        };
        for source_run in source_runs {
            match source_run.status {
                SourceRunStatus::Ok => summary.ok += 1,
                SourceRunStatus::Error => summary.error += 1,
                SourceRunStatus::Pending => summary.pending += 1,
                SourceRunStatus::Skipped => summary.skipped += 1,
            }
            summary.item_count += source_run.item_count;
        }
        summary
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessStatus {
    Fresh,
    Stale,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreshnessPolicy {
    pub max_age_hours: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreshnessAssessment {
    pub status: FreshnessStatus,
    pub observed_at: Option<DateTime<Utc>>,
    pub checked_at: DateTime<Utc>,
    pub age_hours: Option<f64>,
    pub max_age_hours: f64,
    pub reason: String,
}

impl FreshnessAssessment {
    pub fn assess(
        observed_at: Option<DateTime<Utc>>,
        checked_at: DateTime<Utc>,
        policy: &FreshnessPolicy,
    ) -> Self {
        let age_hours = observed_at.map(|observed_at| {
            checked_at.signed_duration_since(observed_at).num_minutes() as f64 / 60.0
        });
        let status = match age_hours {
            Some(age_hours) if age_hours <= policy.max_age_hours => FreshnessStatus::Fresh,
            Some(_) => FreshnessStatus::Stale,
            None => FreshnessStatus::Unknown,
        };
        Self {
            status,
            observed_at,
            checked_at,
            age_hours,
            max_age_hours: policy.max_age_hours,
            reason: policy.reason.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlerRunManifest {
    pub generated_at: DateTime<Utc>,
    pub instance: String,
    pub display_name: String,
    pub base_path: String,
    pub config_path: String,
    pub output_paths: CrawlerOutputPaths,
    pub artifact_inventory: ArtifactInventory,
    pub live: bool,
    pub max_live_per_project: usize,
    pub since_days: i64,
    pub snapshot_freshness: FreshnessAssessment,
    pub record_count: usize,
    pub source_runs: SourceRunSummary,
    pub collection_plan_count: usize,
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

pub fn project_counts_for_records(records: &[NormalizedRecord]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for record in records {
        *counts.entry(record.subject.clone()).or_insert(0) += 1;
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_run_summary_counts_statuses_and_items() {
        let source_runs = vec![
            source_run(SourceRunStatus::Ok, 3),
            source_run(SourceRunStatus::Error, 0),
            source_run(SourceRunStatus::Pending, 2),
            source_run(SourceRunStatus::Skipped, 0),
            source_run(SourceRunStatus::Ok, 5),
        ];

        let summary = SourceRunSummary::from_source_runs(&source_runs);

        assert_eq!(summary.total, 5);
        assert_eq!(summary.ok, 2);
        assert_eq!(summary.error, 1);
        assert_eq!(summary.pending, 1);
        assert_eq!(summary.skipped, 1);
        assert_eq!(summary.item_count, 10);
    }

    #[test]
    fn source_run_from_records_counts_subjects() {
        let source = SourceConfig {
            name: "test source".to_owned(),
            kind: "test_kind".to_owned(),
            url: "https://example.test".to_owned(),
            adapter: Some("test-adapter".to_owned()),
            feed_urls: None,
            manual_path: None,
            fixture_path: None,
        };
        let records = vec![
            normalized_record("alpha", "https://example.test/a"),
            normalized_record("alpha", "https://example.test/b"),
            normalized_record("beta", "https://example.test/c"),
        ];

        let source_run = SourceRun::from_records(&source, &records, "collected records");

        assert_eq!(source_run.source, "test source");
        assert_eq!(source_run.kind, "test_kind");
        assert!(matches!(source_run.status, SourceRunStatus::Ok));
        assert_eq!(source_run.item_count, 3);
        assert_eq!(source_run.message, "collected records");
        assert_eq!(source_run.project_counts.get("alpha"), Some(&2));
        assert_eq!(source_run.project_counts.get("beta"), Some(&1));
    }

    #[test]
    fn freshness_assessment_marks_fresh_stale_and_unknown() {
        let checked_at = DateTime::from_timestamp(3_600 * 10, 0).expect("checked time");
        let policy = FreshnessPolicy {
            max_age_hours: 6.0,
            reason: "test freshness".to_owned(),
        };

        let fresh = FreshnessAssessment::assess(
            DateTime::from_timestamp(3_600 * 8, 0),
            checked_at,
            &policy,
        );
        let stale = FreshnessAssessment::assess(
            DateTime::from_timestamp(3_600 * 2, 0),
            checked_at,
            &policy,
        );
        let unknown = FreshnessAssessment::assess(None, checked_at, &policy);

        assert_eq!(fresh.status, FreshnessStatus::Fresh);
        assert_eq!(fresh.age_hours, Some(2.0));
        assert_eq!(stale.status, FreshnessStatus::Stale);
        assert_eq!(unknown.status, FreshnessStatus::Unknown);
    }

    #[test]
    fn artifact_inventory_marks_existing_and_missing_files() {
        let test_dir = std::env::temp_dir().join(format!(
            "verdun-artifact-inventory-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&test_dir).expect("create test dir");
        let existing_path = test_dir.join("existing.json");
        let missing_path = test_dir.join("missing.json");
        fs::write(&existing_path, "{}").expect("write existing artifact");

        let checked_at = DateTime::from_timestamp(3_600 * 10, 0).expect("checked time");
        let inventory = ArtifactInventory::inspect(
            checked_at,
            &[
                ArtifactSpec::new("existing", "json", &existing_path, true),
                ArtifactSpec::new("missing", "json", &missing_path, true),
            ],
        );

        assert_eq!(inventory.generated_at, checked_at);
        assert_eq!(inventory.summary.total, 2);
        assert_eq!(inventory.summary.existing, 1);
        assert_eq!(inventory.summary.missing_required, 1);
        assert_eq!(inventory.summary.total_bytes, 2);
        assert!(inventory.artifacts[0].exists);
        assert_eq!(inventory.artifacts[0].bytes, Some(2));
        assert!(inventory.artifacts[0].modified_at.is_some());
        assert!(!inventory.artifacts[1].exists);
        assert_eq!(inventory.artifacts[1].bytes, None);
        assert_eq!(inventory.artifacts[1].modified_at, None);

        fs::remove_dir_all(&test_dir).expect("remove test dir");
    }

    fn source_run(status: SourceRunStatus, item_count: usize) -> SourceRun {
        SourceRun {
            source: "source".to_owned(),
            kind: "kind".to_owned(),
            status,
            item_count,
            message: "message".to_owned(),
            project_counts: BTreeMap::new(),
        }
    }

    fn normalized_record(subject: &str, url: &str) -> NormalizedRecord {
        NormalizedRecord {
            id: stable_id(subject, url),
            title: "title".to_owned(),
            url: url.to_owned(),
            source: "test source".to_owned(),
            source_kind: "test_kind".to_owned(),
            observed_at: DateTime::from_timestamp(3_600, 0).expect("observed time"),
            subject: subject.to_owned(),
            topic: "topic".to_owned(),
            summary: "summary".to_owned(),
            tags: Vec::new(),
            score: 1,
            status: "candidate".to_owned(),
            dedupe_key: url.to_owned(),
            provenance_json: serde_json::json!({}),
            normalized_json: serde_json::json!({}),
            raw_json: serde_json::json!({}),
        }
    }
}

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

#[derive(Debug, Deserialize, Clone)]
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

impl SourceConfig {
    pub fn adapter_id(&self) -> &str {
        self.adapter.as_deref().unwrap_or(self.kind.as_str())
    }

    pub fn cache_namespace(&self) -> String {
        slug(&self.kind)
    }

    pub fn cache_key_seed(&self) -> String {
        let mut parts = vec![self.name.clone(), self.kind.clone()];
        if let Some(adapter) = &self.adapter {
            parts.push(adapter.clone());
        }
        if !self.url.is_empty() {
            parts.push(self.url.clone());
        }
        if let Some(path) = &self.fixture_path {
            parts.push(path.to_string_lossy().into_owned());
        }
        if let Some(path) = &self.manual_path {
            parts.push(path.to_string_lossy().into_owned());
        }
        parts.join("|")
    }
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
        Self::from_records_with_status(
            source,
            if records.is_empty() {
                SourceRunStatus::Error
            } else {
                SourceRunStatus::Ok
            },
            records,
            message,
        )
    }

    pub fn from_records_with_status(
        source: &SourceConfig,
        status: SourceRunStatus,
        records: &[NormalizedRecord],
        message: impl Into<String>,
    ) -> Self {
        Self::with_counts(
            source,
            status,
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

    pub fn pending(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self::with_counts(
            source,
            SourceRunStatus::Pending,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceAdapterCacheContext {
    pub namespace: String,
    pub key_seed: String,
    pub cache_key: String,
    pub observed_after: DateTime<Utc>,
    pub max_age_hours: f64,
}

impl<'a> SourceAdapterContext<'a> {
    pub fn adapter_id(&self) -> &str {
        self.source.adapter_id()
    }

    pub fn cache_context(&self, max_age_hours: u64) -> SourceAdapterCacheContext {
        let namespace = self.source.cache_namespace();
        let key_seed = self.source.cache_key_seed();
        let cache_key = stable_id(&namespace, &key_seed);
        SourceAdapterCacheContext {
            namespace,
            key_seed,
            cache_key,
            observed_after: self.since,
            max_age_hours: max_age_hours as f64,
        }
    }
}

pub struct SourceAdapterOutput {
    pub records: Vec<NormalizedRecord>,
    pub source_runs: Vec<SourceRun>,
}

impl SourceAdapterOutput {
    pub fn new(records: Vec<NormalizedRecord>, source_runs: Vec<SourceRun>) -> Self {
        Self {
            records,
            source_runs,
        }
    }

    pub fn from_records(
        source: &SourceConfig,
        records: Vec<NormalizedRecord>,
        message: impl Into<String>,
    ) -> Self {
        let source_run = SourceRun::from_records(source, &records, message);
        Self {
            records,
            source_runs: vec![source_run],
        }
    }

    pub fn from_records_with_status(
        source: &SourceConfig,
        records: Vec<NormalizedRecord>,
        status: SourceRunStatus,
        message: impl Into<String>,
    ) -> Self {
        let source_run = SourceRun::from_records_with_status(source, status, &records, message);
        Self {
            records,
            source_runs: vec![source_run],
        }
    }

    pub fn error(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self {
            records: Vec::new(),
            source_runs: vec![SourceRun::error(source, message)],
        }
    }

    pub fn skipped(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self {
            records: Vec::new(),
            source_runs: vec![SourceRun::skipped(source, message)],
        }
    }

    pub fn pending(source: &SourceConfig, message: impl Into<String>) -> Self {
        Self {
            records: Vec::new(),
            source_runs: vec![SourceRun::pending(source, message)],
        }
    }
}

pub struct SourceAdapterRegistration {
    pub ids: &'static [&'static str],
    pub adapter: &'static dyn SourceAdapter,
}

impl SourceAdapterRegistration {
    pub const fn new(ids: &'static [&'static str], adapter: &'static dyn SourceAdapter) -> Self {
        Self { ids, adapter }
    }

    pub fn matches(&self, id: &str) -> bool {
        self.ids.iter().any(|registered_id| registered_id == &id)
    }
}

pub fn find_source_adapter<'a>(
    id: &str,
    adapters: &'a [SourceAdapterRegistration],
) -> Option<&'a dyn SourceAdapter> {
    adapters
        .iter()
        .find(|registration| registration.matches(id))
        .map(|registration| registration.adapter)
}

pub fn collect_source_adapter_outputs(
    config: &CrawlerConfig,
    live: bool,
    max_per_project: usize,
    since: DateTime<Utc>,
    editorial_focuses: &[EditorialFocus],
    adapters: &[SourceAdapterRegistration],
) -> anyhow::Result<(Vec<NormalizedRecord>, Vec<SourceRun>)> {
    let mut records = Vec::new();
    let mut source_runs = Vec::new();
    for source in &config.sources {
        let adapter_id = source.adapter_id();
        let adapter = find_source_adapter(adapter_id, adapters).ok_or_else(|| {
            anyhow::anyhow!(
                "{} uses unsupported source adapter {}",
                source.name,
                adapter_id
            )
        })?;
        let output = adapter.collect(SourceAdapterContext {
            config,
            source,
            live,
            max_per_project,
            since,
            editorial_focuses,
        })?;
        records.extend(output.records);
        source_runs.extend(output.source_runs);
    }
    Ok((records, source_runs))
}

pub trait SourceAdapter: Sync {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseReloadCommandSet {
    pub export_sql: Option<Vec<String>>,
    pub apply_sql: Vec<String>,
}

impl DatabaseReloadCommandSet {
    pub fn new(export_sql: Option<Vec<String>>, apply_sql: Vec<String>) -> Self {
        Self {
            export_sql,
            apply_sql,
        }
    }

    pub fn redacted_psql_apply(sql_path: impl Into<String>) -> Vec<String> {
        vec![
            "psql".to_owned(),
            "<redacted>".to_owned(),
            "-v".to_owned(),
            "ON_ERROR_STOP=1".to_owned(),
            "-f".to_owned(),
            sql_path.into(),
        ]
    }

    pub fn with_redacted_psql_apply(
        export_sql: Option<Vec<String>>,
        sql_path: impl Into<String>,
    ) -> Self {
        Self::new(export_sql, Self::redacted_psql_apply(sql_path))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseReloadHandoff {
    pub schema_version: u8,
    pub generated_at: DateTime<Utc>,
    pub kind: String,
    pub status: String,
    pub apply: bool,
    pub generated_sql: bool,
    pub instance: String,
    pub display_name: String,
    pub base_path: Option<String>,
    pub snapshot_path: Option<String>,
    pub sql_path: String,
    pub migration_paths: Vec<String>,
    pub database_env: String,
    pub commands: DatabaseReloadCommandSet,
    #[serde(default, skip_serializing_if = "serde_json::Value::is_null")]
    pub metadata: serde_json::Value,
}

impl DatabaseReloadHandoff {
    pub fn new(
        kind: impl Into<String>,
        apply: bool,
        generated_sql: bool,
        instance: impl Into<String>,
        display_name: impl Into<String>,
        base_path: Option<String>,
        snapshot_path: Option<String>,
        sql_path: impl Into<String>,
        migration_paths: Vec<String>,
        database_url_available: bool,
        commands: DatabaseReloadCommandSet,
        metadata: serde_json::Value,
    ) -> Self {
        Self {
            schema_version: 1,
            generated_at: Utc::now(),
            kind: kind.into(),
            status: Self::reload_status(apply).to_owned(),
            apply,
            generated_sql,
            instance: instance.into(),
            display_name: display_name.into(),
            base_path,
            snapshot_path,
            sql_path: sql_path.into(),
            migration_paths,
            database_env: Self::database_env_status(database_url_available).to_owned(),
            commands,
            metadata,
        }
    }

    pub fn reload_status(apply: bool) -> &'static str {
        if apply { "applied" } else { "preflight" }
    }

    pub fn database_env_status(database_url_available: bool) -> &'static str {
        if database_url_available {
            "provided"
        } else {
            "not_provided"
        }
    }

    pub fn write_pretty_json(&self, path: impl AsRef<Path>) -> std::io::Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        let text = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        fs::write(path, format!("{text}\n"))
    }
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
    fn source_adapter_output_from_records_builds_matching_source_run() {
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
            normalized_record("beta", "https://example.test/b"),
        ];

        let output = SourceAdapterOutput::from_records(&source, records, "collected records");

        assert_eq!(output.records.len(), 2);
        assert_eq!(output.source_runs.len(), 1);
        let source_run = &output.source_runs[0];
        assert_eq!(source_run.source, "test source");
        assert!(matches!(source_run.status, SourceRunStatus::Ok));
        assert_eq!(source_run.item_count, 2);
        assert_eq!(source_run.project_counts.get("alpha"), Some(&1));
        assert_eq!(source_run.project_counts.get("beta"), Some(&1));
    }

    #[test]
    fn source_adapter_output_terminal_constructors_are_empty() {
        let source = SourceConfig {
            name: "test source".to_owned(),
            kind: "test_kind".to_owned(),
            url: "https://example.test".to_owned(),
            adapter: Some("test-adapter".to_owned()),
            feed_urls: None,
            manual_path: None,
            fixture_path: None,
        };

        let error = SourceAdapterOutput::error(&source, "failed");
        let skipped = SourceAdapterOutput::skipped(&source, "not live");
        let pending = SourceAdapterOutput::pending(&source, "configure adapter");

        assert!(error.records.is_empty());
        assert_eq!(error.source_runs.len(), 1);
        assert!(matches!(
            error.source_runs[0].status,
            SourceRunStatus::Error
        ));
        assert_eq!(error.source_runs[0].message, "failed");
        assert!(skipped.records.is_empty());
        assert_eq!(skipped.source_runs.len(), 1);
        assert!(matches!(
            skipped.source_runs[0].status,
            SourceRunStatus::Skipped
        ));
        assert_eq!(skipped.source_runs[0].message, "not live");
        assert!(pending.records.is_empty());
        assert_eq!(pending.source_runs.len(), 1);
        assert!(matches!(
            pending.source_runs[0].status,
            SourceRunStatus::Pending
        ));
        assert_eq!(pending.source_runs[0].message, "configure adapter");
    }

    #[test]
    fn source_adapter_output_can_force_status_for_records() {
        let source = SourceConfig {
            name: "manual source".to_owned(),
            kind: "manual".to_owned(),
            url: "https://example.test".to_owned(),
            adapter: Some("manual".to_owned()),
            feed_urls: None,
            manual_path: None,
            fixture_path: None,
        };
        let records = vec![normalized_record("alpha", "https://example.test/a")];

        let output = SourceAdapterOutput::from_records_with_status(
            &source,
            records,
            SourceRunStatus::Error,
            "manual import is stale",
        );

        assert_eq!(output.records.len(), 1);
        assert_eq!(output.source_runs.len(), 1);
        assert!(matches!(
            output.source_runs[0].status,
            SourceRunStatus::Error
        ));
        assert_eq!(output.source_runs[0].item_count, 1);
        assert_eq!(output.source_runs[0].project_counts.get("alpha"), Some(&1));
        assert_eq!(output.source_runs[0].message, "manual import is stale");
    }

    #[test]
    fn collect_source_adapter_outputs_resolves_registered_aliases() {
        static TEST_ADAPTER: TestSourceAdapter = TestSourceAdapter;
        static ADAPTERS: &[SourceAdapterRegistration] = &[SourceAdapterRegistration::new(
            &["test-adapter", "test-kind"],
            &TEST_ADAPTER,
        )];
        let config = CrawlerConfig {
            theme: "demo".to_owned(),
            targets: Vec::new(),
            sources: vec![SourceConfig {
                name: "test source".to_owned(),
                kind: "test-kind".to_owned(),
                url: "https://example.test".to_owned(),
                adapter: Some("test-adapter".to_owned()),
                feed_urls: None,
                manual_path: None,
                fixture_path: None,
            }],
        };

        let (records, source_runs) =
            collect_source_adapter_outputs(&config, true, 7, Utc::now(), &[], ADAPTERS)
                .expect("collect adapter outputs");

        assert_eq!(records.len(), 1);
        assert_eq!(source_runs.len(), 1);
        assert_eq!(source_runs[0].source, "test source");
        assert!(matches!(source_runs[0].status, SourceRunStatus::Ok));
        assert_eq!(records[0].provenance_json["live"], true);
        assert_eq!(records[0].provenance_json["max_per_project"], 7);
    }

    #[test]
    fn find_source_adapter_resolves_aliases() {
        static TEST_ADAPTER: TestSourceAdapter = TestSourceAdapter;
        static ADAPTERS: &[SourceAdapterRegistration] = &[SourceAdapterRegistration::new(
            &["test-adapter", "test-kind"],
            &TEST_ADAPTER,
        )];

        let adapter = find_source_adapter("test-kind", ADAPTERS).expect("find adapter");

        assert_eq!(adapter.id(), "test-adapter");
        assert!(find_source_adapter("missing", ADAPTERS).is_none());
    }

    #[test]
    fn source_config_exposes_adapter_and_cache_identity() {
        let source = SourceConfig {
            name: "Manual Leads".to_owned(),
            kind: "Manual JSON".to_owned(),
            url: String::new(),
            adapter: None,
            feed_urls: None,
            manual_path: Some(PathBuf::from("data/manual.json")),
            fixture_path: Some(PathBuf::from("fixtures/manual.json")),
        };

        assert_eq!(source.adapter_id(), "Manual JSON");
        assert_eq!(source.cache_namespace(), "manual-json");
        assert!(source.cache_key_seed().contains("Manual Leads"));
        assert!(source.cache_key_seed().contains("fixtures/manual.json"));
        assert!(source.cache_key_seed().contains("data/manual.json"));

        let mut adapted = source.clone();
        adapted.adapter = Some("custom-adapter".to_owned());
        assert_eq!(adapted.adapter_id(), "custom-adapter");
        assert!(adapted.cache_key_seed().contains("custom-adapter"));
    }

    #[test]
    fn collect_source_adapter_outputs_reports_missing_adapter() {
        let config = CrawlerConfig {
            theme: "demo".to_owned(),
            targets: Vec::new(),
            sources: vec![SourceConfig {
                name: "test source".to_owned(),
                kind: "test-kind".to_owned(),
                url: "https://example.test".to_owned(),
                adapter: Some("missing-adapter".to_owned()),
                feed_urls: None,
                manual_path: None,
                fixture_path: None,
            }],
        };

        let error = collect_source_adapter_outputs(&config, true, 7, Utc::now(), &[], &[])
            .expect_err("missing adapter should fail");

        assert!(
            error
                .to_string()
                .contains("test source uses unsupported source adapter missing-adapter")
        );
    }

    #[test]
    fn source_adapter_context_builds_stable_cache_context() {
        let config = CrawlerConfig {
            theme: "demo".to_owned(),
            targets: Vec::new(),
            sources: Vec::new(),
        };
        let source = SourceConfig {
            name: "HTTP Records".to_owned(),
            kind: "HTTP JSON".to_owned(),
            url: "https://example.test/records.json".to_owned(),
            adapter: Some("http-record-json".to_owned()),
            feed_urls: None,
            manual_path: None,
            fixture_path: Some(PathBuf::from("fixtures/records.json")),
        };
        let since = Utc::now();
        let context = SourceAdapterContext {
            config: &config,
            source: &source,
            live: true,
            max_per_project: 10,
            since,
            editorial_focuses: &[],
        };

        let cache = context.cache_context(6);

        assert_eq!(context.adapter_id(), "http-record-json");
        assert_eq!(cache.namespace, "http-json");
        assert_eq!(cache.observed_after, since);
        assert_eq!(cache.max_age_hours, 6.0);
        assert!(cache.key_seed.contains("HTTP Records"));
        assert!(cache.key_seed.contains("fixtures/records.json"));
        assert_eq!(cache.cache_key, stable_id("http-json", &cache.key_seed));
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

    #[test]
    fn database_reload_command_set_builds_redacted_psql_apply() {
        let commands = DatabaseReloadCommandSet::with_redacted_psql_apply(
            Some(vec!["crawler".to_owned(), "export-sql".to_owned()]),
            "/tmp/load.sql",
        );

        assert_eq!(
            commands.export_sql,
            Some(vec!["crawler".to_owned(), "export-sql".to_owned()])
        );
        assert_eq!(
            commands.apply_sql,
            vec![
                "psql".to_owned(),
                "<redacted>".to_owned(),
                "-v".to_owned(),
                "ON_ERROR_STOP=1".to_owned(),
                "-f".to_owned(),
                "/tmp/load.sql".to_owned(),
            ]
        );
    }

    #[test]
    fn database_reload_handoff_constructor_sets_common_receipt_fields() {
        let handoff = DatabaseReloadHandoff::new(
            "test_reload",
            false,
            true,
            "demo",
            "Demo",
            Some("/demo/".to_owned()),
            Some("/tmp/snapshot.json".to_owned()),
            "/tmp/load.sql",
            vec!["db/migrations/0001.sql".to_owned()],
            false,
            DatabaseReloadCommandSet::with_redacted_psql_apply(None, "/tmp/load.sql"),
            serde_json::json!({"recordCount": 2}),
        );

        assert_eq!(handoff.schema_version, 1);
        assert_eq!(handoff.status, "preflight");
        assert_eq!(handoff.database_env, "not_provided");
        assert_eq!(handoff.instance, "demo");
        assert_eq!(handoff.base_path.as_deref(), Some("/demo/"));
        assert_eq!(
            handoff.commands.apply_sql,
            DatabaseReloadCommandSet::redacted_psql_apply("/tmp/load.sql")
        );
        assert_eq!(handoff.metadata["recordCount"], 2);

        let applied = DatabaseReloadHandoff::new(
            "test_reload",
            true,
            false,
            "demo",
            "Demo",
            None,
            None,
            "/tmp/load.sql",
            Vec::new(),
            true,
            DatabaseReloadCommandSet::with_redacted_psql_apply(None, "/tmp/load.sql"),
            serde_json::Value::Null,
        );
        assert_eq!(applied.status, "applied");
        assert_eq!(applied.database_env, "provided");
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

    struct TestSourceAdapter;

    impl SourceAdapter for TestSourceAdapter {
        fn id(&self) -> &'static str {
            "test-adapter"
        }

        fn collect(
            &self,
            context: SourceAdapterContext<'_>,
        ) -> anyhow::Result<SourceAdapterOutput> {
            let mut record = normalized_record("alpha", "https://example.test/a");
            record.provenance_json = serde_json::json!({
                "live": context.live,
                "max_per_project": context.max_per_project,
            });
            Ok(SourceAdapterOutput::from_records(
                context.source,
                vec![record],
                "test adapter collected records",
            ))
        }
    }
}

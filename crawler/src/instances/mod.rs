mod bundled;

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

use crate::core::{
    CrawlerCollection, CrawlerConfig, CrawlerSnapshot, EditorialFocus, NormalizedCollectionPlan,
};

pub struct LegacySqlExport {
    pub sql: String,
    pub record_count: usize,
    pub source_run_count: usize,
    pub plan_count: usize,
}

pub struct CrawlerInstanceRegistration {
    pub instance: &'static dyn CrawlerInstance,
    pub default: bool,
}

pub trait CrawlerInstance: Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn base_path(&self) -> &'static str;
    fn default_config_path(&self) -> PathBuf;
    fn default_item_payload_path(&self) -> PathBuf;
    fn default_source_runs_path(&self) -> PathBuf;
    fn default_public_snapshot_path(&self) -> PathBuf;
    fn default_editorial_state_path(&self) -> PathBuf;
    fn verify_config(&self, config: &CrawlerConfig) -> Result<()>;
    fn read_editorial_focuses(&self, path: &PathBuf) -> Result<Vec<EditorialFocus>>;
    fn collection_plans(
        &self,
        config: &CrawlerConfig,
        editorial_focuses: &[EditorialFocus],
    ) -> Vec<NormalizedCollectionPlan>;
    fn collect(
        &self,
        config: &CrawlerConfig,
        live: bool,
        max_per_project: usize,
        since: DateTime<Utc>,
        editorial_focuses: &[EditorialFocus],
    ) -> Result<CrawlerCollection>;
    fn legacy_sql_export(
        &self,
        _target: &str,
        _snapshot: Option<&PathBuf>,
        _input: &PathBuf,
        _source_runs: &PathBuf,
    ) -> Result<Option<LegacySqlExport>> {
        Ok(None)
    }
    fn public_snapshot_as_crawler_snapshot(
        &self,
        _value: serde_json::Value,
        _path: &PathBuf,
    ) -> Result<Option<CrawlerSnapshot>> {
        Ok(None)
    }
    fn split_payload_as_crawler_snapshot(
        &self,
        _input: &PathBuf,
        _source_runs: &PathBuf,
    ) -> Result<Option<CrawlerSnapshot>> {
        Ok(None)
    }
}

pub static REGISTERED_CRAWLER_INSTANCES: &[CrawlerInstanceRegistration] =
    bundled::BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS;

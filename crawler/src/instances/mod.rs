pub mod garbage;
pub mod greathouse;

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
    fn default_public_snapshot_path(&self) -> PathBuf;
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

pub static REGISTERED_CRAWLER_INSTANCES: &[CrawlerInstanceRegistration] = &[
    CrawlerInstanceRegistration {
        instance: &garbage::GARBAGE_CRAWLER_INSTANCE,
        default: true,
    },
    CrawlerInstanceRegistration {
        instance: &greathouse::GREATHOUSE_CRAWLER_INSTANCE,
        default: false,
    },
];

pub fn default_crawler_instance() -> &'static dyn CrawlerInstance {
    REGISTERED_CRAWLER_INSTANCES
        .iter()
        .find(|entry| entry.default)
        .or_else(|| REGISTERED_CRAWLER_INSTANCES.first())
        .map(|entry| entry.instance)
        .expect("at least one crawler instance is registered")
}

pub fn crawler_instance(instance: &str) -> Result<&'static dyn CrawlerInstance> {
    if let Some(entry) = REGISTERED_CRAWLER_INSTANCES
        .iter()
        .find(|entry| entry.instance.id() == instance)
    {
        return Ok(entry.instance);
    }
    anyhow::bail!(
        "unknown crawler instance {instance:?}; supported instances: {}",
        supported_crawler_instance_ids().join(", ")
    )
}

fn supported_crawler_instance_ids() -> Vec<&'static str> {
    REGISTERED_CRAWLER_INSTANCES
        .iter()
        .map(|entry| entry.instance.id())
        .collect()
}

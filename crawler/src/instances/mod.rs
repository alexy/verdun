pub mod garbage;
pub mod greathouse;

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

use crate::core::{CrawlerCollection, CrawlerConfig, EditorialFocus, NormalizedCollectionPlan};

pub trait CrawlerInstance {
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
}

pub fn default_crawler_instance() -> &'static dyn CrawlerInstance {
    &garbage::GARBAGE_CRAWLER_INSTANCE
}

pub fn crawler_instance(instance: &str) -> Result<&'static dyn CrawlerInstance> {
    match instance {
        "garbage" => Ok(default_crawler_instance()),
        "greathouse" => Ok(&greathouse::GREATHOUSE_CRAWLER_INSTANCE),
        other => {
            anyhow::bail!(
                "unknown crawler instance {other:?}; supported instances: garbage, greathouse"
            )
        }
    }
}

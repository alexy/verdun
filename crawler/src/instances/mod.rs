pub mod garbage;
pub mod greathouse;

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

use crate::core::{CrawlerConfig, SourceRun};
use garbage::{EditorialFocus, NewsItem, ProjectQueryPlan};

pub trait CrawlerInstance {
    fn id(&self) -> &'static str;
    fn verify_config(&self, config: &CrawlerConfig) -> Result<()>;
    fn read_editorial_focuses(&self, path: &PathBuf) -> Result<Vec<EditorialFocus>>;
    fn query_plans(
        &self,
        config: &CrawlerConfig,
        editorial_focuses: &[EditorialFocus],
    ) -> Vec<ProjectQueryPlan>;
    fn seed_items(&self, config: &CrawlerConfig) -> Vec<NewsItem>;
    fn seed_source_runs(&self, config: &CrawlerConfig, live: bool) -> Vec<SourceRun>;
    fn collect_live_items(
        &self,
        config: &CrawlerConfig,
        max_per_project: usize,
        since: DateTime<Utc>,
        editorial_focuses: &[EditorialFocus],
    ) -> Result<(Vec<NewsItem>, Vec<SourceRun>)>;
    fn dedupe_items(&self, items: Vec<NewsItem>) -> Vec<NewsItem>;
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

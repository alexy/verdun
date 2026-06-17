pub mod garbage;

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

use crate::core::{CrawlerConfig, SourceRun};
use garbage::{EditorialFocus, NewsItem};

pub trait CrawlerInstance {
    fn read_editorial_focuses(&self, path: &PathBuf) -> Result<Vec<EditorialFocus>>;
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

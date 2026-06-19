#[path = "demo.rs"]
pub mod demo;

use super::CrawlerInstanceRegistration;

pub static BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS: &[CrawlerInstanceRegistration] =
    &[CrawlerInstanceRegistration {
        instance: &demo::CRAWLER_INSTANCE,
        default: true,
    }];

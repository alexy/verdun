#[path = "external.rs"]
mod external;
#[path = "greathouse.rs"]
pub mod greathouse;

use super::CrawlerInstanceRegistration;

pub static BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS: &[CrawlerInstanceRegistration] = &[
    CrawlerInstanceRegistration {
        instance: &external::garbage::CRAWLER_INSTANCE,
        default: true,
    },
    CrawlerInstanceRegistration {
        instance: &greathouse::CRAWLER_INSTANCE,
        default: false,
    },
];

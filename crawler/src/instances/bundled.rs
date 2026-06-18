#[path = "garbage.rs"]
pub mod garbage;
#[path = "greathouse.rs"]
pub mod greathouse;

use super::CrawlerInstanceRegistration;

pub static BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS: &[CrawlerInstanceRegistration] = &[
    CrawlerInstanceRegistration {
        instance: &garbage::CRAWLER_INSTANCE,
        default: true,
    },
    CrawlerInstanceRegistration {
        instance: &greathouse::CRAWLER_INSTANCE,
        default: false,
    },
];

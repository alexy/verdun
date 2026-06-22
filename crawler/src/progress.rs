use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

const DEFAULT_PROGRESS_JSONL: &str = ".codex-artifacts/crawler-progress/progress.jsonl";
const DEFAULT_PROGRESS_LATEST: &str = ".codex-artifacts/crawler-progress/latest.json";

#[derive(Debug, Clone)]
pub struct CrawlerProgressSink {
    run_id: String,
    jsonl_path: Option<PathBuf>,
    latest_path: Option<PathBuf>,
    stderr: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlerProgressEvent {
    pub schema_version: u32,
    pub run_id: String,
    pub emitted_at: DateTime<Utc>,
    pub instance: String,
    pub phase: String,
    pub status: String,
    pub message: String,
    pub current: Option<u64>,
    pub total: Option<u64>,
    pub metadata: Value,
}

impl CrawlerProgressSink {
    pub fn from_env(instance: impl Into<String>) -> Self {
        let disabled = std::env::var("VERDUN_CRAWLER_PROGRESS").as_deref() == Ok("0");
        if disabled {
            return Self::disabled();
        }
        Self {
            run_id: std::env::var("VERDUN_CRAWLER_PROGRESS_RUN_ID")
                .unwrap_or_else(|_| default_run_id()),
            jsonl_path: Some(
                std::env::var("VERDUN_CRAWLER_PROGRESS_JSONL")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from(DEFAULT_PROGRESS_JSONL)),
            ),
            latest_path: Some(
                std::env::var("VERDUN_CRAWLER_PROGRESS_LATEST")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from(DEFAULT_PROGRESS_LATEST)),
            ),
            stderr: std::env::var("VERDUN_CRAWLER_PROGRESS_STDERR").as_deref() == Ok("1"),
        }
        .with_instance(instance)
    }

    pub fn disabled() -> Self {
        Self {
            run_id: default_run_id(),
            jsonl_path: None,
            latest_path: None,
            stderr: false,
        }
    }

    pub fn with_paths(
        run_id: impl Into<String>,
        jsonl_path: Option<PathBuf>,
        latest_path: Option<PathBuf>,
        stderr: bool,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            jsonl_path,
            latest_path,
            stderr,
        }
    }

    fn with_instance(self, _instance: impl Into<String>) -> Self {
        self
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    pub fn emit(
        &self,
        instance: impl Into<String>,
        phase: impl Into<String>,
        status: impl Into<String>,
        message: impl Into<String>,
    ) -> Result<()> {
        self.emit_event(CrawlerProgressEvent {
            schema_version: 1,
            run_id: self.run_id.clone(),
            emitted_at: Utc::now(),
            instance: instance.into(),
            phase: phase.into(),
            status: status.into(),
            message: message.into(),
            current: None,
            total: None,
            metadata: Value::Object(Default::default()),
        })
    }

    pub fn emit_count(
        &self,
        instance: impl Into<String>,
        phase: impl Into<String>,
        status: impl Into<String>,
        message: impl Into<String>,
        current: u64,
        total: u64,
        metadata: Value,
    ) -> Result<()> {
        self.emit_event(CrawlerProgressEvent {
            schema_version: 1,
            run_id: self.run_id.clone(),
            emitted_at: Utc::now(),
            instance: instance.into(),
            phase: phase.into(),
            status: status.into(),
            message: message.into(),
            current: Some(current),
            total: Some(total),
            metadata,
        })
    }

    pub fn emit_event(&self, event: CrawlerProgressEvent) -> Result<()> {
        if self.stderr {
            eprintln!("{}", pretty_event_line(&event));
        }
        let text = serde_json::to_string(&event)?;
        if let Some(path) = &self.jsonl_path {
            append_line(path, &text)?;
        }
        if let Some(path) = &self.latest_path {
            write_latest(path, &event)?;
        }
        Ok(())
    }
}

fn pretty_event_line(event: &CrawlerProgressEvent) -> String {
    let progress = match (event.current, event.total) {
        (Some(current), Some(total)) if total > 0 => {
            let width = 24_u64;
            let filled = ((current.min(total) * width) / total) as usize;
            let empty = width as usize - filled;
            format!(
                " [{}{}] {}/{}",
                "#".repeat(filled),
                ".".repeat(empty),
                current,
                total
            )
        }
        _ => String::new(),
    };
    format!(
        "[crawler-progress] {:<24} {:<14} {:<10}{}  {}",
        event.instance, event.phase, event.status, progress, event.message
    )
}

fn default_run_id() -> String {
    format!(
        "crawler-{}-{}",
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        std::process::id()
    )
}

fn append_line(path: &Path, text: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("opening {}", path.display()))?;
    writeln!(file, "{text}").with_context(|| format!("writing {}", path.display()))
}

fn write_latest(path: &Path, event: &CrawlerProgressEvent) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(event)?;
    fs::write(path, format!("{text}\n")).with_context(|| format!("writing {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn progress_sink_writes_jsonl_and_latest() {
        let root =
            std::env::temp_dir().join(format!("verdun-progress-test-{}", std::process::id()));
        let jsonl = root.join("progress.jsonl");
        let latest = root.join("latest.json");
        let _ = fs::remove_dir_all(&root);

        let sink = CrawlerProgressSink::with_paths(
            "test-run",
            Some(jsonl.clone()),
            Some(latest.clone()),
            false,
        );
        sink.emit_count(
            "demo",
            "collect",
            "running",
            "collected records",
            2,
            5,
            json!({"area": "demo"}),
        )
        .expect("emit progress");

        let jsonl_text = fs::read_to_string(&jsonl).expect("read jsonl");
        assert_eq!(jsonl_text.lines().count(), 1);
        let event: CrawlerProgressEvent =
            serde_json::from_str(jsonl_text.trim()).expect("parse jsonl event");
        assert_eq!(event.run_id, "test-run");
        assert_eq!(event.current, Some(2));
        assert_eq!(event.total, Some(5));

        let latest_event: CrawlerProgressEvent =
            serde_json::from_str(&fs::read_to_string(&latest).expect("read latest"))
                .expect("parse latest");
        assert_eq!(latest_event.metadata["area"], "demo");
        assert!(pretty_event_line(&latest_event).contains("[#########...............] 2/5"));

        let _ = fs::remove_dir_all(&root);
    }
}

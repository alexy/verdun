use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

const DEFAULT_CHECKPOINT_PATH: &str = ".codex-artifacts/crawler-progress/checkpoint.json";

#[derive(Debug, Clone)]
pub struct CrawlerCheckpointStore {
    path: Option<PathBuf>,
    state: CrawlerCheckpointState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlerCheckpointState {
    pub schema_version: u32,
    pub run_id: String,
    pub instance: String,
    pub updated_at: DateTime<Utc>,
    pub units: BTreeMap<String, CrawlerCheckpointUnit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlerCheckpointUnit {
    pub status: String,
    pub completed_at: Option<DateTime<Utc>>,
    pub payload: Value,
    pub metadata: Value,
}

impl CrawlerCheckpointStore {
    pub fn from_env(instance: impl Into<String>, run_id: impl Into<String>) -> Result<Self> {
        if std::env::var("VERDUN_CRAWLER_CHECKPOINT").as_deref() == Ok("0") {
            return Ok(Self::disabled(instance, run_id));
        }
        let path = std::env::var("VERDUN_CRAWLER_CHECKPOINT_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(DEFAULT_CHECKPOINT_PATH));
        Self::open(path, instance, run_id)
    }

    pub fn disabled(instance: impl Into<String>, run_id: impl Into<String>) -> Self {
        Self {
            path: None,
            state: CrawlerCheckpointState::new(instance, run_id),
        }
    }

    pub fn open(
        path: impl Into<PathBuf>,
        instance: impl Into<String>,
        run_id: impl Into<String>,
    ) -> Result<Self> {
        let path = path.into();
        let fallback = CrawlerCheckpointState::new(instance, run_id);
        let state = if path.exists() {
            let text = fs::read_to_string(&path)
                .with_context(|| format!("failed to read {}", path.display()))?;
            serde_json::from_str(&text)
                .with_context(|| format!("failed to parse {}", path.display()))?
        } else {
            fallback
        };
        Ok(Self {
            path: Some(path),
            state,
        })
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn state(&self) -> &CrawlerCheckpointState {
        &self.state
    }

    pub fn completed_payload(&self, unit_id: &str) -> Option<&Value> {
        self.state
            .units
            .get(unit_id)
            .filter(|unit| unit.status == "completed")
            .map(|unit| &unit.payload)
    }

    pub fn mark_started(&mut self, unit_id: impl Into<String>, metadata: Value) -> Result<()> {
        let unit_id = unit_id.into();
        self.state.units.insert(
            unit_id,
            CrawlerCheckpointUnit {
                status: "started".to_owned(),
                completed_at: None,
                payload: Value::Null,
                metadata,
            },
        );
        self.persist()
    }

    pub fn mark_completed(
        &mut self,
        unit_id: impl Into<String>,
        payload: Value,
        metadata: Value,
    ) -> Result<()> {
        let unit_id = unit_id.into();
        self.state.units.insert(
            unit_id,
            CrawlerCheckpointUnit {
                status: "completed".to_owned(),
                completed_at: Some(Utc::now()),
                payload,
                metadata,
            },
        );
        self.persist()
    }

    pub fn persist(&mut self) -> Result<()> {
        self.state.updated_at = Utc::now();
        let Some(path) = &self.path else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
        }
        let text = serde_json::to_string_pretty(&self.state)?;
        fs::write(path, format!("{text}\n")).with_context(|| format!("writing {}", path.display()))
    }
}

impl CrawlerCheckpointState {
    pub fn new(instance: impl Into<String>, run_id: impl Into<String>) -> Self {
        Self {
            schema_version: 1,
            run_id: run_id.into(),
            instance: instance.into(),
            updated_at: Utc::now(),
            units: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn checkpoint_store_round_trips_completed_payloads() {
        let root =
            std::env::temp_dir().join(format!("verdun-checkpoint-test-{}", std::process::id()));
        let path = root.join("checkpoint.json");
        let _ = fs::remove_dir_all(&root);

        let mut store =
            CrawlerCheckpointStore::open(&path, "demo", "run-1").expect("open checkpoint");
        store
            .mark_started("area:a", json!({"name": "Area A"}))
            .expect("mark started");
        store
            .mark_completed("area:a", json!([{"id": 1}]), json!({"count": 1}))
            .expect("mark completed");

        let reopened =
            CrawlerCheckpointStore::open(&path, "demo", "run-2").expect("reopen checkpoint");
        assert_eq!(
            reopened.completed_payload("area:a").expect("payload")[0]["id"],
            1
        );

        let _ = fs::remove_dir_all(&root);
    }
}

use anyhow::{Context, Result};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct JsonDiskCache {
    root: PathBuf,
}

#[derive(Debug, Clone)]
pub struct CacheRead<T> {
    pub path: PathBuf,
    pub value: Option<T>,
}

impl<T> CacheRead<T> {
    pub fn hit(&self) -> bool {
        self.value.is_some()
    }
}

impl JsonDiskCache {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn path_for(&self, namespace: &str, key: &str) -> PathBuf {
        self.root
            .join(slug_path_part(namespace))
            .join(format!("{}.json", cache_digest(key)))
    }

    pub fn read_json<T: DeserializeOwned>(
        &self,
        namespace: &str,
        key: &str,
    ) -> Result<CacheRead<T>> {
        let path = self.path_for(namespace, key);
        if !path.exists() {
            return Ok(CacheRead { path, value: None });
        }
        let text = fs::read_to_string(&path)
            .with_context(|| format!("reading cached JSON {}", path.display()))?;
        let value = serde_json::from_str(&text)
            .with_context(|| format!("parsing cached JSON {}", path.display()))?;
        Ok(CacheRead {
            path,
            value: Some(value),
        })
    }

    pub fn write_json<T: Serialize>(
        &self,
        namespace: &str,
        key: &str,
        value: &T,
    ) -> Result<PathBuf> {
        let path = self.path_for(namespace, key);
        write_pretty_json(&path, value)?;
        Ok(path)
    }
}

pub fn write_pretty_json<T: Serialize>(path: impl AsRef<Path>, value: &T) -> Result<()> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(value)?;
    fs::write(path, text).with_context(|| format!("writing {}", path.display()))
}

pub fn write_text(path: impl AsRef<Path>, text: impl AsRef<str>) -> Result<()> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    fs::write(path, text.as_ref()).with_context(|| format!("writing {}", path.display()))
}

fn cache_digest(key: &str) -> String {
    let digest = Sha256::digest(key.as_bytes());
    digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn slug_path_part(value: &str) -> String {
    let slug = value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "default".to_owned()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn cache_path_is_deterministic_and_sanitized() {
        let cache = JsonDiskCache::new("/tmp/verdun-cache-test");

        let first = cache.path_for("HTTP JSON", "https://example.com/a?b=1");
        let second = cache.path_for("HTTP JSON", "https://example.com/a?b=1");
        let different = cache.path_for("HTTP JSON", "https://example.com/a?b=2");

        assert_eq!(first, second);
        assert_ne!(first, different);
        assert!(first.starts_with("/tmp/verdun-cache-test/http-json"));
        assert_eq!(
            first.extension().and_then(|value| value.to_str()),
            Some("json")
        );
    }

    #[test]
    fn cache_reports_miss_then_hit() {
        let root = temp_root("cache-hit");
        let cache = JsonDiskCache::new(&root);

        let miss: CacheRead<serde_json::Value> = cache
            .read_json("records", "subject-a")
            .expect("read cache miss");
        assert!(!miss.hit());
        assert!(miss.value.is_none());

        let path = cache
            .write_json("records", "subject-a", &json!({"ok": true}))
            .expect("write cache");
        assert!(path.exists());

        let hit: CacheRead<serde_json::Value> = cache
            .read_json("records", "subject-a")
            .expect("read cache hit");
        assert!(hit.hit());
        assert_eq!(hit.value, Some(json!({"ok": true})));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn artifact_writers_create_parent_directories() {
        let root = temp_root("artifact-write");
        let json_path = root.join("nested").join("artifact.json");
        let text_path = root.join("nested").join("artifact.txt");

        write_pretty_json(&json_path, &json!({"items": [1, 2]})).expect("write json");
        write_text(&text_path, "hello").expect("write text");

        assert!(json_path.exists());
        assert_eq!(fs::read_to_string(text_path).expect("read text"), "hello");

        let _ = fs::remove_dir_all(root);
    }

    fn temp_root(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        std::env::temp_dir().join(format!("verdun-{name}-{nonce}"))
    }
}

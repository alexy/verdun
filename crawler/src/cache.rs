use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

static CACHE_WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const CACHE_METADATA_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone)]
pub struct JsonDiskCache {
    root: PathBuf,
}

#[derive(Debug, Clone)]
pub struct CacheRead<T> {
    pub path: PathBuf,
    pub value: Option<T>,
}

#[derive(Debug, Clone, Copy)]
pub struct ReadableJsonDiskCache<'a> {
    root: Option<&'a Path>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheWriteMetadata {
    schema_version: u32,
    namespace: String,
    key: String,
    payload_file: String,
    payload_bytes: usize,
    written_at_unix: u64,
    backfilled: bool,
    key_recovered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheNamespacePolicy {
    pub stale_after_hours: f64,
    pub freshness_class: String,
    pub refresh_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonCacheNamespaceAudit {
    pub name: String,
    pub files: u64,
    pub json_files: u64,
    pub payload_json_files: u64,
    pub metadata_files: u64,
    pub payloads_with_metadata: u64,
    pub legacy_payload_json_files: u64,
    pub metadata_coverage_ratio: Option<f64>,
    pub corrupt_json_files: u64,
    pub temp_files: u64,
    pub bytes: u64,
    pub oldest_modified_iso: Option<String>,
    pub newest_modified_iso: Option<String>,
    pub oldest_age_hours: Option<f64>,
    pub newest_age_hours: Option<f64>,
    pub stale_after_hours: f64,
    pub freshness_class: String,
    pub refresh_reason: String,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonCacheAudit {
    pub enabled: bool,
    pub directory: String,
    pub files: u64,
    pub json_files: u64,
    pub payload_json_files: u64,
    pub metadata_files: u64,
    pub payloads_with_metadata: u64,
    pub legacy_payload_json_files: u64,
    pub metadata_coverage_ratio: Option<f64>,
    pub corrupt_json_files: u64,
    pub temp_files: u64,
    pub bytes: u64,
    pub oldest_age_hours: Option<f64>,
    pub newest_age_hours: Option<f64>,
    pub default_stale_after_hours: f64,
    pub stale_namespaces: usize,
    pub namespaces: Vec<JsonCacheNamespaceAudit>,
}

impl<T> CacheRead<T> {
    pub fn hit(&self) -> bool {
        self.value.is_some()
    }
}

impl<'a> ReadableJsonDiskCache<'a> {
    pub fn new(root: Option<&'a Path>) -> Self {
        Self { root }
    }

    pub fn namespace_dir(&self, namespace: &str) -> Option<PathBuf> {
        Some(self.root?.join(namespace))
    }

    pub fn path(&self, namespace: &str, key: &str) -> Option<PathBuf> {
        let mut path = self.namespace_dir(namespace)?;
        path.push(format!("{}.json", safe_cache_key(key)));
        Some(path)
    }

    pub fn read<T>(&self, namespace: &str, key: &str) -> Option<T>
    where
        T: DeserializeOwned,
    {
        let path = self.path(namespace, key)?;
        self.read_path(&path)
    }

    pub fn read_path<T>(&self, path: &Path) -> Option<T>
    where
        T: DeserializeOwned,
    {
        let text = fs::read_to_string(path).ok()?;
        serde_json::from_str::<T>(&text).ok()
    }

    pub fn read_fresh_path<T>(&self, path: &Path, max_age: Duration) -> Option<T>
    where
        T: DeserializeOwned,
    {
        let modified = fs::metadata(path).ok()?.modified().ok()?;
        if modified.elapsed().ok()? > max_age {
            return None;
        }
        self.read_path(path)
    }

    pub fn write<T>(&self, namespace: &str, key: &str, value: &T)
    where
        T: Serialize,
    {
        let Some(path) = self.path(namespace, key) else {
            return;
        };
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(value)
            && write_atomic_json(&path, &text).is_ok()
        {
            let _ = write_cache_metadata(namespace, key, &path, text.as_bytes().len() + 1);
        }
    }
}

pub fn backfill_cache_metadata(root: &Path) -> Result<serde_json::Value> {
    let mut summary = BackfillSummary::default();
    if !root.exists() {
        return Ok(summary.into_json(root));
    }
    backfill_dir(root, root, &mut summary)?;
    Ok(summary.into_json(root))
}

#[derive(Default)]
struct BackfillSummary {
    payload_json_files: u64,
    existing_metadata_files: u64,
    payloads_with_existing_metadata: u64,
    written_metadata_files: u64,
    skipped_corrupt_json_files: u64,
    skipped_non_json_files: u64,
    failed_metadata_writes: u64,
}

impl BackfillSummary {
    fn into_json(self, root: &Path) -> serde_json::Value {
        serde_json::json!({
            "cacheDir": path_string(root),
            "payloadJsonFiles": self.payload_json_files,
            "existingMetadataFiles": self.existing_metadata_files,
            "payloadsWithExistingMetadata": self.payloads_with_existing_metadata,
            "writtenMetadataFiles": self.written_metadata_files,
            "skippedCorruptJsonFiles": self.skipped_corrupt_json_files,
            "skippedNonJsonFiles": self.skipped_non_json_files,
            "failedMetadataWrites": self.failed_metadata_writes,
        })
    }
}

fn backfill_dir(root: &Path, dir: &Path, summary: &mut BackfillSummary) -> Result<()> {
    let paths = fs::read_dir(dir)
        .with_context(|| format!("failed to read cache dir {}", dir.display()))?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()
        .with_context(|| format!("failed to list cache dir {}", dir.display()))?;
    for path in paths {
        if path.is_dir() {
            backfill_dir(root, &path, summary)?;
            continue;
        }
        if is_cache_metadata_path(&path) {
            summary.existing_metadata_files += 1;
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            summary.skipped_non_json_files += 1;
            continue;
        }
        summary.payload_json_files += 1;
        let Some(metadata_path) = cache_metadata_path(&path) else {
            summary.failed_metadata_writes += 1;
            continue;
        };
        if metadata_path.exists() {
            summary.payloads_with_existing_metadata += 1;
            continue;
        }
        let text = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        if serde_json::from_str::<serde_json::Value>(&text).is_err() {
            summary.skipped_corrupt_json_files += 1;
            continue;
        }
        let namespace = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .parent()
            .and_then(|parent| parent.components().next())
            .map(|component| component.as_os_str().to_string_lossy().to_string())
            .unwrap_or_else(|| "root".to_owned());
        let key = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("legacy-cache-payload");
        match write_cache_metadata_with_flags(&namespace, key, &path, text.as_bytes().len(), true) {
            Ok(()) => summary.written_metadata_files += 1,
            Err(_) => summary.failed_metadata_writes += 1,
        }
    }
    Ok(())
}

fn write_cache_metadata(
    namespace: &str,
    key: &str,
    payload_path: &Path,
    payload_bytes: usize,
) -> std::io::Result<()> {
    write_cache_metadata_with_flags(namespace, key, payload_path, payload_bytes, false)
}

fn write_cache_metadata_with_flags(
    namespace: &str,
    key: &str,
    payload_path: &Path,
    payload_bytes: usize,
    backfilled: bool,
) -> std::io::Result<()> {
    let Some(metadata_path) = cache_metadata_path(payload_path) else {
        return Ok(());
    };
    let metadata = CacheWriteMetadata {
        schema_version: CACHE_METADATA_SCHEMA_VERSION,
        namespace: namespace.to_owned(),
        key: key.to_owned(),
        payload_file: payload_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("cache.json")
            .to_owned(),
        payload_bytes,
        written_at_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
        backfilled,
        key_recovered: !backfilled,
    };
    let text = serde_json::to_string_pretty(&metadata)?;
    write_atomic_json(&metadata_path, &text)
}

fn cache_metadata_path(payload_path: &Path) -> Option<PathBuf> {
    let file_name = payload_path.file_name()?.to_str()?;
    Some(payload_path.with_file_name(format!("{file_name}.meta.json")))
}

fn write_atomic_json(path: &Path, text: &str) -> std::io::Result<()> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cache.json");
    let sequence = CACHE_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temp_path = parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        sequence
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)?;
        file.write_all(text.as_bytes())?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp_path, path)?;
        if let Ok(parent_dir) = fs::File::open(parent) {
            let _ = parent_dir.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub fn audit_json_cache(
    root: impl AsRef<Path>,
    default_stale_after_hours: f64,
    policy_for_namespace: impl Fn(&str, f64) -> CacheNamespacePolicy,
) -> Result<JsonCacheAudit> {
    let root = root.as_ref();
    if !root.exists() {
        return Ok(JsonCacheAudit {
            enabled: false,
            directory: path_string(root),
            files: 0,
            json_files: 0,
            payload_json_files: 0,
            metadata_files: 0,
            payloads_with_metadata: 0,
            legacy_payload_json_files: 0,
            metadata_coverage_ratio: None,
            corrupt_json_files: 0,
            temp_files: 0,
            bytes: 0,
            oldest_age_hours: None,
            newest_age_hours: None,
            default_stale_after_hours,
            stale_namespaces: 0,
            namespaces: Vec::new(),
        });
    }

    let mut namespaces = BTreeMap::<String, NamespaceStats>::new();
    collect_cache_files(root, root, &mut namespaces)?;
    let mut rows = namespaces
        .into_iter()
        .map(|(name, stats)| {
            stats.into_audit(name, default_stale_after_hours, &policy_for_namespace)
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| right.bytes.cmp(&left.bytes));

    let files = rows.iter().map(|row| row.files).sum();
    let json_files = rows.iter().map(|row| row.json_files).sum();
    let payload_json_files = rows.iter().map(|row| row.payload_json_files).sum();
    let metadata_files = rows.iter().map(|row| row.metadata_files).sum();
    let payloads_with_metadata = rows.iter().map(|row| row.payloads_with_metadata).sum();
    let legacy_payload_json_files = rows.iter().map(|row| row.legacy_payload_json_files).sum();
    let corrupt_json_files = rows.iter().map(|row| row.corrupt_json_files).sum();
    let temp_files = rows.iter().map(|row| row.temp_files).sum();
    let bytes = rows.iter().map(|row| row.bytes).sum();
    let stale_namespaces = rows.iter().filter(|row| row.stale).count();

    Ok(JsonCacheAudit {
        enabled: true,
        directory: path_string(root),
        files,
        json_files,
        payload_json_files,
        metadata_files,
        payloads_with_metadata,
        legacy_payload_json_files,
        metadata_coverage_ratio: metadata_coverage_ratio(
            payloads_with_metadata,
            payload_json_files,
        ),
        corrupt_json_files,
        temp_files,
        bytes,
        oldest_age_hours: round_opt(
            rows.iter()
                .filter_map(|row| row.oldest_age_hours)
                .reduce(f64::max),
        ),
        newest_age_hours: round_opt(
            rows.iter()
                .filter_map(|row| row.newest_age_hours)
                .reduce(f64::min),
        ),
        default_stale_after_hours,
        stale_namespaces,
        namespaces: rows,
    })
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

#[derive(Default)]
struct NamespaceStats {
    files: u64,
    json_files: u64,
    payload_json_files: u64,
    metadata_files: u64,
    payload_names: BTreeSet<String>,
    metadata_payload_names: BTreeSet<String>,
    corrupt_json_files: u64,
    temp_files: u64,
    bytes: u64,
    oldest: Option<SystemTime>,
    newest: Option<SystemTime>,
}

impl NamespaceStats {
    fn add(&mut self, path: &Path, bytes: u64, modified: SystemTime) {
        self.files += 1;
        self.bytes += bytes;
        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            self.json_files += 1;
            if is_cache_metadata_path(path) {
                self.metadata_files += 1;
                if let Some(payload_name) = metadata_payload_name(path) {
                    self.metadata_payload_names.insert(payload_name);
                }
            } else {
                self.payload_json_files += 1;
                if let Some(payload_name) = path.file_name().and_then(|name| name.to_str()) {
                    self.payload_names.insert(payload_name.to_owned());
                }
            }
            if !cache_json_is_valid(path) {
                self.corrupt_json_files += 1;
            }
        }
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".tmp"))
        {
            self.temp_files += 1;
        }
        self.oldest = Some(
            self.oldest
                .map(|oldest| oldest.min(modified))
                .unwrap_or(modified),
        );
        self.newest = Some(
            self.newest
                .map(|newest| newest.max(modified))
                .unwrap_or(modified),
        );
    }

    fn into_audit(
        self,
        name: String,
        default_stale_after_hours: f64,
        policy_for_namespace: &impl Fn(&str, f64) -> CacheNamespacePolicy,
    ) -> JsonCacheNamespaceAudit {
        let oldest_age_hours = self.oldest.map(age_hours);
        let newest_age_hours = self.newest.map(age_hours);
        let payloads_with_metadata = self
            .payload_names
            .intersection(&self.metadata_payload_names)
            .count() as u64;
        let legacy_payload_json_files = self
            .payload_json_files
            .saturating_sub(payloads_with_metadata);
        let policy = policy_for_namespace(&name, default_stale_after_hours);
        JsonCacheNamespaceAudit {
            name,
            files: self.files,
            json_files: self.json_files,
            payload_json_files: self.payload_json_files,
            metadata_files: self.metadata_files,
            payloads_with_metadata,
            legacy_payload_json_files,
            metadata_coverage_ratio: metadata_coverage_ratio(
                payloads_with_metadata,
                self.payload_json_files,
            ),
            corrupt_json_files: self.corrupt_json_files,
            temp_files: self.temp_files,
            bytes: self.bytes,
            oldest_modified_iso: self.oldest.map(system_time_iso),
            newest_modified_iso: self.newest.map(system_time_iso),
            oldest_age_hours: round_opt(oldest_age_hours),
            newest_age_hours: round_opt(newest_age_hours),
            stale_after_hours: policy.stale_after_hours,
            freshness_class: policy.freshness_class,
            refresh_reason: policy.refresh_reason,
            stale: oldest_age_hours
                .map(|age| age > policy.stale_after_hours)
                .unwrap_or(false),
        }
    }
}

fn collect_cache_files(
    root: &Path,
    dir: &Path,
    namespaces: &mut BTreeMap<String, NamespaceStats>,
) -> Result<()> {
    for entry in fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_cache_files(root, &path, namespaces)?;
            continue;
        }
        let metadata = entry.metadata()?;
        let relative = path.strip_prefix(root).unwrap_or(&path);
        let namespace = relative
            .parent()
            .and_then(|parent| parent.components().next())
            .map(|component| component.as_os_str().to_string_lossy().to_string())
            .unwrap_or_else(|| "root".to_owned());
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        namespaces
            .entry(namespace)
            .or_default()
            .add(&path, metadata.len(), modified);
    }
    Ok(())
}

pub fn is_cache_metadata_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(".meta.json"))
}

pub fn safe_cache_key(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn metadata_payload_name(path: &Path) -> Option<String> {
    path.file_name()?
        .to_str()?
        .strip_suffix(".meta.json")
        .map(str::to_owned)
}

fn cache_json_is_valid(path: &Path) -> bool {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .is_some()
}

fn metadata_coverage_ratio(payloads_with_metadata: u64, payload_json_files: u64) -> Option<f64> {
    if payload_json_files == 0 {
        None
    } else {
        round_opt(Some(
            payloads_with_metadata as f64 / payload_json_files as f64,
        ))
    }
}

fn round_opt(value: Option<f64>) -> Option<f64> {
    value.map(|value| (value * 100.0).round() / 100.0)
}

fn age_hours(time: SystemTime) -> f64 {
    time.elapsed()
        .map(|duration| duration.as_secs_f64() / 3600.0)
        .unwrap_or(0.0)
}

fn system_time_iso(time: SystemTime) -> String {
    let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    DateTime::<Utc>::from(UNIX_EPOCH + duration)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
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

    #[test]
    fn json_cache_audit_counts_payload_metadata_and_temp_files() {
        let root = temp_root("cache-audit");
        let namespace = root.join("http-json");
        fs::create_dir_all(&namespace).expect("create namespace");
        fs::write(namespace.join("payload.json"), "{\"ok\":true}\n").expect("write payload");
        fs::write(
            namespace.join("payload.json.meta.json"),
            "{\"payloadFile\":\"payload.json\"}\n",
        )
        .expect("write metadata");
        fs::write(namespace.join("broken.json"), "{").expect("write broken payload");
        fs::write(namespace.join(".payload.tmp"), "").expect("write temp");

        let audit = audit_json_cache(&root, 72.0, |name, fallback| CacheNamespacePolicy {
            stale_after_hours: fallback,
            freshness_class: format!("{name}-class"),
            refresh_reason: "test policy".to_owned(),
        })
        .expect("audit cache");

        assert!(audit.enabled);
        assert_eq!(audit.files, 4);
        assert_eq!(audit.payload_json_files, 2);
        assert_eq!(audit.metadata_files, 1);
        assert_eq!(audit.payloads_with_metadata, 1);
        assert_eq!(audit.legacy_payload_json_files, 1);
        assert_eq!(audit.corrupt_json_files, 1);
        assert_eq!(audit.temp_files, 1);
        assert_eq!(audit.metadata_coverage_ratio, Some(0.5));
        assert_eq!(audit.namespaces.len(), 1);
        assert_eq!(audit.namespaces[0].freshness_class, "http-json-class");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn readable_cache_writes_payload_and_metadata_atomically() {
        let root = temp_root("readable-cache-atomic");
        let cache = ReadableJsonDiskCache::new(Some(&root));

        cache.write(
            "api",
            "https://example.test/query?a=1&b=2",
            &json!({"count": 1}),
        );
        cache.write(
            "api",
            "https://example.test/query?a=1&b=2",
            &json!({"count": 2}),
        );

        assert_eq!(
            cache.read::<serde_json::Value>("api", "https://example.test/query?a=1&b=2"),
            Some(json!({"count": 2}))
        );
        let path = cache
            .path("api", "https://example.test/query?a=1&b=2")
            .expect("cache path");
        let metadata_path = cache_metadata_path(&path).expect("metadata path");
        let metadata = cache
            .read_path::<serde_json::Value>(&metadata_path)
            .expect("metadata json");
        assert_eq!(metadata["schemaVersion"], 1);
        assert_eq!(metadata["namespace"], "api");
        assert_eq!(metadata["key"], "https://example.test/query?a=1&b=2");
        assert_eq!(
            metadata["payloadFile"],
            "https___example.test_query_a_1_b_2.json"
        );
        assert!(metadata["payloadBytes"].as_u64().expect("payload bytes") > 0);
        assert!(metadata["writtenAtUnix"].as_u64().expect("written at") > 0);
        let temp_files = fs::read_dir(cache.namespace_dir("api").expect("namespace dir"))
            .expect("read cache namespace")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(temp_files, 0);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn readable_cache_ignores_corrupt_json_entries() {
        let root = temp_root("readable-cache-corrupt");
        let cache = ReadableJsonDiskCache::new(Some(&root));
        let path = cache.path("api", "corrupt").expect("cache path");
        fs::create_dir_all(path.parent().expect("cache parent")).expect("cache parent");
        fs::write(&path, "{not valid json\n").expect("write corrupt cache");

        assert_eq!(cache.read::<serde_json::Value>("api", "corrupt"), None);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn readable_cache_backfills_metadata_without_overwriting_existing_metadata() {
        let root = temp_root("readable-cache-backfill");
        let namespace = root.join("api");
        fs::create_dir_all(&namespace).expect("cache namespace");
        let legacy_path = namespace.join("legacy_payload.json");
        fs::write(&legacy_path, "{\"ok\":true}\n").expect("legacy payload");
        let corrupt_path = namespace.join("corrupt_payload.json");
        fs::write(&corrupt_path, "{not-json\n").expect("corrupt payload");

        let cache = ReadableJsonDiskCache::new(Some(&root));
        cache.write(
            "api",
            "https://example.test/exact-key",
            &json!({"count": 1}),
        );
        let exact_path = cache
            .path("api", "https://example.test/exact-key")
            .expect("exact path");
        let exact_metadata_path = cache_metadata_path(&exact_path).expect("exact metadata path");
        let before = fs::read_to_string(&exact_metadata_path).expect("existing metadata");

        let summary = backfill_cache_metadata(&root).expect("backfill summary");
        assert_eq!(summary["payloadJsonFiles"], 3);
        assert_eq!(summary["existingMetadataFiles"], 1);
        assert_eq!(summary["payloadsWithExistingMetadata"], 1);
        assert_eq!(summary["writtenMetadataFiles"], 1);
        assert_eq!(summary["skippedCorruptJsonFiles"], 1);
        assert_eq!(
            fs::read_to_string(&exact_metadata_path).expect("existing metadata after"),
            before
        );

        let legacy_metadata = cache
            .read_path::<serde_json::Value>(
                &cache_metadata_path(&legacy_path).expect("legacy metadata path"),
            )
            .expect("legacy metadata");
        assert_eq!(legacy_metadata["namespace"], "api");
        assert_eq!(legacy_metadata["payloadFile"], "legacy_payload.json");
        assert_eq!(legacy_metadata["backfilled"], true);
        assert_eq!(legacy_metadata["keyRecovered"], false);
        assert!(
            !cache_metadata_path(&corrupt_path)
                .expect("corrupt metadata path")
                .exists()
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn safe_cache_key_preserves_readable_ascii_and_replaces_separators() {
        assert_eq!(
            safe_cache_key("Area Name/FeatureServer?x=1&y=2"),
            "Area_Name_FeatureServer_x_1_y_2"
        );
    }

    fn temp_root(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        std::env::temp_dir().join(format!("verdun-{name}-{nonce}"))
    }
}

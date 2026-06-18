use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use clap::{Parser, Subcommand, ValueEnum};
mod core;
mod instances;
use crate::core::{CrawlerConfig, CrawlerSnapshot};
use crate::instances::garbage;
use std::{fs, path::PathBuf};

#[derive(Parser)]
#[command(author, version, about = "Verdun reusable crawler and database loader")]
struct Cli {
    #[command(subcommand)]
    command: CommandKind,
}

#[derive(Subcommand)]
enum CommandKind {
    Collect {
        #[arg(long)]
        instance: Option<String>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long, default_value = "crawler/data/items.json")]
        out: PathBuf,
        #[arg(long, default_value = "crawler/data/source-runs.json")]
        source_runs_out: PathBuf,
        #[arg(long)]
        public_out: Option<PathBuf>,
        #[arg(long)]
        generic_out: Option<PathBuf>,
        #[arg(long)]
        live: bool,
        #[arg(long, default_value_t = 4)]
        max_live_per_project: usize,
        #[arg(long, default_value_t = 45)]
        since_days: i64,
        #[arg(long, default_value = "crawler/data/editorial-state.json")]
        editorial_state: PathBuf,
    },
    ExportSql {
        #[arg(long)]
        snapshot: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = SqlExportTarget::Generic)]
        target: SqlExportTarget,
        #[arg(long)]
        instance: Option<String>,
        #[arg(long)]
        instance_name: Option<String>,
        #[arg(long)]
        base_path: Option<String>,
        #[arg(long, default_value = "crawler/data/items.json")]
        input: PathBuf,
        #[arg(long, default_value = "crawler/data/source-runs.json")]
        source_runs: PathBuf,
        #[arg(long, default_value = "/tmp/verdun-workbench-load.sql")]
        out: PathBuf,
    },
    Verify {
        #[arg(long)]
        instance: Option<String>,
        #[arg(long)]
        config: Option<PathBuf>,
    },
    Queries {
        #[arg(long)]
        instance: Option<String>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long, default_value = "crawler/data/editorial-state.json")]
        editorial_state: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        CommandKind::Collect {
            instance,
            config,
            out,
            source_runs_out,
            public_out,
            generic_out,
            live,
            max_live_per_project,
            since_days,
            editorial_state,
        } => collect(
            instance,
            config,
            out,
            source_runs_out,
            public_out,
            generic_out,
            live,
            max_live_per_project,
            since_days,
            editorial_state,
        ),
        CommandKind::ExportSql {
            input,
            source_runs,
            out,
            snapshot,
            target,
            instance,
            instance_name,
            base_path,
        } => export_sql(
            snapshot,
            input,
            source_runs,
            out,
            target,
            instance,
            instance_name,
            base_path,
        ),
        CommandKind::Verify { instance, config } => verify(instance, config),
        CommandKind::Queries {
            instance,
            config,
            editorial_state,
        } => queries(instance, config, editorial_state),
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum SqlExportTarget {
    Newsletter,
    Generic,
}

struct ExportInstance {
    id: String,
    name: String,
    base_path: String,
}

fn collect(
    instance: Option<String>,
    config: Option<PathBuf>,
    out: PathBuf,
    source_runs_out: PathBuf,
    public_out: Option<PathBuf>,
    generic_out: Option<PathBuf>,
    live: bool,
    max_live_per_project: usize,
    since_days: i64,
    editorial_state: PathBuf,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref())?;
    let config = config.unwrap_or_else(|| crawler_instance.default_config_path());
    let public_out = public_out.unwrap_or_else(|| crawler_instance.default_public_snapshot_path());
    let config = read_crawler_config(&config)?;
    let editorial_focuses = crawler_instance.read_editorial_focuses(&editorial_state)?;
    anyhow::ensure!(since_days > 0, "--since-days must be positive");
    let since = Utc::now() - Duration::days(since_days);
    let collection = crawler_instance.collect(
        &config,
        live,
        max_live_per_project,
        since,
        &editorial_focuses,
    )?;
    let record_count = collection.snapshot.records.len();
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let payload = serde_json::to_string_pretty(&collection.item_payload)?;
    fs::write(&out, &payload).with_context(|| format!("writing {}", out.display()))?;
    if let Some(parent) = source_runs_out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    fs::write(
        &source_runs_out,
        serde_json::to_string_pretty(&collection.snapshot.source_runs)?,
    )
    .with_context(|| format!("writing {}", source_runs_out.display()))?;
    if let Some(generic_out) = generic_out {
        if let Some(parent) = generic_out.parent() {
            fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
        }
        fs::write(
            &generic_out,
            serde_json::to_string_pretty(&collection.snapshot)?,
        )
        .with_context(|| format!("writing {}", generic_out.display()))?;
    }
    if let Some(parent) = public_out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    fs::write(
        &public_out,
        serde_json::to_string_pretty(&collection.public_payload)?,
    )
    .with_context(|| format!("writing {}", public_out.display()))?;
    println!(
        "wrote {} records to {}, {}, and {}",
        record_count,
        out.display(),
        source_runs_out.display(),
        public_out.display()
    );
    Ok(())
}

fn export_sql(
    snapshot: Option<PathBuf>,
    input: PathBuf,
    source_runs: PathBuf,
    out: PathBuf,
    target: SqlExportTarget,
    instance: Option<String>,
    instance_name: Option<String>,
    base_path: Option<String>,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref())?;
    let instance = ExportInstance {
        id: crawler_instance.id().to_string(),
        name: instance_name.unwrap_or_else(|| crawler_instance.display_name().to_string()),
        base_path: base_path.unwrap_or_else(|| crawler_instance.base_path().to_string()),
    };
    let (sql, record_count, source_run_count, plan_count) = match target {
        SqlExportTarget::Newsletter => {
            let payload = load_garbage_newsletter_export_payload(snapshot, input, source_runs)?;
            (
                garbage::newsletter_export_sql(&payload)?,
                payload.items.len(),
                payload.source_runs.len(),
                payload.query_plans.len(),
            )
        }
        SqlExportTarget::Generic => {
            let snapshot = load_generic_crawler_snapshot(snapshot, input, source_runs)?;
            (
                generic_export_sql(&snapshot, &instance)?,
                snapshot.records.len(),
                snapshot.source_runs.len(),
                snapshot.collection_plans.len(),
            )
        }
    };
    fs::write(&out, sql).with_context(|| format!("writing {}", out.display()))?;
    println!(
        "wrote {} SQL load for {} items, {} source runs, and {} query plans to {}",
        target.as_str(),
        record_count,
        source_run_count,
        plan_count,
        out.display()
    );
    Ok(())
}

impl SqlExportTarget {
    fn as_str(self) -> &'static str {
        match self {
            Self::Newsletter => "newsletter",
            Self::Generic => "generic",
        }
    }
}

fn generic_export_sql(snapshot: &CrawlerSnapshot, instance: &ExportInstance) -> Result<String> {
    let mut sql =
        String::from("-- Generated by verdun-crawler export-sql --target generic\nbegin;\n");
    sql.push_str("insert into instances (id, name, base_path, theme, updated_at)\n");
    sql.push_str("values (");
    sql.push_str(&sql_string(&instance.id));
    sql.push_str(", ");
    sql.push_str(&sql_string(&instance.name));
    sql.push_str(", ");
    sql.push_str(&sql_string(&instance.base_path));
    sql.push_str(", ");
    sql.push_str(&sql_string(&snapshot.theme));
    sql.push_str(", now())\n");
    sql.push_str("on conflict (id) do update set\n");
    sql.push_str("  name = excluded.name,\n  base_path = excluded.base_path,\n  theme = excluded.theme,\n  updated_at = excluded.updated_at;\n\n");
    for record in &snapshot.records {
        sql.push_str("insert into records (\n");
        sql.push_str("  instance, id, title, url, source, source_kind, observed_at, subject, topic, summary, tags, score, status, dedupe_key, provenance_json, normalized_json, raw_json, updated_at\n");
        sql.push_str(") values (");
        sql.push_str(&sql_string(&instance.id));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.id));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.title));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.url));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.source));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.source_kind));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.observed_at.to_rfc3339()));
        sql.push_str("::timestamptz, ");
        sql.push_str(&sql_string(&record.subject));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.topic));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.summary));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&record.tags));
        sql.push_str(", ");
        sql.push_str(&record.score.to_string());
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.status));
        sql.push_str(", ");
        sql.push_str(&sql_string(&record.dedupe_key));
        sql.push_str(", ");
        sql.push_str(&sql_string(&serde_json::to_string(
            &record.provenance_json,
        )?));
        sql.push_str("::jsonb, ");
        sql.push_str(&sql_string(&serde_json::to_string(
            &record.normalized_json,
        )?));
        sql.push_str("::jsonb, ");
        sql.push_str(&sql_string(&serde_json::to_string(&record.raw_json)?));
        sql.push_str("::jsonb, now())\n");
        sql.push_str("on conflict (instance, id) do update set\n");
        sql.push_str("  title = excluded.title,\n  url = excluded.url,\n  source = excluded.source,\n  source_kind = excluded.source_kind,\n");
        sql.push_str("  observed_at = excluded.observed_at,\n  subject = excluded.subject,\n  topic = excluded.topic,\n");
        sql.push_str("  summary = excluded.summary,\n  tags = excluded.tags,\n  score = excluded.score,\n  status = excluded.status,\n");
        sql.push_str(
            "  dedupe_key = excluded.dedupe_key,\n  provenance_json = excluded.provenance_json,\n",
        );
        sql.push_str("  normalized_json = excluded.normalized_json,\n  raw_json = excluded.raw_json,\n  updated_at = excluded.updated_at;\n\n");
    }
    for run in &snapshot.source_runs {
        sql.push_str("insert into source_runs (\n");
        sql.push_str(
            "  instance, source, kind, status, item_count, message, subject_counts, collected_at\n",
        );
        sql.push_str(") values (");
        sql.push_str(&sql_string(&instance.id));
        sql.push_str(", ");
        sql.push_str(&sql_string(&run.source));
        sql.push_str(", ");
        sql.push_str(&sql_string(&run.kind));
        sql.push_str(", ");
        sql.push_str(&sql_string(run.status.as_str()));
        sql.push_str(", ");
        sql.push_str(&run.item_count.to_string());
        sql.push_str(", ");
        sql.push_str(&sql_string(&run.message));
        sql.push_str(", ");
        sql.push_str(&sql_string(&serde_json::to_string(&run.project_counts)?));
        sql.push_str("::jsonb, ");
        sql.push_str(&sql_string(&snapshot.generated_at.to_rfc3339()));
        sql.push_str("::timestamptz)\n");
        sql.push_str("on conflict (instance, source) do update set\n");
        sql.push_str("  kind = excluded.kind,\n  status = excluded.status,\n  item_count = excluded.item_count,\n");
        sql.push_str("  message = excluded.message,\n  subject_counts = excluded.subject_counts,\n  collected_at = excluded.collected_at;\n\n");
    }
    for plan in &snapshot.collection_plans {
        sql.push_str("insert into collection_plans (\n");
        sql.push_str("  instance, subject, topic, query, live_terms, tags, review_targets, focus_terms, updated_at\n");
        sql.push_str(") values (");
        sql.push_str(&sql_string(&instance.id));
        sql.push_str(", ");
        sql.push_str(&sql_string(&plan.subject));
        sql.push_str(", ");
        sql.push_str(&sql_string(&plan.topic));
        sql.push_str(", ");
        sql.push_str(&sql_string(&plan.query));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&plan.live_terms));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&plan.tags));
        sql.push_str(", ");
        sql.push_str(&sql_string(&serde_json::to_string(&plan.review_targets)?));
        sql.push_str("::jsonb, ");
        sql.push_str(&sql_text_array(&plan.focus_terms));
        sql.push_str(", now())\n");
        sql.push_str("on conflict (instance, subject) do update set\n");
        sql.push_str("  topic = excluded.topic,\n");
        sql.push_str("  query = excluded.query,\n");
        sql.push_str("  live_terms = excluded.live_terms,\n");
        sql.push_str("  tags = excluded.tags,\n");
        sql.push_str("  review_targets = excluded.review_targets,\n");
        sql.push_str("  focus_terms = excluded.focus_terms,\n");
        sql.push_str("  updated_at = excluded.updated_at;\n\n");
    }
    sql.push_str("commit;\n");
    Ok(sql)
}

fn load_generic_crawler_snapshot(
    snapshot: Option<PathBuf>,
    input: PathBuf,
    source_runs: PathBuf,
) -> Result<CrawlerSnapshot> {
    if let Some(snapshot) = snapshot {
        let value: serde_json::Value = serde_json::from_slice(
            &fs::read(&snapshot).with_context(|| format!("reading {}", snapshot.display()))?,
        )?;
        if value.get("records").is_some() {
            return serde_json::from_value(value)
                .with_context(|| format!("parsing generic snapshot {}", snapshot.display()));
        }
        return garbage_public_snapshot_value_as_crawler_snapshot(value, &snapshot);
    }

    Ok(load_garbage_newsletter_export_payload(None, input, source_runs)?.normalized_snapshot())
}

fn garbage_public_snapshot_value_as_crawler_snapshot(
    value: serde_json::Value,
    path: &PathBuf,
) -> Result<CrawlerSnapshot> {
    let snapshot: garbage::PublicSnapshot = serde_json::from_value(value)
        .with_context(|| format!("parsing Garbage snapshot {}", path.display()))?;
    Ok(garbage::ExportPayload {
        theme: snapshot.theme,
        items: snapshot.items,
        source_runs: snapshot.source_runs,
        query_plans: snapshot.query_plans,
        generated_at: snapshot.generated_at,
    }
    .normalized_snapshot())
}

fn load_garbage_newsletter_export_payload(
    snapshot: Option<PathBuf>,
    input: PathBuf,
    source_runs: PathBuf,
) -> Result<garbage::ExportPayload> {
    if let Some(snapshot) = snapshot {
        let snapshot: garbage::PublicSnapshot = serde_json::from_slice(
            &fs::read(&snapshot).with_context(|| format!("reading {}", snapshot.display()))?,
        )?;
        return Ok(garbage::ExportPayload {
            theme: snapshot.theme,
            items: snapshot.items,
            source_runs: snapshot.source_runs,
            query_plans: snapshot.query_plans,
            generated_at: snapshot.generated_at,
        });
    }

    let items: Vec<garbage::NewsItem> = serde_json::from_slice(
        &fs::read(&input).with_context(|| format!("reading {}", input.display()))?,
    )?;
    let source_runs: Vec<crate::core::SourceRun> = if source_runs.exists() {
        serde_json::from_slice(
            &fs::read(&source_runs)
                .with_context(|| format!("reading {}", source_runs.display()))?,
        )?
    } else {
        Vec::new()
    };
    Ok(garbage::ExportPayload {
        theme: "Strongly typed and functional AI/data systems".to_string(),
        items,
        source_runs,
        query_plans: Vec::new(),
        generated_at: Utc::now(),
    })
}

fn verify(instance: Option<String>, config: Option<PathBuf>) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref())?;
    let config = config.unwrap_or_else(|| crawler_instance.default_config_path());
    let config = read_crawler_config(&config)?;
    crawler_instance.verify_config(&config)?;
    println!(
        "verified {} instance with {} projects and {} sources for {}",
        crawler_instance.id(),
        config.targets.len(),
        config.sources.len(),
        config.theme
    );
    Ok(())
}

fn queries(
    instance: Option<String>,
    config: Option<PathBuf>,
    editorial_state: PathBuf,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref())?;
    let config = config.unwrap_or_else(|| crawler_instance.default_config_path());
    let config = read_crawler_config(&config)?;
    let editorial_focuses = crawler_instance.read_editorial_focuses(&editorial_state)?;
    println!(
        "{}",
        serde_json::to_string_pretty(
            &crawler_instance.collection_plans(&config, &editorial_focuses)
        )?
    );
    Ok(())
}

fn resolve_crawler_instance(
    instance: Option<&str>,
) -> Result<&'static dyn instances::CrawlerInstance> {
    match instance {
        Some(instance) => instances::crawler_instance(instance),
        None => Ok(instances::default_crawler_instance()),
    }
}

fn read_crawler_config(path: &PathBuf) -> Result<CrawlerConfig> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    toml::from_str(&text).with_context(|| format!("parsing {}", path.display()))
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sql_text_array(values: &[String]) -> String {
    let values = values
        .iter()
        .map(|value| sql_string(value))
        .collect::<Vec<_>>()
        .join(", ");
    format!("array[{}]::text[]", values)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instances::garbage;
    use chrono::DateTime;

    #[test]
    fn parses_lobsters_search_story() {
        let html = r#"
            <li id="story_abc123" data-shortid="abc123" class="story">
              <div class="details">
                <span class="link">
                  <a class="u-url" href="https://example.com/post?x=1&amp;y=2" rel="ugc noreferrer">Pydantic&#39;s typed adapter</a>
                </span>
              </div>
              <a class="tag tag_python" href="/t/python">python</a>
              <a class="tag tag_databases" href="/t/databases">databases</a>
              <time title="2026-05-13 19:49:20" datetime="2026-05-13 19:49:20" data-at-unix="1778719760">1 month ago</time>
              <details class="caches" name="caches">
                <summary>caches</summary>
                <ul>
                  <li><a href="https://web.archive.org/">Archive.org</a></li>
                </ul>
              </details>
              <a class="upvoter" href="/login">24</a>
              <span class="comments_label"><a role="heading" aria-level="2" href="/s/abc123/pydantic_typed_adapter">11 comments</a></span>
            </li>
        "#;

        let stories = garbage::parse_lobsters_search_stories(html);

        assert_eq!(stories.len(), 1);
        let story = &stories[0];
        assert_eq!(story.short_id.as_deref(), Some("abc123"));
        assert_eq!(story.title, "Pydantic's typed adapter");
        assert_eq!(story.url, "https://example.com/post?x=1&y=2");
        assert_eq!(
            story.short_id_url.as_deref(),
            Some("https://lobste.rs/s/abc123/pydantic_typed_adapter")
        );
        assert_eq!(story.score, Some(24));
        assert_eq!(story.comment_count, Some(11));
        assert_eq!(story.tags, vec!["python", "databases"]);
        assert_eq!(
            story.created_at,
            DateTime::parse_from_rfc3339("2026-05-13T19:49:20Z")
                .unwrap()
                .with_timezone(&Utc)
        );
    }

    #[test]
    fn parses_lobsters_empty_search() {
        let stories = garbage::parse_lobsters_search_stories("<ol class=\"stories\"></ol>");

        assert!(stories.is_empty());
    }
}

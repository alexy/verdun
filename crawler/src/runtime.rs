use crate::cache::{write_pretty_json, write_text};
use crate::core::{CrawlerConfig, CrawlerSnapshot};
use crate::instances::{self, CrawlerInstanceRegistration};
use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use clap::{Parser, Subcommand};
use std::{
    fs,
    path::{Path, PathBuf},
};

const GENERIC_SQL_TARGET: &str = "generic";

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
        #[arg(long)]
        out: Option<PathBuf>,
        #[arg(long)]
        source_runs_out: Option<PathBuf>,
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
        #[arg(long)]
        editorial_state: Option<PathBuf>,
    },
    ExportSql {
        #[arg(long)]
        snapshot: Option<PathBuf>,
        #[arg(long, default_value = GENERIC_SQL_TARGET)]
        target: String,
        #[arg(long)]
        instance: Option<String>,
        #[arg(long)]
        instance_name: Option<String>,
        #[arg(long)]
        base_path: Option<String>,
        #[arg(long)]
        input: Option<PathBuf>,
        #[arg(long)]
        source_runs: Option<PathBuf>,
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
        #[arg(long)]
        editorial_state: Option<PathBuf>,
    },
}

pub fn run_cli() -> Result<()> {
    run_cli_with_registrations(instances::REGISTERED_CRAWLER_INSTANCES)
}

pub fn run_cli_with_registrations(
    registrations: &'static [CrawlerInstanceRegistration],
) -> Result<()> {
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
            registrations,
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
            registrations,
            snapshot,
            input,
            source_runs,
            out,
            target,
            instance,
            instance_name,
            base_path,
        ),
        CommandKind::Verify { instance, config } => verify(registrations, instance, config),
        CommandKind::Queries {
            instance,
            config,
            editorial_state,
        } => queries(registrations, instance, config, editorial_state),
    }
}

struct ExportInstance {
    id: String,
    name: String,
    base_path: String,
}

fn collect(
    registrations: &'static [CrawlerInstanceRegistration],
    instance: Option<String>,
    config: Option<PathBuf>,
    out: Option<PathBuf>,
    source_runs_out: Option<PathBuf>,
    public_out: Option<PathBuf>,
    generic_out: Option<PathBuf>,
    live: bool,
    max_live_per_project: usize,
    since_days: i64,
    editorial_state: Option<PathBuf>,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref(), registrations)?;
    let config = config.unwrap_or_else(|| crawler_instance.default_config_path());
    let out = out.unwrap_or_else(|| crawler_instance.default_item_payload_path());
    let source_runs_out =
        source_runs_out.unwrap_or_else(|| crawler_instance.default_source_runs_path());
    let public_out = public_out.unwrap_or_else(|| crawler_instance.default_public_snapshot_path());
    let config = read_crawler_config(&config)?;
    let editorial_state =
        editorial_state.unwrap_or_else(|| crawler_instance.default_editorial_state_path());
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
    write_pretty_json(&out, &collection.item_payload)?;
    write_pretty_json(&source_runs_out, &collection.snapshot.source_runs)?;
    if let Some(generic_out) = generic_out {
        write_pretty_json(&generic_out, &collection.snapshot)?;
    }
    write_pretty_json(&public_out, &collection.public_payload)?;
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
    registrations: &'static [CrawlerInstanceRegistration],
    snapshot: Option<PathBuf>,
    input: Option<PathBuf>,
    source_runs: Option<PathBuf>,
    out: PathBuf,
    target: String,
    instance: Option<String>,
    instance_name: Option<String>,
    base_path: Option<String>,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref(), registrations)?;
    let input = input.unwrap_or_else(|| crawler_instance.default_item_payload_path());
    let source_runs = source_runs.unwrap_or_else(|| crawler_instance.default_source_runs_path());
    let instance = ExportInstance {
        id: crawler_instance.id().to_string(),
        name: instance_name.unwrap_or_else(|| crawler_instance.display_name().to_string()),
        base_path: base_path.unwrap_or_else(|| crawler_instance.base_path().to_string()),
    };
    let target = target.trim().to_string();
    anyhow::ensure!(!target.is_empty(), "--target must not be empty");
    let (sql, record_count, source_run_count, plan_count) = if target == GENERIC_SQL_TARGET {
        let snapshot =
            load_generic_crawler_snapshot(crawler_instance, snapshot, input, source_runs)?;
        (
            generic_export_sql(&snapshot, &instance)?,
            snapshot.records.len(),
            snapshot.source_runs.len(),
            snapshot.collection_plans.len(),
        )
    } else {
        let export = crawler_instance
            .legacy_sql_export(&target, snapshot.as_ref(), &input, &source_runs)?
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "crawler instance {:?} does not support --target {}",
                    crawler_instance.id(),
                    target
                )
            })?;
        (
            export.sql,
            export.record_count,
            export.source_run_count,
            export.plan_count,
        )
    };
    write_text(&out, sql)?;
    println!(
        "wrote {} SQL load for {} items, {} source runs, and {} query plans to {}",
        target,
        record_count,
        source_run_count,
        plan_count,
        out.display()
    );
    Ok(())
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
    crawler_instance: &'static dyn instances::CrawlerInstance,
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
        return crawler_instance
            .public_snapshot_as_crawler_snapshot(value, &snapshot)?
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "crawler instance {:?} cannot convert compatibility snapshot {} to the generic crawler snapshot contract",
                    crawler_instance.id(),
                    snapshot.display()
                )
            });
    }

    crawler_instance
        .split_payload_as_crawler_snapshot(&input, &source_runs)?
        .ok_or_else(|| {
            anyhow::anyhow!(
                "crawler instance {:?} cannot convert split payload files {} and {} to the generic crawler snapshot contract",
                crawler_instance.id(),
                input.display(),
                source_runs.display()
            )
        })
}

fn verify(
    registrations: &'static [CrawlerInstanceRegistration],
    instance: Option<String>,
    config: Option<PathBuf>,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref(), registrations)?;
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
    registrations: &'static [CrawlerInstanceRegistration],
    instance: Option<String>,
    config: Option<PathBuf>,
    editorial_state: Option<PathBuf>,
) -> Result<()> {
    let crawler_instance = resolve_crawler_instance(instance.as_deref(), registrations)?;
    let config = config.unwrap_or_else(|| crawler_instance.default_config_path());
    let config = read_crawler_config(&config)?;
    let editorial_state =
        editorial_state.unwrap_or_else(|| crawler_instance.default_editorial_state_path());
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
    registrations: &'static [CrawlerInstanceRegistration],
) -> Result<&'static dyn instances::CrawlerInstance> {
    match instance {
        Some(instance) => crawler_instance(instance, registrations),
        None => Ok(default_crawler_instance(registrations)),
    }
}

fn default_crawler_instance(
    registrations: &'static [CrawlerInstanceRegistration],
) -> &'static dyn instances::CrawlerInstance {
    registrations
        .iter()
        .find(|entry| entry.default)
        .or_else(|| registrations.first())
        .map(|entry| entry.instance)
        .expect("at least one crawler instance is registered")
}

fn crawler_instance(
    instance: &str,
    registrations: &'static [CrawlerInstanceRegistration],
) -> Result<&'static dyn instances::CrawlerInstance> {
    if let Some(entry) = registrations
        .iter()
        .find(|entry| entry.instance.id() == instance)
    {
        return Ok(entry.instance);
    }
    anyhow::bail!(
        "unknown crawler instance {instance:?}; supported instances: {}",
        registrations
            .iter()
            .map(|entry| entry.instance.id())
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn read_crawler_config(path: &PathBuf) -> Result<CrawlerConfig> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    let mut config: CrawlerConfig =
        toml::from_str(&text).with_context(|| format!("parsing {}", path.display()))?;
    resolve_source_paths(&mut config, path);
    Ok(config)
}

fn resolve_source_paths(config: &mut CrawlerConfig, path: &Path) {
    let Some(config_dir) = path.parent() else {
        return;
    };
    for source in &mut config.sources {
        if let Some(manual_path) = &mut source.manual_path {
            if manual_path.is_relative() && !manual_path.exists() {
                *manual_path = config_dir.join(&manual_path);
            }
        }
        if let Some(fixture_path) = &mut source.fixture_path {
            if fixture_path.is_relative() && !fixture_path.exists() {
                *fixture_path = config_dir.join(&fixture_path);
            }
        }
    }
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

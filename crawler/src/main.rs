use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use clap::{Parser, Subcommand, ValueEnum};
mod core;
mod instances;
use crate::core::{CollectionTarget, CrawlerConfig, SourceConfig, SourceRun, SourceRunStatus};
use crate::instances::garbage::{
    self, EditorialFocus, ExportPayload, FeedEntry, ManualPost, NewsItem, PublicSnapshot,
};
use regex::Regex;
use reqwest::blocking::Client;
use std::{collections::BTreeMap, fs, path::PathBuf, time::Duration as StdDuration};

#[derive(Parser)]
#[command(author, version, about = "Verdun newsletter crawler and loader")]
struct Cli {
    #[command(subcommand)]
    command: CommandKind,
}

#[derive(Subcommand)]
enum CommandKind {
    Collect {
        #[arg(long, default_value = "crawler/instances/garbage/config.toml")]
        config: PathBuf,
        #[arg(long, default_value = "crawler/data/items.json")]
        out: PathBuf,
        #[arg(long, default_value = "crawler/data/source-runs.json")]
        source_runs_out: PathBuf,
        #[arg(long, default_value = "public/data/newsletter-snapshot.json")]
        public_out: PathBuf,
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
        #[arg(long, value_enum, default_value_t = SqlExportTarget::Newsletter)]
        target: SqlExportTarget,
        #[arg(long, default_value = "garbage")]
        instance: String,
        #[arg(long, default_value = "Garbage")]
        instance_name: String,
        #[arg(long, default_value = "/rbage/")]
        base_path: String,
        #[arg(long, default_value = "crawler/data/items.json")]
        input: PathBuf,
        #[arg(long, default_value = "crawler/data/source-runs.json")]
        source_runs: PathBuf,
        #[arg(long, default_value = "/tmp/verdun-newsletter-load.sql")]
        out: PathBuf,
    },
    Verify {
        #[arg(long, default_value = "crawler/instances/garbage/config.toml")]
        config: PathBuf,
    },
    Queries {
        #[arg(long, default_value = "crawler/instances/garbage/config.toml")]
        config: PathBuf,
        #[arg(long, default_value = "crawler/data/editorial-state.json")]
        editorial_state: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        CommandKind::Collect {
            config,
            out,
            source_runs_out,
            public_out,
            live,
            max_live_per_project,
            since_days,
            editorial_state,
        } => collect(
            config,
            out,
            source_runs_out,
            public_out,
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
            ExportInstance {
                id: instance,
                name: instance_name,
                base_path,
            },
        ),
        CommandKind::Verify { config } => verify(config),
        CommandKind::Queries {
            config,
            editorial_state,
        } => queries(config, editorial_state),
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
    config: PathBuf,
    out: PathBuf,
    source_runs_out: PathBuf,
    public_out: PathBuf,
    live: bool,
    max_live_per_project: usize,
    since_days: i64,
    editorial_state: PathBuf,
) -> Result<()> {
    let config = read_crawler_config(&config)?;
    let editorial_focuses = garbage::read_editorial_focuses(&editorial_state)?;
    anyhow::ensure!(since_days > 0, "--since-days must be positive");
    let mut items = garbage::seed_items(&config);
    let mut source_runs = seed_source_runs(&config, live);
    if live {
        let since = Utc::now() - Duration::days(since_days);
        match live_items(&config, max_live_per_project, since, &editorial_focuses) {
            Ok((live_items, live_source_runs)) => {
                items.extend(live_items);
                source_runs.extend(live_source_runs);
            }
            Err(error) => eprintln!("live collection skipped after error: {error:#}"),
        }
    }
    let items = garbage::dedupe_items(items);
    let item_count = items.len();
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let payload = serde_json::to_string_pretty(&items)?;
    fs::write(&out, &payload).with_context(|| format!("writing {}", out.display()))?;
    if let Some(parent) = source_runs_out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    fs::write(
        &source_runs_out,
        serde_json::to_string_pretty(&source_runs)?,
    )
    .with_context(|| format!("writing {}", source_runs_out.display()))?;
    if let Some(parent) = public_out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let query_plans = garbage::query_plans(&config, &editorial_focuses);
    let public_snapshot = PublicSnapshot {
        generated_at: Utc::now(),
        theme: config.theme,
        items,
        source_runs,
        query_plans,
    };
    fs::write(&public_out, serde_json::to_string_pretty(&public_snapshot)?)
        .with_context(|| format!("writing {}", public_out.display()))?;
    println!(
        "wrote {} newsletter items to {}, {}, and {}",
        item_count,
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
    instance: ExportInstance,
) -> Result<()> {
    let payload = load_export_payload(snapshot, input, source_runs)?;
    let sql = match target {
        SqlExportTarget::Newsletter => newsletter_export_sql(&payload)?,
        SqlExportTarget::Generic => generic_export_sql(&payload, &instance)?,
    };
    fs::write(&out, sql).with_context(|| format!("writing {}", out.display()))?;
    println!(
        "wrote {} SQL load for {} items, {} source runs, and {} query plans to {}",
        target.as_str(),
        payload.items.len(),
        payload.source_runs.len(),
        payload.query_plans.len(),
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

fn newsletter_export_sql(payload: &ExportPayload) -> Result<String> {
    let mut sql = String::from("-- Generated by verdun-crawler export-sql\nbegin;\n");
    for item in &payload.items {
        sql.push_str("insert into newsletter_items (\n");
        sql.push_str("  id, title, source, source_kind, url, published_at, project, topic, summary, why_it_matters, tags, score, raw_json, updated_at\n");
        sql.push_str(") values (");
        sql.push_str(&sql_string(&item.id));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.title));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.source));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.source_kind));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.url));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.published_at.to_rfc3339()));
        sql.push_str("::timestamptz, ");
        sql.push_str(&sql_string(&item.project));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.topic));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.summary));
        sql.push_str(", ");
        sql.push_str(&sql_string(&item.why_it_matters));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&item.tags));
        sql.push_str(", ");
        sql.push_str(&item.score.to_string());
        sql.push_str(", ");
        sql.push_str(&sql_string(&serde_json::to_string(&item.raw_json)?));
        sql.push_str("::jsonb, now())\n");
        sql.push_str("on conflict (id) do update set\n");
        sql.push_str("  title = excluded.title,\n  source = excluded.source,\n  source_kind = excluded.source_kind,\n  url = excluded.url,\n");
        sql.push_str("  published_at = excluded.published_at,\n  project = excluded.project,\n  topic = excluded.topic,\n");
        sql.push_str("  summary = excluded.summary,\n  why_it_matters = excluded.why_it_matters,\n  tags = excluded.tags,\n");
        sql.push_str("  score = excluded.score,\n  raw_json = excluded.raw_json,\n  updated_at = excluded.updated_at;\n\n");
    }
    for run in &payload.source_runs {
        sql.push_str("insert into newsletter_source_runs (\n");
        sql.push_str("  source, kind, status, item_count, message, project_counts, collected_at\n");
        sql.push_str(") values (");
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
        sql.push_str(&sql_string(&payload.generated_at.to_rfc3339()));
        sql.push_str("::timestamptz)\n");
        sql.push_str("on conflict (source) do update set\n");
        sql.push_str("  kind = excluded.kind,\n  status = excluded.status,\n  item_count = excluded.item_count,\n");
        sql.push_str("  message = excluded.message,\n  project_counts = excluded.project_counts,\n  collected_at = excluded.collected_at;\n\n");
    }
    for plan in &payload.query_plans {
        sql.push_str("insert into newsletter_query_plans (\n");
        sql.push_str("  project, topic, hacker_news_query, live_terms, dev_to_tags, review_targets, focus_terms, updated_at\n");
        sql.push_str(") values (");
        sql.push_str(&sql_string(&plan.project));
        sql.push_str(", ");
        sql.push_str(&sql_string(&plan.topic));
        sql.push_str(", ");
        sql.push_str(&sql_string(&plan.hacker_news_query));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&plan.live_terms));
        sql.push_str(", ");
        sql.push_str(&sql_text_array(&plan.dev_to_tags));
        sql.push_str(", ");
        sql.push_str(&sql_string(&serde_json::to_string(&plan.review_targets)?));
        sql.push_str("::jsonb, ");
        sql.push_str(&sql_text_array(&plan.focus_terms));
        sql.push_str(", now())\n");
        sql.push_str("on conflict (project) do update set\n");
        sql.push_str("  topic = excluded.topic,\n");
        sql.push_str("  hacker_news_query = excluded.hacker_news_query,\n");
        sql.push_str("  live_terms = excluded.live_terms,\n");
        sql.push_str("  dev_to_tags = excluded.dev_to_tags,\n");
        sql.push_str("  review_targets = excluded.review_targets,\n");
        sql.push_str("  focus_terms = excluded.focus_terms,\n");
        sql.push_str("  updated_at = excluded.updated_at;\n\n");
    }
    sql.push_str("commit;\n");
    Ok(sql)
}

fn generic_export_sql(payload: &ExportPayload, instance: &ExportInstance) -> Result<String> {
    let snapshot = payload.normalized_snapshot();
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

fn load_export_payload(
    snapshot: Option<PathBuf>,
    input: PathBuf,
    source_runs: PathBuf,
) -> Result<ExportPayload> {
    if let Some(snapshot) = snapshot {
        let snapshot: PublicSnapshot = serde_json::from_slice(
            &fs::read(&snapshot).with_context(|| format!("reading {}", snapshot.display()))?,
        )?;
        return Ok(ExportPayload {
            theme: snapshot.theme,
            items: snapshot.items,
            source_runs: snapshot.source_runs,
            query_plans: snapshot.query_plans,
            generated_at: snapshot.generated_at,
        });
    }

    let items: Vec<NewsItem> = serde_json::from_slice(
        &fs::read(&input).with_context(|| format!("reading {}", input.display()))?,
    )?;
    let source_runs: Vec<SourceRun> = if source_runs.exists() {
        serde_json::from_slice(
            &fs::read(&source_runs)
                .with_context(|| format!("reading {}", source_runs.display()))?,
        )?
    } else {
        Vec::new()
    };
    Ok(ExportPayload {
        theme: "Strongly typed and functional AI/data systems".to_string(),
        items,
        source_runs,
        query_plans: Vec::new(),
        generated_at: Utc::now(),
    })
}

fn verify(config: PathBuf) -> Result<()> {
    let config = read_crawler_config(&config)?;
    anyhow::ensure!(!config.targets.is_empty(), "config must include projects");
    anyhow::ensure!(!config.sources.is_empty(), "config must include sources");
    anyhow::ensure!(
        config
            .targets
            .iter()
            .any(|project| project.name == "Pydantic"),
        "Pydantic must be tracked"
    );
    anyhow::ensure!(
        config
            .targets
            .iter()
            .any(|project| project.name == "LakeSail"),
        "LakeSail must be tracked"
    );
    verify_required_projects(&config)?;
    verify_required_sources(&config)?;
    println!(
        "verified {} projects and {} sources for {}",
        config.targets.len(),
        config.sources.len(),
        config.theme
    );
    Ok(())
}

fn queries(config: PathBuf, editorial_state: PathBuf) -> Result<()> {
    let config = read_crawler_config(&config)?;
    let editorial_focuses = garbage::read_editorial_focuses(&editorial_state)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&garbage::query_plans(&config, &editorial_focuses))?
    );
    Ok(())
}

fn verify_required_projects(config: &CrawlerConfig) -> Result<()> {
    for project_name in [
        "Pydantic",
        "BAML",
        "DSPy",
        "Instructor",
        "LakeSail",
        "Apache Arrow",
        "DataFusion",
        "Delta Lake",
        "Ibis",
        "Dagster",
        "Grust Sail",
        "Turso",
        "LanceDB",
        "HelixDB",
        "SurrealDB",
        "pgGraph",
        "Grust",
        "TypeSec",
        "Garde",
        "zod-rs",
        "FalkorDB",
        "LadybugDB",
        "CocoIndex",
    ] {
        let project = config
            .targets
            .iter()
            .find(|candidate| candidate.name == project_name)
            .with_context(|| format!("{project_name} must be tracked"))?;
        anyhow::ensure!(
            !project.topic.trim().is_empty(),
            "{project_name} must have a topic"
        );
        anyhow::ensure!(
            project.homepage.starts_with("https://"),
            "{project_name} must have an https homepage"
        );
        anyhow::ensure!(
            project.keywords.len() >= 3,
            "{project_name} must have at least three matching keywords"
        );
        anyhow::ensure!(
            !garbage::project_live_terms(project).is_empty(),
            "{project_name} must have at least one distinctive live-search term"
        );
    }
    Ok(())
}

fn verify_required_sources(config: &CrawlerConfig) -> Result<()> {
    for source_name in ["Hacker News", "Lobste.rs", "dev.to"] {
        let source = required_source(config, source_name)?;
        anyhow::ensure!(
            source.feed_urls.as_ref().is_none_or(Vec::is_empty),
            "{source_name} should use its API adapter, not feed_urls"
        );
        anyhow::ensure!(
            source.manual_path.is_none(),
            "{source_name} should use its API adapter, not manual_path"
        );
    }
    for source_name in ["Medium", "Substack"] {
        let source = required_source(config, source_name)?;
        let feeds = source
            .feed_urls
            .as_ref()
            .filter(|feeds| !feeds.is_empty())
            .with_context(|| format!("{source_name} must configure feed_urls"))?;
        anyhow::ensure!(
            feeds.iter().all(|feed| feed.starts_with("https://")),
            "{source_name} feed_urls must be https"
        );
    }
    for source_name in ["LinkedIn", "X/Twitter"] {
        let source = required_source(config, source_name)?;
        let path = source
            .manual_path
            .as_ref()
            .with_context(|| format!("{source_name} must configure manual_path"))?;
        anyhow::ensure!(
            path.exists(),
            "{source_name} manual import file must exist at {}",
            path.display()
        );
    }
    Ok(())
}

fn required_source<'a>(config: &'a CrawlerConfig, source_name: &str) -> Result<&'a SourceConfig> {
    let source = config
        .sources
        .iter()
        .find(|candidate| candidate.name == source_name)
        .with_context(|| format!("{source_name} must be tracked"))?;
    anyhow::ensure!(
        source.url.starts_with("https://"),
        "{source_name} must have an https source URL"
    );
    Ok(source)
}

fn live_items(
    config: &CrawlerConfig,
    max_per_project: usize,
    since: DateTime<Utc>,
    editorial_focuses: &[EditorialFocus],
) -> Result<(Vec<NewsItem>, Vec<SourceRun>)> {
    let client = Client::builder()
        .timeout(StdDuration::from_secs(12))
        .user_agent("verdun-newsletter-crawler/0.1")
        .build()
        .context("building HTTP client")?;
    let mut items = Vec::new();
    let mut source_runs = Vec::new();
    if let Some(source) = config
        .sources
        .iter()
        .find(|source| source.name == "Hacker News")
    {
        match garbage::fetch_hacker_news(
            &client,
            config,
            source,
            max_per_project,
            editorial_focuses,
        ) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(garbage::ok_source_run(
                    source,
                    &source_items,
                    "HN Algolia search_by_date",
                ));
                items.append(&mut source_items);
            }
            Err(error) => {
                source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
            }
        }
    }
    if let Some(source) = config
        .sources
        .iter()
        .find(|source| source.name == "Lobste.rs")
    {
        match garbage::fetch_lobsters(&client, config, source, max_per_project, editorial_focuses) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(garbage::ok_source_run(
                    source,
                    &source_items,
                    "Lobste.rs search",
                ));
                items.append(&mut source_items);
            }
            Err(error) => {
                source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
            }
        }
    }
    if let Some(source) = config.sources.iter().find(|source| source.name == "dev.to") {
        match garbage::fetch_dev_to(&client, config, source, max_per_project, editorial_focuses) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(garbage::ok_source_run(
                    source,
                    &source_items,
                    "dev.to articles API",
                ));
                items.append(&mut source_items);
            }
            Err(error) => {
                source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
            }
        }
    }
    if let Some(source) = config.sources.iter().find(|source| source.name == "Medium") {
        match fetch_feed_source(&client, config, source, max_per_project, editorial_focuses) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(garbage::ok_source_run(
                    source,
                    &source_items,
                    "configured RSS/Atom feeds",
                ));
                items.append(&mut source_items);
            }
            Err(error) => {
                source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
            }
        }
    }
    if let Some(source) = config
        .sources
        .iter()
        .find(|source| source.name == "Substack")
    {
        match fetch_feed_source(&client, config, source, max_per_project, editorial_focuses) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(garbage::ok_source_run(
                    source,
                    &source_items,
                    "configured RSS/Atom feeds",
                ));
                items.append(&mut source_items);
            }
            Err(error) => {
                source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
            }
        }
    }
    for source_name in ["LinkedIn", "X/Twitter"] {
        if let Some(source) = config
            .sources
            .iter()
            .find(|source| source.name == source_name)
        {
            match collect_manual_source(config, source, max_per_project, editorial_focuses) {
                Ok(manual_source) => {
                    let mut source_items = manual_source.items;
                    retain_recent(&mut source_items, since);
                    source_runs.push(garbage::manual_source_run(
                        source,
                        &source_items,
                        manual_source.post_count,
                        manual_source.latest_published_at,
                        since,
                    ));
                    items.append(&mut source_items);
                }
                Err(error) => {
                    source_runs.push(garbage::error_source_run(source, &format!("{error:#}")))
                }
            }
        }
    }
    Ok((items, source_runs))
}

fn retain_recent(items: &mut Vec<NewsItem>, since: DateTime<Utc>) {
    items.retain(|item| item.published_at >= since);
}

fn fetch_feed_source(
    client: &Client,
    config: &CrawlerConfig,
    source: &SourceConfig,
    max_per_project: usize,
    editorial_focuses: &[EditorialFocus],
) -> Result<Vec<NewsItem>> {
    let feed_urls = source
        .feed_urls
        .as_ref()
        .filter(|feeds| !feeds.is_empty())
        .with_context(|| format!("{} has no feed_urls configured", source.name))?;
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut items = Vec::new();
    for feed_url in feed_urls {
        let text = client
            .get(feed_url)
            .send()
            .with_context(|| format!("fetching feed {feed_url}"))?
            .error_for_status()
            .with_context(|| format!("feed returned error for {feed_url}"))?
            .text()
            .with_context(|| format!("reading feed body for {feed_url}"))?;
        let entries = parse_feed_entries(&text, feed_url);
        for entry in entries {
            for project in &config.targets {
                let focus_terms = garbage::project_focus_terms(project, editorial_focuses);
                let count = *counts.get(project.name.as_str()).unwrap_or(&0);
                if count >= max_per_project
                    || !feed_entry_matches_project(&entry, project, &focus_terms)
                {
                    continue;
                }
                items.push(garbage::feed_item(project, source, &entry, &focus_terms));
                counts.insert(project.name.as_str(), count + 1);
            }
        }
    }
    Ok(items)
}

fn collect_manual_source(
    config: &CrawlerConfig,
    source: &SourceConfig,
    max_per_project: usize,
    editorial_focuses: &[EditorialFocus],
) -> Result<ManualSourceCollect> {
    let path = source
        .manual_path
        .as_ref()
        .with_context(|| format!("{} has no manual_path configured", source.name))?;
    if !path.exists() {
        return Ok(ManualSourceCollect::default());
    }
    let posts: Vec<ManualPost> = serde_json::from_slice(
        &fs::read(path).with_context(|| format!("reading {}", path.display()))?,
    )
    .with_context(|| format!("parsing {}", path.display()))?;
    let post_count = posts.len();
    let latest_published_at = posts.iter().map(|post| post.published_at).max();
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut items = Vec::new();
    for post in posts {
        for project in &config.targets {
            let focus_terms = garbage::project_focus_terms(project, editorial_focuses);
            let count = *counts.get(project.name.as_str()).unwrap_or(&0);
            if count >= max_per_project
                || !manual_post_matches_project(&post, project, &focus_terms)
            {
                continue;
            }
            items.push(garbage::manual_post_item(
                project,
                source,
                &post,
                &focus_terms,
            ));
            counts.insert(project.name.as_str(), count + 1);
        }
    }
    Ok(ManualSourceCollect {
        items,
        post_count,
        latest_published_at,
    })
}

#[derive(Debug, Default)]
struct ManualSourceCollect {
    items: Vec<NewsItem>,
    post_count: usize,
    latest_published_at: Option<DateTime<Utc>>,
}

fn seed_source_runs(config: &CrawlerConfig, live: bool) -> Vec<SourceRun> {
    config
        .sources
        .iter()
        .filter_map(|source| {
            let status = if live {
                SourceRunStatus::Pending
            } else {
                SourceRunStatus::Skipped
            };
            let message = match source.name.as_str() {
                "Hacker News" | "Lobste.rs" | "dev.to" if live => return None,
                "Medium" | "Substack"
                    if live
                        && source
                            .feed_urls
                            .as_ref()
                            .is_some_and(|feeds| !feeds.is_empty()) =>
                {
                    return None;
                }
                "Hacker News" | "Lobste.rs" | "dev.to" => {
                    "run with --live to collect this public source"
                }
                "Medium" | "Substack" => "configure feed_urls and run with --live",
                "LinkedIn" | "X/Twitter" if live && source.manual_path.is_some() => return None,
                "LinkedIn" | "X/Twitter" => "configure manual_path or authenticated adapter",
                _ => "adapter pending",
            };
            Some(SourceRun {
                source: source.name.clone(),
                kind: source.kind.clone(),
                status,
                item_count: 0,
                message: message.to_string(),
                project_counts: BTreeMap::new(),
            })
        })
        .collect()
}

fn read_crawler_config(path: &PathBuf) -> Result<CrawlerConfig> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    toml::from_str(&text).with_context(|| format!("parsing {}", path.display()))
}

fn feed_entry_matches_project(
    entry: &FeedEntry,
    project: &CollectionTarget,
    focus_terms: &[String],
) -> bool {
    let link_without_query = entry.link.split('?').next().unwrap_or(&entry.link);
    let text = format!(
        "{} {} {} {}",
        entry.title, link_without_query, entry.summary, entry.match_text
    );
    text_matches_project(&text, project, focus_terms)
}

fn manual_post_matches_project(
    post: &ManualPost,
    project: &CollectionTarget,
    focus_terms: &[String],
) -> bool {
    let text = format!("{} {} {}", post.title, post.url, post.text);
    text_matches_project(&text, project, focus_terms)
}

fn parse_feed_entries(text: &str, feed_url: &str) -> Vec<FeedEntry> {
    let blocks = xml_blocks(text, "item");
    let blocks = if blocks.is_empty() {
        xml_blocks(text, "entry")
    } else {
        blocks
    };
    blocks
        .into_iter()
        .filter_map(|block| feed_entry_from_block(&block, feed_url))
        .collect()
}

fn feed_entry_from_block(block: &str, feed_url: &str) -> Option<FeedEntry> {
    let title = clean_feed_text(&xml_text(block, "title")?);
    let link = clean_feed_url(&feed_link(block)?);
    let description = xml_text(block, "description").map(|value| clean_feed_text(&value));
    let summary_text = xml_text(block, "summary").map(|value| clean_feed_text(&value));
    let content = xml_text(block, "content").map(|value| clean_feed_text(&value));
    let summary = description
        .clone()
        .or_else(|| summary_text.clone())
        .or_else(|| content.clone())
        .unwrap_or_default();
    let match_text = [Some(title.clone()), description, summary_text, content]
        .into_iter()
        .flatten()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let published_at = xml_text(block, "pubDate")
        .or_else(|| xml_text(block, "published"))
        .or_else(|| xml_text(block, "updated"))
        .and_then(|value| parse_feed_date(&value))
        .unwrap_or_else(Utc::now);
    Some(FeedEntry {
        title,
        link,
        published_at,
        summary,
        match_text,
        feed_url: feed_url.to_string(),
    })
}

fn xml_blocks(text: &str, tag: &str) -> Vec<String> {
    let pattern = format!(r"(?is)<{tag}\b[^>]*>(.*?)</{tag}>");
    Regex::new(&pattern)
        .expect("valid xml block regex")
        .captures_iter(text)
        .filter_map(|capture| capture.get(1).map(|match_| match_.as_str().to_string()))
        .collect()
}

fn xml_text(text: &str, tag: &str) -> Option<String> {
    let pattern = format!(r"(?is)<(?:\w+:)?{tag}(?::\w+)?\b[^>]*>(.*?)</(?:\w+:)?{tag}(?::\w+)?>");
    Regex::new(&pattern)
        .ok()?
        .captures(text)
        .and_then(|capture| capture.get(1).map(|match_| match_.as_str().to_string()))
}

fn feed_link(block: &str) -> Option<String> {
    if let Some(link) = xml_text(block, "link").map(|value| clean_feed_text(&value)) {
        if link.starts_with("http") {
            return Some(link);
        }
    }
    Regex::new(r#"(?is)<link\b[^>]*href=["']([^"']+)["'][^>]*/?>"#)
        .ok()?
        .captures(block)
        .and_then(|capture| {
            capture
                .get(1)
                .map(|match_| decode_xml_entities(match_.as_str()))
        })
}

fn clean_feed_url(value: &str) -> String {
    if value.contains("medium.com") {
        return value.split('?').next().unwrap_or(value).to_string();
    }
    value.to_string()
}

fn parse_feed_date(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc2822(value)
        .map(|date| date.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            DateTime::parse_from_rfc3339(value)
                .map(|date| date.with_timezone(&Utc))
                .ok()
        })
}

fn clean_feed_text(value: &str) -> String {
    let without_cdata = value.replace("<![CDATA[", "").replace("]]>", "");
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .expect("valid html tag regex")
        .replace_all(&without_cdata, " ");
    let text = normalize_whitespace(&decode_xml_entities(&without_tags));
    let text = Regex::new(r"(?i)\bContinue reading on [^»]+»?")
        .expect("valid continue-reading regex")
        .replace_all(&text, "");
    text.trim().to_string()
}

fn decode_xml_entities(value: &str) -> String {
    let text = Regex::new(r"&#x([0-9a-fA-F]+);")
        .expect("valid hex entity regex")
        .replace_all(value, |captures: &regex::Captures<'_>| {
            u32::from_str_radix(&captures[1], 16)
                .ok()
                .and_then(char::from_u32)
                .unwrap_or(' ')
                .to_string()
        })
        .to_string();
    let text = Regex::new(r"&#([0-9]+);")
        .expect("valid decimal entity regex")
        .replace_all(&text, |captures: &regex::Captures<'_>| {
            captures[1]
                .parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .unwrap_or(' ')
                .to_string()
        })
        .to_string();
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn text_matches_project(text: &str, project: &CollectionTarget, focus_terms: &[String]) -> bool {
    let text = text.to_lowercase();
    let project_name = project.name.to_lowercase();
    if project.name == "LanceDB" {
        return text.contains("lancedb")
            || text.contains("lance-format")
            || text.contains("lancedb.com");
    }
    if contains_distinct_term(&text, &project_name) {
        return true;
    }
    garbage::project_live_terms(project)
        .iter()
        .chain(focus_terms.iter())
        .any(|keyword| contains_distinct_term(&text, keyword))
}

fn contains_distinct_term(text: &str, term: &str) -> bool {
    if term.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(offset) = text[start..].find(term) {
        let index = start + offset;
        let before = text[..index].chars().next_back();
        let after = text[index + term.len()..].chars().next();
        let before_boundary = before.is_none_or(|character| !character.is_ascii_alphanumeric());
        let after_boundary = after.is_none_or(|character| !character.is_ascii_alphanumeric());
        if before_boundary && after_boundary {
            return true;
        }
        start = index + term.len();
    }
    false
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

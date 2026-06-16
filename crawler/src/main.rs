use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use clap::{Parser, Subcommand};
use regex::Regex;
use reqwest::{StatusCode, blocking::Client};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
        #[arg(long, default_value = "crawler/config/watchlist.toml")]
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
    },
    ExportSql {
        #[arg(long)]
        snapshot: Option<PathBuf>,
        #[arg(long, default_value = "crawler/data/items.json")]
        input: PathBuf,
        #[arg(long, default_value = "crawler/data/source-runs.json")]
        source_runs: PathBuf,
        #[arg(long, default_value = "/tmp/verdun-newsletter-load.sql")]
        out: PathBuf,
    },
    Verify {
        #[arg(long, default_value = "crawler/config/watchlist.toml")]
        config: PathBuf,
    },
    Queries {
        #[arg(long, default_value = "crawler/config/watchlist.toml")]
        config: PathBuf,
    },
}

#[derive(Debug, Deserialize)]
struct Watchlist {
    theme: String,
    projects: Vec<Project>,
    sources: Vec<Source>,
}

#[derive(Debug, Deserialize)]
struct Project {
    name: String,
    topic: String,
    homepage: String,
    keywords: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct Source {
    name: String,
    kind: String,
    url: String,
    feed_urls: Option<Vec<String>>,
    manual_path: Option<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NewsItem {
    id: String,
    title: String,
    source: String,
    source_kind: String,
    url: String,
    published_at: DateTime<Utc>,
    project: String,
    topic: String,
    summary: String,
    why_it_matters: String,
    tags: Vec<String>,
    score: i32,
    raw_json: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct PublicSnapshot {
    generated_at: DateTime<Utc>,
    theme: String,
    items: Vec<NewsItem>,
    source_runs: Vec<SourceRun>,
    #[serde(default)]
    query_plans: Vec<ProjectQueryPlan>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SourceRun {
    source: String,
    kind: String,
    status: SourceRunStatus,
    item_count: usize,
    message: String,
    #[serde(default)]
    project_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SourceRunStatus {
    Ok,
    Error,
    Pending,
    Skipped,
}

impl SourceRunStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Error => "error",
            Self::Pending => "pending",
            Self::Skipped => "skipped",
        }
    }
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
        } => collect(
            config,
            out,
            source_runs_out,
            public_out,
            live,
            max_live_per_project,
            since_days,
        ),
        CommandKind::ExportSql {
            input,
            source_runs,
            out,
            snapshot,
        } => export_sql(snapshot, input, source_runs, out),
        CommandKind::Verify { config } => verify(config),
        CommandKind::Queries { config } => queries(config),
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectQueryPlan {
    project: String,
    topic: String,
    hacker_news_query: String,
    live_terms: Vec<String>,
    dev_to_tags: Vec<String>,
}

fn collect(
    config: PathBuf,
    out: PathBuf,
    source_runs_out: PathBuf,
    public_out: PathBuf,
    live: bool,
    max_live_per_project: usize,
    since_days: i64,
) -> Result<()> {
    let watchlist = read_watchlist(&config)?;
    anyhow::ensure!(since_days > 0, "--since-days must be positive");
    let mut items = seed_items(&watchlist);
    let mut source_runs = seed_source_runs(&watchlist, live);
    if live {
        let since = Utc::now() - Duration::days(since_days);
        match live_items(&watchlist, max_live_per_project, since) {
            Ok((live_items, live_source_runs)) => {
                items.extend(live_items);
                source_runs.extend(live_source_runs);
            }
            Err(error) => eprintln!("live collection skipped after error: {error:#}"),
        }
    }
    let items = dedupe_items(items);
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
    let query_plans = query_plans(&watchlist);
    let public_snapshot = PublicSnapshot {
        generated_at: Utc::now(),
        theme: watchlist.theme,
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
) -> Result<()> {
    let (items, source_runs) = load_export_payload(snapshot, input, source_runs)?;
    let mut sql = String::from("-- Generated by verdun-crawler export-sql\nbegin;\n");
    for item in &items {
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
    for run in &source_runs {
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
        sql.push_str("::jsonb, now())\n");
        sql.push_str("on conflict (source) do update set\n");
        sql.push_str("  kind = excluded.kind,\n  status = excluded.status,\n  item_count = excluded.item_count,\n");
        sql.push_str("  message = excluded.message,\n  project_counts = excluded.project_counts,\n  collected_at = excluded.collected_at;\n\n");
    }
    sql.push_str("commit;\n");
    fs::write(&out, sql).with_context(|| format!("writing {}", out.display()))?;
    println!(
        "wrote SQL load for {} items and {} source runs to {}",
        items.len(),
        source_runs.len(),
        out.display()
    );
    Ok(())
}

fn load_export_payload(
    snapshot: Option<PathBuf>,
    input: PathBuf,
    source_runs: PathBuf,
) -> Result<(Vec<NewsItem>, Vec<SourceRun>)> {
    if let Some(snapshot) = snapshot {
        let snapshot: PublicSnapshot = serde_json::from_slice(
            &fs::read(&snapshot).with_context(|| format!("reading {}", snapshot.display()))?,
        )?;
        return Ok((snapshot.items, snapshot.source_runs));
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
    Ok((items, source_runs))
}

fn verify(config: PathBuf) -> Result<()> {
    let watchlist = read_watchlist(&config)?;
    anyhow::ensure!(
        !watchlist.projects.is_empty(),
        "watchlist must include projects"
    );
    anyhow::ensure!(
        !watchlist.sources.is_empty(),
        "watchlist must include sources"
    );
    anyhow::ensure!(
        watchlist
            .projects
            .iter()
            .any(|project| project.name == "Pydantic"),
        "Pydantic must be tracked"
    );
    anyhow::ensure!(
        watchlist
            .projects
            .iter()
            .any(|project| project.name == "LakeSail"),
        "LakeSail must be tracked"
    );
    verify_required_projects(&watchlist)?;
    verify_required_sources(&watchlist)?;
    println!(
        "verified {} projects and {} sources for {}",
        watchlist.projects.len(),
        watchlist.sources.len(),
        watchlist.theme
    );
    Ok(())
}

fn queries(config: PathBuf) -> Result<()> {
    let watchlist = read_watchlist(&config)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&query_plans(&watchlist))?
    );
    Ok(())
}

fn query_plans(watchlist: &Watchlist) -> Vec<ProjectQueryPlan> {
    watchlist
        .projects
        .iter()
        .map(|project| ProjectQueryPlan {
            project: project.name.clone(),
            topic: project.topic.clone(),
            hacker_news_query: project_query(project),
            live_terms: project_live_terms(project),
            dev_to_tags: dev_to_tags(project),
        })
        .collect::<Vec<_>>()
}

fn verify_required_projects(watchlist: &Watchlist) -> Result<()> {
    for project_name in [
        "Pydantic",
        "BAML",
        "DSPy",
        "Instructor",
        "LakeSail",
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
        "FalkorDB",
        "LadybugDB",
        "CocoIndex",
    ] {
        let project = watchlist
            .projects
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
            !project_live_terms(project).is_empty(),
            "{project_name} must have at least one distinctive live-search term"
        );
    }
    Ok(())
}

fn verify_required_sources(watchlist: &Watchlist) -> Result<()> {
    for source_name in ["Hacker News", "Lobste.rs", "dev.to"] {
        let source = required_source(watchlist, source_name)?;
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
        let source = required_source(watchlist, source_name)?;
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
        let source = required_source(watchlist, source_name)?;
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

fn required_source<'a>(watchlist: &'a Watchlist, source_name: &str) -> Result<&'a Source> {
    let source = watchlist
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
    watchlist: &Watchlist,
    max_per_project: usize,
    since: DateTime<Utc>,
) -> Result<(Vec<NewsItem>, Vec<SourceRun>)> {
    let client = Client::builder()
        .timeout(StdDuration::from_secs(12))
        .user_agent("verdun-newsletter-crawler/0.1")
        .build()
        .context("building HTTP client")?;
    let mut items = Vec::new();
    let mut source_runs = Vec::new();
    if let Some(source) = watchlist
        .sources
        .iter()
        .find(|source| source.name == "Hacker News")
    {
        match fetch_hacker_news(&client, watchlist, source, max_per_project) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(ok_source_run(
                    source,
                    &source_items,
                    "HN Algolia search_by_date",
                ));
                items.append(&mut source_items);
            }
            Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
        }
    }
    if let Some(source) = watchlist
        .sources
        .iter()
        .find(|source| source.name == "Lobste.rs")
    {
        match fetch_lobsters(&client, watchlist, source, max_per_project) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(ok_source_run(
                    source,
                    &source_items,
                    "Lobste.rs newest.json",
                ));
                items.append(&mut source_items);
            }
            Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
        }
    }
    if let Some(source) = watchlist
        .sources
        .iter()
        .find(|source| source.name == "dev.to")
    {
        match fetch_dev_to(&client, watchlist, source, max_per_project) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(ok_source_run(source, &source_items, "dev.to articles API"));
                items.append(&mut source_items);
            }
            Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
        }
    }
    if let Some(source) = watchlist
        .sources
        .iter()
        .find(|source| source.name == "Medium")
    {
        match fetch_feed_source(&client, watchlist, source, max_per_project) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(ok_source_run(
                    source,
                    &source_items,
                    "configured RSS/Atom feeds",
                ));
                items.append(&mut source_items);
            }
            Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
        }
    }
    if let Some(source) = watchlist
        .sources
        .iter()
        .find(|source| source.name == "Substack")
    {
        match fetch_feed_source(&client, watchlist, source, max_per_project) {
            Ok(mut source_items) => {
                retain_recent(&mut source_items, since);
                source_runs.push(ok_source_run(
                    source,
                    &source_items,
                    "configured RSS/Atom feeds",
                ));
                items.append(&mut source_items);
            }
            Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
        }
    }
    for source_name in ["LinkedIn", "X/Twitter"] {
        if let Some(source) = watchlist
            .sources
            .iter()
            .find(|source| source.name == source_name)
        {
            match collect_manual_source(watchlist, source, max_per_project) {
                Ok(mut source_items) => {
                    retain_recent(&mut source_items, since);
                    source_runs.push(ok_source_run(source, &source_items, "manual JSON import"));
                    items.append(&mut source_items);
                }
                Err(error) => source_runs.push(error_source_run(source, &format!("{error:#}"))),
            }
        }
    }
    Ok((items, source_runs))
}

fn retain_recent(items: &mut Vec<NewsItem>, since: DateTime<Utc>) {
    items.retain(|item| item.published_at >= since);
}

fn fetch_hacker_news(
    client: &Client,
    watchlist: &Watchlist,
    source: &Source,
    max_per_project: usize,
) -> Result<Vec<NewsItem>> {
    let mut items = Vec::new();
    for project in &watchlist.projects {
        let query = project_query(project);
        let response = client
            .get("https://hn.algolia.com/api/v1/search_by_date")
            .query(&[
                ("query", query.as_str()),
                ("tags", "story"),
                (
                    "hitsPerPage",
                    &(max_per_project * 2).max(1).min(20).to_string(),
                ),
            ])
            .send()
            .with_context(|| format!("fetching Hacker News for {}", project.name))?
            .error_for_status()
            .with_context(|| format!("Hacker News returned error for {}", project.name))?
            .json::<HackerNewsResponse>()
            .with_context(|| format!("decoding Hacker News for {}", project.name))?;
        for hit in response
            .hits
            .into_iter()
            .filter(|hit| hn_hit_matches_project(hit, project))
            .take(max_per_project)
        {
            items.push(hn_item(project, source, hit));
        }
    }
    Ok(items)
}

fn fetch_lobsters(
    client: &Client,
    watchlist: &Watchlist,
    source: &Source,
    max_per_project: usize,
) -> Result<Vec<NewsItem>> {
    let stories = client
        .get("https://lobste.rs/newest.json")
        .send()
        .context("fetching Lobste.rs newest stories")?
        .error_for_status()
        .context("Lobste.rs returned error")?
        .json::<Vec<LobstersStory>>()
        .context("decoding Lobste.rs newest stories")?;
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut items = Vec::new();
    for story in stories {
        for project in &watchlist.projects {
            let count = *counts.get(project.name.as_str()).unwrap_or(&0);
            if count >= max_per_project || !lobsters_story_matches_project(&story, project) {
                continue;
            }
            items.push(lobsters_item(project, source, &story));
            counts.insert(project.name.as_str(), count + 1);
        }
    }
    Ok(items)
}

fn fetch_dev_to(
    client: &Client,
    watchlist: &Watchlist,
    source: &Source,
    max_per_project: usize,
) -> Result<Vec<NewsItem>> {
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut seen_articles = BTreeMap::new();
    let mut items = Vec::new();
    for project in &watchlist.projects {
        for tag in dev_to_tags(project).into_iter().take(2) {
            let response = client
                .get("https://dev.to/api/articles")
                .query(&[("per_page", "20"), ("top", "30"), ("tag", tag.as_str())])
                .send()
                .with_context(|| format!("fetching dev.to articles for {}", project.name))?;
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                return Ok(items);
            }
            let articles = response
                .error_for_status()
                .with_context(|| format!("dev.to returned error for {}", project.name))?
                .json::<Vec<DevToArticle>>()
                .with_context(|| format!("decoding dev.to articles for {}", project.name))?;
            for article in articles {
                if seen_articles.insert(article.id, true).is_some() {
                    continue;
                }
                let count = *counts.get(project.name.as_str()).unwrap_or(&0);
                if count >= max_per_project {
                    break;
                }
                if !dev_to_article_matches_project(&article, project) {
                    continue;
                }
                items.push(dev_to_item(project, source, &article));
                counts.insert(project.name.as_str(), count + 1);
            }
            let count = *counts.get(project.name.as_str()).unwrap_or(&0);
            if count >= max_per_project {
                break;
            }
        }
    }
    Ok(items)
}

fn fetch_feed_source(
    client: &Client,
    watchlist: &Watchlist,
    source: &Source,
    max_per_project: usize,
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
            for project in &watchlist.projects {
                let count = *counts.get(project.name.as_str()).unwrap_or(&0);
                if count >= max_per_project || !feed_entry_matches_project(&entry, project) {
                    continue;
                }
                items.push(feed_item(project, source, &entry));
                counts.insert(project.name.as_str(), count + 1);
            }
        }
    }
    Ok(items)
}

fn collect_manual_source(
    watchlist: &Watchlist,
    source: &Source,
    max_per_project: usize,
) -> Result<Vec<NewsItem>> {
    let path = source
        .manual_path
        .as_ref()
        .with_context(|| format!("{} has no manual_path configured", source.name))?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let posts: Vec<ManualPost> = serde_json::from_slice(
        &fs::read(path).with_context(|| format!("reading {}", path.display()))?,
    )
    .with_context(|| format!("parsing {}", path.display()))?;
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut items = Vec::new();
    for post in posts {
        for project in &watchlist.projects {
            let count = *counts.get(project.name.as_str()).unwrap_or(&0);
            if count >= max_per_project || !manual_post_matches_project(&post, project) {
                continue;
            }
            items.push(manual_post_item(project, source, &post));
            counts.insert(project.name.as_str(), count + 1);
        }
    }
    Ok(items)
}

fn seed_source_runs(watchlist: &Watchlist, live: bool) -> Vec<SourceRun> {
    watchlist
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

fn ok_source_run(source: &Source, items: &[NewsItem], message: &str) -> SourceRun {
    SourceRun {
        source: source.name.clone(),
        kind: source.kind.clone(),
        status: SourceRunStatus::Ok,
        item_count: items.len(),
        message: message.to_string(),
        project_counts: project_counts(items),
    }
}

fn error_source_run(source: &Source, message: &str) -> SourceRun {
    SourceRun {
        source: source.name.clone(),
        kind: source.kind.clone(),
        status: SourceRunStatus::Error,
        item_count: 0,
        message: message.to_string(),
        project_counts: BTreeMap::new(),
    }
}

fn project_counts(items: &[NewsItem]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for item in items {
        *counts.entry(item.project.clone()).or_insert(0) += 1;
    }
    counts
}

fn read_watchlist(path: &PathBuf) -> Result<Watchlist> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    toml::from_str(&text).with_context(|| format!("parsing {}", path.display()))
}

fn seed_items(watchlist: &Watchlist) -> Vec<NewsItem> {
    let source = watchlist
        .sources
        .iter()
        .find(|candidate| candidate.name == "Hacker News")
        .cloned()
        .unwrap_or_else(|| watchlist.sources[0].clone());
    watchlist
        .projects
        .iter()
        .enumerate()
        .map(|(index, project)| project_item(project, &source, index))
        .collect()
}

fn dedupe_items(items: Vec<NewsItem>) -> Vec<NewsItem> {
    let mut by_id = BTreeMap::new();
    for item in items {
        by_id.entry(item.id.clone()).or_insert(item);
    }
    by_id.into_values().collect()
}

fn project_item(project: &Project, source: &Source, index: usize) -> NewsItem {
    let published_at = seed_base_time() - Duration::days(index as i64);
    let title = format!(
        "{} belongs in this week's typed AI/data systems watch",
        project.name
    );
    let summary = format!(
        "{} is being tracked for {} signals around {}.",
        project.name,
        project.topic,
        project.keywords.join(", ")
    );
    let why_it_matters = format!(
        "{} helps explain where typed contracts, local execution, and practical AI/data systems are converging.",
        project.name
    );
    let id = stable_id(&project.name, &project.homepage);
    NewsItem {
        id,
        title,
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: project.homepage.clone(),
        published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary,
        why_it_matters,
        tags: project.keywords.iter().take(4).cloned().collect(),
        score: 90 - (index as i32 * 3),
        raw_json: serde_json::json!({
            "homepage": project.homepage,
            "source_url": source.url,
            "collection_stage": "watchlist-seed",
            "provenance": provenance("watchlist-seed", "watchlist", source, project, &project.homepage)
        }),
    }
}

fn seed_base_time() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-06-15T12:00:00Z")
        .expect("valid seed timestamp")
        .with_timezone(&Utc)
}

#[derive(Debug, Deserialize)]
struct HackerNewsResponse {
    hits: Vec<HackerNewsHit>,
}

#[derive(Debug, Deserialize)]
struct HackerNewsHit {
    #[serde(rename = "objectID")]
    object_id: Option<String>,
    title: Option<String>,
    url: Option<String>,
    story_url: Option<String>,
    created_at_i: Option<i64>,
    points: Option<i32>,
    num_comments: Option<i32>,
    author: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct LobstersStory {
    short_id: Option<String>,
    short_id_url: Option<String>,
    title: String,
    url: String,
    created_at: DateTime<Utc>,
    score: Option<i32>,
    comment_count: Option<i32>,
    tags: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct DevToArticle {
    id: i64,
    title: String,
    description: Option<String>,
    url: String,
    canonical_url: Option<String>,
    published_at: DateTime<Utc>,
    positive_reactions_count: Option<i32>,
    comments_count: Option<i32>,
    tag_list: Vec<String>,
    user: DevToUser,
}

#[derive(Debug, Deserialize, Clone)]
struct DevToUser {
    username: String,
}

#[derive(Debug, Deserialize, Clone)]
struct ManualPost {
    title: String,
    url: String,
    author: Option<String>,
    published_at: DateTime<Utc>,
    text: String,
}

#[derive(Debug, Clone)]
struct FeedEntry {
    title: String,
    link: String,
    published_at: DateTime<Utc>,
    summary: String,
    feed_url: String,
}

fn hn_item(project: &Project, source: &Source, hit: HackerNewsHit) -> NewsItem {
    let title = hit
        .title
        .unwrap_or_else(|| format!("{} discussion on Hacker News", project.name));
    let url = hit
        .url
        .or(hit.story_url)
        .unwrap_or_else(|| source.url.clone());
    let points = hit.points.unwrap_or_default();
    let comments = hit.num_comments.unwrap_or_default();
    let published_at = hit
        .created_at_i
        .and_then(|timestamp| DateTime::from_timestamp(timestamp, 0))
        .unwrap_or_else(Utc::now);
    NewsItem {
        id: stable_id(
            "hn",
            &format!(
                "{}:{}",
                project.name,
                hit.object_id.clone().unwrap_or_else(|| url.clone())
            ),
        ),
        title,
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: url.clone(),
        published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary: format!(
            "Hacker News surfaced this item while tracking {} keywords: {}.",
            project.name,
            project.keywords.join(", ")
        ),
        why_it_matters: format!(
            "Community discussion can reveal whether {} is becoming practical infrastructure or only an interesting release note.",
            project.name
        ),
        tags: project
            .keywords
            .iter()
            .take(3)
            .cloned()
            .chain(["hacker-news".to_string()])
            .collect(),
        score: 60 + points.min(30) + comments.min(20),
        raw_json: serde_json::json!({
            "collection_stage": "live",
            "provenance": provenance("live", "hn-algolia", source, project, &url),
            "source": "hacker-news",
            "object_id": hit.object_id,
            "points": points,
            "comments": comments,
            "author": hit.author
        }),
    }
}

fn lobsters_item(project: &Project, source: &Source, story: &LobstersStory) -> NewsItem {
    let score = story.score.unwrap_or_default();
    let comments = story.comment_count.unwrap_or_default();
    let url = story
        .short_id_url
        .clone()
        .unwrap_or_else(|| story.url.clone());
    NewsItem {
        id: stable_id(
            "lobsters",
            &format!(
                "{}:{}",
                project.name,
                story.short_id.clone().unwrap_or_else(|| story.url.clone())
            ),
        ),
        title: story.title.clone(),
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: url.clone(),
        published_at: story.created_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary: format!(
            "Lobste.rs matched this story against {} signals: {}.",
            project.name,
            project.keywords.join(", ")
        ),
        why_it_matters: format!(
            "Lobste.rs is a useful technical filter for whether {} has substance with systems-oriented readers.",
            project.name
        ),
        tags: project
            .keywords
            .iter()
            .take(2)
            .cloned()
            .chain(story.tags.iter().take(3).cloned())
            .collect(),
        score: 62 + score.min(25) + comments.min(15),
        raw_json: serde_json::json!({
            "collection_stage": "live",
            "provenance": provenance("live", "lobsters-newest", source, project, &url),
            "source": "lobsters",
            "short_id": story.short_id,
            "score": score,
            "comments": comments,
            "story_url": story.url
        }),
    }
}

fn dev_to_item(project: &Project, source: &Source, article: &DevToArticle) -> NewsItem {
    let reactions = article.positive_reactions_count.unwrap_or_default();
    let comments = article.comments_count.unwrap_or_default();
    let url = article
        .canonical_url
        .clone()
        .unwrap_or_else(|| article.url.clone());
    NewsItem {
        id: stable_id("dev-to", &format!("{}:{}", project.name, article.id)),
        title: article.title.clone(),
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: url.clone(),
        published_at: article.published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary: article.description.clone().unwrap_or_else(|| {
            format!(
                "dev.to surfaced this item while tracking {} signals: {}.",
                project.name,
                project.keywords.join(", ")
            )
        }),
        why_it_matters: format!(
            "Developer essays show whether {} is gaining practical adoption beyond release announcements.",
            project.name
        ),
        tags: project
            .keywords
            .iter()
            .take(2)
            .cloned()
            .chain(article.tag_list.iter().take(4).cloned())
            .collect(),
        score: 55 + reactions.min(30) + comments.min(15),
        raw_json: serde_json::json!({
            "collection_stage": "live",
            "provenance": provenance("live", "dev-to-articles", source, project, &url),
            "source": "dev-to",
            "article_id": article.id,
            "reactions": reactions,
            "comments": comments,
            "author": article.user.username
        }),
    }
}

fn feed_item(project: &Project, source: &Source, entry: &FeedEntry) -> NewsItem {
    NewsItem {
        id: stable_id(
            &slug(&source.name),
            &format!("{}:{}", project.name, entry.link),
        ),
        title: entry.title.clone(),
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: entry.link.clone(),
        published_at: entry.published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary: if entry.summary.is_empty() {
            format!(
                "{} surfaced this feed item while tracking {} signals: {}.",
                source.name,
                project.name,
                project.keywords.join(", ")
            )
        } else {
            truncate_text(&entry.summary, 260)
        },
        why_it_matters: format!(
            "Long-form publication coverage can show whether {} is being adopted, compared, or explained beyond release traffic.",
            project.name
        ),
        tags: project
            .keywords
            .iter()
            .take(3)
            .cloned()
            .chain([slug(&source.name)])
            .collect(),
        score: feed_score(project, entry),
        raw_json: serde_json::json!({
            "collection_stage": "live",
            "provenance": provenance("live", "rss-atom-feed", source, project, &entry.link),
            "source": slug(&source.name),
            "feed_url": entry.feed_url
        }),
    }
}

fn manual_post_item(project: &Project, source: &Source, post: &ManualPost) -> NewsItem {
    NewsItem {
        id: stable_id(
            &slug(&source.name),
            &format!("{}:{}", project.name, post.url),
        ),
        title: post.title.clone(),
        source: source.name.clone(),
        source_kind: source.kind.clone(),
        url: post.url.clone(),
        published_at: post.published_at,
        project: project.name.clone(),
        topic: project.topic.clone(),
        summary: truncate_text(&post.text, 260),
        why_it_matters: format!(
            "Manually reviewed social posts can capture practitioner interest in {} without relying on unauthenticated scraping.",
            project.name
        ),
        tags: project
            .keywords
            .iter()
            .take(3)
            .cloned()
            .chain([slug(&source.name)])
            .collect(),
        score: 76,
        raw_json: serde_json::json!({
            "collection_stage": "manual",
            "provenance": provenance("manual", "manual-json", source, project, &post.url),
            "source": slug(&source.name),
            "author": post.author
        }),
    }
}

fn provenance(
    stage: &str,
    adapter: &str,
    source: &Source,
    project: &Project,
    evidence_url: &str,
) -> serde_json::Value {
    serde_json::json!({
        "stage": stage,
        "adapter": adapter,
        "source": source.name,
        "source_kind": source.kind,
        "source_url": source.url,
        "evidence_url": evidence_url,
        "project": project.name,
        "matched_keywords": project.keywords.iter().take(5).cloned().collect::<Vec<_>>()
    })
}

fn project_query(project: &Project) -> String {
    let mut parts = vec![project.name.clone()];
    parts.extend(project_live_terms(project).into_iter().take(2));
    parts.join(" ")
}

fn hn_hit_matches_project(hit: &HackerNewsHit, project: &Project) -> bool {
    let text = format!(
        "{} {}",
        hit.title.as_deref().unwrap_or_default(),
        hit.url
            .as_deref()
            .or(hit.story_url.as_deref())
            .unwrap_or_default()
    );
    text_matches_project(&text, project)
}

fn lobsters_story_matches_project(story: &LobstersStory, project: &Project) -> bool {
    let text = format!("{} {} {}", story.title, story.url, story.tags.join(" "));
    text_matches_project(&text, project)
}

fn dev_to_article_matches_project(article: &DevToArticle, project: &Project) -> bool {
    let text = format!(
        "{} {} {} {}",
        article.title,
        article.description.as_deref().unwrap_or_default(),
        article.url,
        article.tag_list.join(" ")
    );
    text_matches_project(&text, project)
}

fn feed_entry_matches_project(entry: &FeedEntry, project: &Project) -> bool {
    let link_without_query = entry.link.split('?').next().unwrap_or(&entry.link);
    let text = format!("{} {} {}", entry.title, link_without_query, entry.summary);
    text_matches_project(&text, project)
}

fn manual_post_matches_project(post: &ManualPost, project: &Project) -> bool {
    let text = format!("{} {} {}", post.title, post.url, post.text);
    text_matches_project(&text, project)
}

fn feed_score(project: &Project, entry: &FeedEntry) -> i32 {
    let text = format!("{} {}", entry.title, entry.link).to_lowercase();
    let project_name = project.name.to_lowercase();
    let explicit_project = text.contains(&project_name)
        || (project.name == "LanceDB"
            && (text.contains("lancedb") || text.contains("lance-format")));
    if explicit_project { 88 } else { 68 }
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
    let summary = xml_text(block, "description")
        .or_else(|| xml_text(block, "summary"))
        .or_else(|| xml_text(block, "content"))
        .map(|value| clean_feed_text(&value))
        .unwrap_or_default();
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
    let pattern = format!(r"(?is)<(?:\w+:)?{tag}\b[^>]*>(.*?)</(?:\w+:)?{tag}>");
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

fn truncate_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut text = value.chars().take(max_chars).collect::<String>();
    text.push('…');
    text
}

fn text_matches_project(text: &str, project: &Project) -> bool {
    let text = text.to_lowercase();
    let project_name = project.name.to_lowercase();
    if project.name == "LanceDB" {
        return text.contains("lancedb")
            || text.contains("lance-format")
            || text.contains("lancedb.com");
    }
    if text.contains(&project_name) {
        return true;
    }
    project_live_terms(project)
        .iter()
        .any(|keyword| text.contains(keyword))
}

fn project_live_terms(project: &Project) -> Vec<String> {
    let generic_terms = [
        "ai",
        "arrow",
        "backend",
        "capability",
        "columnar",
        "cypher",
        "data orchestration",
        "dataframes",
        "declarative lm",
        "edge",
        "embedded graph",
        "expression api",
        "graph",
        "graph database",
        "graph query",
        "knowledge graph",
        "lance",
        "language model programs",
        "llm",
        "multimodal",
        "multimodel",
        "optimizers",
        "prompt functions",
        "python",
        "realtime",
        "replication",
        "rust",
        "rust graph",
        "schema",
        "security",
        "sqlite",
        "software-defined assets",
        "sql compiler",
        "spark connect",
        "structured outputs",
        "typed agents",
        "typed extraction",
        "typed graph",
        "typed llm",
        "typed policy",
        "validation",
        "vectors",
    ];
    project
        .keywords
        .iter()
        .map(|keyword| keyword.to_lowercase())
        .filter(|keyword| keyword.len() >= 4 && !generic_terms.contains(&keyword.as_str()))
        .collect()
}

fn dev_to_tags(project: &Project) -> Vec<String> {
    let mut tags = vec![slug(&project.name).replace('-', "")];
    tags.extend(
        project_live_terms(project)
            .into_iter()
            .map(|term| slug(&term).replace('-', ""))
            .filter(|term| term.len() >= 3),
    );
    tags.sort();
    tags.dedup();
    tags
}

fn stable_id(project: &str, url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(project.as_bytes());
    hasher.update(b"\n");
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    format!(
        "{}-{:x}",
        slug(project),
        &digest[..6]
            .iter()
            .fold(0_u64, |acc, byte| (acc << 8) | u64::from(*byte))
    )
}

fn slug(value: &str) -> String {
    value
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
        .join("-")
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

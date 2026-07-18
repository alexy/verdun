use anyhow::{Result, bail};
use chrono::Utc;
use clap::{Args, Parser, Subcommand};
use verdun_cli::{
    Account, active_account, config_path, load_config, report, save_config, select_account,
};

#[derive(Parser)]
#[command(
    name = "verdun",
    version,
    about = "Mothership CLI for Verdun-backed applications"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Save a token profile, or quickly select an already-saved profile.
    Login(LoginArgs),
    /// Remove a token while preserving the profile's non-secret metadata.
    Logout {
        #[arg(long)]
        account: Option<String>,
    },
    /// Show database, crawler, and active-account state from a Verdun health endpoint.
    Report(ReportArgs),
    /// List saved account profiles; a tier is optional.
    Account(AccountArgs),
    /// Show active configuration without revealing tokens.
    Config,
}

#[derive(Args)]
struct LoginArgs {
    #[arg(long)]
    token: Option<String>,
    #[arg(long)]
    api_base: Option<String>,
    #[arg(long)]
    account: Option<String>,
    #[arg(long)]
    email: Option<String>,
    #[arg(long)]
    tier: Option<String>,
}

#[derive(Args)]
struct ReportArgs {
    #[arg(long)]
    account: Option<String>,
    #[arg(long, default_value = "/api/workbench/health")]
    health_path: String,
    #[arg(long)]
    json: bool,
}

#[derive(Args)]
struct AccountArgs {
    #[command(subcommand)]
    command: Option<AccountCommand>,
}
#[derive(Subcommand)]
enum AccountCommand {
    Ls,
    Use { name: String },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Login(args) => login(args),
        Command::Logout { account } => logout(account.as_deref()),
        Command::Report(args) => show_report(args),
        Command::Account(args) => account(args),
        Command::Config => show_config(),
    }
}

fn login(args: LoginArgs) -> Result<()> {
    let mut config = load_config()?;
    let name = args
        .account
        .or_else(|| args.email.clone())
        .or_else(|| config.active_account.clone())
        .unwrap_or_else(|| "default".into());
    if args.token.is_none() {
        let (_, account) = select_account(&config, Some(&name))?;
        if !account.logged_in() {
            bail!("{name} has no saved token; pass --token");
        }
        let api_base = account.api_base.clone();
        config.active_account = Some(name.clone());
        save_config(&config)?;
        println!("Reusing saved {name} for {api_base}");
        return Ok(());
    }
    let api_base = args
        .api_base
        .or_else(|| config.accounts.get(&name).map(|a| a.api_base.clone()))
        .ok_or_else(|| anyhow::anyhow!("--api-base is required for a new account"))?;
    config.accounts.insert(
        name.clone(),
        Account {
            api_base: api_base.clone(),
            token: args.token,
            email: args.email,
            tier: args.tier,
            updated_at: Some(Utc::now()),
        },
    );
    config.active_account = Some(name.clone());
    save_config(&config)?;
    println!("Saved {name} for {api_base}");
    Ok(())
}

fn logout(name: Option<&str>) -> Result<()> {
    let mut c = load_config()?;
    let name = select_account(&c, name)?.0.to_string();
    c.accounts.get_mut(&name).expect("selected account").token = None;
    save_config(&c)?;
    println!("Logged out {name}");
    Ok(())
}
fn show_report(args: ReportArgs) -> Result<()> {
    let c = load_config()?;
    let (name, account) = select_account(&c, args.account.as_deref())?;
    let health = verdun_cli::ApiClient::from_account(account)?.get_json(&args.health_path)?;
    let value = report(name, account, &health);
    if args.json {
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        println!(
            "account\t{}\t{}",
            value.account.name,
            value.account.tier.as_deref().unwrap_or("un-tiered")
        );
        println!(
            "database\tconfigured={:?}\twritable={:?}\t{}",
            value.database.configured,
            value.database.writable,
            value
                .database
                .editorial_persistence
                .as_deref()
                .unwrap_or("unknown")
        );
        println!(
            "crawler\tsource_runs={:?}\trecords={:?}\t{}",
            value.crawler.source_runs,
            value.crawler.records,
            value.crawler.generated_at.as_deref().unwrap_or("unknown")
        );
    }
    Ok(())
}
fn account(args: AccountArgs) -> Result<()> {
    let mut c = load_config()?;
    match args.command.unwrap_or(AccountCommand::Ls) {
        AccountCommand::Ls => {
            let active = active_account(&c).map(|(name, _)| name.to_string());
            for (name, account) in c.accounts {
                println!(
                    "{} {}\t{}\t{}",
                    if active.as_deref() == Some(name.as_str()) {
                        "*"
                    } else {
                        " "
                    },
                    name,
                    if account.logged_in() {
                        "logged in"
                    } else {
                        "logged out"
                    },
                    account.tier.as_deref().unwrap_or("un-tiered")
                );
            }
            Ok(())
        }
        AccountCommand::Use { name } => {
            if !c.accounts.contains_key(&name) {
                bail!("no stored account named {name}");
            }
            c.active_account = Some(name);
            save_config(&c)
        }
    }
}
fn show_config() -> Result<()> {
    let c = load_config()?;
    println!(
        "account = {}",
        c.active_account.as_deref().unwrap_or("none")
    );
    println!("config_file = {}", config_path("verdun")?.display());
    println!(
        "tokens = {}",
        c.accounts.values().filter(|a| a.logged_in()).count()
    );
    Ok(())
}

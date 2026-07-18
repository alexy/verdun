//! Stable, product-neutral primitives for Verdun command-line applications.

use std::{collections::BTreeMap, fs, path::PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use chrono::{DateTime, Utc};
use reqwest::blocking::{Client, RequestBuilder};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Config {
    #[serde(default)]
    pub active_account: Option<String>,
    #[serde(default)]
    pub accounts: BTreeMap<String, Account>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Account {
    pub api_base: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// A tier is deliberately optional: many Verdun apps have accounts but no plans.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,
}

impl Account {
    pub fn logged_in(&self) -> bool {
        self.token.is_some()
    }
}

pub fn config_path(app: &str) -> Result<PathBuf> {
    let base =
        dirs::config_dir().ok_or_else(|| anyhow!("could not find the user config directory"))?;
    Ok(base.join(app).join("config.toml"))
}

pub fn read_toml<T>(path: &PathBuf) -> Result<T>
where
    T: Default + for<'de> Deserialize<'de>,
{
    if !path.exists() {
        return Ok(T::default());
    }
    let input =
        fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    toml::from_str(&input).with_context(|| format!("could not parse {}", path.display()))
}

pub fn write_toml<T: Serialize>(path: &PathBuf, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("could not create {}", parent.display()))?;
    }
    fs::write(path, toml::to_string(value)?)
        .with_context(|| format!("could not write {}", path.display()))
}

pub fn load_config() -> Result<Config> {
    read_toml(&config_path("verdun")?)
}
pub fn save_config(config: &Config) -> Result<()> {
    write_toml(&config_path("verdun")?, config)
}

pub fn active_account(config: &Config) -> Option<(&str, &Account)> {
    config
        .active_account
        .as_deref()
        .and_then(|name| config.accounts.get(name).map(|account| (name, account)))
        .or_else(|| {
            config
                .accounts
                .iter()
                .next()
                .map(|(name, account)| (name.as_str(), account))
        })
}

pub fn select_account<'a>(
    config: &'a Config,
    name: Option<&str>,
) -> Result<(&'a str, &'a Account)> {
    match name {
        Some(name) => config
            .accounts
            .get_key_value(name)
            .map(|(name, account)| (name.as_str(), account))
            .ok_or_else(|| anyhow!("no stored account named {name}")),
        None => active_account(config).ok_or_else(|| {
            anyhow!("no saved account; run `verdun login --token TOKEN --api-base URL`")
        }),
    }
}

pub struct ApiClient {
    client: Client,
    base: String,
    token: String,
}

impl ApiClient {
    pub fn from_account(account: &Account) -> Result<Self> {
        let token = account.token.clone().ok_or_else(|| {
            anyhow!("account is logged out; run `verdun login --token TOKEN --api-base URL`")
        })?;
        Ok(Self {
            client: Client::new(),
            base: account.api_base.trim_end_matches('/').to_string(),
            token,
        })
    }

    pub fn get_json(&self, path: &str) -> Result<Value> {
        let path = if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        };
        let response = self
            .client
            .get(format!("{}{}", self.base, path))
            .bearer_auth(&self.token)
            .send()
            .context("request failed")?;
        Self::response_json(response)
    }

    pub fn request_json(&self, request: RequestBuilder) -> Result<Value> {
        authenticated_json(request, &self.token)
    }

    fn response_json(response: reqwest::blocking::Response) -> Result<Value> {
        let status = response.status();
        let value = response.json::<Value>().unwrap_or(Value::Null);
        if !status.is_success() {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| value.get("error").and_then(Value::as_str))
                .unwrap_or("request failed");
            bail!("{}: {message}", status);
        }
        Ok(value)
    }
}

/// Send an arbitrary request with a persisted Verdun-compatible bearer token.
/// Product CLIs use this when their route construction remains product-specific.
pub fn authenticated_json(request: RequestBuilder, token: &str) -> Result<Value> {
    ApiClient::response_json(
        request
            .bearer_auth(token)
            .send()
            .context("request failed")?,
    )
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub account: AccountReport,
    pub database: DatabaseReport,
    pub crawler: CrawlerReport,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountReport {
    pub name: String,
    pub email: Option<String>,
    pub tier: Option<String>,
    pub logged_in: bool,
}
#[derive(Debug, Clone, Serialize)]
pub struct DatabaseReport {
    pub configured: Option<bool>,
    pub writable: Option<bool>,
    pub editorial_persistence: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct CrawlerReport {
    pub source_runs: Option<u64>,
    pub records: Option<u64>,
    pub generated_at: Option<String>,
}

pub fn report(account_name: &str, account: &Account, health: &Value) -> Report {
    let snapshot = health.get("activeSnapshot").unwrap_or(health);
    Report {
        account: AccountReport {
            name: account_name.to_string(),
            email: account.email.clone(),
            tier: account.tier.clone(),
            logged_in: account.logged_in(),
        },
        database: DatabaseReport {
            configured: health.get("databaseConfigured").and_then(Value::as_bool),
            writable: snapshot.get("writable").and_then(Value::as_bool),
            editorial_persistence: snapshot
                .get("editorialPersistence")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        },
        crawler: CrawlerReport {
            source_runs: snapshot.get("sourceRunCount").and_then(Value::as_u64),
            records: snapshot.get("recordCount").and_then(Value::as_u64),
            generated_at: snapshot
                .get("generatedAt")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn report_supports_an_account_without_a_tier() {
        let account = Account {
            api_base: "https://example.test".into(),
            token: Some("secret".into()),
            email: None,
            tier: None,
            updated_at: None,
        };
        let result = report(
            "demo",
            &account,
            &json!({"databaseConfigured": true, "activeSnapshot": {"writable": false, "sourceRunCount": 3, "recordCount": 9}}),
        );
        assert_eq!(result.account.tier, None);
        assert_eq!(result.crawler.source_runs, Some(3));
    }
}

//! Generic Postgres access for workbench apps that load the database from Rust
//! rather than emitting SQL for an external `psql`/serverless step.
//!
//! App-neutral: connects to a Postgres/Neon database from a standard set of
//! environment variables over TLS (rustls + ring), then hands back a
//! `tokio_postgres::Client` the app can query directly. Gated behind the `db`
//! cargo feature so apps that only export SQL stay free of the Postgres/TLS
//! dependency stack.

use std::sync::Arc;

use anyhow::{Context, Result};
use tokio_postgres::Client;

/// Environment variables checked, in order, for a Postgres connection string.
/// Generic + Verdun's own namespace only — apps set one of these standard keys.
pub const DATABASE_URL_ENV_KEYS: &[&str] = &[
    "POSTGRES_URL",
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "VERDUN_ACCOUNT_DATABASE_URL",
];

/// First non-empty connection string found in [`DATABASE_URL_ENV_KEYS`].
pub fn database_url_from_env() -> Option<String> {
    for key in DATABASE_URL_ENV_KEYS {
        if let Ok(value) = std::env::var(key) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

/// Connect to Postgres over TLS and spawn the connection driver task. The
/// caller must be running inside a Tokio runtime.
pub async fn connect(database_url: &str) -> Result<Client> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .context("configuring rustls protocol versions")?
    .with_root_certificates(roots)
    .with_no_client_auth();
    let tls = tokio_postgres_rustls::MakeRustlsConnect::new(config);
    let (client, connection) = tokio_postgres::connect(database_url, tls)
        .await
        .context("connecting to postgres")?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("verdun-crawler postgres connection error: {error}");
        }
    });
    Ok(client)
}

/// Connect using the first connection string found in the environment.
pub async fn connect_from_env() -> Result<Client> {
    let url = database_url_from_env().context(
        "no Postgres connection string in environment (set POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL)",
    )?;
    connect(&url).await
}

//! Generic US address geocoding via the public Census Geocoder.
//!
//! App-neutral: any workbench app that needs to turn a US street address into
//! coordinates + county/state, or to resolve county/state from coordinates,
//! can use these helpers. No API key is required. The Census Geocoder is a
//! public US Government service.

use anyhow::{Context, Result};
use serde_json::Value;

#[cfg(test)]
mod tests;

/// A resolved geocoding result. Coordinates are always present; the matched
/// address and administrative geographies are best-effort.
#[derive(Debug, Clone, PartialEq)]
pub struct GeocodeResult {
    pub lat: f64,
    pub lon: f64,
    pub matched_address: Option<String>,
    pub county: Option<String>,
    pub state: Option<String>,
}

const ONELINE_BASE: &str =
    "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const COORDINATES_BASE: &str =
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";

/// Forward-geocode a one-line US street address. Returns `Ok(None)` when the
/// geocoder runs but finds no match.
pub async fn geocode_oneline_address(
    client: &reqwest::Client,
    address: &str,
) -> Result<Option<GeocodeResult>> {
    let url = format!(
        "{ONELINE_BASE}?address={}&benchmark=Public_AR_Current&vintage=Current_Current&format=json",
        urlencode(address)
    );
    let body = fetch_body(client, &url).await?;
    let value: Value = serde_json::from_str(&body).with_context(|| {
        format!("census onelineaddress JSON parse failed; body={}", truncate(&body, 500))
    })?;
    Ok(parse_address_match(&value))
}

/// Resolve county/state for known coordinates. The returned `lat`/`lon` echo
/// the inputs; `county`/`state` are filled from the Census geographies.
pub async fn reverse_geocode_coordinates(
    client: &reqwest::Client,
    lat: f64,
    lon: f64,
) -> Result<GeocodeResult> {
    let url = format!(
        "{COORDINATES_BASE}?x={lon}&y={lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json"
    );
    let body = fetch_body(client, &url).await?;
    let value: Value = serde_json::from_str(&body).with_context(|| {
        format!("census coordinates JSON parse failed; body={}", truncate(&body, 500))
    })?;
    let (county, state) = parse_geographies(value.pointer("/result/geographies"));
    Ok(GeocodeResult { lat, lon, matched_address: None, county, state })
}

async fn fetch_body(client: &reqwest::Client, url: &str) -> Result<String> {
    client
        .get(url)
        .send()
        .await
        .with_context(|| format!("census geocoder request failed: {url}"))?
        .text()
        .await
        .context("reading census geocoder response body")
}

fn parse_address_match(value: &Value) -> Option<GeocodeResult> {
    let first = value
        .pointer("/result/addressMatches")
        .and_then(Value::as_array)
        .and_then(|matches| matches.first())?;
    let lon = first.pointer("/coordinates/x").and_then(Value::as_f64)?;
    let lat = first.pointer("/coordinates/y").and_then(Value::as_f64)?;
    let matched_address = first
        .get("matchedAddress")
        .and_then(Value::as_str)
        .map(str::to_string);
    let (county, state) = parse_geographies(first.get("geographies"));
    Some(GeocodeResult { lat, lon, matched_address, county, state })
}

/// Pull a county basename and 2-letter state from a Census `geographies` blob.
fn parse_geographies(geographies: Option<&Value>) -> (Option<String>, Option<String>) {
    let Some(geographies) = geographies else {
        return (None, None);
    };
    let county = first_string(geographies, "Counties", &["BASENAME", "NAME"]);
    let state = first_string(geographies, "States", &["STUSAB", "BASENAME"]);
    (county, state)
}

/// First present value among `keys` on the first element of `geographies[group]`.
fn first_string(geographies: &Value, group: &str, keys: &[&str]) -> Option<String> {
    let entry = geographies
        .get(group)
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())?;
    keys.iter()
        .find_map(|key| entry.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn urlencode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn truncate(input: &str, max: usize) -> String {
    input.chars().take(max).collect()
}

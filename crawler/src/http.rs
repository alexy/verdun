use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::{
    blocking::{Client, RequestBuilder},
    header,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpFetchMetadata {
    pub url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub content_length: Option<u64>,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpFetch<T> {
    pub metadata: HttpFetchMetadata,
    pub body: T,
}

pub fn fetch_text(client: &Client, url: &str) -> Result<HttpFetch<String>> {
    fetch_text_request(client.get(url), url)
}

pub fn fetch_text_request(request: RequestBuilder, label: &str) -> Result<HttpFetch<String>> {
    let response = request
        .send()
        .with_context(|| format!("fetching {label}"))?;
    let metadata = metadata_from_response(label, &response);
    response
        .error_for_status_ref()
        .with_context(|| format!("fetching {label}"))?;
    let body = response
        .text()
        .with_context(|| format!("reading response body from {label}"))?;
    Ok(HttpFetch { metadata, body })
}

pub fn fetch_text_allow_status(client: &Client, url: &str) -> Result<HttpFetch<String>> {
    fetch_text_allow_status_request(client.get(url), url)
}

pub fn fetch_text_allow_status_request(
    request: RequestBuilder,
    label: &str,
) -> Result<HttpFetch<String>> {
    let response = request
        .send()
        .with_context(|| format!("fetching {label}"))?;
    let metadata = metadata_from_response(label, &response);
    let body = response
        .text()
        .with_context(|| format!("reading response body from {label}"))?;
    Ok(HttpFetch { metadata, body })
}

pub fn fetch_json<T: DeserializeOwned>(client: &Client, url: &str) -> Result<HttpFetch<T>> {
    fetch_json_request(client.get(url), url)
}

pub fn fetch_json_request<T: DeserializeOwned>(
    request: RequestBuilder,
    label: &str,
) -> Result<HttpFetch<T>> {
    let response = request
        .send()
        .with_context(|| format!("fetching {label}"))?;
    let metadata = metadata_from_response(label, &response);
    response
        .error_for_status_ref()
        .with_context(|| format!("fetching {label}"))?;
    let body = response
        .json::<T>()
        .with_context(|| format!("decoding JSON from {label}"))?;
    Ok(HttpFetch { metadata, body })
}

pub fn probe_http_status(client: &Client, url: &str) -> Result<HttpFetchMetadata> {
    let response = client
        .get(url)
        .send()
        .with_context(|| format!("fetching {url}"))?;
    Ok(metadata_from_response(url, &response))
}

fn metadata_from_response(url: &str, response: &reqwest::blocking::Response) -> HttpFetchMetadata {
    let response_url = response.url().as_str();
    HttpFetchMetadata {
        url: if response_url.is_empty() {
            url.to_owned()
        } else {
            response_url.to_owned()
        },
        status: response.status().as_u16(),
        content_type: response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned),
        content_length: response.content_length(),
        fetched_at: Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_carries_status_and_url() {
        let metadata = HttpFetchMetadata {
            url: "https://example.test/data.json".to_owned(),
            status: 200,
            content_type: Some("application/json".to_owned()),
            content_length: Some(12),
            fetched_at: Utc::now(),
        };

        assert_eq!(metadata.status, 200);
        assert_eq!(metadata.url, "https://example.test/data.json");
        assert_eq!(metadata.content_type.as_deref(), Some("application/json"));
    }
}

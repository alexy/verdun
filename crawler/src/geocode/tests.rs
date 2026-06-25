use super::*;
use serde_json::json;

#[test]
fn parses_onelineaddress_match() {
    let value = json!({
        "result": {
            "addressMatches": [{
                "matchedAddress": "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
                "coordinates": { "x": -77.0365, "y": 38.8977 },
                "geographies": {
                    "Counties": [{ "BASENAME": "District of Columbia", "NAME": "District of Columbia" }],
                    "States": [{ "STUSAB": "DC", "BASENAME": "District of Columbia" }]
                }
            }]
        }
    });
    let result = parse_address_match(&value).expect("a match");
    assert_eq!(result.lat, 38.8977);
    assert_eq!(result.lon, -77.0365);
    assert_eq!(result.county.as_deref(), Some("District of Columbia"));
    assert_eq!(result.state.as_deref(), Some("DC"));
    assert!(result.matched_address.unwrap().contains("PENNSYLVANIA"));
}

#[test]
fn returns_none_when_no_match() {
    let value = json!({ "result": { "addressMatches": [] } });
    assert!(parse_address_match(&value).is_none());
}

#[test]
fn parses_county_from_coordinates_geographies() {
    let geographies = json!({
        "Counties": [{ "BASENAME": "Santa Clara" }],
        "States": [{ "STUSAB": "CA" }]
    });
    let (county, state) = parse_geographies(Some(&geographies));
    assert_eq!(county.as_deref(), Some("Santa Clara"));
    assert_eq!(state.as_deref(), Some("CA"));
}

#[test]
fn falls_back_to_name_when_basename_absent() {
    let geographies = json!({ "Counties": [{ "NAME": "Alameda County" }] });
    let (county, _state) = parse_geographies(Some(&geographies));
    assert_eq!(county.as_deref(), Some("Alameda County"));
}

#[test]
fn encodes_spaces_and_commas() {
    assert_eq!(urlencode("1 Main St, CA"), "1%20Main%20St%2C%20CA");
}

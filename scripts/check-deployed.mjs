const defaultBaseUrl = 'https://collected.ga/rbage/'
const args = process.argv.slice(2)
const staticOnly = args.includes('--static-only')
const baseArg = args.find((arg) => !arg.startsWith('--')) ?? process.env.VERDUN_DEPLOYED_URL ?? defaultBaseUrl
const baseUrl = normalizeBaseUrl(baseArg)
const origin = new URL(baseUrl).origin

const appHtml = await fetchText(baseUrl, 'app route')
if (!appHtml.includes('<div id="app"></div>')) {
  throw new Error(`${baseUrl} did not return the Verdun app shell`)
}
if (!appHtml.includes('/rbage/assets/')) {
  throw new Error(`${baseUrl} is not using the /rbage/ asset base path`)
}

const staticSnapshot = await fetchJson(new URL('data/newsletter-snapshot.json', baseUrl), 'static snapshot')
validateSnapshot(staticSnapshot, 'static snapshot')

if (!staticOnly) {
  const apiSnapshot = await fetchJson(new URL('/api/newsletter/items', origin), 'items API')
  validateSnapshot(apiSnapshot, 'items API')
}

console.log(`verified Verdun deployment at ${baseUrl}${staticOnly ? ' (static only)' : ''}`)

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url.toString()
}

async function fetchText(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label} returned ${response.status} at ${url}`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    throw new Error(`${label} returned ${contentType || 'unknown content-type'} at ${url}`)
  }
  return await response.text()
}

async function fetchJson(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label} returned ${response.status} at ${url}`)
  return await response.json()
}

function validateSnapshot(snapshot, label) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(`${label} did not return an object snapshot`)
  }
  const items = arrayValue(snapshot.items)
  const sourceRuns = arrayValue(snapshot.sourceRuns ?? snapshot.source_runs)
  const queryPlans = arrayValue(snapshot.queryPlans ?? snapshot.query_plans)
  if (items.length < 23) throw new Error(`${label} has too few newsletter items: ${items.length}`)
  if (!sourceRuns.length) throw new Error(`${label} has no source health metadata`)
  if (queryPlans.length < 23) throw new Error(`${label} has too few crawler query plans: ${queryPlans.length}`)
  for (const project of ['Pydantic', 'LakeSail', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Turso', 'LanceDB', 'HelixDB', 'SurrealDB', 'pgGraph', 'Garde', 'zod-rs']) {
    if (!items.some((item) => item?.project === project)) {
      throw new Error(`${label} is missing required project item: ${project}`)
    }
  }
  for (const project of ['BAML', 'DSPy', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Ibis', 'Dagster', 'Garde', 'zod-rs']) {
    if (!queryPlans.some((plan) => plan?.project === project)) {
      throw new Error(`${label} is missing required query plan: ${project}`)
    }
  }
  const firstItem = items.find((item) => item && typeof item === 'object')
  const hasWhyItMatters = Boolean(firstItem?.whyItMatters ?? firstItem?.why_it_matters)
  if (!firstItem?.title || !firstItem?.url || !hasWhyItMatters) {
    throw new Error(`${label} items are missing publication fields`)
  }
}

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}

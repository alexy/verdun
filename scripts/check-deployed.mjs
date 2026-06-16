const defaultBaseUrl = 'https://collected.ga/rbage/'
const args = process.argv.slice(2)
const staticOnly = args.includes('--static-only')
const requireReady = args.includes('--require-ready')
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
await validateSnapshot(staticSnapshot, 'static snapshot')

if (!staticOnly) {
  const apiSnapshot = await fetchJson(new URL('/api/newsletter/items', origin), 'items API')
  await validateSnapshot(apiSnapshot, 'items API')
}

console.log(`verified Verdun deployment at ${baseUrl}${staticOnly ? ' (static only)' : ''}${requireReady ? ' with readiness gate' : ''}`)

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

async function validateSnapshot(snapshot, label) {
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
  if (requireReady) {
    const readiness = deploymentReadiness(snapshot)
    if (readiness.status !== 'ready') {
      const failedChecks = readiness.checks.filter((check) => !check.passed).map((check) => `${check.label}: ${check.detail}`)
      throw new Error(`${label} is not publishing-ready: ${failedChecks.join(' ') || readiness.summary}`)
    }
  }
}

function deploymentReadiness(snapshot) {
  const items = arrayValue(snapshot.items)
  const sourceRuns = arrayValue(snapshot.sourceRuns ?? snapshot.source_runs)
  const focuses = arrayValue(snapshot.focuses)
  const selectedItems = draftSelection(items)
  const upvotedCount = items.filter((item) => Number(item?.vote) > 0).length
  const liveSourceCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'ok' && itemCount(run) > 0).length
  const liveProjectCount = new Set(sourceRuns.flatMap((run) => Object.keys(projectCounts(run)))).size
  const focusCount = focuses.filter((focus) => typeof focus?.text === 'string' && focus.text.trim()).length
  const selectedProjectCount = new Set(selectedItems.map((item) => item?.project).filter(Boolean)).size
  const sourceErrorCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'error').length
  const checks = [
    {
      label: 'Editorial picks',
      passed: upvotedCount > 0,
      detail: upvotedCount > 0 ? `${upvotedCount} upvoted items will lead the draft.` : 'Upvote at least one item before publishing.',
    },
    {
      label: 'Live source coverage',
      passed: liveSourceCount >= 3 && liveProjectCount >= 3,
      detail: `${liveSourceCount} sources returned live items across ${liveProjectCount} projects.`,
    },
    {
      label: 'Project spread',
      passed: selectedProjectCount >= 2 || selectedItems.length <= 1,
      detail: selectedItems.length ? `${selectedProjectCount} projects represented in the selected spine.` : 'No items are selected yet.',
    },
    {
      label: 'Editorial intent',
      passed: focusCount > 0,
      detail: focusCount > 0 ? `${focusCount} saved focus signals will shape the brief.` : 'Add this-week or ongoing focus before drafting.',
    },
    {
      label: 'Source health',
      passed: sourceErrorCount === 0,
      detail: sourceErrorCount === 0 ? 'No watched source is currently reporting an error.' : `${sourceErrorCount} watched sources need attention.`,
    },
  ]
  const passedCount = checks.filter((check) => check.passed).length
  const status = checks.every((check) => check.passed) ? 'ready' : 'needs_review'
  return {
    status,
    summary: status === 'ready' ? 'Ready for deployment publishing.' : `${passedCount}/${checks.length} readiness checks pass.`,
    checks,
  }
}

function draftSelection(items, limit = 7) {
  const sorted = [...items].sort((left, right) => {
    const voteDelta = Number(right?.vote ?? 0) - Number(left?.vote ?? 0)
    if (voteDelta !== 0) return voteDelta
    const scoreDelta = Number(right?.score ?? 0) - Number(left?.score ?? 0)
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right?.publishedAt ?? right?.published_at ?? '') - Date.parse(left?.publishedAt ?? left?.published_at ?? '')
  })
  const included = sorted.filter((item) => Number(item?.vote) > 0)
  return (included.length ? included : sorted.filter((item) => Number(item?.vote ?? 0) >= 0)).slice(0, limit)
}

function itemCount(run) {
  return Number(run?.itemCount ?? run?.item_count ?? 0)
}

function projectCounts(run) {
  const value = run?.projectCounts ?? run?.project_counts
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sourceRunStatus(run) {
  return run?.status === 'ok' || run?.status === 'error' || run?.status === 'pending' || run?.status === 'skipped' ? run.status : 'pending'
}

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}

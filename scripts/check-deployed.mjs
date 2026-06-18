import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const args = process.argv.slice(2)
const valueOptions = new Set(['--asset-base', '--instance', '--min-collection-plans', '--min-records', '--min-source-runs', '--required-plan', '--required-subject', '--static-snapshot'])
const staticOnly = args.includes('--static-only')
const requireReady = args.includes('--require-ready')
const requireDatabase = args.includes('--require-database')
const instance = optionValue('--instance') ?? process.env.VERDUN_INSTANCE ?? defaultDeployCheckProfileId()
const profile = deployCheckProfile(instance)
const readinessCheckModule = profile?.readinessCheckModule ? await import(profile.readinessCheckModule) : undefined
const draftCheckModule = profile?.draft?.checkModule ? await import(profile.draft.checkModule) : undefined
const staticSnapshotPath = optionValue('--static-snapshot') ?? process.env.VERDUN_STATIC_SNAPSHOT ?? profile?.staticSnapshotPath ?? 'data/workbench-snapshot.json'
const baseArg = positionalArg() ?? process.env.VERDUN_DEPLOYED_URL ?? profile?.defaultBaseUrl
if (!baseArg) throw new Error(`No deployed URL configured for ${instance}. Pass a base URL or set VERDUN_DEPLOYED_URL.`)
const baseUrl = normalizeBaseUrl(baseArg)
const origin = new URL(baseUrl).origin
const assetBasePath = optionValue('--asset-base') ?? new URL(baseUrl).pathname
const checkDraft = args.includes('--check-draft')
const skipDraft = args.includes('--skip-draft') || (!checkDraft && !profile?.draft)
const requiredSubjects = optionValues('--required-subject')
const requiredPlans = optionValues('--required-plan')
const minRecords = numberOption('--min-records', profile?.minRecords ?? 1)
const minSourceRuns = numberOption('--min-source-runs', 1)
const minCollectionPlans = numberOption('--min-collection-plans', profile?.minCollectionPlans ?? 0)
const expectedSubjects = requiredSubjects.length ? requiredSubjects : profile?.requiredSubjects ?? []
const expectedPlans = requiredPlans.length ? requiredPlans : profile?.requiredPlans ?? []

const appHtml = await fetchText(baseUrl, 'app route')
if (!appHtml.includes('<div id="app"></div>')) {
  throw new Error(`${baseUrl} did not return the Verdun app shell`)
}
if (!appHtml.includes(`${assetBasePath}assets/`)) {
  throw new Error(`${baseUrl} is not using the ${assetBasePath} asset base path`)
}

const staticSnapshot = await fetchJson(new URL(staticSnapshotPath, baseUrl), 'static snapshot')
await validateSnapshot(staticSnapshot, 'static snapshot')

if (!staticOnly) {
  const apiSnapshot = await fetchJson(new URL(`/api/workbench/records?instance=${encodeURIComponent(instance)}`, origin), 'workbench records API')
  await validateSnapshot(apiSnapshot, 'workbench records API')
  const apiStatus = await fetchJson(new URL(`/api/workbench/status?instance=${encodeURIComponent(instance)}`, origin), 'workbench status API')
  validateStatus(apiStatus)
  const apiHealth = await fetchJson(new URL(`/api/workbench/health?instance=${encodeURIComponent(instance)}`, origin), 'workbench health API')
  validateHealth(apiHealth, apiStatus)
  if (!skipDraft) await validateDraftApi(origin, profile?.draft)
}

console.log(`verified Verdun ${instance} deployment at ${baseUrl}${staticOnly ? ' (static only)' : ''}${skipDraft ? ' without draft API checks' : ''}${requireReady ? ' with readiness gate' : ''}${requireDatabase ? ' with database gate' : ''}`)

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url.toString()
}

async function fetchText(url, label) {
  const response = await safeFetch(url, label)
  if (!response.ok) throw new Error(responseError(label, url, response.status))
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    throw new Error(`${label} returned ${contentType || 'unknown content-type'} at ${url}`)
  }
  return await response.text()
}

async function fetchJson(url, label) {
  const response = await safeFetch(url, label)
  if (!response.ok) throw new Error(responseError(label, url, response.status))
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`${label} returned ${contentType || 'unknown content-type'} at ${url}`)
  }
  return await response.json()
}

async function safeFetch(url, label) {
  try {
    return await fetch(url)
  } catch (error) {
    throw new Error(networkError(label, url, error))
  }
}

function networkError(label, url, error) {
  const cause = error?.cause ?? error
  const code = typeof cause?.code === 'string' ? cause.code : ''
  const hostname = new URL(url).hostname
  if (code === 'ENOTFOUND') {
    return `${label} could not resolve ${hostname}. If this is a newly attached Vercel custom domain, verify it with \`npx vercel domains inspect ${hostname}\`, \`npx vercel alias ls\`, and retry after DNS propagation.`
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENETUNREACH') {
    return `${label} could not reach ${url}: ${code}. Check network access or verify the protected deployment with \`npx vercel curl ${assetBasePath} --deployment <deployment-url>\`.`
  }
  return `${label} fetch failed at ${url}: ${cause?.message ?? error?.message ?? error}`
}

function responseError(label, url, status) {
  const hint = status === 401
    ? ` If this is a Vercel Authentication-protected deployment, verify it with \`npx vercel curl ${assetBasePath} --deployment <deployment-url>\` and \`npx vercel curl "/api/workbench/records?instance=${instance}" --deployment <deployment-url>\`.`
    : ''
  return `${label} returned ${status} at ${url}.${hint}`
}

async function validateSnapshot(snapshot, label) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(`${label} did not return an object snapshot`)
  }
  const items = arrayValue(snapshot.items ?? snapshot.records)
  const sourceRuns = arrayValue(snapshot.sourceRuns ?? snapshot.source_runs)
  const queryPlans = arrayValue(snapshot.queryPlans ?? snapshot.query_plans ?? snapshot.collectionPlans ?? snapshot.collection_plans)
  const editorialPersistence = snapshot.editorialPersistence ?? snapshot.editorial_persistence ?? (label === 'static snapshot' ? 'browser' : undefined)
  if (!['database', 'local_file', 'browser'].includes(editorialPersistence)) {
    throw new Error(`${label} did not report editorial persistence mode`)
  }
  if (items.length < minRecords) throw new Error(`${label} has too few records: ${items.length}`)
  if (sourceRuns.length < minSourceRuns) throw new Error(`${label} has too few source runs: ${sourceRuns.length}`)
  if (queryPlans.length < minCollectionPlans) throw new Error(`${label} has too few collection plans: ${queryPlans.length}`)
  for (const project of expectedSubjects) {
    if (!items.some((item) => (item?.project ?? item?.subject) === project)) {
      throw new Error(`${label} is missing required subject record: ${project}`)
    }
  }
  for (const project of expectedPlans) {
    if (!queryPlans.some((plan) => (plan?.project ?? plan?.subject) === project)) {
      throw new Error(`${label} is missing required collection plan: ${project}`)
    }
  }
  const firstItem = items.find((item) => item && typeof item === 'object')
  const hasPublicationContext = Boolean(firstItem?.whyItMatters ?? firstItem?.why_it_matters ?? firstItem?.summary)
  if (!firstItem?.title || !firstItem?.url || !hasPublicationContext) {
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

function validateStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('status API did not return an object')
  }
  if (!['database', 'local_file', 'browser'].includes(status.editorialPersistence)) {
    throw new Error('status API did not report editorial persistence mode')
  }
  if (requireDatabase && status.editorialPersistence !== 'database') {
    throw new Error(`status API is not database-backed: ${status.editorialPersistence}. Run \`npm run db:deploy -- --apply\` after configuring POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL in Vercel production.`)
  }
  if (requireDatabase && status.writable !== true) {
    throw new Error('status API is not writable')
  }
  const itemCount = Number(status.itemCount ?? status.recordCount)
  const queryPlanCount = Number(status.queryPlanCount ?? status.collectionPlanCount)
  if (itemCount < minRecords) throw new Error(`status API has too few records: ${itemCount}`)
  if (Number(status.sourceRunCount) < minSourceRuns) throw new Error(`status API has too few source runs: ${status.sourceRunCount}`)
  if (queryPlanCount < minCollectionPlans) throw new Error(`status API has too few collection plans: ${queryPlanCount}`)
}

function validateHealth(health, status) {
  if (!health || typeof health !== 'object' || Array.isArray(health)) {
    throw new Error('health API did not return an object')
  }
  if (health.ok !== true || health.service !== 'workbench' || health.surface !== 'health') {
    throw new Error('health API did not identify the workbench health surface')
  }
  if (!['database_configured', 'database_not_configured'].includes(health.state)) {
    throw new Error(`health API returned unexpected state: ${health.state}`)
  }
  if (typeof health.databaseConfigured !== 'boolean') {
    throw new Error('health API did not report databaseConfigured')
  }
  if (health.editorialPersistence !== status.editorialPersistence) {
    throw new Error(`health API persistence does not match status API: ${health.editorialPersistence} vs ${status.editorialPersistence}`)
  }
  if (requireDatabase && health.state !== 'database_configured') {
    throw new Error(`health API is not database-configured: ${health.state}`)
  }
  if (!arrayValue(health.readSurfaces).includes('records') || !arrayValue(health.readSurfaces).includes('health')) {
    throw new Error('health API did not list expected read surfaces')
  }
  if (!arrayValue(health.writeSurfaces).includes('review') || !arrayValue(health.writeSurfaces).includes('focus')) {
    throw new Error('health API did not list generic write surfaces')
  }
  if (!arrayValue(health.collectionSurfaces).includes('crawler collect') || !arrayValue(health.collectionSurfaces).includes('crawler export-sql')) {
    throw new Error('health API did not list generic collection surfaces')
  }
  if (Number(health.activeSnapshot?.recordCount) !== Number(status.recordCount)) {
    throw new Error('health API active snapshot count does not match status API')
  }
}

async function validateDraftApi(origin, draftProfile) {
  if (!draftProfile) throw new Error(`No draft check profile configured for ${instance}. Pass --skip-draft or add an instance deploy-check profile.`)
  if (typeof draftCheckModule?.validateDraftApi !== 'function') {
    throw new Error(`No draft API validator configured for ${instance}. Add draft.checkModule to the deploy-check profile or pass --skip-draft.`)
  }
  await draftCheckModule.validateDraftApi({
    origin,
    draftProfile,
    requireReady,
    fetchJson,
    fetchTextContent,
  })
}

async function fetchTextContent(url, label, expectedContentType) {
  const response = await safeFetch(url, label)
  if (!response.ok) throw new Error(responseError(label, url, response.status))
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes(expectedContentType)) {
    throw new Error(`${label} returned ${contentType || 'unknown content-type'} at ${url}`)
  }
  return await response.text()
}

function deploymentReadiness(snapshot) {
  if (typeof readinessCheckModule?.deploymentReadiness !== 'function') {
    throw new Error(`No deployment readiness checker configured for ${instance}. Add readinessCheckModule to the deploy-check profile.`)
  }
  return readinessCheckModule.deploymentReadiness(snapshot)
}

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}

function optionValue(name) {
  const equals = args.find((arg) => arg.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function optionValues(name) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === name && args[index + 1]) values.push(args[index + 1])
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1))
  }
  return values
}

function numberOption(name, fallback) {
  const rawValue = optionValue(name)
  if (rawValue === undefined) return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`)
  return value
}

function positionalArg() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (valueOptions.has(arg)) {
      index += 1
      continue
    }
    if (!arg.startsWith('--')) return arg
  }
  return undefined
}

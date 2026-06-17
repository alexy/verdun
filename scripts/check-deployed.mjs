import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const args = process.argv.slice(2)
const valueOptions = new Set(['--asset-base', '--instance', '--min-collection-plans', '--min-records', '--min-source-runs', '--required-plan', '--required-subject', '--static-snapshot'])
const staticOnly = args.includes('--static-only')
const requireReady = args.includes('--require-ready')
const requireDatabase = args.includes('--require-database')
const instance = optionValue('--instance') ?? process.env.VERDUN_INSTANCE ?? defaultDeployCheckProfileId()
const profile = deployCheckProfile(instance)
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
  const draftUrl = new URL(draftProfile.apiPath, origin)
  const draft = await fetchJson(draftUrl, 'draft API')
  if (!draft?.draft?.markdown?.includes('## Weekly throughline')) {
    throw new Error('draft API did not return generated Markdown with a weekly throughline')
  }
  if (!draft?.manifest?.issue?.slug || !Array.isArray(draft?.manifest?.itemIds)) {
    throw new Error('draft API did not return a publish manifest with issue identity')
  }
  if (!draft?.readiness?.checks?.length || !draft?.proseQuality?.checks?.length) {
    throw new Error('draft API did not return readiness and prose-quality checks')
  }

  const markdownUrl = new URL(`${draftProfile.apiPath}?format=markdown`, origin)
  const markdown = await fetchTextContent(markdownUrl, 'draft Markdown API', 'text/markdown')
  for (const expectedText of arrayValue(draftProfile.markdownIncludes)) {
    if (!markdown.includes(expectedText)) {
      throw new Error(`draft Markdown API did not include expected text: ${expectedText}`)
    }
  }

  const manifestUrl = new URL(`${draftProfile.apiPath}?format=manifest`, origin)
  const manifest = await fetchJson(manifestUrl, 'draft manifest API')
  if (manifest?.snapshotInput !== draftProfile.manifestSnapshotInput || manifest?.issue?.selectedItemCount !== manifest?.itemIds?.length) {
    throw new Error('draft manifest API did not return a coherent publish manifest')
  }

  if (requireReady) {
    const readyUrl = new URL(`${draftProfile.apiPath}?require-ready=true`, origin)
    const readyDraft = await fetchJson(readyUrl, 'ready draft API')
    if (readyDraft?.manifest?.readiness?.status !== 'ready' || readyDraft?.manifest?.proseQuality?.status !== 'ready') {
      throw new Error('ready draft API did not return a ready publish manifest')
    }
  }
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
  const items = arrayValue(snapshot.items ?? snapshot.records)
  const sourceRuns = arrayValue(snapshot.sourceRuns ?? snapshot.source_runs)
  const focuses = arrayValue(snapshot.focuses)
  const selectedItems = draftSelection(items)
  const upvotedCount = items.filter((item) => reviewValue(item) > 0).length
  const liveSourceCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'ok' && itemCount(run) > 0).length
  const liveProjectCount = new Set(sourceRuns.flatMap((run) => Object.keys(projectCounts(run)))).size
  const focusCount = focuses.filter((focus) => typeof focus?.text === 'string' && focus.text.trim()).length
  const selectedProjectCount = new Set(selectedItems.map((item) => item?.project ?? item?.subject).filter(Boolean)).size
  const sourceErrorCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'error').length
  const freshness = snapshotFreshness(snapshot.generatedAt ?? snapshot.generated_at)
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
    {
      label: 'Snapshot freshness',
      passed: freshness.fresh,
      detail: freshness.detail,
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

function snapshotFreshness(generatedAt) {
  const generated = Date.parse(generatedAt ?? '')
  if (!Number.isFinite(generated)) {
    return {
      fresh: false,
      detail: 'Snapshot generated_at is not a valid date.',
    }
  }
  const ageDays = Math.floor(Math.max(0, Date.now() - generated) / (24 * 60 * 60 * 1000))
  if (ageDays <= 14) {
    return {
      fresh: true,
      detail: ageDays === 0 ? 'Snapshot was generated today.' : `Snapshot was generated ${ageDays} day${ageDays === 1 ? '' : 's'} ago.`,
    }
  }
  return {
    fresh: false,
    detail: `Snapshot was generated ${ageDays} days ago; rerun collect --live before publishing.`,
  }
}

function draftSelection(items, limit = 7) {
  const sorted = [...items].sort((left, right) => {
    const voteDelta = reviewValue(right) - reviewValue(left)
    if (voteDelta !== 0) return voteDelta
    const scoreDelta = Number(right?.score ?? 0) - Number(left?.score ?? 0)
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right?.publishedAt ?? right?.published_at ?? right?.observedAt ?? right?.observed_at ?? '') - Date.parse(left?.publishedAt ?? left?.published_at ?? left?.observedAt ?? left?.observed_at ?? '')
  })
  const included = sorted.filter((item) => reviewValue(item) > 0)
  return (included.length ? included : sorted.filter((item) => reviewValue(item) >= 0)).slice(0, limit)
}

function reviewValue(item) {
  return Number(item?.vote ?? item?.review ?? 0)
}

function itemCount(run) {
  return Number(run?.itemCount ?? run?.item_count ?? 0)
}

function projectCounts(run) {
  const value = run?.projectCounts ?? run?.project_counts ?? run?.subjectCounts ?? run?.subject_counts
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sourceRunStatus(run) {
  return run?.status === 'ok' || run?.status === 'error' || run?.status === 'pending' || run?.status === 'skipped' ? run.status : 'pending'
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

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const garbageProfile = deployCheckProfile(defaultDeployCheckProfileId())
const greathouseProfile = deployCheckProfile('greathouse')
if (!garbageProfile?.sourceSnapshotPath || !garbageProfile?.draft || !greathouseProfile) {
  throw new Error('deployed-check smoke requires Garbage and Greathouse deploy profiles')
}
const garbageBasePath = garbageProfile.basePath
const greathouseBasePath = greathouseProfile.basePath
const rawSnapshot = JSON.parse(await readFile(garbageProfile.sourceSnapshotPath, 'utf8'))
const checkDeployedSource = await readFile('scripts/check-deployed.mjs', 'utf8')
const deployProfilesSource = await readFile('scripts/instances/deploy-check-profiles.mjs', 'utf8')
const greathouseDeployProfileSource = await readFile('scripts/instances/greathouse/deploy-checks.mjs', 'utf8')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
for (const marker of ['collected.ga', '/rbage/', '/api/garbage/newsletter/draft', 'Strongly Typed AI/Data Notes', 'data/newsletter-snapshot.json']) {
  if (checkDeployedSource.includes(marker)) {
    throw new Error(`generic deployed checker still embeds Garbage deploy marker: ${marker}`)
  }
}
if (packageJson.scripts?.['check:preview'] !== 'node scripts/check-preview.mjs') {
  throw new Error('check:preview should use the profile-backed preview checker')
}
if (!deployProfilesSource.includes('registeredDeployCheckProfiles') || deployProfilesSource.includes('return garbageDeployCheckProfile.id')) {
  throw new Error('deploy check profiles are not resolved from profile registration metadata')
}
if (!greathouseDeployProfileSource.includes("id: 'greathouse'") || !greathouseDeployProfileSource.includes("staticSnapshotPath: 'data/greathouse-snapshot.json'")) {
  throw new Error('Greathouse deploy profile is missing static snapshot metadata')
}
const freshGeneratedAt = new Date().toISOString()
let reviewedSnapshot = {
  ...rawSnapshot,
  generated_at: freshGeneratedAt,
  editorial_persistence: 'database',
  items: rawSnapshot.items.map((item) => ({
    ...item,
    vote: ['grust-sail-3683deba292c', 'lakesail-e5ce5d36852a'].includes(item.id) ? 1 : 0,
  })),
  focuses: [
    {
      id: 'focus-smoke-check-deployed-ready',
      text: 'More typed lakehouse execution and graph lowering evidence.',
      scope: 'this_week',
      created_at: new Date().toISOString(),
    },
  ],
}
function snapshotJson() {
  return JSON.stringify(reviewedSnapshot)
}
function databaseStatusJson() {
  return JSON.stringify({
    editorialPersistence: 'database',
    generatedAt: reviewedSnapshot.generated_at,
    recordCount: reviewedSnapshot.items.length,
    itemCount: reviewedSnapshot.items.length,
    focusCount: reviewedSnapshot.focuses.length,
    reviewCount: 2,
    voteCount: 2,
    sourceRunCount: reviewedSnapshot.source_runs.length,
    collectionPlanCount: reviewedSnapshot.query_plans.length,
    queryPlanCount: reviewedSnapshot.query_plans.length,
    writable: true,
  })
}
function browserStatusJson() {
  return JSON.stringify({
    editorialPersistence: 'browser',
    generatedAt: reviewedSnapshot.generated_at,
    recordCount: reviewedSnapshot.items.length,
    itemCount: reviewedSnapshot.items.length,
    focusCount: reviewedSnapshot.focuses.length,
    reviewCount: 0,
    voteCount: 0,
    sourceRunCount: reviewedSnapshot.source_runs.length,
    collectionPlanCount: reviewedSnapshot.query_plans.length,
    queryPlanCount: reviewedSnapshot.query_plans.length,
    writable: false,
  })
}
let statusJson = databaseStatusJson()
const greathouseSnapshot = {
  instance: {
    id: 'greathouse',
    name: 'Greathouse',
    basePath: '/greathouse/',
  },
  generatedAt: freshGeneratedAt,
  editorialPersistence: 'database',
  records: [
    {
      id: 'greathouse-listing-1',
      title: 'Berkeley two-bedroom near transit',
      url: 'https://example.com/listings/1',
      subject: 'Berkeley 2BR',
      summary: 'Fresh listing with source provenance and comparable evidence.',
      review: 1,
      score: 94,
      observedAt: freshGeneratedAt,
    },
    {
      id: 'greathouse-diagnostic-1',
      title: 'Source diagnostic for protected listing endpoint',
      url: 'https://example.com/diagnostics/redfin',
      subject: 'Oakland blocked source',
      summary: 'Blocked-source diagnostic retained as normalized review evidence.',
      review: 0,
      score: 71,
      observedAt: freshGeneratedAt,
    },
  ],
  sourceRuns: [
    {
      source: 'local-listing-json',
      status: 'ok',
      itemCount: 1,
      subjectCounts: { 'Berkeley 2BR': 1 },
      message: 'Loaded local listing fixture.',
      collectedAt: freshGeneratedAt,
    },
    {
      source: 'http-status-diagnostic',
      status: 'ok',
      itemCount: 1,
      subjectCounts: { 'Oakland blocked source': 1 },
      message: 'Recorded blocked-source diagnostic.',
      collectedAt: freshGeneratedAt,
    },
  ],
  collectionPlans: [
    {
      subject: 'Berkeley 2BR',
      query: 'Berkeley 2BR homes source diagnostics',
      liveTerms: ['Berkeley 2BR', 'listing freshness'],
    },
    {
      subject: 'Oakland blocked source',
      query: 'Oakland blocked source diagnostics',
      liveTerms: ['Oakland blocked source', 'retry'],
    },
  ],
  focuses: [
    {
      id: 'focus-greathouse-source-health',
      text: 'Prioritize source freshness and blocked-source diagnostics.',
      scope: 'ongoing',
      createdAt: freshGeneratedAt,
    },
  ],
}
function greathouseSnapshotJson() {
  return JSON.stringify(greathouseSnapshot)
}
function greathouseStatusJson() {
  return JSON.stringify({
    instance: greathouseSnapshot.instance,
    editorialPersistence: 'database',
    generatedAt: greathouseSnapshot.generatedAt,
    recordCount: greathouseSnapshot.records.length,
    focusCount: greathouseSnapshot.focuses.length,
    reviewCount: 1,
    sourceRunCount: greathouseSnapshot.sourceRuns.length,
    collectionPlanCount: greathouseSnapshot.collectionPlans.length,
    writable: true,
  })
}
function healthJson() {
  const status = JSON.parse(statusJson)
  const databaseConfigured = status.editorialPersistence === 'database'
  return JSON.stringify({
    ok: true,
    service: 'workbench',
    surface: 'health',
    state: databaseConfigured ? 'database_configured' : 'database_not_configured',
    databaseConfigured,
    editorialPersistence: status.editorialPersistence,
    readSurfaces: ['records', 'status', 'health'],
    writeSurfaces: ['review', 'focus'],
    collectionSurfaces: ['crawler verify', 'crawler collect', 'crawler export-sql', 'db:deploy'],
    activeSnapshot: status,
  })
}
function greathouseHealthJson() {
  const status = JSON.parse(greathouseStatusJson())
  return JSON.stringify({
    ok: true,
    service: 'workbench',
    surface: 'health',
    state: 'database_configured',
    databaseConfigured: true,
    editorialPersistence: 'database',
    readSurfaces: ['records', 'status', 'health'],
    writeSurfaces: ['review', 'focus'],
    collectionSurfaces: ['crawler verify', 'crawler collect', 'crawler export-sql', 'db:deploy'],
    activeSnapshot: status,
  })
}
const draftMarkdown = `# Strongly Typed AI/Data Notes: June 16, 2026

## Weekly throughline

Typed lakehouse and graph systems are moving from experiments into practical infrastructure.

## Sources watched

- Hacker News: 5 items
`
const draftManifest = {
  snapshotInput: garbageProfile.draft.manifestSnapshotInput,
  issue: {
    date: '2026-06-16',
    slug: 'strongly-typed-ai-data-notes-june-16-2026',
    title: 'Strongly Typed AI/Data Notes: June 16, 2026',
    selectedItemCount: 2,
  },
  title: 'Strongly Typed AI/Data Notes: June 16, 2026',
  itemIds: ['grust-sail-3683deba292c', 'lakesail-e5ce5d36852a'],
  readiness: { status: 'ready', checks: [{ id: 'upvotes', passed: true }] },
  proseQuality: { status: 'ready', checks: [{ id: 'throughline', passed: true }] },
}
const draftJson = JSON.stringify({
  draft: {
    title: draftManifest.title,
    markdown: draftMarkdown,
    html: '<h1>Strongly Typed AI/Data Notes: June 16, 2026</h1>',
    itemIds: draftManifest.itemIds,
  },
  manifest: draftManifest,
  readiness: draftManifest.readiness,
  proseQuality: draftManifest.proseQuality,
  sourceCoverage: { watchedProjects: [], coveredProjects: [], uncoveredProjects: [] },
})

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === garbageBasePath || url.pathname === `${garbageBasePath}index.html`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><div id="app"></div><script type="module" src="${garbageBasePath}assets/index.js"></script>`)
    return
  }
  if (url.pathname === greathouseBasePath || url.pathname === `${greathouseBasePath}index.html`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><div id="app"></div><script type="module" src="${greathouseBasePath}assets/index.js"></script>`)
    return
  }
  if (url.pathname === profileStaticPath(greathouseProfile)) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseSnapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/records' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseSnapshotJson())
    return
  }
  if (url.pathname === profileStaticPath(garbageProfile) || url.pathname === '/api/workbench/records') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/status' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseStatusJson())
    return
  }
  if (url.pathname === '/api/workbench/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(statusJson)
    return
  }
  if (url.pathname === '/api/workbench/health' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseHealthJson())
    return
  }
  if (url.pathname === '/api/workbench/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(healthJson())
    return
  }
  if (url.pathname === garbageProfile.draft.apiPath) {
    const format = url.searchParams.get('format')
    if (format === 'markdown') {
      response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' })
      response.end(draftMarkdown)
      return
    }
    if (format === 'manifest') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(draftManifest))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(draftJson)
    return
  }
  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') {
  server.close()
  throw new Error('could not bind check-deployed smoke server')
}

try {
  const result = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-ready',
  ])
  if (result.status !== 0) {
    throw new Error(`check-deployed readiness smoke failed\n${result.stdout}\n${result.stderr}`)
  }
  if (!result.stdout.includes('with readiness gate')) {
    throw new Error('check-deployed readiness smoke did not report the readiness gate')
  }
  const previewResult = await runCheckDeployed([
    'scripts/check-preview.mjs',
    localProfileUrl(address.port, garbageProfile),
  ])
  if (previewResult.status !== 0 || !previewResult.stdout.includes('(static only)')) {
    throw new Error(`profile-backed preview check failed\n${previewResult.stdout}\n${previewResult.stderr}`)
  }
  reviewedSnapshot = {
    ...reviewedSnapshot,
    generated_at: '2026-01-01T00:00:00Z',
  }
  statusJson = databaseStatusJson()
  const staleResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-ready',
  ])
  if (staleResult.status === 0 || !staleResult.stderr.includes('Snapshot freshness')) {
    throw new Error(`check-deployed readiness gate should reject stale snapshots\n${staleResult.stdout}\n${staleResult.stderr}`)
  }
  reviewedSnapshot = {
    ...reviewedSnapshot,
    generated_at: freshGeneratedAt,
  }
  statusJson = databaseStatusJson()
  const databaseResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-database',
  ])
  if (databaseResult.status !== 0 || !databaseResult.stdout.includes('with database gate')) {
    throw new Error(`check-deployed database smoke failed\n${databaseResult.stdout}\n${databaseResult.stderr}`)
  }
  statusJson = browserStatusJson()
  const browserResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-database',
  ])
  if (browserResult.status === 0 || !browserResult.stderr.includes('not database-backed')) {
    throw new Error(`check-deployed database gate should reject browser persistence\n${browserResult.stdout}\n${browserResult.stderr}`)
  }
  statusJson = databaseStatusJson()
  const greathouseResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, greathouseProfile),
    '--instance',
    'greathouse',
  ])
  if (greathouseResult.status !== 0) {
    throw new Error(`check-deployed Greathouse workbench smoke failed\n${greathouseResult.stdout}\n${greathouseResult.stderr}`)
  }
  if (!greathouseResult.stdout.includes('Verdun greathouse deployment') || !greathouseResult.stdout.includes('without draft API checks')) {
    throw new Error('check-deployed Greathouse smoke did not report generic instance validation without draft checks')
  }
} finally {
  server.closeIdleConnections?.()
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

function localProfileUrl(port, profile) {
  return `http://127.0.0.1:${port}${profile.basePath}`
}

function profileStaticPath(profile) {
  return new URL(profile.staticSnapshotPath, `http://127.0.0.1${profile.basePath}`).pathname
}

function runCheckDeployed(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (status) => {
      resolve({ status, stdout, stderr })
    })
  })
}

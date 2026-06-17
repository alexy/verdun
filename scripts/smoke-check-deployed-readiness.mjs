import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const rawSnapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
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
const draftMarkdown = `# Strongly Typed AI/Data Notes: June 16, 2026

## Weekly throughline

Typed lakehouse and graph systems are moving from experiments into practical infrastructure.

## Sources watched

- Hacker News: 5 items
`
const draftManifest = {
  snapshotInput: 'api/garbage/newsletter/items',
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
  if (url.pathname === '/rbage/' || url.pathname === '/rbage/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><div id="app"></div><script type="module" src="/rbage/assets/index.js"></script>')
    return
  }
  if (url.pathname === '/rbage/data/newsletter-snapshot.json' || url.pathname === '/api/workbench/records') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(statusJson)
    return
  }
  if (url.pathname === '/api/workbench/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(healthJson())
    return
  }
  if (url.pathname === '/api/garbage/newsletter/draft') {
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
    `http://127.0.0.1:${address.port}/rbage/`,
    '--require-ready',
  ])
  if (result.status !== 0) {
    throw new Error(`check-deployed readiness smoke failed\n${result.stdout}\n${result.stderr}`)
  }
  if (!result.stdout.includes('with readiness gate')) {
    throw new Error('check-deployed readiness smoke did not report the readiness gate')
  }
  reviewedSnapshot = {
    ...reviewedSnapshot,
    generated_at: '2026-01-01T00:00:00Z',
  }
  statusJson = databaseStatusJson()
  const staleResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    `http://127.0.0.1:${address.port}/rbage/`,
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
    `http://127.0.0.1:${address.port}/rbage/`,
    '--require-database',
  ])
  if (databaseResult.status !== 0 || !databaseResult.stdout.includes('with database gate')) {
    throw new Error(`check-deployed database smoke failed\n${databaseResult.stdout}\n${databaseResult.stderr}`)
  }
  statusJson = browserStatusJson()
  const browserResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    `http://127.0.0.1:${address.port}/rbage/`,
    '--require-database',
  ])
  if (browserResult.status === 0 || !browserResult.stderr.includes('not database-backed')) {
    throw new Error(`check-deployed database gate should reject browser persistence\n${browserResult.stdout}\n${browserResult.stderr}`)
  }
} finally {
  server.closeIdleConnections?.()
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
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

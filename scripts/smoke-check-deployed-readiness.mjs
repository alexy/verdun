import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const rawSnapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const reviewedSnapshot = {
  ...rawSnapshot,
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
const snapshotJson = JSON.stringify(reviewedSnapshot)
const databaseStatusJson = JSON.stringify({
  editorialPersistence: 'database',
  generatedAt: reviewedSnapshot.generated_at,
  itemCount: reviewedSnapshot.items.length,
  focusCount: reviewedSnapshot.focuses.length,
  voteCount: 2,
  sourceRunCount: reviewedSnapshot.source_runs.length,
  queryPlanCount: reviewedSnapshot.query_plans.length,
  writable: true,
})
const browserStatusJson = JSON.stringify({
  editorialPersistence: 'browser',
  generatedAt: reviewedSnapshot.generated_at,
  itemCount: reviewedSnapshot.items.length,
  focusCount: reviewedSnapshot.focuses.length,
  voteCount: 0,
  sourceRunCount: reviewedSnapshot.source_runs.length,
  queryPlanCount: reviewedSnapshot.query_plans.length,
  writable: false,
})
let statusJson = databaseStatusJson

const server = createServer((request, response) => {
  if (request.url === '/rbage/' || request.url === '/rbage/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><div id="app"></div><script type="module" src="/rbage/assets/index.js"></script>')
    return
  }
  if (request.url === '/rbage/data/newsletter-snapshot.json' || request.url === '/api/newsletter/items') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(snapshotJson)
    return
  }
  if (request.url === '/api/newsletter/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(statusJson)
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
  const databaseResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    `http://127.0.0.1:${address.port}/rbage/`,
    '--require-database',
  ])
  if (databaseResult.status !== 0 || !databaseResult.stdout.includes('with database gate')) {
    throw new Error(`check-deployed database smoke failed\n${databaseResult.stdout}\n${databaseResult.stderr}`)
  }
  statusJson = browserStatusJson
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

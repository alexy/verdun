import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const garbageProfile = deployCheckProfile(defaultDeployCheckProfileId())
const greathouseProfile = deployCheckProfile('greathouse')
if (!garbageProfile?.sourceSnapshotPath || !garbageProfile?.draft || !garbageProfile?.smokeFixtureModule || !greathouseProfile?.smokeFixtureModule) {
  throw new Error('deployed-check smoke requires Garbage and Greathouse deploy profiles')
}
const garbageBasePath = garbageProfile.basePath
const greathouseBasePath = greathouseProfile.basePath
const rawSnapshot = JSON.parse(await readFile(garbageProfile.sourceSnapshotPath, 'utf8'))
const checkDeployedSource = await readFile('scripts/check-deployed.mjs', 'utf8')
const deployProfilesSource = await readFile('scripts/instances/deploy-check-profiles.mjs', 'utf8')
const garbageDeployProfileSource = await readFile('scripts/instances/garbage/deploy-checks.mjs', 'utf8')
const greathouseDeployProfileSource = await readFile('scripts/instances/greathouse/deploy-checks.mjs', 'utf8')
const vercelConfigSource = await readFile('scripts/generate-vercel-config.mjs', 'utf8')
const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
for (const marker of ['collected.ga', '/rbage/', '/api/garbage/newsletter/draft', 'Strongly Typed AI/Data Notes', 'data/newsletter-snapshot.json']) {
  if (checkDeployedSource.includes(marker)) {
    throw new Error(`generic deployed checker still embeds Garbage deploy marker: ${marker}`)
  }
}
if (packageJson.scripts?.['check:preview'] !== 'node scripts/check-preview.mjs') {
  throw new Error('check:preview should use the profile-backed preview checker')
}
if (packageJson.scripts?.['vercel:config'] !== 'node scripts/generate-vercel-config.mjs' || packageJson.scripts?.['smoke:vercel-config'] !== 'node scripts/generate-vercel-config.mjs --check') {
  throw new Error('Vercel config scripts should use the deploy-profile-backed generator')
}
for (const scriptName of garbageProfile.removedGenericCommands ?? []) {
  if (packageJson.scripts?.[scriptName]) {
    throw new Error(`${scriptName} should be named as an explicit instance command`)
  }
}
for (const scriptName of garbageProfile.smokeCommands ?? []) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`${scriptName} should exist as an explicit instance smoke command`)
  }
  if (!packageJson.scripts[scriptName].includes('scripts/instances/garbage/')) {
    throw new Error(`${scriptName} should run an instance-owned smoke script`)
  }
}
for (const scriptName of garbageProfile.publishingCommands ?? []) {
  if (!packageJson.scripts?.[scriptName]?.includes('scripts/instances/garbage/')) {
    throw new Error(`${scriptName} should run an instance-owned publishing script`)
  }
}
if (vercelConfigSource.includes('/rbage/') || vercelConfigSource.includes('/greathouse/')) {
  throw new Error('Vercel config generator should derive app paths from deploy profiles')
}
for (const profile of [garbageProfile, greathouseProfile]) {
  const basePath = profile.basePath
  for (const source of [`${basePath}assets/(.*)`, `${basePath}data/(.*)`, `${basePath}(.*)`]) {
    if (!vercelConfig.rewrites?.some((rewrite) => rewrite.source === source)) {
      throw new Error(`generated vercel.json is missing rewrite ${source}`)
    }
  }
}
if (vercelConfig.redirects?.[0]?.destination !== garbageProfile.basePath) {
  throw new Error('generated vercel.json root redirect should point at the default deploy profile')
}
if (!deployProfilesSource.includes('registeredDeployCheckProfiles') || deployProfilesSource.includes('return garbageDeployCheckProfile.id')) {
  throw new Error('deploy check profiles are not resolved from profile registration metadata')
}
if (!garbageProfile.smokeFixtureModule.includes('/garbage/') || !garbageDeployProfileSource.includes('smokeFixtureModule')) {
  throw new Error('Garbage deployed-check smoke fixture should be instance-owned profile metadata')
}
for (const metadataKey of ['smokeCommands', 'removedGenericCommands', 'publishingCommands', 'compatibilitySqlSmoke', 'smokeAllCommands']) {
  if (!garbageDeployProfileSource.includes(metadataKey)) {
    throw new Error(`Garbage deploy profile is missing ${metadataKey} metadata`)
  }
}
if (!greathouseDeployProfileSource.includes("id: 'greathouse'") || !greathouseDeployProfileSource.includes("staticSnapshotPath: 'data/greathouse-snapshot.json'") || !greathouseDeployProfileSource.includes('smokeFixtureModule') || !greathouseDeployProfileSource.includes('genericSqlSmoke') || !greathouseDeployProfileSource.includes('smokeAllCommands')) {
  throw new Error('Greathouse deploy profile is missing static snapshot metadata')
}
const freshGeneratedAt = new Date().toISOString()
const { createDeployedCheckSmokeFixture } = await import(garbageProfile.smokeFixtureModule)
const garbageFixture = createDeployedCheckSmokeFixture({
  profile: garbageProfile,
  rawSnapshot,
  generatedAt: freshGeneratedAt,
})
let statusJson = garbageFixture.databaseStatusJson()
const { createDeployedCheckSmokeFixture: createGreathouseDeployedCheckSmokeFixture } = await import(greathouseProfile.smokeFixtureModule)
const greathouseFixture = createGreathouseDeployedCheckSmokeFixture({
  profile: greathouseProfile,
  generatedAt: freshGeneratedAt,
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
    response.end(greathouseFixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/records' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseFixture.snapshotJson())
    return
  }
  if (url.pathname === profileStaticPath(garbageProfile) || url.pathname === '/api/workbench/records') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(garbageFixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/status' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseFixture.statusJson())
    return
  }
  if (url.pathname === '/api/workbench/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(statusJson)
    return
  }
  if (url.pathname === '/api/workbench/health' && url.searchParams.get('instance') === 'greathouse') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(greathouseFixture.healthJson())
    return
  }
  if (url.pathname === '/api/workbench/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(garbageFixture.healthJson(statusJson))
    return
  }
  if (garbageFixture.handleDraftRequest(url, response)) {
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
  garbageFixture.setGeneratedAt('2026-01-01T00:00:00Z')
  statusJson = garbageFixture.databaseStatusJson()
  const staleResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-ready',
  ])
  if (staleResult.status === 0 || !staleResult.stderr.includes('Snapshot freshness')) {
    throw new Error(`check-deployed readiness gate should reject stale snapshots\n${staleResult.stdout}\n${staleResult.stderr}`)
  }
  garbageFixture.setGeneratedAt(freshGeneratedAt)
  statusJson = garbageFixture.databaseStatusJson()
  const databaseResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-database',
  ])
  if (databaseResult.status !== 0 || !databaseResult.stdout.includes('with database gate')) {
    throw new Error(`check-deployed database smoke failed\n${databaseResult.stdout}\n${databaseResult.stderr}`)
  }
  statusJson = garbageFixture.browserStatusJson()
  const browserResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, garbageProfile),
    '--require-database',
  ])
  if (browserResult.status === 0 || !browserResult.stderr.includes('not database-backed')) {
    throw new Error(`check-deployed database gate should reject browser persistence\n${browserResult.stdout}\n${browserResult.stderr}`)
  }
  statusJson = garbageFixture.databaseStatusJson()
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

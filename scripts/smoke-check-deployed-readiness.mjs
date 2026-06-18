import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { defaultDeployCheckProfileId, deployCheckProfile, supportedDeployCheckProfiles } from './instances/deploy-check-profiles.mjs'

const defaultProfile = deployCheckProfile(defaultDeployCheckProfileId())
const secondaryProfile = supportedDeployCheckProfiles().find((profile) => profile.id !== defaultProfile?.id && profile.smokeFixtureModule)
if (!defaultProfile?.sourceSnapshotPath || !defaultProfile?.draft || !defaultProfile?.smokeFixtureModule || !secondaryProfile?.smokeFixtureModule) {
  throw new Error('deployed-check smoke requires a default draft profile and a secondary workbench profile')
}
const defaultBasePath = defaultProfile.basePath
const secondaryBasePath = secondaryProfile.basePath
const rawSnapshot = JSON.parse(await readFile(defaultProfile.sourceSnapshotPath, 'utf8'))
const checkDeployedSource = await readFile('scripts/check-deployed.mjs', 'utf8')
const deployProfilesSource = await readFile('scripts/instances/deploy-check-profiles.mjs', 'utf8')
const vercelConfigSource = await readFile('scripts/generate-vercel-config.mjs', 'utf8')
const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
for (const marker of ['collected.ga', '/rbage/', '/api/garbage/newsletter/draft', 'Strongly Typed AI/Data Notes', 'data/newsletter-snapshot.json', 'Weekly throughline', 'upvoted items will lead the draft']) {
  if (checkDeployedSource.includes(marker)) {
    throw new Error(`generic deployed checker still embeds Garbage deploy marker: ${marker}`)
  }
}
if (!defaultProfile.readinessCheckModule?.includes(`instances/${defaultProfile.id}/`) || !defaultProfile.draft?.checkModule?.includes(`instances/${defaultProfile.id}/`)) {
  throw new Error('default deploy profile should own readiness and draft validators from its instance boundary')
}
if (packageJson.scripts?.['check:preview'] !== 'node scripts/check-preview.mjs') {
  throw new Error('check:preview should use the profile-backed preview checker')
}
if (packageJson.scripts?.['vercel:config'] !== 'node scripts/generate-vercel-config.mjs' || packageJson.scripts?.['smoke:vercel-config'] !== 'node scripts/generate-vercel-config.mjs --check') {
  throw new Error('Vercel config scripts should use the deploy-profile-backed generator')
}
for (const scriptName of defaultProfile.removedGenericCommands ?? []) {
  if (packageJson.scripts?.[scriptName]) {
    throw new Error(`${scriptName} should be named as an explicit instance command`)
  }
}
for (const scriptName of defaultProfile.smokeCommands ?? []) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`${scriptName} should exist as an explicit instance smoke command`)
  }
  if (!packageJson.scripts[scriptName].includes(`scripts/instances/${defaultProfile.id}/`)) {
    throw new Error(`${scriptName} should run an instance-owned smoke script`)
  }
}
for (const scriptName of defaultProfile.publishingCommands ?? []) {
  if (!packageJson.scripts?.[scriptName]?.includes(`scripts/instances/${defaultProfile.id}/`)) {
    throw new Error(`${scriptName} should run an instance-owned publishing script`)
  }
}
if (vercelConfigSource.includes('/rbage/') || vercelConfigSource.includes('/greathouse/')) {
  throw new Error('Vercel config generator should derive app paths from deploy profiles')
}
for (const profile of [defaultProfile, secondaryProfile]) {
  const basePath = profile.basePath
  for (const source of [`${basePath}assets/(.*)`, `${basePath}data/(.*)`, `${basePath}(.*)`]) {
    if (!vercelConfig.rewrites?.some((rewrite) => rewrite.source === source)) {
      throw new Error(`generated vercel.json is missing rewrite ${source}`)
    }
  }
}
if (vercelConfig.redirects?.[0]?.destination !== defaultProfile.basePath) {
  throw new Error('generated vercel.json root redirect should point at the default deploy profile')
}
if (
  !deployProfilesSource.includes('registeredDeployCheckProfiles') ||
  deployProfilesSource.includes('garbageDeployCheckProfile') ||
  deployProfilesSource.includes('greathouseDeployCheckProfile')
) {
  throw new Error('deploy check profiles are not resolved from profile registration metadata')
}
if (!profileModulePathMatchesInstance(defaultProfile)) {
  throw new Error('default deployed-check smoke fixture should be instance-owned profile metadata')
}
for (const metadataKey of ['smokeCommands', 'removedGenericCommands', 'publishingCommands', 'compatibilitySqlSmoke', 'smokeAllCommands', 'uiSmokeCommands']) {
  if (!(metadataKey in defaultProfile)) {
    throw new Error(`default deploy profile is missing ${metadataKey} metadata`)
  }
}
if (!secondaryProfile.staticSnapshotPath || !profileModulePathMatchesInstance(secondaryProfile) || !secondaryProfile.genericSqlSmoke || !secondaryProfile.smokeAllCommands) {
  throw new Error('secondary deploy profile is missing reusable workbench smoke metadata')
}
const freshGeneratedAt = new Date().toISOString()
const { createDeployedCheckSmokeFixture } = await import(defaultProfile.smokeFixtureModule)
const defaultFixture = createDeployedCheckSmokeFixture({
  profile: defaultProfile,
  rawSnapshot,
  generatedAt: freshGeneratedAt,
})
let statusJson = defaultFixture.databaseStatusJson()
const { createDeployedCheckSmokeFixture: createSecondaryDeployedCheckSmokeFixture } = await import(secondaryProfile.smokeFixtureModule)
const secondaryFixture = createSecondaryDeployedCheckSmokeFixture({
  profile: secondaryProfile,
  generatedAt: freshGeneratedAt,
})
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === defaultBasePath || url.pathname === `${defaultBasePath}index.html`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><div id="app"></div><script type="module" src="${defaultBasePath}assets/index.js"></script>`)
    return
  }
  if (url.pathname === secondaryBasePath || url.pathname === `${secondaryBasePath}index.html`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><div id="app"></div><script type="module" src="${secondaryBasePath}assets/index.js"></script>`)
    return
  }
  if (url.pathname === profileStaticPath(secondaryProfile)) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(secondaryFixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/records' && url.searchParams.get('instance') === secondaryProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(secondaryFixture.snapshotJson())
    return
  }
  if (url.pathname === profileStaticPath(defaultProfile) || url.pathname === '/api/workbench/records') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(defaultFixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/status' && url.searchParams.get('instance') === secondaryProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(secondaryFixture.statusJson())
    return
  }
  if (url.pathname === '/api/workbench/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(statusJson)
    return
  }
  if (url.pathname === '/api/workbench/health' && url.searchParams.get('instance') === secondaryProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(secondaryFixture.healthJson())
    return
  }
  if (url.pathname === '/api/workbench/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(defaultFixture.healthJson(statusJson))
    return
  }
  if (defaultFixture.handleDraftRequest(url, response)) {
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
    localProfileUrl(address.port, defaultProfile),
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
    localProfileUrl(address.port, defaultProfile),
  ])
  if (previewResult.status !== 0 || !previewResult.stdout.includes('(static only)')) {
    throw new Error(`profile-backed preview check failed\n${previewResult.stdout}\n${previewResult.stderr}`)
  }
  defaultFixture.setGeneratedAt('2026-01-01T00:00:00Z')
  statusJson = defaultFixture.databaseStatusJson()
  const staleResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, defaultProfile),
    '--require-ready',
  ])
  if (staleResult.status === 0 || !staleResult.stderr.includes('Snapshot freshness')) {
    throw new Error(`check-deployed readiness gate should reject stale snapshots\n${staleResult.stdout}\n${staleResult.stderr}`)
  }
  defaultFixture.setGeneratedAt(freshGeneratedAt)
  statusJson = defaultFixture.databaseStatusJson()
  const databaseResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, defaultProfile),
    '--require-database',
  ])
  if (databaseResult.status !== 0 || !databaseResult.stdout.includes('with database gate')) {
    throw new Error(`check-deployed database smoke failed\n${databaseResult.stdout}\n${databaseResult.stderr}`)
  }
  statusJson = defaultFixture.browserStatusJson()
  const browserResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, defaultProfile),
    '--require-database',
  ])
  if (browserResult.status === 0 || !browserResult.stderr.includes('not database-backed')) {
    throw new Error(`check-deployed database gate should reject browser persistence\n${browserResult.stdout}\n${browserResult.stderr}`)
  }
  statusJson = defaultFixture.databaseStatusJson()
  const secondaryResult = await runCheckDeployed([
    'scripts/check-deployed.mjs',
    localProfileUrl(address.port, secondaryProfile),
    '--instance',
    secondaryProfile.id,
  ])
  if (secondaryResult.status !== 0) {
    throw new Error(`check-deployed ${secondaryProfile.id} workbench smoke failed\n${secondaryResult.stdout}\n${secondaryResult.stderr}`)
  }
  if (!secondaryResult.stdout.includes(`Verdun ${secondaryProfile.id} deployment`) || !secondaryResult.stdout.includes('without draft API checks')) {
    throw new Error(`check-deployed ${secondaryProfile.id} smoke did not report generic instance validation without draft checks`)
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

function profileModulePathMatchesInstance(profile) {
  return profile.smokeFixtureModule?.includes(`instances/${profile.id}/`)
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

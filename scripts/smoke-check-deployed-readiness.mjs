import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readdir, readFile } from 'node:fs/promises'

import { defaultDeployCheckProfileId, deployCheckProfile, supportedDeployCheckProfiles } from './instances/deploy-check-profiles.mjs'

const defaultProfile = deployCheckProfile(defaultDeployCheckProfileId())
if (!defaultProfile?.smokeFixtureModule || !defaultProfile.staticSnapshotPath) {
  throw new Error('deployed-check smoke requires a bundled workbench deploy profile')
}
if (defaultProfile.id !== 'demo') {
  throw new Error(`Verdun default deploy profile should be bundled demo, found ${defaultProfile.id}`)
}
if (supportedDeployCheckProfiles().some((profile) => profile.id !== 'demo')) {
  throw new Error('Verdun bundled deploy profiles should only include demo unless external modules opt in')
}

const checkDeployedSource = await readFile('scripts/check-deployed.mjs', 'utf8')
const deployProfilesSource = await readFile('scripts/instances/deploy-check-profiles.mjs', 'utf8')
const externalProfilesSource = await readFile('scripts/instances/external-deploy-check-profile-modules.mjs', 'utf8')
const vercelConfigSource = await readFile('scripts/generate-vercel-config.mjs', 'utf8')
const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const bundledDeployProfileDirectories = (await readdir('scripts/instances', { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

if (bundledDeployProfileDirectories.join(',') !== 'demo') {
  throw new Error(`Verdun should bundle only the demo deploy profile, found ${bundledDeployProfileDirectories.join(', ')}`)
}
if (packageJson.scripts?.['check:preview'] !== 'node scripts/check-preview.mjs') {
  throw new Error('check:preview should use the profile-backed preview checker')
}
if (packageJson.scripts?.['vercel:config'] !== 'node scripts/generate-vercel-config.mjs' || packageJson.scripts?.['smoke:vercel-config'] !== 'node scripts/generate-vercel-config.mjs --check') {
  throw new Error('Vercel config scripts should use the deploy-profile-backed generator')
}
if (vercelConfigSource.includes('hardcoded') || !vercelConfigSource.includes('supportedDeployCheckProfiles')) {
  throw new Error('Vercel config generator should derive app paths from deploy profiles')
}
for (const source of [`${defaultProfile.basePath}assets/(.*)`, `${defaultProfile.basePath}data/(.*)`, `${defaultProfile.basePath}(.*)`]) {
  if (!vercelConfig.rewrites?.some((rewrite) => rewrite.source === source)) {
    throw new Error(`generated vercel.json is missing rewrite ${source}`)
  }
}
if (vercelConfig.redirects?.[0]?.destination !== defaultProfile.basePath) {
  throw new Error('generated vercel.json root redirect should point at the default deploy profile')
}
if (
  !deployProfilesSource.includes('registeredDeployCheckProfiles') ||
  !deployProfilesSource.includes('externalDeployCheckProfileModules') ||
  deployProfilesSource.includes('../apps/') ||
  deployProfilesSource.includes('apps/') ||
  !deployProfilesSource.includes('readdir(instanceDirectory')
) {
  throw new Error('deploy check profiles are not discovered from instance profile modules')
}
if (externalProfilesSource.includes('../apps/') || externalProfilesSource.includes('apps/') || !externalProfilesSource.includes('VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES')) {
  throw new Error('external deploy-profile registry should be environment-provided, not hardcoded to an app')
}
if (!defaultProfile.smokeFixtureModule.includes(`instances/${defaultProfile.id}/`) || !defaultProfile.smokeAllCommands) {
  throw new Error('bundled deploy profile is missing reusable workbench smoke metadata')
}

const freshGeneratedAt = new Date().toISOString()
const { createDeployedCheckSmokeFixture } = await import(defaultProfile.smokeFixtureModule)
const fixture = createDeployedCheckSmokeFixture({
  profile: defaultProfile,
  generatedAt: freshGeneratedAt,
})

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === defaultProfile.basePath || url.pathname === `${defaultProfile.basePath}index.html`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><div id="app"></div><script type="module" src="${defaultProfile.basePath}assets/index.js"></script>`)
    return
  }
  if (url.pathname === profileStaticPath(defaultProfile)) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(fixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/records' && url.searchParams.get('instance') === defaultProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(fixture.snapshotJson())
    return
  }
  if (url.pathname === '/api/workbench/status' && url.searchParams.get('instance') === defaultProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(fixture.statusJson())
    return
  }
  if (url.pathname === '/api/workbench/health' && url.searchParams.get('instance') === defaultProfile.id) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(fixture.healthJson())
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
    '--instance',
    defaultProfile.id,
  ])
  if (result.status !== 0) {
    throw new Error(`check-deployed workbench smoke failed\n${result.stdout}\n${result.stderr}`)
  }
  if (!result.stdout.includes(`Verdun ${defaultProfile.id} deployment`) || !result.stdout.includes('without draft API checks')) {
    throw new Error('check-deployed smoke did not report generic instance validation without draft checks')
  }
  const previewResult = await runCheckDeployed([
    'scripts/check-preview.mjs',
    localProfileUrl(address.port, defaultProfile),
    '--instance',
    defaultProfile.id,
  ])
  if (previewResult.status !== 0 || !previewResult.stdout.includes('(static only)')) {
    throw new Error(`profile-backed preview check failed\n${previewResult.stdout}\n${previewResult.stderr}`)
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

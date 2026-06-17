import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyGarbage = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
  '--instance',
  'garbage',
], { encoding: 'utf8' })

if (verifyGarbage.error) throw verifyGarbage.error
if (verifyGarbage.status !== 0) {
  throw new Error(`garbage instance verification failed\n${verifyGarbage.stdout}\n${verifyGarbage.stderr}`)
}
if (!verifyGarbage.stdout.includes('verified garbage instance')) {
  throw new Error('garbage instance verification did not report the selected instance')
}

const verifyGreathouse = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
  '--instance',
  'greathouse',
  '--config',
  'crawler/instances/greathouse/config.toml',
], { encoding: 'utf8' })

if (verifyGreathouse.error) throw verifyGreathouse.error
if (verifyGreathouse.status !== 0) {
  throw new Error(`greathouse instance verification failed\n${verifyGreathouse.stdout}\n${verifyGreathouse.stderr}`)
}
if (!verifyGreathouse.stdout.includes('verified greathouse instance')) {
  throw new Error('greathouse instance verification did not report the selected instance')
}

const verifyUnknown = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
  '--instance',
  'unknown',
], { encoding: 'utf8' })

if (verifyUnknown.error) throw verifyUnknown.error
if (verifyUnknown.status === 0) {
  throw new Error('unsupported crawler instance should fail')
}
if (!verifyUnknown.stderr.includes('unknown crawler instance "unknown"')) {
  throw new Error(`unsupported instance failure did not explain the selected instance\n${verifyUnknown.stdout}\n${verifyUnknown.stderr}`)
}

const workDir = await mkdtemp(join(tmpdir(), 'verdun-greathouse-crawler-'))
try {
  const itemsPath = join(workDir, 'items.json')
  const sourceRunsPath = join(workDir, 'source-runs.json')
  const snapshotPath = join(workDir, 'greathouse-snapshot.json')
  const sqlPath = join(workDir, 'greathouse-generic.sql')
  const defaultSqlPath = join(workDir, 'greathouse-default.sql')
  const httpItemsPath = join(workDir, 'http-items.json')
  const httpSourceRunsPath = join(workDir, 'http-source-runs.json')
  const httpSnapshotPath = join(workDir, 'http-greathouse-snapshot.json')
  const httpConfigPath = join(workDir, 'http-greathouse.toml')
  const collectGreathouse = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--instance',
    'greathouse',
    '--config',
    'crawler/instances/greathouse/config.toml',
    '--out',
    itemsPath,
    '--source-runs-out',
    sourceRunsPath,
    '--public-out',
    snapshotPath,
    '--live',
  ], { encoding: 'utf8' })
  if (collectGreathouse.error) throw collectGreathouse.error
  if (collectGreathouse.status !== 0) {
    throw new Error(`greathouse collection failed\n${collectGreathouse.stdout}\n${collectGreathouse.stderr}`)
  }
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  if (snapshot.theme !== 'Property intelligence and source diagnostics') {
    throw new Error(`greathouse snapshot had wrong theme: ${snapshot.theme}`)
  }
  const listing = snapshot.items?.find((item) => item.source_kind === 'listing' && item.project === 'Berkeley 2BR')
  if (!listing) {
    throw new Error('greathouse snapshot did not contain a listing-shaped record')
  }
  if (listing.raw_json?.provenance?.adapter !== 'local-listing-json') {
    throw new Error(`listing record used wrong adapter provenance: ${listing.raw_json?.provenance?.adapter}`)
  }
  const diagnostic = snapshot.items?.find((item) => item.source_kind === 'diagnostic' && item.project === 'Oakland blocked source')
  if (!diagnostic) {
    throw new Error('greathouse snapshot did not contain a diagnostic-shaped record')
  }
  if (diagnostic.raw_json?.provenance?.adapter !== 'local-diagnostic-json') {
    throw new Error(`diagnostic record used wrong adapter provenance: ${diagnostic.raw_json?.provenance?.adapter}`)
  }
  const reviewAdapters = new Set(
    snapshot.query_plans?.flatMap((plan) => plan.review_targets?.map((target) => target.adapter) ?? []) ?? [],
  )
  if (!reviewAdapters.has('local-listing-json') || !reviewAdapters.has('local-diagnostic-json')) {
    throw new Error(`greathouse review targets did not expose local JSON adapters: ${[...reviewAdapters].join(', ')}`)
  }

  const exportGeneric = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'export-sql',
    '--target',
    'generic',
    '--instance',
    'greathouse',
    '--instance-name',
    'Greathouse',
    '--base-path',
    '/greathouse/',
    '--snapshot',
    snapshotPath,
    '--out',
    sqlPath,
  ], { encoding: 'utf8' })
  if (exportGeneric.error) throw exportGeneric.error
  if (exportGeneric.status !== 0) {
    throw new Error(`greathouse generic export failed\n${exportGeneric.stdout}\n${exportGeneric.stderr}`)
  }
  const exportDefault = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'export-sql',
    '--instance',
    'greathouse',
    '--instance-name',
    'Greathouse',
    '--base-path',
    '/greathouse/',
    '--snapshot',
    snapshotPath,
    '--out',
    defaultSqlPath,
  ], { encoding: 'utf8' })
  if (exportDefault.error) throw exportDefault.error
  if (exportDefault.status !== 0) {
    throw new Error(`greathouse default export failed\n${exportDefault.stdout}\n${exportDefault.stderr}`)
  }
  if (!exportDefault.stdout.includes('wrote generic SQL load')) {
    throw new Error(`default export did not use generic SQL target\n${exportDefault.stdout}`)
  }
  const defaultSql = await readFile(defaultSqlPath, 'utf8')
  if (!defaultSql.includes('insert into records') || defaultSql.includes('insert into newsletter_items')) {
    throw new Error('default export did not write generic workbench tables')
  }

  const loader = spawnSync('npm', [
    'run',
    'smoke:generic-loader',
    '--',
    sqlPath,
    snapshotPath,
    '--allow-custom-instance',
    '--expect-instance',
    'greathouse',
    '--expect-base-path',
    '/greathouse/',
  ], { encoding: 'utf8' })
  if (loader.error) throw loader.error
  if (loader.status !== 0) {
    throw new Error(`greathouse generic loader smoke failed\n${loader.stdout}\n${loader.stderr}`)
  }

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/listings.json') {
      response.end(JSON.stringify([
        {
          subject: 'Berkeley 2BR',
          url: 'https://example.com/live-http/berkeley-two-bedroom',
          title: 'HTTP Berkeley two-bedroom listing',
          observed_at: '2026-06-16T14:00:00Z',
          summary: 'HTTP listing adapter record for Greathouse.',
          tags: ['berkeley', 'http'],
          score: 88,
        },
      ]))
      return
    }
    if (request.url === '/diagnostics.json') {
      response.end(JSON.stringify([
        {
          subject: 'Oakland blocked source',
          url: 'https://example.com/live-http/oakland-diagnostic',
          title: 'HTTP Oakland diagnostic record',
          observed_at: '2026-06-16T14:05:00Z',
          summary: 'HTTP diagnostic adapter record for Greathouse.',
          tags: ['oakland', 'diagnostic', 'http'],
          score: 76,
        },
      ]))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not_found' }))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const { port } = server.address()
    await writeFile(httpConfigPath, `theme = "Property intelligence and source diagnostics"

[[projects]]
name = "Berkeley 2BR"
topic = "buyer shortlist"
homepage = "https://example.com/greathouse/berkeley-2br"
keywords = ["berkeley", "2br", "transit", "comparable"]

[[projects]]
name = "Oakland blocked source"
topic = "source diagnostics"
homepage = "https://example.com/greathouse/oakland-diagnostic"
keywords = ["oakland", "blocked-source", "retry", "diagnostic"]

[[sources]]
name = "HTTP listings"
kind = "listing"
url = "http://127.0.0.1:${port}/listings.json"
adapter = "http-listing-json"

[[sources]]
name = "HTTP diagnostics"
kind = "diagnostic"
url = "http://127.0.0.1:${port}/diagnostics.json"
adapter = "http-diagnostic-json"
`)
    const verifyHttp = await runCommand('cargo', [
      'run',
      '--manifest-path',
      'crawler/Cargo.toml',
      '--',
      'verify',
      '--instance',
      'greathouse',
      '--config',
      httpConfigPath,
    ])
    if (verifyHttp.status !== 0) {
      throw new Error(`greathouse HTTP adapter verification failed\n${verifyHttp.stdout}\n${verifyHttp.stderr}`)
    }
    const collectHttp = await runCommand('cargo', [
      'run',
      '--manifest-path',
      'crawler/Cargo.toml',
      '--',
      'collect',
      '--instance',
      'greathouse',
      '--config',
      httpConfigPath,
      '--out',
      httpItemsPath,
      '--source-runs-out',
      httpSourceRunsPath,
      '--public-out',
      httpSnapshotPath,
      '--live',
    ])
    if (collectHttp.status !== 0) {
      throw new Error(`greathouse HTTP collection failed\n${collectHttp.stdout}\n${collectHttp.stderr}`)
    }
    const httpSnapshot = JSON.parse(await readFile(httpSnapshotPath, 'utf8'))
    const httpAdapters = new Set(httpSnapshot.items?.map((item) => item.raw_json?.provenance?.adapter) ?? [])
    if (!httpAdapters.has('http-listing-json') || !httpAdapters.has('http-diagnostic-json')) {
      throw new Error(`greathouse HTTP adapters were not preserved in provenance: ${[...httpAdapters].join(', ')}`)
    }
    if (!httpSnapshot.items?.every((item) => item.raw_json?.provenance?.stage === 'live_http')) {
      throw new Error('greathouse HTTP adapter records did not default to live_http provenance stage')
    }
    const httpRunMessages = httpSnapshot.source_runs?.map((run) => run.message).join('\n') ?? ''
    if (!httpRunMessages.includes('HTTP listing adapter') || !httpRunMessages.includes('HTTP diagnostic adapter')) {
      throw new Error(`greathouse HTTP source runs did not report HTTP adapters:\n${httpRunMessages}`)
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
} finally {
  await rm(workDir, { recursive: true, force: true })
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { encoding: 'utf8' })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (status) => {
      resolve({ status, stdout, stderr })
    })
  })
}

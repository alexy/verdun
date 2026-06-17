import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [crawlerMainSource, garbageInstanceSource, instanceTraitSource] = await Promise.all([
  readFile('crawler/src/main.rs', 'utf8'),
  readFile('crawler/src/instances/garbage.rs', 'utf8'),
  readFile('crawler/src/instances/mod.rs', 'utf8'),
])
if (crawlerMainSource.includes('insert into newsletter_')) {
  throw new Error('crawler main still embeds legacy newsletter SQL table exports')
}
if (crawlerMainSource.includes('fn generic_export_sql(payload: &ExportPayload')) {
  throw new Error('generic SQL exporter still depends on Garbage export payloads')
}
for (const marker of [
  'default_value = "garbage"',
  'default_value = "Garbage"',
  'default_value = "/rbage/"',
  'crawler/instances/garbage/config.toml',
  'public/data/newsletter-snapshot.json',
]) {
  if (crawlerMainSource.includes(marker)) {
    throw new Error(`crawler main still embeds Garbage CLI default: ${marker}`)
  }
}
if (!garbageInstanceSource.includes('pub fn newsletter_export_sql') || !garbageInstanceSource.includes('insert into newsletter_items')) {
  throw new Error('Garbage crawler instance does not own the legacy newsletter SQL exporter')
}
if (!garbageInstanceSource.includes('pub fn news_item_record') || !garbageInstanceSource.includes('NormalizedRecord')) {
  throw new Error('Garbage crawler instance does not expose a core record projection for legacy news items')
}
if (instanceTraitSource.includes('ProjectQueryPlan') || !instanceTraitSource.includes('Vec<NormalizedCollectionPlan>')) {
  throw new Error('crawler instance trait still exposes Garbage query-plan types instead of core collection plans')
}
if (instanceTraitSource.includes('EditorialFocus, NewsItem') || !instanceTraitSource.includes('use crate::core::{CrawlerConfig, EditorialFocus')) {
  throw new Error('crawler instance trait still imports editorial focus state from Garbage instead of core')
}

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
  const redfinListing = snapshot.items?.find((item) => item.raw_json?.provenance?.adapter === 'redfin-listing-json')
  if (!redfinListing) {
    throw new Error('greathouse snapshot did not contain a Redfin adapter listing record')
  }
  if (redfinListing.raw_json?.provenance?.stage !== 'property_source') {
    throw new Error(`Redfin listing used wrong provenance stage: ${redfinListing.raw_json?.provenance?.stage}`)
  }
  if (redfinListing.raw_json?.property?.price !== 875000 || redfinListing.raw_json?.property?.beds !== 2 || redfinListing.raw_json?.property?.baths !== 1.5) {
    throw new Error(`Redfin listing did not preserve normalized property details: ${JSON.stringify(redfinListing.raw_json?.property)}`)
  }
  if (!redfinListing.summary.includes('$875,000 Redfin listing') || !redfinListing.summary.includes('4 comparable signals')) {
    throw new Error(`Redfin listing summary was not property-shaped: ${redfinListing.summary}`)
  }
  const zillowListing = snapshot.items?.find((item) => item.raw_json?.provenance?.adapter === 'zillow-listing-json')
  if (!zillowListing) {
    throw new Error('greathouse snapshot did not contain a Zillow adapter listing record')
  }
  if (zillowListing.raw_json?.provenance?.stage !== 'property_source') {
    throw new Error(`Zillow listing used wrong provenance stage: ${zillowListing.raw_json?.provenance?.stage}`)
  }
  if (zillowListing.raw_json?.property?.zestimate !== 842000 || zillowListing.raw_json?.property?.rent_zestimate !== 4100 || zillowListing.raw_json?.property?.favorite_count !== 17) {
    throw new Error(`Zillow listing did not preserve valuation and demand details: ${JSON.stringify(zillowListing.raw_json?.property)}`)
  }
  if (!zillowListing.summary.includes('$842,000 Zillow listing') || !zillowListing.summary.includes('238 page views') || !zillowListing.summary.includes('17 saves')) {
    throw new Error(`Zillow listing summary was not property-shaped: ${zillowListing.summary}`)
  }
  const diagnostic = snapshot.items?.find((item) => item.raw_json?.provenance?.adapter === 'local-diagnostic-json' && item.project === 'Oakland blocked source')
  if (!diagnostic) {
    throw new Error('greathouse snapshot did not contain a diagnostic-shaped record')
  }
  if (diagnostic.raw_json?.provenance?.adapter !== 'local-diagnostic-json') {
    throw new Error(`diagnostic record used wrong adapter provenance: ${diagnostic.raw_json?.provenance?.adapter}`)
  }
  const browserDiagnostic = snapshot.items?.find((item) => item.raw_json?.provenance?.adapter === 'browser-diagnostic-json')
  if (!browserDiagnostic) {
    throw new Error('greathouse snapshot did not contain a browser diagnostic record')
  }
  if (browserDiagnostic.raw_json?.provenance?.stage !== 'browser_diagnostic') {
    throw new Error(`browser diagnostic used wrong provenance stage: ${browserDiagnostic.raw_json?.provenance?.stage}`)
  }
  if (browserDiagnostic.raw_json?.property?.blocked_reason !== 'captcha' || browserDiagnostic.raw_json?.property?.screenshot_path !== 'crawler/instances/greathouse/artifacts/oakland-source-blocked.png') {
    throw new Error(`browser diagnostic did not preserve rendered-page evidence: ${JSON.stringify(browserDiagnostic.raw_json?.property)}`)
  }
  const reviewAdapters = new Set(
    snapshot.query_plans?.flatMap((plan) => plan.review_targets?.map((target) => target.adapter) ?? []) ?? [],
  )
  if (!reviewAdapters.has('local-listing-json') || !reviewAdapters.has('redfin-listing-json') || !reviewAdapters.has('zillow-listing-json') || !reviewAdapters.has('local-diagnostic-json') || !reviewAdapters.has('browser-diagnostic-json')) {
    throw new Error(`greathouse review targets did not expose local JSON adapters: ${[...reviewAdapters].join(', ')}`)
  }
  const zillowRun = snapshot.source_runs?.find((run) => run.source === 'Zillow property feed')
  if (zillowRun?.project_counts?.['Berkeley 2BR'] !== 1 || !zillowRun.message.includes('Zillow listing adapter')) {
    throw new Error(`Zillow source run did not expose source health: ${JSON.stringify(zillowRun)}`)
  }
  const browserRun = snapshot.source_runs?.find((run) => run.source === 'Redfin browser diagnostics')
  if (browserRun?.project_counts?.['Oakland blocked source'] !== 1 || !browserRun.message.includes('Browser diagnostic adapter')) {
    throw new Error(`browser diagnostic source run did not expose source health: ${JSON.stringify(browserRun)}`)
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
    if (request.url === '/blocked') {
      response.statusCode = 403
      response.end(JSON.stringify({ error: 'blocked' }))
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

[[sources]]
name = "HTTP blocked probe"
kind = "diagnostic"
url = "http://127.0.0.1:${port}/blocked"
adapter = "http-status-diagnostic"
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
    if (!httpAdapters.has('http-listing-json') || !httpAdapters.has('http-diagnostic-json') || !httpAdapters.has('http-status-diagnostic')) {
      throw new Error(`greathouse HTTP adapters were not preserved in provenance: ${[...httpAdapters].join(', ')}`)
    }
    const blockedProbe = httpSnapshot.items?.find((item) => item.raw_json?.provenance?.adapter === 'http-status-diagnostic')
    if (!blockedProbe) {
      throw new Error('greathouse HTTP status diagnostic adapter did not emit a diagnostic record')
    }
    if (blockedProbe.raw_json?.provenance?.stage !== 'blocked_http') {
      throw new Error(`HTTP status diagnostic record used wrong stage: ${blockedProbe.raw_json?.provenance?.stage}`)
    }
    if (blockedProbe.project !== 'Oakland blocked source') {
      throw new Error(`HTTP status diagnostic record used wrong project: ${blockedProbe.project}`)
    }
    const liveHttpRecords = httpSnapshot.items?.filter((item) => item.raw_json?.provenance?.adapter !== 'http-status-diagnostic') ?? []
    if (!liveHttpRecords.every((item) => item.raw_json?.provenance?.stage === 'live_http')) {
      throw new Error('greathouse HTTP JSON adapter records did not default to live_http provenance stage')
    }
    const httpRunMessages = httpSnapshot.source_runs?.map((run) => run.message).join('\n') ?? ''
    if (!httpRunMessages.includes('HTTP listing adapter') || !httpRunMessages.includes('HTTP diagnostic adapter') || !httpRunMessages.includes('HTTP status diagnostic adapter')) {
      throw new Error(`greathouse HTTP source runs did not report HTTP adapters:\n${httpRunMessages}`)
    }
    const blockedRun = httpSnapshot.source_runs?.find((run) => run.source === 'HTTP blocked probe')
    if (blockedRun?.project_counts?.['Oakland blocked source'] !== 1) {
      throw new Error(`HTTP status diagnostic source run did not expose project counts: ${JSON.stringify(blockedRun)}`)
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

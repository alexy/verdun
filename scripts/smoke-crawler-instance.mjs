import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [
  crawlerMainSource,
  greathouseInstanceSource,
  instanceTraitSource,
  bundledInstancesSource,
  crawlerLibSource,
  crawlerSdkSource,
  crawlerRuntimeSource,
] = await Promise.all([
  readFile('crawler/src/main.rs', 'utf8'),
  readFile('crawler/src/instances/greathouse.rs', 'utf8'),
  readFile('crawler/src/instances/mod.rs', 'utf8'),
  readFile('crawler/src/instances/bundled.rs', 'utf8'),
  readFile('crawler/src/lib.rs', 'utf8'),
  readFile('crawler/src/sdk.rs', 'utf8'),
  readFile('crawler/src/runtime.rs', 'utf8'),
])
const trackedLegacyGarbageArtifacts = spawnSync('git', [
  'ls-files',
  'public/data/newsletter-snapshot.json',
  'crawler/data/items.json',
  'crawler/data/source-runs.json',
  'crawler/data/newsletter-draft.md',
], { encoding: 'utf8' })
if (trackedLegacyGarbageArtifacts.error) throw trackedLegacyGarbageArtifacts.error
if (trackedLegacyGarbageArtifacts.status !== 0) {
  throw new Error(`could not inspect tracked legacy Garbage artifacts\n${trackedLegacyGarbageArtifacts.stderr}`)
}
const presentTrackedLegacyArtifacts = trackedLegacyGarbageArtifacts.stdout
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((artifactPath) => existsSync(artifactPath))
if (presentTrackedLegacyArtifacts.length) {
  throw new Error(`Verdun should not keep tracked Garbage crawler/newsletter artifacts:\n${presentTrackedLegacyArtifacts.join('\n')}`)
}
for (const removedPath of ['crawler/src/instances/garbage.rs', 'crawler/src/instances/external.rs']) {
  if (existsSync(removedPath)) {
    throw new Error(`${removedPath} should not exist; app crawlers register from their own packages`)
  }
}
if (!crawlerLibSource.includes('pub use runtime::{run_cli, run_cli_with_registrations};')) {
  throw new Error('verdun-crawler should expose a reusable CLI runtime for app-owned crawler binaries')
}
if (!crawlerLibSource.includes('pub mod sdk;')) {
  throw new Error('verdun-crawler should expose a public SDK facade for app-owned crawler binaries')
}
if (!crawlerSdkSource.includes('run_cli_with_registrations') || !crawlerSdkSource.includes('CrawlerInstanceRegistration')) {
  throw new Error('verdun-crawler SDK should expose runtime and instance registration contracts')
}
if (bundledInstancesSource.includes('garbage') || bundledInstancesSource.includes('external::')) {
  throw new Error('Verdun bundled crawler registrations should not include Garbage or an external parent path')
}
if (existsSync('crawler/src/instances/garbage.rs')) {
  throw new Error('Garbage crawler implementation should not live behind a resident Verdun instance module')
}
if (!crawlerMainSource.includes('verdun_crawler::run_cli()')) {
  throw new Error('crawler main should be a thin Verdun CLI wrapper')
}
if (crawlerRuntimeSource.includes('insert into newsletter_')) {
  throw new Error('crawler runtime still embeds legacy newsletter SQL table exports')
}
if (crawlerRuntimeSource.includes('fn generic_export_sql(payload: &ExportPayload')) {
  throw new Error('generic SQL exporter still depends on Garbage export payloads')
}
for (const marker of [
  'use crate::instances::garbage',
  'garbage::load_newsletter_export_payload',
  'garbage::newsletter_export_sql',
  'garbage::public_snapshot_value_as_crawler_snapshot',
  'SqlExportTarget',
  'Newsletter',
  'use crate::instances::garbage::{',
  'fn legacy_query_plans',
  'fn load_export_payload',
  'fn load_crawler_snapshot',
]) {
  if (crawlerRuntimeSource.includes(marker)) {
    throw new Error(`crawler runtime still exposes direct Garbage compatibility wiring: ${marker}`)
  }
}
if (!crawlerRuntimeSource.includes('.legacy_sql_export(') || !crawlerRuntimeSource.includes('load_generic_crawler_snapshot')) {
  throw new Error('crawler runtime does not route legacy SQL export and generic snapshot loading through crawler instance hooks')
}
for (const marker of [
  'garbage::PublicSnapshot',
  'garbage::ExportPayload',
  'garbage::NewsItem',
]) {
  if (crawlerRuntimeSource.includes(marker)) {
    throw new Error(`crawler runtime still parses Garbage compatibility type directly: ${marker}`)
  }
}
if (!instanceTraitSource.includes('fn legacy_sql_export') || !instanceTraitSource.includes('fn public_snapshot_as_crawler_snapshot') || !instanceTraitSource.includes('fn split_payload_as_crawler_snapshot')) {
  throw new Error('crawler instance trait does not expose optional compatibility hooks')
}
for (const marker of [
  'default_value = "garbage"',
  'default_value = "Garbage"',
  'default_value = "/rbage/"',
  'crawler/instances/garbage/config.toml',
  'public/data/newsletter-snapshot.json',
  'crawler/data/items.json',
  'crawler/data/source-runs.json',
  'crawler/data/editorial-state.json',
]) {
  if (crawlerRuntimeSource.includes(marker)) {
    throw new Error(`crawler runtime still embeds Garbage CLI default: ${marker}`)
  }
}
for (const marker of [
  'default_item_payload_path',
  'default_source_runs_path',
  'default_editorial_state_path',
]) {
  if (!instanceTraitSource.includes(marker)) {
    throw new Error(`crawler instance trait is missing instance-owned path metadata: ${marker}`)
  }
}
if (instanceTraitSource.includes('ProjectQueryPlan') || !instanceTraitSource.includes('Vec<NormalizedCollectionPlan>')) {
  throw new Error('crawler instance trait still exposes Garbage query-plan types instead of core collection plans')
}
if (!instanceTraitSource.includes('REGISTERED_CRAWLER_INSTANCES') || !instanceTraitSource.includes('CrawlerInstanceRegistration')) {
  throw new Error('crawler instances are not resolved through a registration table')
}
if (
  instanceTraitSource.includes('pub mod garbage') ||
  instanceTraitSource.includes('pub mod greathouse') ||
  instanceTraitSource.includes('garbage::CRAWLER_INSTANCE') ||
  instanceTraitSource.includes('greathouse::CRAWLER_INSTANCE') ||
  instanceTraitSource.includes('GARBAGE_CRAWLER_INSTANCE') ||
  instanceTraitSource.includes('GREATHOUSE_CRAWLER_INSTANCE') ||
  !greathouseInstanceSource.includes('pub static CRAWLER_INSTANCE') ||
  !bundledInstancesSource.includes('BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS') ||
  !bundledInstancesSource.includes('greathouse::CRAWLER_INSTANCE')
) {
  throw new Error('resident crawler instance modules should be isolated behind the bundled crawler registration manifest')
}
if (instanceTraitSource.includes('match instance') || instanceTraitSource.includes('supported instances: garbage, greathouse')) {
  throw new Error('crawler instance resolver still hard-codes supported instances instead of using registrations')
}
if (!instanceTraitSource.includes('EditorialFocus') || !instanceTraitSource.includes('CrawlerCollection')) {
  throw new Error('crawler instance trait still imports editorial focus state from Garbage instead of core')
}
if (instanceTraitSource.includes('use garbage::NewsItem') || instanceTraitSource.includes('Vec<NewsItem>')) {
  throw new Error('crawler instance trait still exposes Garbage NewsItem instead of core collection output')
}
if (greathouseInstanceSource.includes('NewsItem') || greathouseInstanceSource.includes('instances::garbage')) {
  throw new Error('Greathouse crawler still depends on Garbage news item types')
}
if (!greathouseInstanceSource.includes('Result<Vec<NormalizedRecord>>')) {
  throw new Error('Greathouse source adapters do not collect core normalized records directly')
}

const verifyGreathouse = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
], { encoding: 'utf8' })

if (verifyGreathouse.error) throw verifyGreathouse.error
if (verifyGreathouse.status !== 0) {
  throw new Error(`default greathouse instance verification failed\n${verifyGreathouse.stdout}\n${verifyGreathouse.stderr}`)
}
if (!verifyGreathouse.stdout.includes('verified greathouse instance')) {
  throw new Error('default crawler verification did not report the bundled Greathouse instance')
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
  const genericSnapshotPath = join(workDir, 'greathouse-generic-snapshot.json')
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
    '--generic-out',
    genericSnapshotPath,
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
  const snapshotRecords = snapshot.records ?? snapshot.items ?? []
  const snapshotPlans = snapshot.collection_plans ?? snapshot.query_plans ?? []
  if (!Array.isArray(snapshot.records) || snapshot.items) {
    throw new Error('greathouse public snapshot did not use the generic records shape')
  }
  const listing = snapshotRecords.find((item) => item.source_kind === 'listing' && subjectOf(item) === 'Berkeley 2BR')
  if (!listing) {
    throw new Error('greathouse snapshot did not contain a listing-shaped record')
  }
  if (listing.raw_json?.provenance?.adapter !== 'local-listing-json') {
    throw new Error(`listing record used wrong adapter provenance: ${listing.raw_json?.provenance?.adapter}`)
  }
  const redfinListing = snapshotRecords.find((item) => item.raw_json?.provenance?.adapter === 'redfin-listing-json')
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
  const zillowListing = snapshotRecords.find((item) => item.raw_json?.provenance?.adapter === 'zillow-listing-json')
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
  const diagnostic = snapshotRecords.find((item) => item.raw_json?.provenance?.adapter === 'local-diagnostic-json' && subjectOf(item) === 'Oakland blocked source')
  if (!diagnostic) {
    throw new Error('greathouse snapshot did not contain a diagnostic-shaped record')
  }
  if (diagnostic.raw_json?.provenance?.adapter !== 'local-diagnostic-json') {
    throw new Error(`diagnostic record used wrong adapter provenance: ${diagnostic.raw_json?.provenance?.adapter}`)
  }
  const browserDiagnostic = snapshotRecords.find((item) => item.raw_json?.provenance?.adapter === 'browser-diagnostic-json')
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
    snapshotPlans.flatMap((plan) => plan.review_targets?.map((target) => target.adapter) ?? []),
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
  const genericSnapshot = JSON.parse(await readFile(genericSnapshotPath, 'utf8'))
  if (!Array.isArray(genericSnapshot.records) || genericSnapshot.items) {
    throw new Error('generic collect output did not use the core CrawlerSnapshot records shape')
  }
  const genericZillowListing = genericSnapshot.records.find((record) => record.source === 'Zillow property feed' && record.subject === 'Berkeley 2BR')
  if (!genericZillowListing) {
    throw new Error('generic collect output did not project Zillow listing into normalized records')
  }
  if (genericZillowListing.provenance_json?.adapter !== 'zillow-listing-json') {
    throw new Error(`generic Zillow record used wrong provenance projection: ${genericZillowListing.provenance_json?.adapter}`)
  }
  const genericPlan = genericSnapshot.collection_plans?.find((plan) => plan.subject === 'Berkeley 2BR')
  if (!genericPlan || genericPlan.project || genericPlan.hacker_news_query || !genericPlan.query || !Array.isArray(genericPlan.tags)) {
    throw new Error(`generic collect output did not use normalized collection plans: ${JSON.stringify(genericPlan)}`)
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
    genericSnapshotPath,
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
    genericSnapshotPath,
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
    const httpRecords = httpSnapshot.records ?? httpSnapshot.items ?? []
    const httpAdapters = new Set(httpRecords.map((item) => item.raw_json?.provenance?.adapter))
    if (!httpAdapters.has('http-listing-json') || !httpAdapters.has('http-diagnostic-json') || !httpAdapters.has('http-status-diagnostic')) {
      throw new Error(`greathouse HTTP adapters were not preserved in provenance: ${[...httpAdapters].join(', ')}`)
    }
    const blockedProbe = httpRecords.find((item) => item.raw_json?.provenance?.adapter === 'http-status-diagnostic')
    if (!blockedProbe) {
      throw new Error('greathouse HTTP status diagnostic adapter did not emit a diagnostic record')
    }
    if (blockedProbe.raw_json?.provenance?.stage !== 'blocked_http') {
      throw new Error(`HTTP status diagnostic record used wrong stage: ${blockedProbe.raw_json?.provenance?.stage}`)
    }
    if (subjectOf(blockedProbe) !== 'Oakland blocked source') {
      throw new Error(`HTTP status diagnostic record used wrong subject: ${subjectOf(blockedProbe)}`)
    }
    const liveHttpRecords = httpRecords.filter((item) => item.raw_json?.provenance?.adapter !== 'http-status-diagnostic')
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

function subjectOf(item) {
  return item.subject ?? item.project
}

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [
  crawlerMainSource,
  demoInstanceSource,
  instanceTraitSource,
  bundledInstancesSource,
  crawlerLibSource,
  crawlerSdkSource,
  crawlerRuntimeSource,
  readmeSource,
  appDocSource,
  crawlerManifestSource,
  crawlerInstanceEntries,
  crawlerConfigEntries,
] = await Promise.all([
  readFile('crawler/src/main.rs', 'utf8'),
  readFile('crawler/src/instances/demo.rs', 'utf8'),
  readFile('crawler/src/instances/mod.rs', 'utf8'),
  readFile('crawler/src/instances/bundled.rs', 'utf8'),
  readFile('crawler/src/lib.rs', 'utf8'),
  readFile('crawler/src/sdk.rs', 'utf8'),
  readFile('crawler/src/runtime.rs', 'utf8'),
  readFile('README.md', 'utf8'),
  readFile('APP.md', 'utf8'),
  readFile('crawler/Cargo.toml', 'utf8'),
  readdir('crawler/src/instances', { withFileTypes: true }),
  readdir('crawler/instances', { withFileTypes: true }),
])

if (!crawlerManifestSource.includes('description = "Reusable crawler SDK and database reload runtime for Verdun workbench apps"') || !crawlerManifestSource.includes('readme = "README.md"')) {
  throw new Error('verdun-crawler package metadata should describe the reusable SDK/runtime and point at crawler/README.md')
}
if (!crawlerManifestSource.includes('keywords = ["crawler", "database", "workbench", "vercel"]')) {
  throw new Error('verdun-crawler package metadata should keep reusable crawler/workbench keywords')
}
for (const [docPath, source] of [['README.md', readmeSource], ['APP.md', appDocSource]]) {
  if (!source.includes('demo') || !source.includes('external app')) {
    throw new Error(`${docPath} should describe Verdun as a demo-backed reusable core for external app packages`)
  }
}

const trackedDataArtifacts = spawnSync('git', [
  'ls-files',
  'public/data',
  'crawler/data',
], { encoding: 'utf8' })
if (trackedDataArtifacts.error) throw trackedDataArtifacts.error
if (trackedDataArtifacts.status !== 0) {
  throw new Error(`could not inspect tracked data artifacts\n${trackedDataArtifacts.stderr}`)
}
const unexpectedTrackedDataArtifacts = trackedDataArtifacts.stdout
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((artifactPath) => existsSync(artifactPath))
  .filter((artifactPath) => !artifactPath.includes('demo'))
if (unexpectedTrackedDataArtifacts.length) {
  throw new Error(`Verdun should keep only demo tracked data artifacts:\n${unexpectedTrackedDataArtifacts.join('\n')}`)
}
const bundledCrawlerRustFiles = crawlerInstanceEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.rs'))
  .map((entry) => entry.name)
  .sort()
if (bundledCrawlerRustFiles.join(',') !== 'bundled.rs,demo.rs,mod.rs') {
  throw new Error(`Verdun crawler should bundle only demo Rust instance files, found ${bundledCrawlerRustFiles.join(', ')}`)
}
const bundledCrawlerConfigDirs = crawlerConfigEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
if (bundledCrawlerConfigDirs.join(',') !== 'demo') {
  throw new Error(`Verdun crawler should bundle only demo crawler config, found ${bundledCrawlerConfigDirs.join(', ')}`)
}
if (crawlerLibSource.includes('pub mod core;') || crawlerLibSource.includes('pub mod instances;') || crawlerLibSource.includes('pub use runtime::')) {
  throw new Error('verdun-crawler should expose reusable types/runtime through sdk.rs, not public core/instances/runtime modules')
}
if (!crawlerLibSource.includes('pub mod sdk;')) {
  throw new Error('verdun-crawler should expose a public SDK facade for app-owned crawler binaries')
}
if (!crawlerSdkSource.includes('run_cli_with_registrations') || !crawlerSdkSource.includes('CrawlerInstanceRegistration')) {
  throw new Error('verdun-crawler SDK should expose runtime and instance registration contracts')
}
if (!crawlerMainSource.includes('verdun_crawler::sdk::run_cli()')) {
  throw new Error('crawler main should run through the public SDK facade')
}
if (bundledInstancesSource.includes('external::') || !bundledInstancesSource.includes('demo::CRAWLER_INSTANCE')) {
  throw new Error('Verdun bundled crawler registrations should not include app-owned instances or an external parent path')
}
for (const marker of [
  'SqlExportTarget',
  'fn legacy_query_plans',
  'fn load_export_payload',
  'fn load_crawler_snapshot',
]) {
  if (crawlerRuntimeSource.includes(marker)) {
    throw new Error(`crawler runtime still exposes direct compatibility wiring: ${marker}`)
  }
}
if (!crawlerRuntimeSource.includes('.legacy_sql_export(') || !crawlerRuntimeSource.includes('load_generic_crawler_snapshot')) {
  throw new Error('crawler runtime does not route legacy SQL export and generic snapshot loading through crawler instance hooks')
}
for (const marker of [
  'crawler/data/editorial-state.json',
]) {
  if (crawlerRuntimeSource.includes(marker)) {
    throw new Error(`crawler runtime still embeds app compatibility detail: ${marker}`)
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
  throw new Error('crawler instance trait should expose core collection plan types')
}
if (!instanceTraitSource.includes('REGISTERED_CRAWLER_INSTANCES') || !instanceTraitSource.includes('CrawlerInstanceRegistration')) {
  throw new Error('crawler instances are not resolved through a registration table')
}
if (
  !demoInstanceSource.includes('pub static CRAWLER_INSTANCE') ||
  !bundledInstancesSource.includes('BUNDLED_CRAWLER_INSTANCE_REGISTRATIONS') ||
  !bundledInstancesSource.includes('demo::CRAWLER_INSTANCE')
) {
  throw new Error('resident crawler instance modules should be isolated behind the bundled crawler registration manifest')
}
if (instanceTraitSource.includes('match instance')) {
  throw new Error('crawler instance resolver still hard-codes supported instances instead of using registrations')
}
if (!instanceTraitSource.includes('EditorialFocus') || !instanceTraitSource.includes('CrawlerCollection')) {
  throw new Error('crawler instance trait should use generic editorial focus and crawler collection core types')
}
if (instanceTraitSource.includes('Vec<NewsItem>')) {
  throw new Error('crawler instance trait should expose core collection output')
}
if (demoInstanceSource.includes('NewsItem')) {
  throw new Error('Demo crawler should depend on core normalized record types')
}
if (!demoInstanceSource.includes('Result<CrawlerCollection>') || !demoInstanceSource.includes('Vec<NormalizedRecord>')) {
  throw new Error('Demo source adapters should collect core normalized records into a generic crawler collection')
}

const verifyDemo = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'verify',
], { encoding: 'utf8' })
if (verifyDemo.error) throw verifyDemo.error
if (verifyDemo.status !== 0) {
  throw new Error(`default demo instance verification failed\n${verifyDemo.stdout}\n${verifyDemo.stderr}`)
}
if (!verifyDemo.stdout.includes('verified demo instance')) {
  throw new Error('default crawler verification did not report the bundled demo instance')
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

const workDir = await mkdtemp(join(tmpdir(), 'verdun-demo-crawler-'))
try {
  const itemsPath = join(workDir, 'items.json')
  const sourceRunsPath = join(workDir, 'source-runs.json')
  const snapshotPath = join(workDir, 'demo-snapshot.json')
  const genericSnapshotPath = join(workDir, 'demo-generic-snapshot.json')
  const sqlPath = join(workDir, 'demo-generic.sql')
  const httpItemsPath = join(workDir, 'http-items.json')
  const httpSourceRunsPath = join(workDir, 'http-source-runs.json')
  const httpSnapshotPath = join(workDir, 'http-demo-snapshot.json')
  const httpConfigPath = join(workDir, 'http-demo.toml')

  const collectDemo = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--instance',
    'demo',
    '--config',
    'crawler/instances/demo/config.toml',
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
  if (collectDemo.error) throw collectDemo.error
  if (collectDemo.status !== 0) {
    throw new Error(`demo collection failed\n${collectDemo.stdout}\n${collectDemo.stderr}`)
  }
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  if (snapshot.theme !== 'Generic crawler and database reload demo') {
    throw new Error(`demo snapshot had wrong theme: ${snapshot.theme}`)
  }
  if (!Array.isArray(snapshot.records) || snapshot.items) {
    throw new Error('demo public snapshot did not use the generic records shape')
  }
  const record = snapshot.records.find((item) => item.subject === 'Reusable workbench' && item.source_kind === 'record')
  if (!record || record.raw_json?.provenance?.adapter !== 'local-record-json') {
    throw new Error(`demo snapshot did not contain the generic local record: ${JSON.stringify(record)}`)
  }
  const diagnostic = snapshot.records.find((item) => item.subject === 'Source diagnostics' && item.source_kind === 'diagnostic')
  if (!diagnostic || diagnostic.raw_json?.provenance?.adapter !== 'local-diagnostic-json') {
    throw new Error(`demo snapshot did not contain the generic diagnostic record: ${JSON.stringify(diagnostic)}`)
  }
  const reviewAdapters = new Set(
    snapshot.collection_plans.flatMap((plan) => plan.review_targets?.map((target) => target.adapter) ?? []),
  )
  if (!reviewAdapters.has('local-record-json') || !reviewAdapters.has('local-diagnostic-json')) {
    throw new Error(`demo review targets did not expose generic adapters: ${[...reviewAdapters].join(', ')}`)
  }
  const genericSnapshot = JSON.parse(await readFile(genericSnapshotPath, 'utf8'))
  if (!Array.isArray(genericSnapshot.records) || genericSnapshot.items) {
    throw new Error('generic collect output did not use the core CrawlerSnapshot records shape')
  }
  const genericPlan = genericSnapshot.collection_plans?.find((plan) => plan.subject === 'Reusable workbench')
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
    'demo',
    '--snapshot',
    genericSnapshotPath,
    '--out',
    sqlPath,
  ], { encoding: 'utf8' })
  if (exportGeneric.error) throw exportGeneric.error
  if (exportGeneric.status !== 0) {
    throw new Error(`demo generic export failed\n${exportGeneric.stdout}\n${exportGeneric.stderr}`)
  }
  const loader = spawnSync('npm', [
    'run',
    'smoke:generic-loader',
    '--',
    sqlPath,
    genericSnapshotPath,
    '--expect-instance',
    'demo',
    '--expect-base-path',
    '/demo/',
  ], { encoding: 'utf8' })
  if (loader.error) throw loader.error
  if (loader.status !== 0) {
    throw new Error(`demo generic loader smoke failed\n${loader.stdout}\n${loader.stderr}`)
  }

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/records.json') {
      response.end(JSON.stringify([
        {
          subject: 'Reusable workbench',
          url: 'https://example.com/live-http/reusable-workbench',
          title: 'HTTP reusable workbench record',
          observed_at: '2026-06-18T14:00:00Z',
          summary: 'HTTP record adapter loaded a generic workbench record.',
          tags: ['generic', 'http'],
          score: 88,
        },
      ]))
      return
    }
    if (request.url === '/diagnostics.json') {
      response.end(JSON.stringify([
        {
          subject: 'Source diagnostics',
          url: 'https://example.com/live-http/source-diagnostic',
          title: 'HTTP source diagnostic record',
          observed_at: '2026-06-18T14:05:00Z',
          summary: 'HTTP diagnostic adapter loaded a generic source-health record.',
          tags: ['diagnostic', 'http'],
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
    await writeFile(httpConfigPath, `theme = "Generic crawler and database reload demo"

[[projects]]
name = "Reusable workbench"
topic = "core contract"
homepage = "https://example.com/demo/reusable-workbench"
keywords = ["generic", "workbench", "provenance", "database"]

[[projects]]
name = "Source diagnostics"
topic = "source health"
homepage = "https://example.com/demo/source-diagnostics"
keywords = ["diagnostic", "source-health", "retry", "blocked"]

[[sources]]
name = "HTTP records"
kind = "record"
url = "http://127.0.0.1:${port}/records.json"
adapter = "http-record-json"

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
      'demo',
      '--config',
      httpConfigPath,
    ])
    if (verifyHttp.status !== 0) {
      throw new Error(`demo HTTP adapter verification failed\n${verifyHttp.stdout}\n${verifyHttp.stderr}`)
    }
    const collectHttp = await runCommand('cargo', [
      'run',
      '--manifest-path',
      'crawler/Cargo.toml',
      '--',
      'collect',
      '--instance',
      'demo',
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
      throw new Error(`demo HTTP collection failed\n${collectHttp.stdout}\n${collectHttp.stderr}`)
    }
    const httpSnapshot = JSON.parse(await readFile(httpSnapshotPath, 'utf8'))
    const httpAdapters = new Set(httpSnapshot.records.map((item) => item.raw_json?.provenance?.adapter))
    if (!httpAdapters.has('http-record-json') || !httpAdapters.has('http-diagnostic-json') || !httpAdapters.has('http-status-diagnostic')) {
      throw new Error(`demo HTTP adapters were not preserved in provenance: ${[...httpAdapters].join(', ')}`)
    }
    const blockedProbe = httpSnapshot.records.find((item) => item.raw_json?.provenance?.adapter === 'http-status-diagnostic')
    if (!blockedProbe || blockedProbe.raw_json?.provenance?.stage !== 'blocked_http' || blockedProbe.subject !== 'Source diagnostics') {
      throw new Error(`HTTP status diagnostic record did not preserve blocked diagnostic evidence: ${JSON.stringify(blockedProbe)}`)
    }
    const httpRunMessages = httpSnapshot.source_runs?.map((run) => run.message).join('\n') ?? ''
    if (!httpRunMessages.includes('HTTP JSON adapter') || !httpRunMessages.includes('HTTP status diagnostic adapter')) {
      throw new Error(`demo HTTP source runs did not report adapters:\n${httpRunMessages}`)
    }
    const blockedRun = httpSnapshot.source_runs?.find((run) => run.source === 'HTTP blocked probe')
    if (blockedRun?.project_counts?.['Source diagnostics'] !== 1) {
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

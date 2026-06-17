import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
} finally {
  await rm(workDir, { recursive: true, force: true })
}

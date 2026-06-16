import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outDir = await mkdtemp(join(tmpdir(), 'verdun-crawler-provenance-'))
const itemsPath = join(outDir, 'items.json')
const sourceRunsPath = join(outDir, 'source-runs.json')
const publicPath = join(outDir, 'newsletter-snapshot.json')

try {
  const result = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--out',
    itemsPath,
    '--source-runs-out',
    sourceRunsPath,
    '--public-out',
    publicPath,
  ], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`crawler collect failed\n${result.stdout}\n${result.stderr}`)
  }

  const snapshot = JSON.parse(await readFile(publicPath, 'utf8'))
  if (!Array.isArray(snapshot.items) || snapshot.items.length < 13) {
    throw new Error('crawler provenance smoke expected watchlist seed items')
  }

  for (const item of snapshot.items) {
    const provenance = item.raw_json?.provenance
    if (!provenance) throw new Error(`${item.id} is missing raw_json.provenance`)
    if (provenance.stage !== item.raw_json.collection_stage) {
      throw new Error(`${item.id} provenance stage does not match collection_stage`)
    }
    if (!provenance.adapter || !provenance.source || !provenance.source_url) {
      throw new Error(`${item.id} provenance is missing source adapter metadata`)
    }
    if (provenance.project !== item.project) {
      throw new Error(`${item.id} provenance project does not match item project`)
    }
    if (provenance.evidence_url !== item.url) {
      throw new Error(`${item.id} provenance evidence URL does not match item URL`)
    }
    if (!Array.isArray(provenance.matched_keywords) || provenance.matched_keywords.length < 3) {
      throw new Error(`${item.id} provenance matched keywords are missing`)
    }
  }
} finally {
  await rm(outDir, { recursive: true, force: true })
}

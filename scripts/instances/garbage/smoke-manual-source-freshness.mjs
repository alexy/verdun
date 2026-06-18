import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'verdun-manual-source-'))
const now = Date.now()
const freshPublishedAt = new Date(now - 24 * 60 * 60 * 1000).toISOString()
const stalePublishedAt = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString()

try {
  await runManualSourceCase({
    name: 'fresh',
    publishedAt: freshPublishedAt,
    expectedStatus: 'ok',
    expectedItemCount: 1,
    expectedMessage: 'manual JSON import; 1 reviewed post',
  })
  await runManualSourceCase({
    name: 'stale',
    publishedAt: stalePublishedAt,
    expectedStatus: 'error',
    expectedItemCount: 0,
    expectedMessage: 'manual JSON import is stale',
  })
} finally {
  await rm(root, { recursive: true, force: true })
}

async function runManualSourceCase({ name, publishedAt, expectedStatus, expectedItemCount, expectedMessage }) {
  const manualPath = join(root, `${name}-linkedin.json`)
  const configPath = join(root, `${name}-watchlist.toml`)
  const itemsPath = join(root, `${name}-items.json`)
  const sourceRunsPath = join(root, `${name}-source-runs.json`)
  const snapshotPath = join(root, `${name}-snapshot.json`)
  await writeFile(manualPath, JSON.stringify([
    {
      title: 'Pydantic AI reviewed social note',
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${name}`,
      author: 'manual smoke',
      published_at: publishedAt,
      text: 'Pydantic keeps typed agent outputs auditable through structured outputs and validation.',
    },
  ], null, 2))
  await writeFile(configPath, `
theme = "Strongly typed and functional AI/data systems"

[[projects]]
name = "Pydantic"
topic = "typed AI"
homepage = "https://github.com/pydantic/pydantic-ai"
keywords = ["pydantic", "typed agents", "structured outputs", "validation"]

[[sources]]
name = "LinkedIn"
kind = "social"
url = "https://www.linkedin.com"
manual_path = "${tomlString(manualPath)}"
`.trimStart())

  const result = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--config',
    configPath,
    '--live',
    '--since-days',
    '7',
    '--out',
    itemsPath,
    '--source-runs-out',
    sourceRunsPath,
    '--public-out',
    snapshotPath,
  ], {
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`manual source ${name} collect failed\n${result.stdout}\n${result.stderr}`)
  }

  const sourceRuns = JSON.parse(await readFile(sourceRunsPath, 'utf8'))
  const run = sourceRuns.find((candidate) => candidate.source === 'LinkedIn')
  if (!run) throw new Error(`manual source ${name} did not record a LinkedIn source run`)
  if (run.status !== expectedStatus) {
    throw new Error(`manual source ${name} expected status ${expectedStatus}, found ${run.status}`)
  }
  if (run.item_count !== expectedItemCount) {
    throw new Error(`manual source ${name} expected ${expectedItemCount} items, found ${run.item_count}`)
  }
  if (!run.message.includes(expectedMessage)) {
    throw new Error(`manual source ${name} did not record expected freshness message: ${run.message}`)
  }
}

function tomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'verdun-crawler-dedupe-'))

try {
  const publishedAt = new Date().toISOString()
  const duplicateUrl = 'https://example.com/posts/pydantic-typed-agents?utm_source=linkedin'
  const linkedinPath = join(root, 'linkedin.json')
  const xPath = join(root, 'x-twitter.json')
  const configPath = join(root, 'watchlist.toml')
  const publicPath = join(root, 'snapshot.json')
  const sourceRunsPath = join(root, 'source-runs.json')
  const manualPost = {
    title: 'Pydantic typed agents in production',
    url: duplicateUrl,
    author: 'manual smoke',
    published_at: publishedAt,
    text: 'Pydantic typed agents and structured outputs are moving into production.',
  }
  await writeFile(linkedinPath, JSON.stringify([manualPost], null, 2))
  await writeFile(xPath, JSON.stringify([{ ...manualPost, url: `${duplicateUrl}#thread` }], null, 2))
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
manual_path = "${tomlString(linkedinPath)}"

[[sources]]
name = "X/Twitter"
kind = "social"
url = "https://x.com"
manual_path = "${tomlString(xPath)}"
`)

  const result = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--config',
    configPath,
    '--live',
    '--out',
    join(root, 'items.json'),
    '--source-runs-out',
    sourceRunsPath,
    '--public-out',
    publicPath,
  ], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`crawler dedupe collect failed\n${result.stdout}\n${result.stderr}`)
  }

  const snapshot = JSON.parse(await readFile(publicPath, 'utf8'))
  const matching = snapshot.items.filter((item) => item.url.startsWith('https://example.com/posts/pydantic-typed-agents'))
  if (matching.length !== 1) {
    throw new Error(`expected one deduped social item, found ${matching.length}`)
  }
  const duplicates = matching[0].raw_json?.duplicates ?? []
  if (!Array.isArray(duplicates) || duplicates.length !== 1) {
    throw new Error('deduped social item did not retain duplicate provenance')
  }
  if (!duplicates.some((duplicate) => duplicate.source === 'LinkedIn' || duplicate.source === 'X/Twitter')) {
    throw new Error('duplicate provenance did not record the losing source')
  }
  const sourceRuns = JSON.parse(await readFile(sourceRunsPath, 'utf8'))
  for (const source of ['LinkedIn', 'X/Twitter']) {
    const run = sourceRuns.find((candidate) => candidate.source === source)
    if (!run || run.status !== 'ok' || run.item_count !== 1) {
      throw new Error(`${source} source run did not preserve pre-dedupe source health`)
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

function tomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

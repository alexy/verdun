import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'verdun-feed-content-'))
const publishedAt = new Date().toUTCString()
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Smoke Substack</title>
    <item>
      <title>Catalogs for data platforms</title>
      <link>https://example.com/catalogs-for-data-platforms</link>
      <pubDate>${publishedAt}</pubDate>
      <description>A short teaser with no project name.</description>
      <content:encoded><![CDATA[
        <p>The useful bit is how Dagster asset graph metadata can make typed orchestration inspectable.</p>
      ]]></content:encoded>
    </item>
    <item>
      <title>Lineage catalogs for operational analytics</title>
      <link>https://example.com/lineage-catalogs</link>
      <pubDate>${publishedAt}</pubDate>
      <description>How catalogs make weekly data operations more inspectable.</description>
    </item>
  </channel>
</rss>`

const server = createServer((request, response) => {
  if (request.url !== '/feed') {
    response.writeHead(404)
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': 'application/rss+xml' })
  response.end(feed)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('could not bind feed server')

try {
  const configPath = join(root, 'watchlist.toml')
  const itemsPath = join(root, 'items.json')
  const sourceRunsPath = join(root, 'source-runs.json')
  const snapshotPath = join(root, 'snapshot.json')
  const editorialStatePath = join(root, 'editorial-state.json')
  await writeFile(configPath, `
theme = "Smoke typed data systems"

[[projects]]
name = "Dagster"
topic = "functional data orchestration"
homepage = "https://github.com/dagster-io/dagster"
keywords = ["dagster", "software-defined assets", "data orchestration", "asset graph", "python"]

[[sources]]
name = "Substack"
kind = "publication"
url = "https://substack.com"
feed_urls = ["http://127.0.0.1:${address.port}/feed"]
`)
  await writeFile(editorialStatePath, JSON.stringify({
    focuses: [
      {
        id: 'focus-feed-content',
        text: 'More Dagster material on lineage catalogs for operational analytics.',
        scope: 'this_week',
        created_at: new Date().toISOString(),
      },
    ],
  }))

  const result = await runCommand('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--config',
    configPath,
    '--live',
    '--editorial-state',
    editorialStatePath,
    '--max-live-per-project',
    '2',
    '--out',
    itemsPath,
    '--source-runs-out',
    sourceRunsPath,
    '--public-out',
    snapshotPath,
  ])
  if (result.status !== 0) {
    throw new Error(`feed-content collect failed\n${result.stdout}\n${result.stderr}`)
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const substackRun = snapshot.source_runs.find((run) => run.source === 'Substack')
  if (substackRun?.item_count !== 2 || substackRun.project_counts?.Dagster !== 2) {
    throw new Error(`Substack content:encoded match was not counted in the source run: ${JSON.stringify({ substackRun, items: snapshot.items }, null, 2)}`)
  }
  if (!snapshot.items.some((item) => item.source === 'Substack' && item.project === 'Dagster')) {
    throw new Error('Substack content:encoded match did not produce a Dagster item')
  }
  const focusMatched = snapshot.items.find((item) => item.url === 'https://example.com/lineage-catalogs')
  if (!focusMatched) {
    throw new Error('Substack focus-term match did not produce a Dagster item')
  }
  const matchedKeywords = focusMatched.raw_json?.provenance?.matched_keywords ?? []
  if (!matchedKeywords.includes('focus:catalogs')) {
    throw new Error(`focus-term provenance did not preserve the editorial match: ${JSON.stringify(matchedKeywords)}`)
  }
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await rm(root, { recursive: true, force: true })
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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

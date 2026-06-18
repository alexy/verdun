import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'verdun-grust-watchlist-'))

try {
  const grustRoot = join(root, 'grust')
  const watchlistPath = join(root, 'watchlist.toml')
  const outPath = join(root, 'audit.md')
  await mkdir(join(grustRoot, 'docs'), { recursive: true })
  await writeFile(join(grustRoot, 'Cargo.toml'), `[workspace]
members = [
  "crates/grust",
  "crates/grust-cocoindex",
  "crates/grust-falkor",
  "crates/grust-helix",
  "crates/grust-ladybug",
  "crates/grust-lancedb",
  "crates/grust-pggraph",
  "crates/grust-sail",
  "crates/grust-surreal",
]

[workspace.dependencies]
helix-db = "=2.0.0"
lbug = "0.17.1"
lancedb = "0.30.0"
redis = "1.2.1"
surrealdb = "3.1.0-beta.3"
tokio-postgres = "0.7.15"
garde = "0.23.0"
zod-rs = "1.0.1"
`)
  await writeFile(join(grustRoot, 'README.md'), 'Grust uses Apache Arrow, Arrow IPC, Spark Connect, Delta tables, CocoIndex, LanceDB, LadybugDB, FalkorDB, HelixDB, SurrealDB, and pgGraph backends.')
  await writeFile(join(grustRoot, 'docs', 'Arrow.md'), 'Apache Arrow and Arrow IPC define the tabular interchange story.')
  await writeFile(watchlistPath, watchlist([
    'Grust',
    'Grust Sail',
    'HelixDB',
    'SurrealDB',
    'pgGraph',
    'FalkorDB',
    'LadybugDB',
    'LanceDB',
    'CocoIndex',
    'Garde',
    'zod-rs',
    'Apache Arrow',
    'Delta Lake',
  ]))

  const result = runAudit({ grustRoot, watchlistPath, outPath })
  if (result.status !== 0) {
    throw new Error(`Grust watchlist audit failed\n${result.stdout}\n${result.stderr}`)
  }
  const markdown = await readFile(outPath, 'utf8')
  if (!markdown.includes('Coverage: 13 of 13 Grust-derived signals')) {
    throw new Error('Grust watchlist audit did not report complete coverage')
  }
  if (!markdown.includes('- Grust Sail:') || !markdown.includes('- Apache Arrow:')) {
    throw new Error('Grust watchlist audit did not include expected covered projects')
  }
  if (!markdown.includes('No missing Grust-derived projects.')) {
    throw new Error('Grust watchlist audit reported unexpected missing projects')
  }

  const missingWatchlistPath = join(root, 'missing-watchlist.toml')
  await writeFile(missingWatchlistPath, watchlist(['Grust']))
  const missingResult = runAudit({ grustRoot, watchlistPath: missingWatchlistPath, outPath: '-' })
  if (missingResult.status === 0) {
    throw new Error('Grust watchlist audit should fail when required projects are missing')
  }
  if (!missingResult.stderr.includes('HelixDB') || !missingResult.stderr.includes('Apache Arrow')) {
    throw new Error(`Grust watchlist audit did not name missing projects\n${missingResult.stderr}`)
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

function runAudit({ grustRoot, watchlistPath, outPath }) {
  return spawnSync('node', [
    'scripts/instances/garbage/grust-watchlist-audit.mjs',
    '--grust-root',
    grustRoot,
    '--watchlist',
    watchlistPath,
    '--out',
    outPath,
  ], { encoding: 'utf8' })
}

function watchlist(projects) {
  return projects.map((project) => `[[projects]]
name = "${project}"
topic = "fixture"
homepage = "https://example.com/${project.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"
keywords = ["${project.toLowerCase()}"]
`).join('\n')
}

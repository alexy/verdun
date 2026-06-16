import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-ulysses-state-'))
const exportDir = await mkdtemp(join(tmpdir(), 'verdun-ulysses-export-'))
const importDir = await mkdtemp(join(tmpdir(), 'verdun-ulysses-import-'))
const stateFile = join(stateDir, 'editorial-state.json')

try {
  await writeFile(stateFile, JSON.stringify({
    votes: {
      'grust-sail-3683deba292c': 1,
      'pydantic-d82c0f85d165': 1,
    },
    focuses: [
      {
        id: 'focus-smoke-ulysses-ready',
        text: 'More strongly typed graph and lakehouse items ready for Ulysses editing.',
        scope: 'this_week',
        created_at: '2026-06-15T16:00:00Z',
      },
    ],
  }))

  const result = spawnSync('npm', ['run', 'ulysses:ready'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ULYSSES_DRAFT_DIR: exportDir,
      ULYSSES_IMPORT_DIR: importDir,
      VERDUN_LOCAL_STATE_FILE: stateFile,
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`ulysses:ready failed\n${result.stdout}\n${result.stderr}`)
  }

  const files = await readdir(exportDir)
  const markdownFiles = files.filter((file) => file.endsWith('.md'))
  const manifestFiles = files.filter((file) => file.endsWith('.manifest.json'))
  if (markdownFiles.length !== 1) {
    throw new Error(`expected one Ulysses Markdown export, found ${markdownFiles.length}`)
  }
  if (manifestFiles.length !== 1) {
    throw new Error(`expected one Ulysses publish manifest, found ${manifestFiles.length}`)
  }
  if (!markdownFiles[0].startsWith('2026-06-15-strongly-typed-ai-data-notes-')) {
    throw new Error(`unexpected Ulysses export filename: ${markdownFiles[0]}`)
  }
  if (manifestFiles[0] !== markdownFiles[0].replace(/\.md$/, '.manifest.json')) {
    throw new Error(`unexpected Ulysses manifest filename: ${manifestFiles[0]}`)
  }

  const markdown = await readFile(join(exportDir, markdownFiles[0]), 'utf8')
  const manifest = JSON.parse(await readFile(join(exportDir, manifestFiles[0]), 'utf8'))
  if (!markdown.includes('## Editorial brief')) {
    throw new Error('Ulysses export is missing the editorial brief')
  }
  if (!markdown.includes('This week: More strongly typed graph and lakehouse items ready for Ulysses editing.')) {
    throw new Error('Ulysses export is missing local this-week focus')
  }
  if (!markdown.includes('## Coverage gaps')) {
    throw new Error('Ulysses export is missing source coverage gaps')
  }
  if (!markdown.includes('Grust Sail')) {
    throw new Error('Ulysses export is missing the locally upvoted Grust Sail item')
  }
  if (manifest.markdownPath !== join(exportDir, markdownFiles[0])) {
    throw new Error('Ulysses manifest did not record the paired Markdown path')
  }
  if (manifest.snapshotInput !== 'public/data/newsletter-snapshot.json') {
    throw new Error('Ulysses manifest did not record the snapshot input')
  }
  if (manifest.readiness?.status !== 'ready') {
    throw new Error('Ulysses manifest did not record ready publishing status')
  }
  if (manifest.gates?.requireUpvotes !== true || manifest.gates?.requireReady !== true) {
    throw new Error('Ulysses manifest did not record active publishing gates')
  }
  if (!manifest.itemIds?.includes('grust-sail-3683deba292c')) {
    throw new Error('Ulysses manifest is missing the selected Grust Sail item id')
  }
  if (manifest.votes?.['grust-sail-3683deba292c'] !== 1) {
    throw new Error('Ulysses manifest is missing local vote state')
  }
  if (!manifest.focuses?.some((focus) => focus.id === 'focus-smoke-ulysses-ready')) {
    throw new Error('Ulysses manifest is missing local focus state')
  }
  if (!manifest.selectedItems?.some((item) => item.id === 'grust-sail-3683deba292c' && item.project === 'Grust Sail' && item.url)) {
    throw new Error('Ulysses manifest is missing selected item metadata')
  }
  if (!Array.isArray(manifest.sourceCoverage?.uncoveredProjects)) {
    throw new Error('Ulysses manifest is missing source coverage details')
  }
  if (manifest.queryPlanCount !== 23) {
    throw new Error(`Ulysses manifest recorded unexpected query plan count: ${manifest.queryPlanCount}`)
  }

  const importFiles = await readdir(importDir)
  if (!importFiles.includes(markdownFiles[0]) || !importFiles.includes(manifestFiles[0])) {
    throw new Error('Ulysses import handoff did not receive the Markdown and manifest pair')
  }
  const copiedMarkdown = await readFile(join(importDir, markdownFiles[0]), 'utf8')
  const copiedManifest = await readFile(join(importDir, manifestFiles[0]), 'utf8')
  if (copiedMarkdown !== markdown) {
    throw new Error('Ulysses import Markdown copy does not match the generated export')
  }
  if (copiedManifest !== JSON.stringify(manifest, null, 2) + '\n') {
    throw new Error('Ulysses import manifest copy does not match the generated export')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
  await rm(exportDir, { recursive: true, force: true })
  await rm(importDir, { recursive: true, force: true })
}

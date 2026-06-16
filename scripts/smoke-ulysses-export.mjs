import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-ulysses-state-'))
const exportDir = await mkdtemp(join(tmpdir(), 'verdun-ulysses-export-'))
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
      VERDUN_LOCAL_STATE_FILE: stateFile,
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`ulysses:ready failed\n${result.stdout}\n${result.stderr}`)
  }

  const files = await readdir(exportDir)
  const markdownFiles = files.filter((file) => file.endsWith('.md'))
  if (markdownFiles.length !== 1) {
    throw new Error(`expected one Ulysses Markdown export, found ${markdownFiles.length}`)
  }
  if (!markdownFiles[0].startsWith('2026-06-15-strongly-typed-ai-data-notes-')) {
    throw new Error(`unexpected Ulysses export filename: ${markdownFiles[0]}`)
  }

  const markdown = await readFile(join(exportDir, markdownFiles[0]), 'utf8')
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
} finally {
  await rm(stateDir, { recursive: true, force: true })
  await rm(exportDir, { recursive: true, force: true })
}

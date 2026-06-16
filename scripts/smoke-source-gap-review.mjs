import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'verdun-source-gaps-'))

try {
  const snapshotPath = join(root, 'snapshot.json')
  const outPath = join(root, 'source-gap-review.md')
  await writeFile(snapshotPath, JSON.stringify({
    generated_at: '2026-06-16T15:00:00Z',
    query_plans: [
      {
        project: 'Pydantic',
        topic: 'typed AI',
        hacker_news_query: 'Pydantic pydantic',
        live_terms: ['pydantic'],
        dev_to_tags: ['pydantic'],
        review_targets: [
          {
            source: 'Hacker News',
            label: 'HN: Pydantic pydantic',
            url: 'https://hn.algolia.com/?query=Pydantic+pydantic',
            adapter: 'hn-algolia',
          },
        ],
      },
      {
        project: 'BAML',
        topic: 'typed LLM functions',
        hacker_news_query: 'BAML baml',
        live_terms: ['baml'],
        dev_to_tags: ['baml'],
        focus_terms: ['structured outputs'],
        review_targets: [
          {
            source: 'LinkedIn',
            label: 'LinkedIn posts: BAML baml',
            url: 'https://www.linkedin.com/search/results/content/?keywords=BAML+baml',
            adapter: 'manual-review',
          },
          {
            source: 'Hacker News',
            label: 'HN: BAML baml',
            url: 'https://hn.algolia.com/?query=BAML+baml',
            adapter: 'hn-algolia',
          },
        ],
      },
    ],
    source_runs: [
      {
        source: 'Hacker News',
        status: 'ok',
        item_count: 1,
        project_counts: { Pydantic: 1 },
      },
    ],
  }, null, 2))

  const result = spawnSync('node', [
    'scripts/source-gap-review.mjs',
    '--snapshot',
    snapshotPath,
    '--out',
    outPath,
  ], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`source gap review failed\n${result.stdout}\n${result.stderr}`)
  }

  const markdown = await readFile(outPath, 'utf8')
  if (!markdown.includes('# Source Gap Review: 2026-06-16')) {
    throw new Error('source gap review did not include the issue date')
  }
  if (!markdown.includes('Coverage: 1 of 2 watched projects')) {
    throw new Error('source gap review did not summarize coverage')
  }
  if (!markdown.includes('## BAML') || markdown.includes('## Pydantic')) {
    throw new Error('source gap review did not isolate the uncovered project')
  }
  if (!markdown.includes('- [ ] Hacker News: [HN: BAML baml]') || !markdown.includes('- [ ] LinkedIn: [LinkedIn posts: BAML baml]')) {
    throw new Error('source gap review did not include the expected review targets')
  }
  if (!markdown.includes('Editorial focus terms: `structured outputs`')) {
    throw new Error('source gap review did not include focus terms')
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

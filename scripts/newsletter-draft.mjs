import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runnerImport } from 'vite'

const fallbackFocuses = [
  {
    id: 'focus-local-first-graphs',
    text: 'More strongly typed graph/database work that can run locally before cloud deployment.',
    scope: 'ongoing',
    createdAt: new Date().toISOString(),
  },
]
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const ulyssesMode = args.includes('--ulysses')
  const positional = args.filter((arg) => arg !== '--ulysses')
  const input = positional[0] ?? process.env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
  const snapshot = await loadSnapshotFile(input)
  const draft = await buildNewsletterDraft(snapshot)
  const out = positional[1] ?? process.env.NEWSLETTER_DRAFT_OUT ?? defaultDraftPath(draft, snapshot, ulyssesMode)

  if (out) {
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, draft.markdown)
    console.log(`wrote newsletter draft to ${out}`)
  } else {
    process.stdout.write(draft.markdown)
  }
}

export async function buildNewsletterDraft(snapshot) {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.buildNewsletterDraft(snapshot)
}

export async function loadSnapshotFile(input) {
  return normalizeSnapshot(JSON.parse(await readFile(input, 'utf8')))
}

export function defaultDraftPath(draft, snapshot, ulyssesMode = false) {
  if (!ulyssesMode) return 'crawler/data/newsletter-draft.md'
  const exportDir = process.env.ULYSSES_DRAFT_DIR ?? 'crawler/data/ulysses'
  const dateStem = isoDate(snapshot.generatedAt)
  return join(exportDir, `${dateStem}-${slug(draft.title)}.md`)
}

export function normalizeSnapshot(raw) {
  return {
    generatedAt: raw.generated_at ?? raw.generatedAt ?? new Date().toISOString(),
    theme: raw.theme ?? 'Strongly typed and functional AI/data systems',
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      sourceKind: item.source_kind ?? item.sourceKind,
      url: item.url,
      publishedAt: item.published_at ?? item.publishedAt,
      project: item.project,
      topic: item.topic,
      summary: item.summary,
      whyItMatters: item.why_it_matters ?? item.whyItMatters,
      tags: item.tags ?? [],
      score: item.score ?? 0,
      vote: item.vote ?? 0,
    })),
    focuses: (raw.focuses ?? fallbackFocuses).map((focus) => ({
      id: focus.id,
      text: focus.text,
      scope: focus.scope === 'ongoing' ? 'ongoing' : 'this_week',
      createdAt: focus.created_at ?? focus.createdAt ?? new Date().toISOString(),
    })),
    sourceRuns: (raw.source_runs ?? raw.sourceRuns ?? []).map((run) => ({
      source: run.source,
      kind: run.kind,
      status: run.status,
      itemCount: run.item_count ?? run.itemCount ?? 0,
      message: run.message,
    })),
  }
}

function isoDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

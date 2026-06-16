import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
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
  const cli = parseCliArgs(args)
  const ulyssesMode = cli.flags.has('--ulysses')
  const requireUpvotes = cli.flags.has('--require-upvotes') || process.env.NEWSLETTER_REQUIRE_UPVOTES === 'true'
  const requireReady = cli.flags.has('--require-ready') || process.env.NEWSLETTER_REQUIRE_READY === 'true'
  const ulyssesImportDir = cli.values.get('--ulysses-import-dir') ?? process.env.ULYSSES_IMPORT_DIR
  const positional = cli.positional
  const input = positional[0] ?? process.env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
  const snapshot = await loadSnapshotFile(input)
  const draft = await buildNewsletterDraft(snapshot)
  await assertDraftReady(snapshot, draft, { requireUpvotes, requireReady })
  const out = positional[1] ?? process.env.NEWSLETTER_DRAFT_OUT ?? defaultDraftPath(draft, snapshot, ulyssesMode)

  if (out) {
    const { manifestPath } = await writeDraftArtifacts(out, draft, snapshot, {
      markdownPath: out,
      snapshotInput: input,
      requireReady,
      requireUpvotes,
      ulyssesMode,
    })
    console.log(`wrote newsletter draft to ${out}`)
    console.log(`wrote publish manifest to ${manifestPath}`)
    const handoff = await copyDraftArtifacts(out, manifestPath, ulyssesImportDir)
    if (handoff) {
      console.log(`copied Ulysses Markdown to ${handoff.markdownPath}`)
      console.log(`copied Ulysses manifest to ${handoff.manifestPath}`)
    }
  } else {
    process.stdout.write(draft.markdown)
  }
}

function parseCliArgs(args) {
  const flags = new Set()
  const values = new Map()
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--ulysses' || arg === '--require-upvotes' || arg === '--require-ready') {
      flags.add(arg)
    } else if (arg === '--ulysses-import-dir') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--ulysses-import-dir requires a directory path')
      values.set(arg, value)
      index += 1
    } else {
      positional.push(arg)
    }
  }
  return { flags, values, positional }
}

export async function buildNewsletterDraft(snapshot) {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.buildNewsletterDraft(snapshot)
}

export async function evaluateNewsletterReadiness(snapshot) {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.evaluateNewsletterReadiness(snapshot)
}

export async function evaluateSourceCoverage(snapshot) {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.evaluateSourceCoverage(snapshot)
}

export async function sharedBuildPublishManifest(draft, snapshot, options = {}) {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.buildPublishManifest(draft, snapshot, options)
}

export async function loadSnapshotFile(input) {
  return applyLocalEditorialState(normalizeSnapshot(await readSnapshotInput(input)))
}

export async function readSnapshotInput(input) {
  if (isHttpUrl(input)) {
    const response = await fetch(input)
    if (!response.ok) throw new Error(`snapshot URL returned ${response.status}`)
    return await response.json()
  }
  return JSON.parse(await readFile(input, 'utf8'))
}

export async function assertDraftReady(snapshot, draft, options = {}) {
  if (options.requireUpvotes) {
    const selectedVotes = new Map(snapshot.items.map((item) => [item.id, item.vote]))
    const selectedUpvotes = draft.itemIds.filter((itemId) => selectedVotes.get(itemId) > 0)
    if (!selectedUpvotes.length) {
      throw new Error('Draft requires at least one upvoted item. Upvote items in the app or unset NEWSLETTER_REQUIRE_UPVOTES.')
    }
  }

  if (options.requireReady) {
    const readiness = await evaluateNewsletterReadiness(snapshot)
    if (readiness.status !== 'ready') {
      const failedChecks = readiness.checks
        .filter((check) => !check.passed)
        .map((check) => `${check.label}: ${check.detail}`)
      const details = failedChecks.length ? failedChecks.join(' ') : readiness.summary
      throw new Error(`Draft is not publishing-ready. ${details}`)
    }
  }
}

export function defaultDraftPath(draft, snapshot, ulyssesMode = false) {
  if (!ulyssesMode) return 'crawler/data/newsletter-draft.md'
  const exportDir = process.env.ULYSSES_DRAFT_DIR ?? 'crawler/data/ulysses'
  const dateStem = isoDate(snapshot.generatedAt)
  return join(exportDir, `${dateStem}-${slug(draft.title)}.md`)
}

export async function writeDraftArtifacts(out, draft, snapshot, options = {}) {
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, draft.markdown)
  const manifestPath = manifestPathForDraft(out)
  await writeFile(manifestPath, `${JSON.stringify(await buildPublishManifest(draft, snapshot, options), null, 2)}\n`)
  return { manifestPath }
}

export async function copyDraftArtifacts(markdownPath, manifestPath, importDir) {
  if (!importDir) return null
  await mkdir(importDir, { recursive: true })
  const copiedMarkdownPath = join(importDir, basename(markdownPath))
  const copiedManifestPath = join(importDir, basename(manifestPath))
  if (resolve(markdownPath) !== resolve(copiedMarkdownPath)) {
    await copyFile(markdownPath, copiedMarkdownPath)
  }
  if (resolve(manifestPath) !== resolve(copiedManifestPath)) {
    await copyFile(manifestPath, copiedManifestPath)
  }
  return {
    markdownPath: copiedMarkdownPath,
    manifestPath: copiedManifestPath,
  }
}

export function manifestPathForDraft(out) {
  return out.endsWith('.md') ? out.replace(/\.md$/, '.manifest.json') : `${out}.manifest.json`
}

export async function buildPublishManifest(draft, snapshot, options = {}) {
  return sharedBuildPublishManifest(draft, snapshot, options)
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
      provenance: normalizeProvenance(item.provenance ?? rawJsonProvenance(item.raw_json), item),
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
      projectCounts: normalizeProjectCounts(run.project_counts ?? run.projectCounts),
    })),
    queryPlans: (raw.query_plans ?? raw.queryPlans ?? []).map((plan) => ({
      project: plan.project,
      topic: plan.topic ?? '',
      hackerNewsQuery: plan.hacker_news_query ?? plan.hackerNewsQuery ?? '',
      liveTerms: plan.live_terms ?? plan.liveTerms ?? [],
      devToTags: plan.dev_to_tags ?? plan.devToTags ?? [],
      focusTerms: plan.focus_terms ?? plan.focusTerms ?? [],
    })),
  }
}

function rawJsonProvenance(rawJson) {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return null
  return rawJson.provenance ?? rawJson
}

function normalizeProvenance(raw, item) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const stage = stringValue(raw.stage ?? raw.collection_stage)
  const source = stringValue(raw.source) || stringValue(item.source) || 'Unknown'
  const evidenceUrl = stringValue(raw.evidence_url) || stringValue(item.url)
  if (!stage || !source || !evidenceUrl) return undefined
  return {
    stage,
    adapter: stringValue(raw.adapter) || source,
    source,
    sourceKind: stringValue(raw.source_kind) || stringValue(item.source_kind ?? item.sourceKind) || 'unknown',
    sourceUrl: stringValue(raw.source_url) || evidenceUrl,
    evidenceUrl,
    project: stringValue(raw.project) || stringValue(item.project) || 'Unknown',
    matchedKeywords: Array.isArray(raw.matched_keywords)
      ? raw.matched_keywords.map((keyword) => String(keyword)).filter(Boolean)
      : [],
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

export function applyLocalEditorialState(snapshot) {
  if (process.env.NEWSLETTER_APPLY_LOCAL_STATE === 'false') return snapshot
  const state = readLocalEditorialState()
  if (!state) return snapshot
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item, vote: state.votes[item.id] ?? item.vote })),
    focuses: [...state.focuses, ...snapshot.focuses].slice(0, 25),
  }
}

function readLocalEditorialState() {
  const path = process.env.VERDUN_LOCAL_STATE_FILE ?? join(process.cwd(), 'crawler', 'data', 'editorial-state.json')
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const votes = normalizeVotes(raw.votes)
    const focuses = normalizeFocuses(raw.focuses)
    if (!Object.keys(votes).length && !focuses.length) return null
    return { votes, focuses }
  } catch {
    return null
  }
}

function normalizeVotes(votes) {
  if (!votes || typeof votes !== 'object' || Array.isArray(votes)) return {}
  return Object.fromEntries(
    Object.entries(votes)
      .map(([itemId, rawVote]) => [itemId, Number(rawVote)])
      .filter(([, vote]) => vote === -1 || vote === 0 || vote === 1),
  )
}

function normalizeFocuses(focuses) {
  if (!Array.isArray(focuses)) return []
  return focuses
    .map((focus) => normalizeFocus(focus))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 25)
}

function normalizeFocus(focus) {
  if (!focus || typeof focus !== 'object' || Array.isArray(focus)) return null
  const text = typeof focus.text === 'string' ? focus.text.trim() : ''
  if (!text) return null
  return {
    id: typeof focus.id === 'string' && focus.id ? focus.id : `local-${Date.now()}`,
    text,
    scope: focus.scope === 'ongoing' ? 'ongoing' : 'this_week',
    createdAt: typeof focus.created_at === 'string'
      ? focus.created_at
      : typeof focus.createdAt === 'string'
        ? focus.createdAt
        : new Date().toISOString(),
  }
}

function normalizeProjectCounts(projectCounts) {
  if (!projectCounts || typeof projectCounts !== 'object' || Array.isArray(projectCounts)) return {}
  return Object.fromEntries(
    Object.entries(projectCounts)
      .map(([project, count]) => [project, Number(count)])
      .filter(([project, count]) => project && Number.isFinite(count) && count > 0),
  )
}

function isHttpUrl(value) {
  return value.startsWith('http://') || value.startsWith('https://')
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

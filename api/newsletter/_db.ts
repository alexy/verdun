import { neon } from '@neondatabase/serverless'
import { seedSnapshot, type NewsletterFocus, type NewsletterSnapshot, type NewsItem, type NewsItemProvenance, type ProjectQueryPlan, type SourceRunStatus, type VoteValue } from '../../src/lib/newsletter'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

declare const process: {
  env: Record<string, string | undefined>
  cwd: () => string
}

type NewsRow = {
  id: string
  title: string
  source: string
  source_kind: string
  url: string
  published_at: string
  project: string
  topic: string
  summary: string
  why_it_matters: string
  tags: string[]
  score: number
  raw_json?: unknown
  vote: VoteValue | null
}

type FocusRow = {
  id: string
  text: string
  scope: 'this_week' | 'ongoing'
  created_at: string
}

type SourceRunRow = {
  source: string
  kind: string
  status: SourceRunStatus
  item_count: number
  message: string
  project_counts?: Record<string, unknown> | null
}

type QueryPlanRow = {
  project: string
  topic: string
  hacker_news_query: string
  live_terms: string[]
  dev_to_tags: string[]
  focus_terms: string[]
}

type StaticNewsRow = {
  id: string
  title: string
  source: string
  source_kind: string
  url: string
  published_at: string
  project: string
  topic: string
  summary: string
  why_it_matters: string
  tags: string[]
  score: number
  raw_json?: unknown
}

type StaticSourceRun = {
  source: string
  kind: string
  status: 'ok' | 'error' | 'pending' | 'skipped'
  item_count: number
  message: string
  project_counts?: Record<string, unknown>
}

type StaticQueryPlan = {
  project: string
  topic: string
  hacker_news_query: string
  live_terms: string[]
  dev_to_tags: string[]
  focus_terms?: string[]
}

type StaticSnapshot = {
  generated_at: string
  theme: string
  items: StaticNewsRow[]
  source_runs: StaticSourceRun[]
  query_plans?: StaticQueryPlan[]
}

type LocalEditorialState = {
  votes: Record<string, VoteValue>
  focuses: FocusRow[]
}

export async function readSnapshot(): Promise<NewsletterSnapshot> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) return withLocalEditorialState(readStaticSnapshot() ?? seedSnapshot)
  const sql = neon(databaseUrl)
  const rows = await sql.query(`
    select
      i.id,
      i.title,
      i.source,
      i.source_kind,
      i.url,
      i.published_at::text,
      i.project,
      i.topic,
      i.summary,
      i.why_it_matters,
      i.tags,
      i.score,
      i.raw_json,
      coalesce(v.vote, 0)::int as vote
    from newsletter_items i
    left join newsletter_votes v on v.item_id = i.id
    order by coalesce(v.vote, 0) desc, i.score desc, i.published_at desc
    limit 250
  `) as NewsRow[]
  const focusRows = await sql.query(`
    select id, text, scope, created_at::text
    from newsletter_focuses
    order by created_at desc
    limit 25
  `) as FocusRow[]
  const sourceRunRows = await sql.query(`
    select source, kind, status, item_count, message, project_counts
    from newsletter_source_runs
    order by
      case status when 'ok' then 0 when 'error' then 1 when 'pending' then 2 else 3 end,
      source
  `) as SourceRunRow[]
  const queryPlanRows = await sql.query(`
    select project, topic, hacker_news_query, live_terms, dev_to_tags, focus_terms
    from newsletter_query_plans
    order by project
  `) as QueryPlanRow[]

  return {
    generatedAt: new Date().toISOString(),
    theme: 'Strongly typed and functional AI/data systems',
    items: rows.map(toNewsItem),
    focuses: focusRows.map(toFocus),
    sourceRuns: sourceRunRows.map(toSourceRun),
    queryPlans: queryPlanRows.map(toQueryPlan),
  }
}

function readStaticSnapshot(): NewsletterSnapshot | null {
  const snapshotPath = join(process.cwd(), 'public', 'data', 'newsletter-snapshot.json')
  if (existsSync(snapshotPath)) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as StaticSnapshot
    return {
      generatedAt: snapshot.generated_at,
      theme: snapshot.theme,
      items: snapshot.items.map(toStaticNewsItem),
      focuses: seedSnapshot.focuses,
      sourceRuns: snapshot.source_runs.map((run) => ({
        source: run.source,
        kind: run.kind,
        status: run.status,
        itemCount: run.item_count,
        message: run.message,
        projectCounts: normalizeProjectCounts(run.project_counts),
      })),
      queryPlans: (snapshot.query_plans ?? []).map(toQueryPlan),
    }
  }

  const itemsPath = join(process.cwd(), 'public', 'data', 'newsletter-items.json')
  if (!existsSync(itemsPath)) return null
  const rows = JSON.parse(readFileSync(itemsPath, 'utf8')) as StaticNewsRow[]
  return {
    generatedAt: new Date().toISOString(),
    theme: 'Strongly typed and functional AI/data systems',
    items: rows.map(toStaticNewsItem),
    focuses: seedSnapshot.focuses,
    sourceRuns: [],
    queryPlans: [],
  }
}

export async function writeVote(itemId: string, vote: VoteValue): Promise<void> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) {
    const state = readLocalEditorialState()
    if (vote === 0) {
      delete state.votes[itemId]
    } else {
      state.votes[itemId] = vote
    }
    writeLocalEditorialState(state)
    return
  }
  const sql = neon(databaseUrl)
  await sql.query(`
    insert into newsletter_votes (item_id, vote, updated_at)
    values ($1, $2, now())
    on conflict (item_id)
    do update set vote = excluded.vote, updated_at = excluded.updated_at
  `, [itemId, vote])
}

export async function writeFocus(text: string, scope: 'this_week' | 'ongoing'): Promise<NewsletterFocus | null> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) {
    const state = readLocalEditorialState()
    const focus: FocusRow = {
      id: randomUUID(),
      text,
      scope,
      created_at: new Date().toISOString(),
    }
    state.focuses = [focus, ...state.focuses].slice(0, 25)
    writeLocalEditorialState(state)
    return toFocus(focus)
  }
  const sql = neon(databaseUrl)
  const rows = await sql.query(`
    insert into newsletter_focuses (text, scope)
    values ($1, $2)
    returning id, text, scope, created_at::text
  `, [text, scope]) as FocusRow[]
  return rows[0] ? toFocus(rows[0]) : null
}

function newsletterDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
}

function withLocalEditorialState(snapshot: NewsletterSnapshot): NewsletterSnapshot {
  const state = readLocalEditorialState()
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item, vote: state.votes[item.id] ?? item.vote })),
    focuses: [...state.focuses.map(toFocus), ...snapshot.focuses].slice(0, 25),
  }
}

function readLocalEditorialState(): LocalEditorialState {
  const path = localEditorialStatePath()
  if (!existsSync(path)) return emptyLocalEditorialState()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LocalEditorialState>
    return {
      votes: normalizeVotes(raw.votes),
      focuses: normalizeFocusRows(raw.focuses),
    }
  } catch {
    return emptyLocalEditorialState()
  }
}

function writeLocalEditorialState(state: LocalEditorialState): void {
  const path = localEditorialStatePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}

function localEditorialStatePath(): string {
  return process.env.VERDUN_LOCAL_STATE_FILE ?? join(process.cwd(), 'crawler', 'data', 'editorial-state.json')
}

function emptyLocalEditorialState(): LocalEditorialState {
  return { votes: {}, focuses: [] }
}

function normalizeVotes(votes: unknown): Record<string, VoteValue> {
  if (!votes || typeof votes !== 'object' || Array.isArray(votes)) return {}
  const normalized: Record<string, VoteValue> = {}
  for (const [itemId, rawVote] of Object.entries(votes)) {
    const vote = Number(rawVote)
    if (vote === -1 || vote === 0 || vote === 1) normalized[itemId] = vote
  }
  return normalized
}

function normalizeFocusRows(focuses: unknown): FocusRow[] {
  if (!Array.isArray(focuses)) return []
  return focuses
    .map((focus) => normalizeFocusRow(focus))
    .filter((focus): focus is FocusRow => Boolean(focus))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 25)
}

function normalizeFocusRow(focus: unknown): FocusRow | null {
  if (!focus || typeof focus !== 'object' || Array.isArray(focus)) return null
  const row = focus as Record<string, unknown>
  const text = typeof row.text === 'string' ? row.text.trim() : ''
  if (!text) return null
  return {
    id: typeof row.id === 'string' && row.id ? row.id : randomUUID(),
    text,
    scope: row.scope === 'ongoing' ? 'ongoing' : 'this_week',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    sourceKind: row.source_kind,
    url: row.url,
    publishedAt: row.published_at,
    project: row.project,
    topic: row.topic,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    tags: row.tags ?? [],
    score: row.score,
    vote: row.vote ?? 0,
    provenance: normalizeProvenance(row.raw_json, row),
  }
}

function toStaticNewsItem(row: StaticNewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    sourceKind: row.source_kind,
    url: row.url,
    publishedAt: row.published_at,
    project: row.project,
    topic: row.topic,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    tags: row.tags ?? [],
    score: row.score,
    vote: 0,
    provenance: normalizeProvenance(row.raw_json, row),
  }
}

function normalizeProvenance(rawJson: unknown, row: NewsRow | StaticNewsRow): NewsItemProvenance | undefined {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return undefined
  const record = rawJson as Record<string, unknown>
  const provenance = record.provenance && typeof record.provenance === 'object' && !Array.isArray(record.provenance)
    ? record.provenance as Record<string, unknown>
    : record
  const stage = stringValue(provenance.stage ?? provenance.collection_stage)
  const source = stringValue(provenance.source) || row.source
  const evidenceUrl = stringValue(provenance.evidence_url) || row.url
  if (!stage || !source || !evidenceUrl) return undefined
  return {
    stage,
    adapter: stringValue(provenance.adapter) || source,
    source,
    sourceKind: stringValue(provenance.source_kind) || row.source_kind,
    sourceUrl: stringValue(provenance.source_url) || evidenceUrl,
    evidenceUrl,
    project: stringValue(provenance.project) || row.project,
    matchedKeywords: Array.isArray(provenance.matched_keywords)
      ? provenance.matched_keywords.map((keyword) => String(keyword)).filter(Boolean)
      : [],
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toFocus(row: FocusRow): NewsletterFocus {
  return {
    id: row.id,
    text: row.text,
    scope: row.scope,
    createdAt: row.created_at,
  }
}

function toSourceRun(row: SourceRunRow) {
  return {
    source: row.source,
    kind: row.kind,
    status: row.status,
    itemCount: row.item_count,
    message: row.message,
    projectCounts: normalizeProjectCounts(row.project_counts),
  }
}

function toQueryPlan(row: StaticQueryPlan | QueryPlanRow): ProjectQueryPlan {
  return {
    project: row.project,
    topic: row.topic,
    hackerNewsQuery: row.hacker_news_query,
    liveTerms: row.live_terms ?? [],
    devToTags: row.dev_to_tags ?? [],
    focusTerms: row.focus_terms ?? [],
  }
}

function normalizeProjectCounts(projectCounts: unknown): Record<string, number> {
  if (!projectCounts || typeof projectCounts !== 'object' || Array.isArray(projectCounts)) return {}
  const normalized: Record<string, number> = {}
  for (const [project, rawCount] of Object.entries(projectCounts)) {
    const count = Number(rawCount)
    if (project && Number.isFinite(count) && count > 0) normalized[project] = count
  }
  return normalized
}

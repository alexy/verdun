/// <reference types="node" />

import { neon } from '@neondatabase/serverless'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { garbageInstance, garbageSeedFocuses } from '../../../src/instances/garbage/config'
import type { SourceRunStatus } from '../../../src/core/workbench'

declare const process: {
  env: Record<string, string | undefined>
  cwd: () => string
}

type SqlClient = ReturnType<typeof neon>

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

export type VoteValue = -1 | 0 | 1

type NewsletterFocus = {
  id: string
  text: string
  scope: 'this_week' | 'ongoing'
  createdAt: string
}

type NewsItemProvenance = {
  stage: string
  adapter: string
  source: string
  sourceKind: string
  sourceUrl: string
  evidenceUrl: string
  project: string
  matchedKeywords: string[]
}

type NewsItem = {
  id: string
  title: string
  source: string
  sourceKind: string
  url: string
  publishedAt: string
  project: string
  topic: string
  summary: string
  whyItMatters: string
  tags: string[]
  score: number
  vote: VoteValue
  provenance?: NewsItemProvenance
}

type SourceRun = {
  source: string
  kind: string
  status: SourceRunStatus
  itemCount: number
  message: string
  projectCounts: Record<string, number>
}

type ProjectQueryPlan = {
  project: string
  topic: string
  hackerNewsQuery: string
  liveTerms: string[]
  devToTags: string[]
  reviewTargets: ReviewTarget[]
  focusTerms: string[]
}

type ReviewTarget = {
  source: string
  label: string
  url: string
  adapter: string
}

type NewsletterSnapshot = {
  generatedAt: string
  theme: string
  editorialPersistence: 'database' | 'local_file' | 'browser'
  items: NewsItem[]
  focuses: NewsletterFocus[]
  sourceRuns: SourceRun[]
  queryPlans: ProjectQueryPlan[]
}

export type NewsletterStatus = {
  editorialPersistence: NewsletterSnapshot['editorialPersistence']
  generatedAt: string
  itemCount: number
  focusCount: number
  voteCount: number
  sourceRunCount: number
  queryPlanCount: number
  writable: boolean
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
  review_targets?: unknown
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
  review_targets?: unknown
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

export type EditorialStateImportResult = {
  importedFocuses: number
  importedVotes: number
}

type DatabaseSnapshotOptions = {
  sql?: SqlClient
  databaseUrl?: string
}

const seedFocuses: NewsletterFocus[] = garbageSeedFocuses

export async function readSnapshot(): Promise<NewsletterSnapshot> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) return withLocalEditorialState(readStaticSnapshot() ?? emptySnapshot())
  return readDatabaseSnapshot({ databaseUrl })
}

export async function readDatabaseSnapshot(options: DatabaseSnapshotOptions): Promise<NewsletterSnapshot> {
  const databaseUrl = options.databaseUrl ?? newsletterDatabaseUrl()
  const sql = options.sql ?? neon(databaseUrl ?? '')
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
    select project, topic, hacker_news_query, live_terms, dev_to_tags, review_targets, focus_terms
    from newsletter_query_plans
    order by project
  `) as QueryPlanRow[]
  const generatedAt = await readDatabaseGeneratedAt(sql)

  return {
    generatedAt,
    theme: garbageInstance.theme,
    editorialPersistence: 'database',
    items: rows.map(toNewsItem),
    focuses: focusRows.map(toFocus),
    sourceRuns: sourceRunRows.map(toSourceRun),
    queryPlans: queryPlanRows.map(toQueryPlan),
  }
}

export async function readStatus(): Promise<NewsletterStatus> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) {
    const snapshot = withLocalEditorialState(readStaticSnapshot() ?? emptySnapshot())
    return {
      editorialPersistence: snapshot.editorialPersistence,
      generatedAt: snapshot.generatedAt,
      itemCount: snapshot.items.length,
      focusCount: snapshot.focuses.length,
      voteCount: snapshot.items.filter((item) => item.vote !== 0).length,
      sourceRunCount: snapshot.sourceRuns.length,
      queryPlanCount: snapshot.queryPlans.length,
      writable: editorialPersistenceMode() === 'local_file',
    }
  }
  return readDatabaseStatus({ databaseUrl })
}

export async function readDatabaseStatus(options: DatabaseSnapshotOptions): Promise<NewsletterStatus> {
  const databaseUrl = options.databaseUrl ?? newsletterDatabaseUrl()
  const sql = options.sql ?? neon(databaseUrl ?? '')
  const rows = await sql.query(`
    select
      (select count(*)::int from newsletter_items) as item_count,
      (select count(*)::int from newsletter_focuses) as focus_count,
      (select count(*)::int from newsletter_votes where vote <> 0) as vote_count,
      (select count(*)::int from newsletter_source_runs) as source_run_count,
      (select count(*)::int from newsletter_query_plans) as query_plan_count,
      coalesce(
        (select max(collected_at)::text from newsletter_source_runs),
        (select max(updated_at)::text from newsletter_items),
        now()::text
      ) as generated_at
  `) as Array<{
    item_count: number
    focus_count: number
    vote_count: number
    source_run_count: number
    query_plan_count: number
    generated_at: string
  }>
  const row = rows[0]
  return {
    editorialPersistence: 'database',
    generatedAt: row?.generated_at ?? new Date().toISOString(),
    itemCount: Number(row?.item_count ?? 0),
    focusCount: Number(row?.focus_count ?? 0),
    voteCount: Number(row?.vote_count ?? 0),
    sourceRunCount: Number(row?.source_run_count ?? 0),
    queryPlanCount: Number(row?.query_plan_count ?? 0),
    writable: true,
  }
}

async function readDatabaseGeneratedAt(sql: SqlClient): Promise<string> {
  const rows = await sql.query(`
    select coalesce(
      (select max(collected_at)::text from newsletter_source_runs),
      (select max(updated_at)::text from newsletter_items),
      now()::text
    ) as generated_at
  `) as Array<{ generated_at: string }>
  return rows[0]?.generated_at ?? new Date().toISOString()
}

function readStaticSnapshot(): NewsletterSnapshot | null {
  const snapshotPath = join(process.cwd(), ...garbageInstance.staticSnapshotPath.split('/'))
  if (existsSync(snapshotPath)) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as StaticSnapshot
    return {
      generatedAt: snapshot.generated_at,
      theme: snapshot.theme,
      editorialPersistence: editorialPersistenceMode(),
      items: snapshot.items.map(toStaticNewsItem),
      focuses: seedFocuses,
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
    theme: garbageInstance.theme,
    editorialPersistence: editorialPersistenceMode(),
    items: rows.map(toStaticNewsItem),
    focuses: seedFocuses,
    sourceRuns: [],
    queryPlans: [],
  }
}

function emptySnapshot(): NewsletterSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    theme: garbageInstance.theme,
    editorialPersistence: editorialPersistenceMode(),
    items: [],
    focuses: seedFocuses,
    sourceRuns: [],
    queryPlans: [],
  }
}

export async function writeVote(itemId: string, vote: VoteValue): Promise<void> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) {
    assertLocalEditorialWritesAvailable()
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
    assertLocalEditorialWritesAvailable()
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

export async function writeEditorialState(rawState: unknown): Promise<EditorialStateImportResult> {
  const state = normalizeEditorialState(rawState)
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) {
    assertLocalEditorialWritesAvailable()
    const localState = readLocalEditorialState()
    const mergedFocuses = mergeFocusRows(state.focuses, localState.focuses)
    writeLocalEditorialState({
      votes: { ...localState.votes, ...state.votes },
      focuses: mergedFocuses,
    })
    return {
      importedVotes: Object.keys(state.votes).length,
      importedFocuses: mergedFocuses.length - localState.focuses.length,
    }
  }
  const sql = neon(databaseUrl)
  let importedVotes = 0
  for (const [itemId, vote] of Object.entries(state.votes)) {
    const rows = await sql.query(`
      insert into newsletter_votes (item_id, vote, updated_at)
      select id, $2, now()
      from newsletter_items
      where id = $1
      on conflict (item_id)
      do update set vote = excluded.vote, updated_at = excluded.updated_at
      returning item_id
    `, [itemId, vote]) as Array<{ item_id: string }>
    importedVotes += rows.length
  }

  let importedFocuses = 0
  for (const focus of state.focuses) {
    const rows = await sql.query(`
      insert into newsletter_focuses (text, scope, created_at)
      select $1, $2, $3::timestamptz
      where not exists (
        select 1 from newsletter_focuses
        where text = $1 and scope = $2
      )
      returning id
    `, [focus.text, focus.scope, focus.created_at]) as Array<{ id: string }>
    importedFocuses += rows.length
  }
  return { importedVotes, importedFocuses }
}

function newsletterDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
}

function editorialPersistenceMode(): NewsletterSnapshot['editorialPersistence'] {
  if (newsletterDatabaseUrl()) return 'database'
  return process.env.VERCEL === '1' ? 'browser' : 'local_file'
}

function assertLocalEditorialWritesAvailable(): void {
  if (editorialPersistenceMode() !== 'local_file') {
    const error = new Error(garbageInstance.readOnlyMessage)
    Object.assign(error, { statusCode: 503, code: 'editorial_persistence_unavailable' })
    throw error
  }
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
  return process.env.VERDUN_LOCAL_STATE_FILE ?? join(process.cwd(), ...garbageInstance.localStatePath.split('/'))
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

function normalizeEditorialState(rawState: unknown): LocalEditorialState {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return emptyLocalEditorialState()
  const raw = rawState as Partial<LocalEditorialState>
  return {
    votes: normalizeVotes(raw.votes),
    focuses: normalizeFocusRows(raw.focuses),
  }
}

function normalizeFocusRows(focuses: unknown): FocusRow[] {
  if (!Array.isArray(focuses)) return []
  return focuses
    .map((focus) => normalizeFocusRow(focus))
    .filter((focus): focus is FocusRow => Boolean(focus))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 25)
}

function mergeFocusRows(imported: FocusRow[], existing: FocusRow[]): FocusRow[] {
  const seen = new Set(existing.map((focus) => `${focus.scope}\n${focus.text}`))
  const next = [...existing]
  for (const focus of imported) {
    const key = `${focus.scope}\n${focus.text}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(focus)
  }
  return next
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
    reviewTargets: normalizeReviewTargets(row.review_targets),
    focusTerms: row.focus_terms ?? [],
  }
}

function normalizeReviewTargets(raw: unknown): ReviewTarget[] {
  const targets = typeof raw === 'string' ? parseJsonArray(raw) : raw
  if (!Array.isArray(targets)) return []
  return targets
    .map((target) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return null
      const record = target as Record<string, unknown>
      const source = stringValue(record.source)
      const label = stringValue(record.label)
      const url = stringValue(record.url)
      if (!source || !label || !url) return null
      return {
        source,
        label,
        url,
        adapter: stringValue(record.adapter) || source,
      }
    })
    .filter((target): target is ReviewTarget => Boolean(target))
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
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

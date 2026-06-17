import { neon } from '@neondatabase/serverless'
import { randomUUID } from 'crypto'
import { readSnapshot, readStatus, writeFocus, writeVote } from '../newsletter/_db.js'
import { garbageSnapshotToWorkbench } from '../../src/instances/garbage/workbench'
import { garbageInstance } from '../../src/instances/garbage/config'
import type {
  ReviewValue,
  SourceRunStatus,
  WorkbenchCollectionPlan,
  WorkbenchFocus,
  WorkbenchRecord,
  WorkbenchRecordProvenance,
  WorkbenchReviewTarget,
  WorkbenchSnapshot,
  WorkbenchSourceRun,
} from '../../src/core/workbench'

declare const process: {
  env: Record<string, string | undefined>
}

type SqlClient = ReturnType<typeof neon>

type WorkbenchRecordRow = {
  id: string
  title: string
  source: string
  source_kind: string
  url: string
  observed_at: string
  subject: string
  topic: string
  summary: string
  tags: string[]
  score: number
  review: ReviewValue | null
  provenance_json?: unknown
}

type WorkbenchSourceRunRow = {
  source: string
  kind: string
  status: SourceRunStatus
  item_count: number
  message: string
  subject_counts?: unknown
}

type WorkbenchCollectionPlanRow = {
  subject: string
  topic: string
  query: string
  live_terms: string[]
  tags: string[]
  review_targets?: unknown
  focus_terms: string[]
}

type WorkbenchFocusRow = {
  id: string
  text: string
  scope: WorkbenchFocus['scope']
  created_at: string
}

export type WorkbenchStatus = {
  instance: WorkbenchSnapshot['instance']
  editorialPersistence: WorkbenchSnapshot['editorialPersistence']
  generatedAt: string
  recordCount: number
  focusCount: number
  reviewCount: number
  sourceRunCount: number
  collectionPlanCount: number
  writable: boolean
}

export async function readWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
  const databaseUrl = workbenchDatabaseUrl()
  if (!databaseUrl) return garbageSnapshotToWorkbench(await readSnapshot())
  return readDatabaseWorkbenchSnapshot(neon(databaseUrl))
}

export async function readWorkbenchStatus(): Promise<WorkbenchStatus> {
  const databaseUrl = workbenchDatabaseUrl()
  if (!databaseUrl) {
    const newsletterStatus = await readStatus()
    const snapshot = await readWorkbenchSnapshot()
    return {
      instance: snapshot.instance,
      editorialPersistence: newsletterStatus.editorialPersistence,
      generatedAt: newsletterStatus.generatedAt,
      recordCount: newsletterStatus.itemCount,
      focusCount: newsletterStatus.focusCount,
      reviewCount: newsletterStatus.voteCount,
      sourceRunCount: newsletterStatus.sourceRunCount,
      collectionPlanCount: newsletterStatus.queryPlanCount,
      writable: newsletterStatus.writable,
    }
  }
  return readDatabaseWorkbenchStatus(neon(databaseUrl))
}

export async function writeReview(recordId: string, review: ReviewValue): Promise<void> {
  const databaseUrl = workbenchDatabaseUrl()
  if (databaseUrl) return writeDatabaseWorkbenchReview(neon(databaseUrl), recordId, review)
  return writeVote(recordId, review)
}

export async function writeWorkbenchFocus(text: string, scope: WorkbenchFocus['scope']): Promise<WorkbenchFocus | null> {
  const databaseUrl = workbenchDatabaseUrl()
  if (databaseUrl) return writeDatabaseWorkbenchFocus(neon(databaseUrl), text, scope)
  return writeFocus(text, scope)
}

export async function writeDatabaseWorkbenchReview(sql: SqlClient, recordId: string, review: ReviewValue): Promise<void> {
  await sql.query(`
    insert into review_state (instance, record_id, review, updated_at)
    values ('garbage', $1, $2, now())
    on conflict (instance, record_id)
    do update set review = excluded.review, updated_at = excluded.updated_at
  `, [recordId, review])
}

export async function writeDatabaseWorkbenchFocus(sql: SqlClient, text: string, scope: WorkbenchFocus['scope']): Promise<WorkbenchFocus | null> {
  const focus: WorkbenchFocus = {
    id: randomUUID(),
    text,
    scope,
    createdAt: new Date().toISOString(),
  }
  const rows = await sql.query(`
    insert into focuses (instance, id, text, scope, created_at)
    values ('garbage', $1, $2, $3, $4::timestamptz)
    returning id, text, scope, created_at::text
  `, [focus.id, focus.text, focus.scope, focus.createdAt]) as WorkbenchFocusRow[]
  return rows[0] ? toWorkbenchFocus(rows[0]) : focus
}

export async function readDatabaseWorkbenchSnapshot(sql: SqlClient): Promise<WorkbenchSnapshot> {
  const [records, focuses, sourceRuns, collectionPlans, generatedAt] = await Promise.all([
    readWorkbenchRecords(sql),
    readWorkbenchFocuses(sql),
    readWorkbenchSourceRuns(sql),
    readWorkbenchCollectionPlans(sql),
    readWorkbenchGeneratedAt(sql),
  ])
  return {
    generatedAt,
    instance: garbageInstance,
    editorialPersistence: 'database',
    records,
    focuses,
    sourceRuns,
    collectionPlans,
  }
}

export async function readDatabaseWorkbenchStatus(sql: SqlClient): Promise<WorkbenchStatus> {
  const rows = await sql.query(`
    select
      (select count(*)::int from workbench_records where instance = 'garbage') as record_count,
      (select count(*)::int from workbench_focuses where instance = 'garbage') as focus_count,
      (select count(*)::int from workbench_review_state where instance = 'garbage' and review <> 0) as review_count,
      (select count(*)::int from workbench_source_runs where instance = 'garbage') as source_run_count,
      (select count(*)::int from workbench_collection_plans where instance = 'garbage') as collection_plan_count,
      coalesce(
        (select max(collected_at)::text from workbench_source_runs where instance = 'garbage'),
        (select max(updated_at)::text from workbench_records where instance = 'garbage'),
        now()::text
      ) as generated_at
  `) as Array<{
    record_count: number
    focus_count: number
    review_count: number
    source_run_count: number
    collection_plan_count: number
    generated_at: string
  }>
  const row = rows[0]
  return {
    instance: garbageInstance,
    editorialPersistence: 'database',
    generatedAt: row?.generated_at ?? new Date().toISOString(),
    recordCount: Number(row?.record_count ?? 0),
    focusCount: Number(row?.focus_count ?? 0),
    reviewCount: Number(row?.review_count ?? 0),
    sourceRunCount: Number(row?.source_run_count ?? 0),
    collectionPlanCount: Number(row?.collection_plan_count ?? 0),
    writable: true,
  }
}

async function readWorkbenchRecords(sql: SqlClient): Promise<WorkbenchRecord[]> {
  const rows = await sql.query(`
    select
      id,
      title,
      source,
      source_kind,
      url,
      observed_at::text,
      subject,
      topic,
      summary,
      tags,
      score,
      review::int as review,
      provenance_json
    from workbench_records
    where instance = 'garbage'
    order by review desc, score desc, observed_at desc
    limit 250
  `) as WorkbenchRecordRow[]
  return rows.map(toWorkbenchRecord)
}

async function readWorkbenchFocuses(sql: SqlClient): Promise<WorkbenchFocus[]> {
  const rows = await sql.query(`
    select id, text, scope, created_at::text
    from workbench_focuses
    where instance = 'garbage'
    order by created_at desc
    limit 25
  `) as WorkbenchFocusRow[]
  return rows.map(toWorkbenchFocus)
}

async function readWorkbenchSourceRuns(sql: SqlClient): Promise<WorkbenchSourceRun[]> {
  const rows = await sql.query(`
    select source, kind, status, item_count, message, subject_counts
    from workbench_source_runs
    where instance = 'garbage'
    order by
      case status when 'ok' then 0 when 'error' then 1 when 'pending' then 2 else 3 end,
      source
  `) as WorkbenchSourceRunRow[]
  return rows.map(toWorkbenchSourceRun)
}

async function readWorkbenchCollectionPlans(sql: SqlClient): Promise<WorkbenchCollectionPlan[]> {
  const rows = await sql.query(`
    select subject, topic, query, live_terms, tags, review_targets, focus_terms
    from workbench_collection_plans
    where instance = 'garbage'
    order by subject
  `) as WorkbenchCollectionPlanRow[]
  return rows.map(toWorkbenchCollectionPlan)
}

async function readWorkbenchGeneratedAt(sql: SqlClient): Promise<string> {
  const rows = await sql.query(`
    select coalesce(
      (select max(collected_at)::text from workbench_source_runs where instance = 'garbage'),
      (select max(updated_at)::text from workbench_records where instance = 'garbage'),
      now()::text
    ) as generated_at
  `) as Array<{ generated_at: string }>
  return rows[0]?.generated_at ?? new Date().toISOString()
}

function toWorkbenchRecord(row: WorkbenchRecordRow): WorkbenchRecord {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    sourceKind: row.source_kind,
    url: row.url,
    observedAt: row.observed_at,
    subject: row.subject,
    topic: row.topic,
    summary: row.summary,
    tags: row.tags ?? [],
    score: row.score,
    review: normalizeReview(row.review),
    provenance: normalizeProvenance(row.provenance_json, row),
  }
}

function toWorkbenchFocus(row: WorkbenchFocusRow): WorkbenchFocus {
  return {
    id: row.id,
    text: row.text,
    scope: row.scope,
    createdAt: row.created_at,
  }
}

function toWorkbenchSourceRun(row: WorkbenchSourceRunRow): WorkbenchSourceRun {
  return {
    source: row.source,
    kind: row.kind,
    status: row.status,
    itemCount: row.item_count,
    message: row.message,
    subjectCounts: normalizeCounts(row.subject_counts),
  }
}

function toWorkbenchCollectionPlan(row: WorkbenchCollectionPlanRow): WorkbenchCollectionPlan {
  return {
    subject: row.subject,
    topic: row.topic,
    query: row.query,
    liveTerms: row.live_terms ?? [],
    tags: row.tags ?? [],
    reviewTargets: normalizeReviewTargets(row.review_targets),
    focusTerms: row.focus_terms ?? [],
  }
}

function normalizeProvenance(raw: unknown, row: WorkbenchRecordRow): WorkbenchRecordProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const provenance = raw as Record<string, unknown>
  const stage = stringValue(provenance.stage)
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
    subject: stringValue(provenance.project) || stringValue(provenance.subject) || row.subject,
    matchedKeywords: arrayStrings(provenance.matched_keywords),
  }
}

function normalizeReview(value: unknown): ReviewValue {
  return value === -1 || value === 1 ? value : 0
}

function normalizeReviewTargets(raw: unknown): WorkbenchReviewTarget[] {
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
    .filter((target): target is WorkbenchReviewTarget => Boolean(target))
}

function normalizeCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const counts: Record<string, number> = {}
  for (const [subject, value] of Object.entries(raw)) {
    const count = Number(value)
    if (subject && Number.isFinite(count) && count > 0) counts[subject] = count
  }
  return counts
}

function arrayStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((value) => String(value)).filter(Boolean) : []
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function workbenchDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
}

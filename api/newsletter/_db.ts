import { neon } from '@neondatabase/serverless'
import { seedSnapshot, type NewsletterFocus, type NewsletterSnapshot, type NewsItem, type VoteValue } from '../../src/lib/newsletter'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

declare const process: {
  env: Record<string, string | undefined>
  cwd: () => string
}

export type ApiRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
  body?: unknown
}

export type ApiResponse = {
  status: (code: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
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
  vote: VoteValue | null
}

type FocusRow = {
  id: string
  text: string
  scope: 'this_week' | 'ongoing'
  created_at: string
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
}

export function allowMethods(req: ApiRequest, res: ApiResponse, methods: string[]): boolean {
  if (!req.method || methods.includes(req.method)) return true
  res.setHeader('allow', methods.join(', '))
  res.status(405).json({ error: 'method_not_allowed' })
  return false
}

export function sendJson(res: ApiResponse, body: unknown): void {
  res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=60')
  res.status(200).json(body)
}

export async function readSnapshot(): Promise<NewsletterSnapshot> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) return readStaticSnapshot() ?? seedSnapshot
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

  return {
    generatedAt: new Date().toISOString(),
    theme: 'Strongly typed and functional AI/data systems',
    items: rows.map(toNewsItem),
    focuses: focusRows.map(toFocus),
  }
}

function readStaticSnapshot(): NewsletterSnapshot | null {
  const path = join(process.cwd(), 'public', 'data', 'newsletter-items.json')
  if (!existsSync(path)) return null
  const rows = JSON.parse(readFileSync(path, 'utf8')) as StaticNewsRow[]
  return {
    generatedAt: new Date().toISOString(),
    theme: 'Strongly typed and functional AI/data systems',
    items: rows.map(toStaticNewsItem),
    focuses: seedSnapshot.focuses,
  }
}

export async function writeVote(itemId: string, vote: VoteValue): Promise<void> {
  const databaseUrl = newsletterDatabaseUrl()
  if (!databaseUrl) return
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
  if (!databaseUrl) return null
  const sql = neon(databaseUrl)
  const rows = await sql.query(`
    insert into newsletter_focuses (text, scope)
    values ($1, $2)
    returning id, text, scope, created_at::text
  `, [text, scope]) as FocusRow[]
  return rows[0] ? toFocus(rows[0]) : null
}

export function parseBody(req: ApiRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>
  return {}
}

export function sendApiError(res: ApiResponse, error: unknown): void {
  console.error(error)
  res.status(500).json({
    error: 'newsletter_api_error',
    message: 'Newsletter API request failed.',
  })
}

function newsletterDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
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
  }
}

function toFocus(row: FocusRow): NewsletterFocus {
  return {
    id: row.id,
    text: row.text,
    scope: row.scope,
    createdAt: row.created_at,
  }
}

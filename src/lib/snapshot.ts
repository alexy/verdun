import { seedSnapshot, type NewsletterFocus, type NewsletterSnapshot, type NewsItem, type SourceRun, type SourceRunStatus, type VoteValue } from './newsletter'

type RawRecord = Record<string, unknown>

export function normalizeSnapshot(raw: unknown): NewsletterSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return seedSnapshot
  const record = raw as RawRecord
  return {
    generatedAt: stringValue(record.generatedAt ?? record.generated_at, seedSnapshot.generatedAt),
    theme: stringValue(record.theme, seedSnapshot.theme),
    items: arrayValue(record.items).map(normalizeItem).filter((item): item is NewsItem => Boolean(item)),
    focuses: arrayValue(record.focuses).map(normalizeFocus).filter((focus): focus is NewsletterFocus => Boolean(focus)),
    sourceRuns: arrayValue(record.sourceRuns ?? record.source_runs)
      .map(normalizeSourceRun)
      .filter((run): run is SourceRun => Boolean(run)),
  }
}

function normalizeItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord
  const id = stringValue(record.id, '')
  const title = stringValue(record.title, '')
  const url = stringValue(record.url, '')
  if (!id || !title || !url) return null
  return {
    id,
    title,
    source: stringValue(record.source, 'Unknown'),
    sourceKind: stringValue(record.sourceKind ?? record.source_kind, 'community'),
    url,
    publishedAt: stringValue(record.publishedAt ?? record.published_at, new Date().toISOString()),
    project: stringValue(record.project, 'Unknown'),
    topic: stringValue(record.topic, 'typed AI/data'),
    summary: stringValue(record.summary, ''),
    whyItMatters: stringValue(record.whyItMatters ?? record.why_it_matters, ''),
    tags: arrayValue(record.tags).map((tag) => String(tag)).filter(Boolean),
    score: numberValue(record.score, 0),
    vote: voteValue(record.vote),
  }
}

function normalizeFocus(raw: unknown): NewsletterFocus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord
  const text = stringValue(record.text, '').trim()
  if (!text) return null
  return {
    id: stringValue(record.id, `focus-${Date.now()}`),
    text,
    scope: record.scope === 'ongoing' ? 'ongoing' : 'this_week',
    createdAt: stringValue(record.createdAt ?? record.created_at, new Date().toISOString()),
  }
}

function normalizeSourceRun(raw: unknown): SourceRun | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord
  const source = stringValue(record.source, '')
  if (!source) return null
  return {
    source,
    kind: stringValue(record.kind, 'unknown'),
    status: sourceRunStatus(record.status),
    itemCount: numberValue(record.itemCount ?? record.item_count, 0),
    message: stringValue(record.message, ''),
    projectCounts: normalizeProjectCounts(record.projectCounts ?? record.project_counts),
  }
}

function normalizeProjectCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const counts: Record<string, number> = {}
  for (const [project, count] of Object.entries(raw)) {
    const normalizedCount = Number(count)
    if (project && Number.isFinite(normalizedCount) && normalizedCount > 0) counts[project] = normalizedCount
  }
  return counts
}

function sourceRunStatus(raw: unknown): SourceRunStatus {
  return raw === 'ok' || raw === 'error' || raw === 'pending' || raw === 'skipped' ? raw : 'pending'
}

function voteValue(raw: unknown): VoteValue {
  const vote = Number(raw)
  return vote === -1 || vote === 1 ? vote : 0
}

function arrayValue(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function stringValue(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw ? raw : fallback
}

function numberValue(raw: unknown, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

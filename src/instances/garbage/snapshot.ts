import { seedSnapshot, type NewsletterFocus, type NewsletterSnapshot, type NewsItem, type NewsItemProvenance, type ProjectQueryPlan, type SourceRun, type SourceRunStatus, type VoteValue } from './newsletter'

type RawRecord = Record<string, unknown>

export function normalizeSnapshot(raw: unknown): NewsletterSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return seedSnapshot
  const record = raw as RawRecord
  return {
    generatedAt: stringValue(record.generatedAt ?? record.generated_at, seedSnapshot.generatedAt),
    theme: stringValue(record.theme ?? nestedString(record.instance, 'theme'), seedSnapshot.theme),
    editorialPersistence: editorialPersistence(record.editorialPersistence ?? record.editorial_persistence),
    items: arrayValue(record.items ?? record.records).map(normalizeItem).filter((item): item is NewsItem => Boolean(item)),
    focuses: arrayValue(record.focuses).map(normalizeFocus).filter((focus): focus is NewsletterFocus => Boolean(focus)),
    sourceRuns: arrayValue(record.sourceRuns ?? record.source_runs)
      .map(normalizeSourceRun)
      .filter((run): run is SourceRun => Boolean(run)),
    queryPlans: arrayValue(record.queryPlans ?? record.query_plans ?? record.collectionPlans ?? record.collection_plans)
      .map(normalizeQueryPlan)
      .filter((plan): plan is ProjectQueryPlan => Boolean(plan)),
  }
}

function editorialPersistence(raw: unknown): NewsletterSnapshot['editorialPersistence'] {
  return raw === 'database' || raw === 'local_file' || raw === 'browser' ? raw : 'browser'
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
    publishedAt: stringValue(record.publishedAt ?? record.published_at ?? record.observedAt ?? record.observed_at, new Date().toISOString()),
    project: stringValue(record.project ?? record.subject, 'Unknown'),
    topic: stringValue(record.topic, 'typed AI/data'),
    summary: stringValue(record.summary, ''),
    whyItMatters: stringValue(record.whyItMatters ?? record.why_it_matters, stringValue(record.summary, '')),
    tags: arrayValue(record.tags).map((tag) => String(tag)).filter(Boolean),
    score: numberValue(record.score, 0),
    vote: voteValue(record.vote ?? record.review),
    provenance: normalizeProvenance(record.provenance ?? rawJsonProvenance(record.raw_json), record),
  }
}

function rawJsonProvenance(rawJson: unknown): unknown {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return null
  return (rawJson as RawRecord).provenance ?? rawJson
}

function normalizeProvenance(raw: unknown, item: RawRecord): NewsItemProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as RawRecord
  const stage = stringValue(record.stage ?? record.collection_stage, '')
  const source = stringValue(record.source, stringValue(item.source, 'Unknown'))
  const evidenceUrl = stringValue(record.evidenceUrl ?? record.evidence_url, stringValue(item.url, ''))
  if (!stage || !source || !evidenceUrl) return undefined
  return {
    stage,
    adapter: stringValue(record.adapter, source),
    source,
    sourceKind: stringValue(record.sourceKind ?? record.source_kind, stringValue(item.sourceKind ?? item.source_kind, 'unknown')),
    sourceUrl: stringValue(record.sourceUrl ?? record.source_url, evidenceUrl),
    evidenceUrl,
    project: stringValue(record.project ?? record.subject, stringValue(item.project ?? item.subject, 'Unknown')),
    matchedKeywords: arrayValue(record.matchedKeywords ?? record.matched_keywords).map((keyword) => String(keyword)).filter(Boolean),
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
    projectCounts: normalizeProjectCounts(record.projectCounts ?? record.project_counts ?? record.subjectCounts ?? record.subject_counts),
  }
}

function normalizeQueryPlan(raw: unknown): ProjectQueryPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord
  const project = stringValue(record.project ?? record.subject, '')
  if (!project) return null
  return {
    project,
    topic: stringValue(record.topic, ''),
    hackerNewsQuery: stringValue(record.hackerNewsQuery ?? record.hacker_news_query ?? record.query, ''),
    liveTerms: arrayValue(record.liveTerms ?? record.live_terms).map((term) => String(term)).filter(Boolean),
    devToTags: arrayValue(record.devToTags ?? record.dev_to_tags ?? record.tags).map((tag) => String(tag)).filter(Boolean),
    reviewTargets: normalizeReviewTargets(record.reviewTargets ?? record.review_targets),
    focusTerms: arrayValue(record.focusTerms ?? record.focus_terms).map((term) => String(term)).filter(Boolean),
  }
}

function normalizeReviewTargets(raw: unknown): ProjectQueryPlan['reviewTargets'] {
  const targets = typeof raw === 'string' ? parseJsonArray(raw) : raw
  return arrayValue(targets)
    .map((target) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return null
      const record = target as RawRecord
      const source = stringValue(record.source, '')
      const label = stringValue(record.label, '')
      const url = stringValue(record.url, '')
      if (!source || !label || !url) return null
      return {
        source,
        label,
        url,
        adapter: stringValue(record.adapter, source),
      }
    })
    .filter((target): target is ProjectQueryPlan['reviewTargets'][number] => Boolean(target))
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
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

function nestedString(raw: unknown, key: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  return stringValue((raw as RawRecord)[key], '')
}

function numberValue(raw: unknown, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

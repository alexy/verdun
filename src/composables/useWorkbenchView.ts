import { computed, ref, type Ref } from 'vue'
import type { WorkbenchRecord, WorkbenchSnapshot } from '../core/workbench'

export type ReviewFilter = 'all' | 'included' | 'unreviewed' | 'rejected'
export type WorkbenchEvidenceFilter = 'all' | 'collected' | 'live' | 'manual' | 'seed'

export type WorkbenchSourceSummary = {
  source: string
  count: number
  subjects: string[]
}

export type WorkbenchCoverageSummary = {
  watchedSubjects: string[]
  coveredSubjects: string[]
  uncoveredSubjects: string[]
}

export function useWorkbenchView(snapshot: Ref<WorkbenchSnapshot>) {
  const searchText = ref('')
  const reviewFilter = ref<ReviewFilter>('all')
  const subjectFilter = ref('all')
  const sourceFilter = ref('all')
  const evidenceFilter = ref<WorkbenchEvidenceFilter>('all')

  const sortedRecords = computed(() => sortedWorkbenchRecords(snapshot.value.records))
  const includedRecords = computed(() => sortedRecords.value.filter((record) => record.review > 0))
  const rejectedRecordCount = computed(() => snapshot.value.records.filter((record) => record.review < 0).length)
  const unreviewedRecordCount = computed(() => snapshot.value.records.filter((record) => record.review === 0).length)
  const sourceCount = computed(() => new Set(snapshot.value.records.map((record) => record.source)).size)
  const subjectOptions = computed(() => uniqueSorted(snapshot.value.records.map((record) => record.subject)))
  const sourceOptions = computed(() => uniqueSorted(snapshot.value.records.map((record) => record.source)))
  const liveSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'ok' && run.itemCount > 0).length)
  const pendingSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'pending').length)
  const sourceSummary = computed<WorkbenchSourceSummary[]>(() => {
    const bySource = new Map<string, { count: number, subjects: Set<string> }>()
    for (const record of includedRecords.value) {
      const summary = bySource.get(record.source) ?? { count: 0, subjects: new Set<string>() }
      summary.count += 1
      summary.subjects.add(record.subject)
      bySource.set(record.source, summary)
    }
    return Array.from(bySource.entries())
      .map(([source, summary]) => ({
        source,
        count: summary.count,
        subjects: Array.from(summary.subjects).sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
  })
  const coverage = computed<WorkbenchCoverageSummary>(() => {
    const watchedSubjects = uniqueSorted(
      snapshot.value.collectionPlans.length
        ? snapshot.value.collectionPlans.map((plan) => plan.subject)
        : snapshot.value.records.map((record) => record.subject),
    )
    const coveredSubjects = uniqueSorted(
      snapshot.value.sourceRuns
        .filter((run) => run.status === 'ok' && run.itemCount > 0)
        .flatMap((run) => Object.entries(run.subjectCounts)
          .filter(([, count]) => count > 0)
          .map(([subject]) => subject)),
    )
    const covered = new Set(coveredSubjects)
    return {
      watchedSubjects,
      coveredSubjects,
      uncoveredSubjects: watchedSubjects.filter((subject) => !covered.has(subject)),
    }
  })
  const filteredRecords = computed(() => {
    const query = searchText.value.trim().toLowerCase()
    return sortedRecords.value.filter((record) => {
      if (reviewFilter.value === 'included' && record.review <= 0) return false
      if (reviewFilter.value === 'unreviewed' && record.review !== 0) return false
      if (reviewFilter.value === 'rejected' && record.review >= 0) return false
      if (subjectFilter.value !== 'all' && record.subject !== subjectFilter.value) return false
      if (sourceFilter.value !== 'all' && record.source !== sourceFilter.value) return false
      if (!matchesEvidenceFilter(record, evidenceFilter.value)) return false
      if (!query) return true
      const haystack = [
        record.title,
        record.subject,
        record.source,
        record.sourceKind,
        record.topic,
        record.summary,
        ...record.tags,
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  })

  return {
    coverage,
    evidenceFilter,
    filteredRecords,
    includedRecords,
    liveSourceCount,
    pendingSourceCount,
    rejectedRecordCount,
    reviewFilter,
    searchText,
    sortedRecords,
    sourceCount,
    sourceFilter,
    sourceOptions,
    sourceSummary,
    subjectFilter,
    subjectOptions,
    unreviewedRecordCount,
  }
}

export function sortedWorkbenchRecords(records: WorkbenchRecord[]): WorkbenchRecord[] {
  return [...records].sort((left, right) => {
    const reviewDelta = right.review - left.review
    if (reviewDelta !== 0) return reviewDelta
    const scoreDelta = right.score - left.score
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right.observedAt) - Date.parse(left.observedAt)
  })
}

function matchesEvidenceFilter(record: WorkbenchRecord, filter: WorkbenchEvidenceFilter): boolean {
  if (filter === 'all') return true
  const stage = record.provenance?.stage ?? ''
  if (filter === 'collected') return stage === 'live' || stage === 'manual'
  if (filter === 'seed') return stage === 'watchlist-seed'
  return stage === filter
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

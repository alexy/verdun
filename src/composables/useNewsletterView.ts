import { computed, ref, type Ref } from 'vue'
import type { NewsletterPublishManifest, NewsletterSnapshot } from '../lib/newsletter'
import { buildEditorialStateExport, buildNewsletterDraft, buildPublishManifest, buildSourceGapReviewMarkdown, evaluateNewsletterReadiness, evaluateSourceCoverage, sortedNewsItems } from '../lib/newsletter'

export type VoteFilter = 'all' | 'unreviewed' | 'upvoted' | 'downvoted'

export function useNewsletterView(snapshot: Ref<NewsletterSnapshot>) {
  const searchText = ref('')
  const voteFilter = ref<VoteFilter>('all')
  const projectFilter = ref('all')
  const sourceFilter = ref('all')

  const includedItems = computed(() => sortedNewsItems(snapshot.value.items).filter((item) => item.vote > 0))
  const rejectedItems = computed(() => snapshot.value.items.filter((item) => item.vote < 0).length)
  const unreviewedItems = computed(() => snapshot.value.items.filter((item) => item.vote === 0).length)
  const sourceCount = computed(() => new Set(snapshot.value.items.map((item) => item.source)).size)
  const sortedItems = computed(() => sortedNewsItems(snapshot.value.items))
  const projectOptions = computed(() => uniqueSorted(snapshot.value.items.map((item) => item.project)))
  const sourceOptions = computed(() => uniqueSorted(snapshot.value.items.map((item) => item.source)))
  const filteredItems = computed(() => {
    const query = searchText.value.trim().toLowerCase()
    return sortedItems.value.filter((item) => {
      if (voteFilter.value === 'unreviewed' && item.vote !== 0) return false
      if (voteFilter.value === 'upvoted' && item.vote <= 0) return false
      if (voteFilter.value === 'downvoted' && item.vote >= 0) return false
      if (projectFilter.value !== 'all' && item.project !== projectFilter.value) return false
      if (sourceFilter.value !== 'all' && item.source !== sourceFilter.value) return false
      if (!query) return true
      const haystack = [
        item.title,
        item.project,
        item.source,
        item.sourceKind,
        item.topic,
        item.summary,
        item.whyItMatters,
        ...item.tags,
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  })
  const liveSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'ok' && run.itemCount > 0).length)
  const pendingSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'pending').length)
  const draft = computed(() => buildNewsletterDraft(snapshot.value))
  const readiness = computed(() => evaluateNewsletterReadiness(snapshot.value))
  const sourceCoverage = computed(() => evaluateSourceCoverage(snapshot.value))
  const draftFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-strongly-typed-ai-data-notes.md`)
  const publishManifestFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-strongly-typed-ai-data-notes.manifest.json`)
  const publishManifest = computed<NewsletterPublishManifest>(() => buildPublishManifest(draft.value, snapshot.value, {
    markdownPath: draftFilename.value,
  }))
  const publishManifestJson = computed(() => JSON.stringify(publishManifest.value, null, 2))
  const editorialStateJson = computed(() => JSON.stringify(buildEditorialStateExport(snapshot.value), null, 2))
  const editorialStateFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-verdun-editorial-state.json`)
  const sourceGapReviewMarkdown = computed(() => buildSourceGapReviewMarkdown(snapshot.value))
  const sourceGapReviewFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-source-gap-review.md`)

  return {
    draft,
    draftFilename,
    editorialStateFilename,
    editorialStateJson,
    filteredItems,
    includedItems,
    liveSourceCount,
    pendingSourceCount,
    projectFilter,
    projectOptions,
    publishManifest,
    publishManifestFilename,
    publishManifestJson,
    readiness,
    rejectedItems,
    searchText,
    sourceCount,
    sourceCoverage,
    sourceGapReviewFilename,
    sourceGapReviewMarkdown,
    sourceFilter,
    sourceOptions,
    unreviewedItems,
    voteFilter,
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function isoDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

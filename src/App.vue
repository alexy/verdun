<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import EditorialSidebar from './components/EditorialSidebar.vue'
import InboxControls from './components/InboxControls.vue'
import NewsItemCard from './components/NewsItemCard.vue'
import NewsletterDraftPreview from './components/NewsletterDraftPreview.vue'
import type { NewsletterFocus, NewsletterSnapshot, VoteValue } from './lib/newsletter'
import { buildNewsletterDraft, evaluateNewsletterReadiness, seedSnapshot, sortedNewsItems } from './lib/newsletter'
import { ontologyNodes } from './lib/ontology'
import { normalizeSnapshot } from './lib/snapshot'

const snapshot = ref<NewsletterSnapshot>(seedSnapshot)
const loading = ref(false)
const error = ref('')
const searchText = ref('')
const voteFilter = ref<'all' | 'unreviewed' | 'upvoted' | 'downvoted'>('all')
const projectFilter = ref('all')
const sourceFilter = ref('all')
const apiAvailable = ref(false)

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
const draftFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-strongly-typed-ai-data-notes.md`)

onMounted(() => {
  void loadSnapshot()
})

async function loadSnapshot(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchSnapshot()
    snapshot.value = result.snapshot
    apiAvailable.value = result.apiAvailable
  } catch (snapshotError) {
    error.value = snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
    snapshot.value = seedSnapshot
    apiAvailable.value = false
  } finally {
    loading.value = false
  }
}

async function fetchSnapshot(): Promise<{ snapshot: NewsletterSnapshot, apiAvailable: boolean }> {
  const apiResult = await tryFetchSnapshot('/api/newsletter/items')
  if (apiResult) return { snapshot: apiResult, apiAvailable: true }
  const staticResult = await tryFetchSnapshot(`${import.meta.env.BASE_URL}data/newsletter-snapshot.json`)
  if (staticResult) return { snapshot: staticResult, apiAvailable: false }
  throw new Error('items API and static snapshot are unavailable')
}

async function tryFetchSnapshot(url: string): Promise<NewsletterSnapshot | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return normalizeSnapshot(await response.json())
  } catch {
    return null
  }
}

async function setVote(itemId: string, vote: VoteValue): Promise<void> {
  const previous = snapshot.value
  snapshot.value = {
    ...snapshot.value,
    items: snapshot.value.items.map((item) => item.id === itemId ? { ...item, vote } : item),
  }
  if (!apiAvailable.value) return
  try {
    const response = await fetch('/api/newsletter/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, vote }),
    })
    if (!response.ok) throw new Error(`vote API returned ${response.status}`)
  } catch (voteError) {
    snapshot.value = previous
    error.value = voteError instanceof Error ? voteError.message : String(voteError)
  }
}

async function saveFocus(text: string, scope: 'this_week' | 'ongoing'): Promise<void> {
  text = text.trim()
  if (!text) return
  const focus: NewsletterFocus = {
    id: `local-${Date.now()}`,
    text,
    scope,
    createdAt: new Date().toISOString(),
  }
  snapshot.value = {
    ...snapshot.value,
    focuses: [focus, ...snapshot.value.focuses],
  }
  if (!apiAvailable.value) return
  try {
    const response = await fetch('/api/newsletter/focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, scope }),
    })
    if (!response.ok) throw new Error(`focus API returned ${response.status}`)
  } catch (focusError) {
    error.value = focusError instanceof Error ? focusError.message : String(focusError)
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

</script>

<template>
  <main class="shell">
    <AppHeader :loading="loading" @refresh="loadSnapshot" />

    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">Collected.ga editorial desk</p>
        <h1>Strongly typed AI and data news, ready for weekly judgement.</h1>
        <p>
          Triage project releases, community links, and social signals into a focused literary newsletter queue.
        </p>
      </div>
      <div class="metrics" aria-label="Newsletter queue metrics">
        <div>
          <span>{{ snapshot.items.length }}</span>
          <p>items</p>
        </div>
        <div>
          <span>{{ includedItems.length }}</span>
          <p>upvoted</p>
        </div>
        <div>
          <span>{{ rejectedItems }}</span>
          <p>downvoted</p>
        </div>
        <div>
          <span>{{ sourceCount }}</span>
          <p>sources</p>
        </div>
        <div>
          <span>{{ liveSourceCount }}</span>
          <p>live</p>
        </div>
      </div>
    </section>

    <section class="workspace">
      <EditorialSidebar
        :focuses="snapshot.focuses"
        :included-items="includedItems"
        :ontology-nodes="ontologyNodes"
        :pending-source-count="pendingSourceCount"
        :readiness="readiness"
        :source-runs="snapshot.sourceRuns"
        @save-focus="saveFocus"
      />

      <section class="news-list" aria-label="News items">
        <InboxControls
          v-model:project-filter="projectFilter"
          v-model:search-text="searchText"
          v-model:source-filter="sourceFilter"
          v-model:vote-filter="voteFilter"
          :downvoted-count="rejectedItems"
          :error="error"
          :filtered-count="filteredItems.length"
          :generated-at="snapshot.generatedAt"
          :project-options="projectOptions"
          :source-options="sourceOptions"
          :theme="snapshot.theme"
          :total-count="snapshot.items.length"
          :unreviewed-count="unreviewedItems"
          :upvoted-count="includedItems.length"
        />

        <NewsletterDraftPreview :draft="draft" :filename="draftFilename" />

        <p v-if="!filteredItems.length" class="empty inbox-empty">No items match the current filters.</p>

        <NewsItemCard v-for="item in filteredItems" :key="item.id" :item="item" @vote="setVote" />
      </section>
    </section>
  </main>
</template>

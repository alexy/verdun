<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import EditorialSidebar from './components/EditorialSidebar.vue'
import InboxControls from './components/InboxControls.vue'
import NewsItemCard from './components/NewsItemCard.vue'
import NewsletterDraftPreview from './components/NewsletterDraftPreview.vue'
import NewsletterHero from './components/NewsletterHero.vue'
import { useNewsletterSnapshot } from './composables/useNewsletterSnapshot'
import { buildNewsletterDraft, evaluateNewsletterReadiness, sortedNewsItems } from './lib/newsletter'
import { ontologyNodes } from './lib/ontology'

const searchText = ref('')
const voteFilter = ref<'all' | 'unreviewed' | 'upvoted' | 'downvoted'>('all')
const projectFilter = ref('all')
const sourceFilter = ref('all')
const { error, loadSnapshot, loading, saveFocus, setVote, snapshot } = useNewsletterSnapshot()

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

    <NewsletterHero
      :downvoted-count="rejectedItems"
      :item-count="snapshot.items.length"
      :live-source-count="liveSourceCount"
      :source-count="sourceCount"
      :upvoted-count="includedItems.length"
    />

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

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppHeader from '../../components/AppHeader.vue'
import EditorialSidebar from './components/EditorialSidebar.vue'
import InboxControls from './components/InboxControls.vue'
import NewsItemCard from './components/NewsItemCard.vue'
import NewsletterDraftPreview from './components/NewsletterDraftPreview.vue'
import NewsletterHero from './components/NewsletterHero.vue'
import { useNewsletterSnapshot } from './composables/useNewsletterSnapshot'
import { useNewsletterView } from './composables/useNewsletterView'
import { ontologyNodes } from './ontology'
import './style.css'

const { editorialPersistence, error, importEditorialState, loadSnapshot, loading, saveFocus, setVote, snapshot } = useNewsletterSnapshot()
const editorialStateImportSummary = ref('')
const infoOpen = ref(false)
const {
  draft,
  draftFilename,
  draftItemIds,
  draftItems,
  draftSourceSummary,
  evidenceFilter,
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
} = useNewsletterView(snapshot)

onMounted(() => {
  void loadSnapshot()
})

async function handleEditorialStateImport(state: unknown): Promise<void> {
  const result = await importEditorialState(state)
  editorialStateImportSummary.value = `Imported ${result.importedVotes} vote${result.importedVotes === 1 ? '' : 's'} and ${result.importedFocuses} focus note${result.importedFocuses === 1 ? '' : 's'}.`
}

function toggleInfo(): void {
  infoOpen.value = !infoOpen.value
}

</script>

<template>
  <main class="shell">
    <AppHeader :info-open="infoOpen" :loading="loading" @refresh="loadSnapshot" @toggle-info="toggleInfo" />

    <NewsletterHero
      :downvoted-count="rejectedItems"
      :item-count="snapshot.items.length"
      :live-source-count="liveSourceCount"
      :source-count="sourceCount"
      :upvoted-count="includedItems.length"
    />

    <section class="workspace">
      <section class="news-list" aria-label="News items">
        <EditorialSidebar
          mode="action"
          :draft-items="draftItems"
          :draft-source-summary="draftSourceSummary"
          :focuses="snapshot.focuses"
          :ontology-nodes="ontologyNodes"
          :pending-source-count="pendingSourceCount"
          :query-plans="snapshot.queryPlans"
          :readiness="readiness"
          :source-coverage="sourceCoverage"
          :source-gap-review-filename="sourceGapReviewFilename"
          :source-gap-review-markdown="sourceGapReviewMarkdown"
          :source-runs="snapshot.sourceRuns"
          @save-focus="saveFocus"
        />

        <InboxControls
          v-model:project-filter="projectFilter"
          v-model:evidence-filter="evidenceFilter"
          v-model:search-text="searchText"
          v-model:source-filter="sourceFilter"
          v-model:vote-filter="voteFilter"
          :downvoted-count="rejectedItems"
          :draft-count="draftItems.length"
          :editorial-persistence="editorialPersistence"
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

        <p v-if="!filteredItems.length" class="empty inbox-empty">No items match the current filters.</p>

        <NewsItemCard v-for="item in filteredItems" :key="item.id" :in-draft="draftItemIds.has(item.id)" :item="item" @vote="setVote" />

        <NewsletterDraftPreview
          :draft="draft"
          :editorial-state-filename="editorialStateFilename"
          :editorial-state-json="editorialStateJson"
          :filename="draftFilename"
          :import-summary="editorialStateImportSummary"
          :publish-manifest="publishManifest"
          :publish-manifest-filename="publishManifestFilename"
          :publish-manifest-json="publishManifestJson"
          @import-editorial-state="handleEditorialStateImport"
        />
      </section>
    </section>

    <button v-if="infoOpen" class="info-backdrop" type="button" aria-label="Close info menu" @click="infoOpen = false"></button>
    <section id="info-drawer" class="info-drawer" :class="{ 'info-drawer--open': infoOpen }" aria-label="Info menu">
      <div class="info-drawer__header">
        <div>
          <p class="eyebrow">Info</p>
          <h2>Context and checks</h2>
        </div>
        <button class="close-info" type="button" @click="infoOpen = false">Close</button>
      </div>
      <EditorialSidebar
        mode="info"
        :draft-items="draftItems"
        :draft-source-summary="draftSourceSummary"
        :focuses="snapshot.focuses"
        :ontology-nodes="ontologyNodes"
        :pending-source-count="pendingSourceCount"
        :query-plans="snapshot.queryPlans"
        :readiness="readiness"
        :source-coverage="sourceCoverage"
        :source-gap-review-filename="sourceGapReviewFilename"
        :source-gap-review-markdown="sourceGapReviewMarkdown"
        :source-runs="snapshot.sourceRuns"
        @save-focus="saveFocus"
      />
    </section>
  </main>
</template>

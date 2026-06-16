<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import EditorialSidebar from './components/EditorialSidebar.vue'
import InboxControls from './components/InboxControls.vue'
import NewsItemCard from './components/NewsItemCard.vue'
import NewsletterDraftPreview from './components/NewsletterDraftPreview.vue'
import NewsletterHero from './components/NewsletterHero.vue'
import { useNewsletterSnapshot } from './composables/useNewsletterSnapshot'
import { useNewsletterView } from './composables/useNewsletterView'
import { ontologyNodes } from './lib/ontology'

const { editorialPersistence, error, importEditorialState, loadSnapshot, loading, saveFocus, setVote, snapshot } = useNewsletterSnapshot()
const editorialStateImportSummary = ref('')
const {
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
  publishManifestFilename,
  publishManifestJson,
  readiness,
  rejectedItems,
  searchText,
  sourceCount,
  sourceCoverage,
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
        :query-plans="snapshot.queryPlans"
        :readiness="readiness"
        :source-coverage="sourceCoverage"
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

        <NewsletterDraftPreview
          :draft="draft"
          :editorial-state-filename="editorialStateFilename"
          :editorial-state-json="editorialStateJson"
          :filename="draftFilename"
          :import-summary="editorialStateImportSummary"
          :publish-manifest-filename="publishManifestFilename"
          :publish-manifest-json="publishManifestJson"
          @import-editorial-state="handleEditorialStateImport"
        />

        <p v-if="!filteredItems.length" class="empty inbox-empty">No items match the current filters.</p>

        <NewsItemCard v-for="item in filteredItems" :key="item.id" :item="item" @vote="setVote" />
      </section>
    </section>
  </main>
</template>

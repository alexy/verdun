import { runnerImport } from 'vite'
import { ref } from 'vue'

const { module: newsletterModule } = await runnerImport('./src/lib/newsletter.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const { module: viewModule } = await runnerImport('./src/composables/useNewsletterView.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})

const snapshot = ref({
  ...newsletterModule.seedSnapshot,
  items: newsletterModule.seedSnapshot.items.map((item) => ({ ...item })),
})
const view = viewModule.useNewsletterView(snapshot)

if (view.includedItems.value.length !== 2) {
  throw new Error('seed view should start with two included items')
}
if (view.rejectedItems.value !== 0 || view.unreviewedItems.value !== snapshot.value.items.length - 2) {
  throw new Error('seed vote counters are incorrect')
}
if (!view.projectOptions.value.includes('Pydantic') || !view.sourceOptions.value.includes('Hacker News and project feeds')) {
  throw new Error('project/source filter options were not derived')
}

view.searchText.value = 'lakehouse'
if (!view.filteredItems.value.some((item) => item.project === 'LakeSail')) {
  throw new Error('search filter did not include LakeSail lakehouse item')
}

view.searchText.value = ''
view.projectFilter.value = 'pgGraph'
if (view.filteredItems.value.some((item) => item.project !== 'pgGraph')) {
  throw new Error('project filter leaked non-pgGraph items')
}

view.projectFilter.value = 'all'
view.voteFilter.value = 'upvoted'
if (view.filteredItems.value.some((item) => item.vote <= 0)) {
  throw new Error('upvoted filter leaked unselected items')
}

snapshot.value = {
  ...snapshot.value,
  generatedAt: '2026-06-15T12:00:00Z',
  sourceRuns: [
    {
      source: 'smoke',
      kind: 'local',
      status: 'ok',
      itemCount: 2,
      message: 'smoke source',
      projectCounts: { Pydantic: 1, LakeSail: 1 },
    },
  ],
}

if (view.liveSourceCount.value !== 1 || view.pendingSourceCount.value !== 0) {
  throw new Error('source counters did not update when snapshot changed')
}
if (!view.sourceCoverage.value.uncoveredProjects.includes('Turso')) {
  throw new Error('source coverage gaps did not include uncovered watched projects')
}
if (view.draftFilename.value !== '2026-06-15-strongly-typed-ai-data-notes.md') {
  throw new Error('draft filename did not use snapshot date')
}
if (!view.draft.value.markdown.includes('## Weekly throughline')) {
  throw new Error('view model draft did not use the shared draft builder')
}
if (!view.draft.value.markdown.includes('## Coverage gaps')) {
  throw new Error('view model draft did not include coverage gaps')
}
if (!view.readiness.value.checks.some((check) => check.id === 'upvotes')) {
  throw new Error('view model readiness did not use the shared readiness evaluator')
}

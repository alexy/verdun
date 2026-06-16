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
if (view.sourceCoverage.value.uncoveredProjects.length <= 8 && view.draft.value.markdown.includes('plus ')) {
  throw new Error('source coverage should only mention hidden gaps when more than eight are hidden')
}
if (view.draftFilename.value !== '2026-06-15-strongly-typed-ai-data-notes.md') {
  throw new Error('draft filename did not use snapshot date')
}
if (view.editorialStateFilename.value !== '2026-06-15-verdun-editorial-state.json') {
  throw new Error('editorial state filename did not use snapshot date')
}
if (view.publishManifestFilename.value !== '2026-06-15-strongly-typed-ai-data-notes.manifest.json') {
  throw new Error('publish manifest filename did not use snapshot date')
}
const editorialState = JSON.parse(view.editorialStateJson.value)
if (!editorialState.votes || Object.values(editorialState.votes).filter((vote) => vote === 1).length !== 2) {
  throw new Error('editorial state export did not include upvoted items')
}
if (!Array.isArray(editorialState.focuses)) {
  throw new Error('editorial state export did not include focuses')
}
const publishManifest = JSON.parse(view.publishManifestJson.value)
if (publishManifest.markdownPath !== view.draftFilename.value) {
  throw new Error('publish manifest did not record browser Markdown filename')
}
if (publishManifest.itemIds.length !== view.draft.value.itemIds.length) {
  throw new Error('publish manifest item IDs did not match draft item IDs')
}
if (!publishManifest.selectedItems.some((item) => item.id === 'lakesail-rust-spark' && item.project === 'LakeSail')) {
  throw new Error('publish manifest did not include selected item metadata')
}
if (!publishManifest.selectedItems.every((item) => typeof item.selectionReason === 'string' && item.selectionReason.includes('score'))) {
  throw new Error('publish manifest did not include selected item selection reasons')
}
if (publishManifest.votes['lakesail-rust-spark'] !== 1) {
  throw new Error('publish manifest did not include vote state')
}
if (!Array.isArray(publishManifest.sourceCoverage.uncoveredProjects)) {
  throw new Error('publish manifest did not include source coverage')
}
if (publishManifest.readiness.status !== view.readiness.value.status) {
  throw new Error('publish manifest readiness did not match view readiness')
}
if (!publishManifest.proseQuality?.checks?.length) {
  throw new Error('publish manifest did not record prose quality checks')
}
if (!publishManifest.proseQuality.checks.some((check) => check.id === 'evidence-lines' && !check.passed)) {
  throw new Error('seed publish manifest should flag missing source evidence')
}
const imported = newsletterModule.applyEditorialStateExport(snapshot.value, {
  votes: {
    'lakesail-rust-spark': 1,
    'missing-item': 1,
    'bad-vote': 9,
  },
  focuses: [
    {
      id: 'focus-imported-smoke',
      text: 'Imported state should restore a weekly focus.',
      scope: 'this_week',
      created_at: '2026-06-15T18:00:00Z',
    },
  ],
})
if (imported.importedVotes !== 1 || imported.importedFocuses !== 1) {
  throw new Error('editorial state import did not report applied votes/focuses')
}
if (!imported.snapshot.items.some((item) => item.id === 'lakesail-rust-spark' && item.vote === 1)) {
  throw new Error('editorial state import did not apply the matching vote')
}
if (!imported.snapshot.focuses.some((focus) => focus.id === 'focus-imported-smoke')) {
  throw new Error('editorial state import did not add the imported focus')
}
if (!view.draft.value.markdown.includes('## Weekly throughline')) {
  throw new Error('view model draft did not use the shared draft builder')
}
if (!view.draft.value.markdown.includes('## Editor\'s letter')) {
  throw new Error('view model draft did not include the editor letter')
}
if (!view.draft.value.markdown.includes('## Editorial arc')) {
  throw new Error('view model draft did not include the editorial arc')
}
if (!view.draft.value.markdown.includes('## Closing note')) {
  throw new Error('view model draft did not include the closing note')
}
if (!view.draft.value.markdown.includes('## Coverage gaps')) {
  throw new Error('view model draft did not include coverage gaps')
}
if (!view.readiness.value.checks.some((check) => check.id === 'upvotes')) {
  throw new Error('view model readiness did not use the shared readiness evaluator')
}

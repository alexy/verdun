import { runnerImport } from 'vite'
import { ref } from 'vue'

const { module: newsletterModule } = await runnerImport('../apps/garbage/src/newsletter.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const { module: viewModule } = await runnerImport('./src/instances/garbage/composables/useNewsletterView.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const { module: workbenchViewModule } = await runnerImport('./src/composables/useWorkbenchView.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const { module: garbageWorkbenchModule } = await runnerImport('../apps/garbage/src/workbench.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})

const snapshot = ref({
  ...newsletterModule.seedSnapshot,
  items: newsletterModule.seedSnapshot.items.map((item) => ({ ...item })),
})
const view = viewModule.useNewsletterView(snapshot)
const workbenchSnapshotRef = ref(garbageWorkbenchModule.garbageSnapshotToWorkbench(snapshot.value))
const workbenchView = workbenchViewModule.useWorkbenchView(workbenchSnapshotRef)
const workbenchSnapshot = workbenchSnapshotRef.value

if (workbenchSnapshot.instance.id !== 'garbage' || workbenchSnapshot.instance.basePath !== '/rbage/') {
  throw new Error('garbage instance config was not exposed through the workbench snapshot')
}
if (workbenchSnapshot.records.length !== snapshot.value.items.length) {
  throw new Error('workbench projection did not preserve record count')
}
if (!workbenchSnapshot.records.some((record) => record.subject === 'LakeSail' && record.review === 1)) {
  throw new Error('workbench projection did not map project/vote into subject/review')
}
if (workbenchView.includedRecords.value.length !== 2) {
  throw new Error('workbench view should start with two included records')
}
if (!workbenchView.subjectOptions.value.includes('Pydantic') || !workbenchView.sourceOptions.value.includes('Hacker News and project feeds')) {
  throw new Error('workbench view did not derive subject/source filters')
}
workbenchView.subjectFilter.value = 'LakeSail'
if (workbenchView.filteredRecords.value.some((record) => record.subject !== 'LakeSail')) {
  throw new Error('workbench subject filter leaked non-LakeSail records')
}
workbenchView.subjectFilter.value = 'all'
workbenchView.reviewFilter.value = 'included'
if (workbenchView.filteredRecords.value.some((record) => record.review <= 0)) {
  throw new Error('workbench included filter leaked unreviewed records')
}
workbenchView.reviewFilter.value = 'all'

if (view.includedItems.value.length !== 2) {
  throw new Error('seed view should start with two included items')
}
if (view.rejectedItems.value !== 0 || view.unreviewedItems.value !== snapshot.value.items.length - 2) {
  throw new Error('seed vote counters are incorrect')
}
if (!view.projectOptions.value.includes('Pydantic') || !view.sourceOptions.value.includes('Hacker News and project feeds')) {
  throw new Error('project/source filter options were not derived')
}

snapshot.value = {
  ...snapshot.value,
  items: [
    {
      ...snapshot.value.items[0],
      id: 'smoke-live-item',
      title: 'Live collected Pydantic item',
      project: 'Pydantic',
      vote: 0,
      provenance: {
        stage: 'live',
        adapter: 'hn-algolia',
        source: 'Hacker News',
        sourceKind: 'community',
        sourceUrl: 'https://news.ycombinator.com',
        evidenceUrl: 'https://example.com/live',
        project: 'Pydantic',
        matchedKeywords: ['pydantic'],
      },
    },
    {
      ...snapshot.value.items[1],
      id: 'smoke-manual-item',
      title: 'Manual reviewed LakeSail item',
      project: 'LakeSail',
      vote: 0,
      provenance: {
        stage: 'manual',
        adapter: 'manual-json',
        source: 'LinkedIn',
        sourceKind: 'social',
        sourceUrl: 'https://www.linkedin.com',
        evidenceUrl: 'https://example.com/manual',
        project: 'LakeSail',
        matchedKeywords: ['lakesail'],
      },
    },
    {
      ...snapshot.value.items[2],
      id: 'smoke-seed-item',
      title: 'Watchlist seed Turso item',
      project: 'Turso',
      vote: 0,
      provenance: {
        stage: 'watchlist-seed',
        adapter: 'watchlist',
        source: 'Hacker News',
        sourceKind: 'community',
        sourceUrl: 'https://news.ycombinator.com',
        evidenceUrl: 'https://example.com/seed',
        project: 'Turso',
        matchedKeywords: ['turso'],
      },
    },
  ],
}
view.evidenceFilter.value = 'collected'
if (view.filteredItems.value.length !== 2 || view.filteredItems.value.some((item) => item.provenance?.stage === 'watchlist-seed')) {
  throw new Error('collected evidence filter did not isolate live/manual items')
}
workbenchSnapshotRef.value = garbageWorkbenchModule.garbageSnapshotToWorkbench(snapshot.value)
workbenchView.evidenceFilter.value = 'collected'
if (workbenchView.filteredRecords.value.length !== 2 || workbenchView.filteredRecords.value.some((record) => record.provenance?.stage === 'watchlist-seed')) {
  throw new Error('workbench collected evidence filter did not isolate live/manual records')
}
workbenchView.evidenceFilter.value = 'manual'
if (workbenchView.filteredRecords.value.length !== 1 || workbenchView.filteredRecords.value[0]?.id !== 'smoke-manual-item') {
  throw new Error('workbench manual evidence filter did not isolate manual records')
}
workbenchView.evidenceFilter.value = 'all'
view.evidenceFilter.value = 'manual'
if (view.filteredItems.value.length !== 1 || view.filteredItems.value[0]?.id !== 'smoke-manual-item') {
  throw new Error('manual evidence filter did not isolate manual items')
}
view.evidenceFilter.value = 'seed'
if (view.filteredItems.value.length !== 1 || view.filteredItems.value[0]?.id !== 'smoke-seed-item') {
  throw new Error('seed evidence filter did not isolate watchlist seed items')
}
view.evidenceFilter.value = 'all'
snapshot.value = {
  ...newsletterModule.seedSnapshot,
  items: newsletterModule.seedSnapshot.items.map((item) => ({ ...item })),
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
workbenchSnapshotRef.value = garbageWorkbenchModule.garbageSnapshotToWorkbench(snapshot.value)
if (workbenchView.liveSourceCount.value !== 1 || workbenchView.pendingSourceCount.value !== 0) {
  throw new Error('workbench source counters did not update when snapshot changed')
}
if (!workbenchView.coverage.value.uncoveredSubjects.includes('Turso')) {
  throw new Error('workbench source coverage gaps did not include uncovered watched subjects')
}
snapshot.value = {
  ...snapshot.value,
  items: snapshot.value.items.filter((item) => item.project !== 'CocoIndex'),
  queryPlans: [
    ...snapshot.value.queryPlans,
    {
      project: 'QueryPlanOnly',
      topic: 'query-plan only project',
      hackerNewsQuery: 'QueryPlanOnly query-plan-only',
      liveTerms: ['query-plan-only'],
      devToTags: ['queryplanonly'],
      reviewTargets: [],
      focusTerms: [],
    },
  ],
}
if (!view.sourceCoverage.value.watchedProjects.includes('QueryPlanOnly')) {
  throw new Error('source coverage did not treat query plans as the watched-project authority')
}
if (!view.sourceCoverage.value.uncoveredProjects.includes('QueryPlanOnly')) {
  throw new Error('query-plan-only watched project was not reported as uncovered')
}
snapshot.value = {
  ...snapshot.value,
  queryPlans: snapshot.value.queryPlans.filter((plan) => plan.project !== 'QueryPlanOnly'),
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
if (view.draftItems.value.length !== view.draft.value.itemIds.length) {
  throw new Error('draft item list did not resolve the current draft spine')
}
const sourceSummaryTotal = view.draftSourceSummary.value.reduce((sum, source) => sum + source.count, 0)
if (sourceSummaryTotal !== view.draftItems.value.length) {
  throw new Error('draft source summary did not account for every draft item')
}
if (!view.draftSourceSummary.value.some((source) => source.projects.includes('LakeSail'))) {
  throw new Error('draft source summary did not expose draft projects by source')
}
view.voteFilter.value = 'draft'
if (view.filteredItems.value.length !== view.draftItems.value.length) {
  throw new Error('draft spine filter did not show the current draft items')
}
if (view.filteredItems.value.some((item) => !view.draftItemIds.value.has(item.id))) {
  throw new Error('draft spine filter leaked a non-draft item')
}
view.voteFilter.value = 'all'
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
if (!publishManifest.selectedEvidence || !Array.isArray(publishManifest.selectedEvidence.sourceMix)) {
  throw new Error('publish manifest did not include selected evidence audit')
}
if (publishManifest.selectedEvidence.liveCount + publishManifest.selectedEvidence.manualCount + publishManifest.selectedEvidence.seedCount + publishManifest.selectedEvidence.unknownCount !== publishManifest.itemIds.length) {
  throw new Error('publish manifest selected evidence audit did not account for every selected item')
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

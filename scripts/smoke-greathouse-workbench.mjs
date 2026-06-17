import { ref } from 'vue'
import { runnerImport } from 'vite'

const { module: pilotModule } = await runnerImport('./src/instances/greathouse/pilot.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const { module: workbenchViewModule } = await runnerImport('./src/composables/useWorkbenchView.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})

const snapshotRef = ref(pilotModule.greathousePilotSnapshot())
const view = workbenchViewModule.useWorkbenchView(snapshotRef)
const snapshot = snapshotRef.value

if (snapshot.instance.id !== 'greathouse' || snapshot.instance.basePath !== '/greathouse/') {
  throw new Error(`Greathouse pilot did not expose its own instance boundary: ${JSON.stringify(snapshot.instance)}`)
}
if (!snapshot.records.some((record) => record.sourceKind === 'listing' && record.subject === 'Berkeley 2BR')) {
  throw new Error('Greathouse pilot did not expose listing-shaped records through the workbench contract')
}
if (!snapshot.records.some((record) => record.sourceKind === 'diagnostic' && record.provenance?.adapter === 'blocked-source-diagnostic-fixture')) {
  throw new Error('Greathouse pilot did not preserve blocked-source diagnostic provenance')
}
if (!view.subjectOptions.value.includes('Berkeley 2BR') || !view.sourceOptions.value.includes('Redfin')) {
  throw new Error('shared workbench view did not derive Greathouse subject/source filters')
}
if (view.includedRecords.value.length !== 1 || view.includedRecords.value[0]?.id !== 'listing-redfin-berkeley-01') {
  throw new Error('shared workbench view did not treat Greathouse review state generically')
}
view.subjectFilter.value = 'Oakland blocked source'
if (view.filteredRecords.value.length !== 1 || view.filteredRecords.value[0]?.sourceKind !== 'diagnostic') {
  throw new Error('shared workbench subject filter did not isolate the Greathouse diagnostic record')
}
view.subjectFilter.value = 'all'
view.evidenceFilter.value = 'live'
if (view.filteredRecords.value.length !== 2) {
  throw new Error('shared workbench live evidence filter did not work for Greathouse records')
}
if (!view.coverage.value.uncoveredSubjects.includes('Oakland blocked source')) {
  throw new Error('shared workbench coverage did not flag Greathouse blocked-source gaps')
}
if (view.liveSourceCount.value !== 1 || view.pendingSourceCount.value !== 0) {
  throw new Error('shared workbench source counters did not handle Greathouse source runs')
}

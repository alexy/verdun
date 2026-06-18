import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
const { module: registryModule } = await runnerImport('./src/instances/registry.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const [greathouseAppSource, greathouseAppRegistrationSource, garbageAppRegistrationSource, greathouseInstanceRegistrationSource, garbageInstanceRegistrationSource, instanceRegistrationsSource, appSource, appComponentsSource, appRegistrySource, registrySource] = await Promise.all([
  readFile('src/instances/greathouse/GreathouseApp.vue', 'utf8'),
  readFile('src/instances/greathouse/app.ts', 'utf8'),
  readFile('src/instances/garbage/app.ts', 'utf8'),
  readFile('src/instances/greathouse/instance.ts', 'utf8'),
  readFile('src/instances/garbage/instance.ts', 'utf8'),
  readFile('src/instances/instances.ts', 'utf8'),
  readFile('src/App.vue', 'utf8'),
  readFile('src/instances/app-components.ts', 'utf8'),
  readFile('src/instances/app-registry.ts', 'utf8'),
  readFile('src/instances/registry.ts', 'utf8'),
])

const snapshotRef = ref(pilotModule.greathousePilotSnapshot())
const view = workbenchViewModule.useWorkbenchView(snapshotRef)
const snapshot = snapshotRef.value

if (snapshot.instance.id !== 'greathouse' || snapshot.instance.basePath !== '/greathouse/') {
  throw new Error(`Greathouse pilot did not expose its own instance boundary: ${JSON.stringify(snapshot.instance)}`)
}
if (!snapshot.records.some((record) => record.sourceKind === 'listing' && record.subject === 'Berkeley 2BR')) {
  throw new Error('Greathouse pilot did not expose listing-shaped records through the workbench contract')
}
if (!snapshot.records.some((record) => record.sourceKind === 'diagnostic' && record.provenance?.adapter === 'local-diagnostic-json')) {
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
if (!greathouseAppSource.includes('greathousePilotSnapshot') || !greathouseAppSource.includes('WorkbenchReviewRail')) {
  throw new Error('Greathouse workbench app component is not wired to the generic workbench pilot')
}
if (!greathouseAppRegistrationSource.includes('GreathouseApp') || !greathouseAppRegistrationSource.includes('greathouseInstance.id')) {
  throw new Error('Greathouse app component is not registered from its instance boundary')
}
if (!garbageAppRegistrationSource.includes('GarbageApp') || !garbageAppRegistrationSource.includes('garbageInstance.id')) {
  throw new Error('Garbage app component is not registered from its instance boundary')
}
if (!garbageAppRegistrationSource.includes('apps/garbage/src/config.ts')) {
  throw new Error('Garbage app registration should consume the parent-owned Garbage config')
}
if (!greathouseInstanceRegistrationSource.includes('greathouseInstance') || !greathouseInstanceRegistrationSource.includes('greathousePilotSnapshot')) {
  throw new Error('Greathouse instance metadata is not registered from its instance boundary')
}
if (!garbageInstanceRegistrationSource.includes('garbageInstance') || !garbageInstanceRegistrationSource.includes('default: true')) {
  throw new Error('Garbage default instance metadata is not registered from its instance boundary')
}
if (!garbageInstanceRegistrationSource.includes('apps/garbage/src/config.ts')) {
  throw new Error('Garbage instance registration should consume the parent-owned Garbage config')
}
if (existsSync('src/instances/garbage/config.ts')) {
  throw new Error('Garbage instance config should live in the parent package, not resident Verdun source')
}
if (
  !instanceRegistrationsSource.includes('workbenchInstanceRegistration') ||
  instanceRegistrationsSource.includes('garbageWorkbenchInstance') ||
  instanceRegistrationsSource.includes('greathouseWorkbenchInstance') ||
  instanceRegistrationsSource.includes('./garbage/') ||
  instanceRegistrationsSource.includes('./greathouse/')
) {
  throw new Error('registered instance list is not discovering neutral instance metadata registrations')
}
if (!appSource.includes('resolveWorkbenchAppForPath')) {
  throw new Error('root app shell is not wired through the instance app resolver')
}
if (appSource.includes('GreathouseApp') || appSource.includes('GarbageApp')) {
  throw new Error('root app shell imports concrete instance apps instead of the app registry')
}
if (
  !appComponentsSource.includes('workbenchAppRegistration') ||
  appComponentsSource.includes('garbageWorkbenchApp') ||
  appComponentsSource.includes('greathouseWorkbenchApp') ||
  appComponentsSource.includes('./garbage/') ||
  appComponentsSource.includes('./greathouse/')
) {
  throw new Error('registered app component list is not discovering neutral app registrations')
}
if (
  !appRegistrySource.includes('resolveWorkbenchInstanceForPath') ||
  !appRegistrySource.includes('registeredWorkbenchApps')
) {
  throw new Error('instance app registry is not wired to metadata-backed route selection')
}
if (appRegistrySource.includes('GreathouseApp') || appRegistrySource.includes('GarbageApp')) {
  throw new Error('instance app registry imports concrete instance apps instead of app registrations')
}
if (appRegistrySource.includes('?? GarbageApp')) {
  throw new Error('instance app registry still falls back directly to the Garbage app instead of the registered default')
}
if (!registrySource.includes('registeredWorkbenchInstances')) {
  throw new Error('instance registry is not backed by registered instance metadata')
}
if (
  registrySource.includes('garbageInstance') ||
  registrySource.includes('greathouseInstance') ||
  registrySource.includes('greathousePilotSnapshot') ||
  registrySource.includes('return garbageInstance') ||
  registrySource.includes('instance.id === greathouseInstance.id')
) {
  throw new Error('instance registry still imports or hard-codes concrete instance metadata')
}
if (registryModule.resolveWorkbenchInstanceForPath('/greathouse/').id !== 'greathouse') {
  throw new Error('registry did not resolve /greathouse/ to the Greathouse instance')
}
if (registryModule.resolveWorkbenchInstanceForPath('/rbage/').id !== 'garbage') {
  throw new Error('registry did not resolve /rbage/ to the Garbage instance')
}
if (registryModule.defaultWorkbenchInstance().id !== 'garbage') {
  throw new Error('registry did not expose the configured default workbench instance')
}
if (registryModule.staticWorkbenchSnapshot(registryModule.resolveWorkbenchInstance('greathouse'))?.instance?.id !== 'greathouse') {
  throw new Error('registry did not expose the Greathouse static snapshot from registration metadata')
}

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
const [greathouseAppSource, greathouseAppRegistrationSource, greathouseInstanceRegistrationSource, instanceRegistrationsSource, appSource, appComponentsSource, appRegistrySource, registrySource] = await Promise.all([
  readFile('src/instances/greathouse/GreathouseApp.vue', 'utf8'),
  readFile('src/instances/greathouse/app.ts', 'utf8'),
  readFile('src/instances/greathouse/instance.ts', 'utf8'),
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
if (!greathouseInstanceRegistrationSource.includes('greathouseInstance') || !greathouseInstanceRegistrationSource.includes('greathousePilotSnapshot')) {
  throw new Error('Greathouse instance metadata is not registered from its instance boundary')
}
for (const removedGarbageFrontendPath of [
  'src/instances/garbage/app.ts',
  'src/instances/garbage/instance.ts',
  'src/instances/garbage/GarbageApp.vue',
  'src/instances/garbage/style.css',
  'src/instances/garbage/components',
  'src/instances/garbage/composables',
  'src/instances/garbage/config.ts',
  'src/instances/external-app-components.ts',
  'src/instances/external-instances.ts',
]) {
  if (existsSync(removedGarbageFrontendPath)) {
    throw new Error(`${removedGarbageFrontendPath} should not exist; Garbage should own its app entrypoint outside Verdun`)
  }
}
if (
  !instanceRegistrationsSource.includes('workbenchInstanceRegistration') ||
  instanceRegistrationsSource.includes('garbageWorkbenchInstance') ||
  instanceRegistrationsSource.includes('greathouseWorkbenchInstance') ||
  instanceRegistrationsSource.includes('externalWorkbenchInstances') ||
  instanceRegistrationsSource.includes('apps/garbage') ||
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
  appComponentsSource.includes('externalWorkbenchApps') ||
  appComponentsSource.includes('apps/garbage') ||
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
if (appRegistrySource.includes('GreathouseApp') || appRegistrySource.includes('GarbageApp') || appRegistrySource.includes('apps/garbage')) {
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
  registrySource.includes('apps/garbage') ||
  registrySource.includes('return garbageInstance') ||
  registrySource.includes('instance.id === greathouseInstance.id')
) {
  throw new Error('instance registry still imports or hard-codes concrete instance metadata')
}
if (registryModule.resolveWorkbenchInstanceForPath('/greathouse/').id !== 'greathouse') {
  throw new Error('registry did not resolve /greathouse/ to the Greathouse instance')
}
if (registryModule.resolveWorkbenchInstanceForPath('/rbage/').id !== 'greathouse') {
  throw new Error('Verdun registry should not resolve /rbage/ to Garbage; Garbage owns its app entrypoint')
}
if (registryModule.defaultWorkbenchInstance().id !== 'greathouse') {
  throw new Error('Verdun registry should default to its bundled Greathouse proof instance after Garbage is decoupled')
}
if (registryModule.staticWorkbenchSnapshot(registryModule.resolveWorkbenchInstance('greathouse'))?.instance?.id !== 'greathouse') {
  throw new Error('registry did not expose the Greathouse static snapshot from registration metadata')
}

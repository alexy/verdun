import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { ref } from 'vue'
import { runnerImport } from 'vite'

const { module: pilotModule } = await runnerImport('./src/instances/demo/pilot.ts', {
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
const [
  demoAppSource,
  demoAppRegistrationSource,
  demoInstanceRegistrationSource,
  instanceRegistrationsSource,
  appSource,
  appComponentsSource,
  appRegistrySource,
  registrySource,
] = await Promise.all([
  readFile('src/instances/demo/DemoApp.vue', 'utf8'),
  readFile('src/instances/demo/app.ts', 'utf8'),
  readFile('src/instances/demo/instance.ts', 'utf8'),
  readFile('src/instances/instances.ts', 'utf8'),
  readFile('src/App.vue', 'utf8'),
  readFile('src/instances/app-components.ts', 'utf8'),
  readFile('src/instances/app-registry.ts', 'utf8'),
  readFile('src/instances/registry.ts', 'utf8'),
])

const snapshotRef = ref(pilotModule.demoPilotSnapshot())
const view = workbenchViewModule.useWorkbenchView(snapshotRef)
const snapshot = snapshotRef.value

if (snapshot.instance.id !== 'demo' || snapshot.instance.basePath !== '/demo/') {
  throw new Error(`Demo pilot did not expose its own instance boundary: ${JSON.stringify(snapshot.instance)}`)
}
if (!snapshot.records.some((record) => record.sourceKind === 'record' && record.subject === 'Reusable workbench')) {
  throw new Error('Demo pilot did not expose generic records through the workbench contract')
}
if (!snapshot.records.some((record) => record.sourceKind === 'diagnostic' && record.provenance?.adapter === 'demo-diagnostic-json')) {
  throw new Error('Demo pilot did not preserve diagnostic provenance')
}
if (!view.subjectOptions.value.includes('Reusable workbench') || !view.sourceOptions.value.includes('Demo live source')) {
  throw new Error('shared workbench view did not derive demo subject/source filters')
}
if (view.includedRecords.value.length !== 1 || view.includedRecords.value[0]?.id !== 'demo-live-record-01') {
  throw new Error('shared workbench view did not treat demo review state generically')
}
view.subjectFilter.value = 'Source diagnostics'
if (view.filteredRecords.value.length !== 1 || view.filteredRecords.value[0]?.sourceKind !== 'diagnostic') {
  throw new Error('shared workbench subject filter did not isolate the demo diagnostic record')
}
view.subjectFilter.value = 'all'
view.evidenceFilter.value = 'live'
if (view.filteredRecords.value.length !== 2) {
  throw new Error('shared workbench live evidence filter did not work for demo records')
}
if (!view.coverage.value.uncoveredSubjects.includes('Source diagnostics')) {
  throw new Error('shared workbench coverage did not flag demo diagnostic coverage gaps')
}
if (view.liveSourceCount.value !== 1 || view.pendingSourceCount.value !== 0) {
  throw new Error('shared workbench source counters did not handle demo source runs')
}
if (!demoAppSource.includes('demoPilotSnapshot') || !demoAppSource.includes('WorkbenchReviewRail')) {
  throw new Error('Demo workbench app component is not wired to the generic workbench pilot')
}
if (!demoAppRegistrationSource.includes('DemoApp') || !demoAppRegistrationSource.includes('demoInstance.id')) {
  throw new Error('Demo app component is not registered from its instance boundary')
}
if (!demoInstanceRegistrationSource.includes('demoInstance') || !demoInstanceRegistrationSource.includes('demoPilotSnapshot') || !demoInstanceRegistrationSource.includes('default: true')) {
  throw new Error('Demo instance metadata is not registered as the bundled default')
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
if (registryModule.resolveWorkbenchInstanceForPath('/demo/').id !== 'demo') {
  throw new Error('registry did not resolve /demo/ to the demo instance')
}
if (registryModule.resolveWorkbenchInstanceForPath('/rbage/').id !== 'demo') {
  throw new Error('Verdun registry should not resolve /rbage/ to Garbage; Garbage owns its app entrypoint')
}
if (registryModule.defaultWorkbenchInstance().id !== 'demo') {
  throw new Error('Verdun registry should default to its bundled demo instance')
}
if (registryModule.staticWorkbenchSnapshot(registryModule.resolveWorkbenchInstance('demo'))?.instance?.id !== 'demo') {
  throw new Error('registry did not expose the demo static snapshot from registration metadata')
}

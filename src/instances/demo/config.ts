import type { WorkbenchFocus, WorkbenchInstance } from '../../core/workbench'

export const demoInstance: WorkbenchInstance = {
  id: 'demo',
  name: 'Verdun Demo',
  basePath: '/demo/',
  theme: 'Generic collection and review workbench',
  databaseTablePrefix: 'workbench',
  staticSnapshotPath: 'data/demo-snapshot.json',
  localStatePath: 'data/demo-editorial-state.json',
  readOnlyMessage: 'This bundled Verdun demo is read-only until an external app database is configured.',
}

export const demoSeedFocuses: WorkbenchFocus[] = [
  {
    id: 'focus-demo-evidence',
    text: 'Prioritize records with clear provenance, source health, and collection plan coverage.',
    scope: 'ongoing',
    createdAt: new Date().toISOString(),
  },
]

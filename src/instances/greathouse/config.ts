import type { WorkbenchFocus, WorkbenchInstance } from '../../core/workbench'

export const greathouseInstance: WorkbenchInstance = {
  id: 'greathouse',
  name: 'Greathouse',
  basePath: '/greathouse/',
  theme: 'Property intelligence and source diagnostics',
  databaseTablePrefix: 'workbench',
  staticSnapshotPath: 'public/data/greathouse-snapshot.json',
  localStatePath: 'crawler/data/greathouse-editorial-state.json',
  readOnlyMessage: 'This Greathouse pilot is read-only until an instance database and crawler adapter are configured.',
}

export const greathouseSeedFocuses: WorkbenchFocus[] = [
  {
    id: 'focus-source-diagnostics',
    text: 'Prioritize listings with source freshness, blocked-source diagnostics, and comparable evidence.',
    scope: 'ongoing',
    createdAt: new Date().toISOString(),
  },
]

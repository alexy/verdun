import type { WorkbenchFocus, WorkbenchInstance } from '../../core/workbench'

export const garbageInstance: WorkbenchInstance = {
  id: 'garbage',
  name: 'Garbage',
  basePath: '/rbage/',
  theme: 'Strongly typed and functional AI/data systems',
  databaseTablePrefix: 'newsletter',
  staticSnapshotPath: 'public/data/newsletter-snapshot.json',
  localStatePath: 'crawler/data/editorial-state.json',
  readOnlyMessage: 'This deployment is read-only until POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL is configured. Browser-local editorial state can still be exported for Ulysses.',
}

export const garbageSeedFocuses: WorkbenchFocus[] = [
  {
    id: 'focus-local-first-graphs',
    text: 'More strongly typed graph/database work that can run locally before cloud deployment.',
    scope: 'ongoing',
    createdAt: new Date().toISOString(),
  },
]

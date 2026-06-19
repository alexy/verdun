import { fileURLToPath } from 'node:url'

export const coreWorkbenchMigrationPaths = [
  fileURLToPath(new URL('../migrations/0003_generic_workbench_tables.sql', import.meta.url)),
]

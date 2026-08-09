import { fileURLToPath } from 'node:url'

export const coreAccountMigrationPaths = [
  fileURLToPath(new URL('../migrations/0004_accounts.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0005_multi_identity_auth.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0006_application_plans.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0007_workspaces.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0008_linkedin_identity.sql', import.meta.url)),
]

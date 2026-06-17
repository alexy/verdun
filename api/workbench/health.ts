import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../newsletter/_http.js'
import { readWorkbenchStatus } from './_db.js'
import { resolveWorkbenchInstance, supportedWorkbenchInstances } from '../../src/instances/registry'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return

  const databaseConfigured = hasDatabaseEnv()
  try {
    const activeSnapshot = await readWorkbenchStatus(resolveWorkbenchInstance(req.query.instance))
    sendJson(res, {
      ok: true,
      service: 'workbench',
      surface: 'health',
      state: databaseConfigured ? 'database_configured' : 'database_not_configured',
      databaseConfigured,
      instance: activeSnapshot.instance,
      supportedInstances: supportedWorkbenchInstances().map((instance) => ({
        id: instance.id,
        name: instance.name,
        basePath: instance.basePath,
      })),
      editorialPersistence: activeSnapshot.editorialPersistence,
      readSurfaces: ['records', 'status', 'health'],
      writeSurfaces: ['review', 'focus'],
      collectionSurfaces: ['crawler verify', 'crawler collect', 'crawler export-sql', 'db:deploy'],
      databaseContract: {
        genericTables: ['instances', 'records', 'source_runs', 'collection_plans', 'review_state', 'focuses'],
        compatibilityTables: ['newsletter_items', 'newsletter_source_runs', 'newsletter_query_plans', 'newsletter_votes', 'newsletter_focuses'],
        reusableViews: ['workbench_records', 'workbench_source_runs', 'workbench_collection_plans', 'workbench_review_state', 'workbench_focuses'],
      },
      activeSnapshot,
    })
  } catch (error) {
    sendApiError(res, error)
  }
}

function hasDatabaseEnv(): boolean {
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL)
}

import { readStatus } from '../instances/garbage/newsletter-store.js'
import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return

  const databaseConfigured = hasNewsletterDatabaseEnv()
  try {
    const activeSnapshot = await readStatus()
    sendJson(res, {
      ok: true,
      service: 'newsletter',
      surface: 'health',
      state: databaseConfigured ? 'database_configured' : 'database_not_configured',
      databaseConfigured,
      editorialPersistence: activeSnapshot.editorialPersistence,
      readSurfaces: ['items', 'status', 'draft', 'health'],
      writeSurfaces: ['vote', 'focus', 'editorial-state'],
      publishingSurfaces: ['ulysses:draft', 'ulysses:ready', 'ghost:dry-run', 'ghost:ready'],
      weeklyUpdate: {
        loader: 'Rust verdun-crawler export-sql plus npm run db:deploy',
        expectedStore: 'External Postgres with newsletter_items, newsletter_source_runs, and newsletter_query_plans',
        activeSnapshot,
        currentRequirement: databaseConfigured
          ? 'run npm run db:deploy -- --apply after each crawler refresh, then verify with npm run check:deployed -- --require-database'
          : 'attach POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL in Vercel production before DB-backed reads and durable editorial writes are available',
      },
    })
  } catch (error) {
    sendApiError(res, error)
  }
}

function hasNewsletterDatabaseEnv(): boolean {
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL)
}

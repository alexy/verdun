import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runnerImport } from 'vite'

const demoInstance = {
  id: 'demo',
  name: 'Demo',
  basePath: '/demo/',
  theme: 'Generic workbench smoke',
  databaseTablePrefix: 'workbench',
  staticSnapshotPath: 'public/data/demo-snapshot.json',
  localStatePath: 'crawler/data/demo-editorial-state.json',
  readOnlyMessage: 'Demo instance is read-only without an adapter.',
}

function responseRecorder() {
  return {
    body: undefined,
    code: undefined,
    headers: {},
    status(code) {
      this.code = code
      return this
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    json(body) {
      this.body = body
    },
    end(body) {
      this.body = body
    },
  }
}

async function call(handler, method = 'GET', body = undefined, query = {}) {
  const response = responseRecorder()
  await handler({ method, query, body }, response)
  return response
}

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-workbench-api-'))
process.env.VERDUN_LOCAL_STATE_FILE = join(stateDir, 'editorial-state.json')
delete process.env.POSTGRES_URL
delete process.env.DATABASE_URL
delete process.env.NEON_DATABASE_URL

try {
  const [dbSource, healthSource, instanceAdaptersSource, localAdapterTypesSource, registeredAdaptersSource, bundledAdaptersSource, apiInstanceEntries, sourceInstanceEntries] = await Promise.all([
    readFile('api/workbench/_db.ts', 'utf8'),
    readFile('api/workbench/health.ts', 'utf8'),
    readFile('api/workbench/instance-adapters.ts', 'utf8'),
    readFile('api/workbench/local-adapter-types.ts', 'utf8'),
    readFile('api/instances/workbench-adapters.ts', 'utf8'),
    readFile('api/instances/bundled-workbench-adapters.ts', 'utf8'),
    readdir('api/instances', { withFileTypes: true }),
    readdir('src/instances', { withFileTypes: true }),
  ])
  if (dbSource.includes('../instances/') || dbSource.includes('src/instances/')) {
    throw new Error('generic workbench DB helper should depend on adapter contracts, not concrete instances')
  }
  if (!healthSource.includes('compatibilityTables')) {
    throw new Error('generic workbench health route should expose compatibility table metadata generically')
  }
  if (
    instanceAdaptersSource.includes('compatibility_') ||
    instanceAdaptersSource.includes('../instances/') && !instanceAdaptersSource.includes('../instances/workbench-adapters.js')
  ) {
    throw new Error('generic workbench instance-adapter registry still embeds concrete instance metadata')
  }
  if (!localAdapterTypesSource.includes('LocalWorkbenchAdapterRegistration')) {
    throw new Error('local workbench adapter registration contract is missing from the neutral workbench type module')
  }
  if (registeredAdaptersSource.includes('./demo/') || registeredAdaptersSource.includes('../apps/') || registeredAdaptersSource.includes('apps/')) {
    throw new Error('local workbench adapter registry still imports a resident instance directly instead of the bundled adapter manifest')
  }
  if (!bundledAdaptersSource.includes('bundledLocalWorkbenchAdapterRegistrations') || bundledAdaptersSource.includes('../apps/') || bundledAdaptersSource.includes('apps/')) {
    throw new Error('bundled API adapter manifest should expose neutral registrations without external app imports')
  }
  const apiInstanceDirectories = apiInstanceEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  if (apiInstanceDirectories.join(',') !== '') {
    throw new Error(`Verdun API should not bundle app-specific instance directories, found ${apiInstanceDirectories.join(', ')}`)
  }
  const sourceInstanceDirectories = sourceInstanceEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  if (sourceInstanceDirectories.join(',') !== 'demo') {
    throw new Error(`Verdun source should bundle only the demo app instance, found ${sourceInstanceDirectories.join(', ')}`)
  }

  const { module: dbModule } = await runnerImport('./api/workbench/_db.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: recordsModule } = await runnerImport('./api/workbench/records.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: statusModule } = await runnerImport('./api/workbench/status.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: healthModule } = await runnerImport('./api/workbench/health.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: reviewModule } = await runnerImport('./api/workbench/review.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: focusModule } = await runnerImport('./api/workbench/focus.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { module: stateModule } = await runnerImport('./api/workbench/state.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const databaseSnapshot = await dbModule.readDatabaseWorkbenchSnapshot(fakeWorkbenchSql('demo'), demoInstance)
  if (
    databaseSnapshot.instance.id !== 'demo'
    || databaseSnapshot.editorialPersistence !== 'database'
    || databaseSnapshot.records[0]?.subject !== 'Demo Subject'
    || databaseSnapshot.records[0]?.provenance?.subject !== 'Demo Subject'
    || databaseSnapshot.sourceRuns[0]?.subjectCounts?.['Demo Subject'] !== 1
    || databaseSnapshot.collectionPlans[0]?.query !== 'demo subject query'
  ) {
    throw new Error(`workbench database-view reader did not map generic rows: ${JSON.stringify(databaseSnapshot)}`)
  }
  const databaseStatus = await dbModule.readDatabaseWorkbenchStatus(fakeWorkbenchSql('demo'), demoInstance)
  if (databaseStatus.instance.id !== 'demo' || databaseStatus.recordCount !== 1 || databaseStatus.collectionPlanCount !== 1 || databaseStatus.editorialPersistence !== 'database') {
    throw new Error(`workbench database-view status did not map generic counts: ${JSON.stringify(databaseStatus)}`)
  }
  const writeSql = fakeWorkbenchWriteSql()
  await dbModule.writeDatabaseWorkbenchReview(writeSql, 'db-demo', 1, demoInstance)
  const focus = await dbModule.writeDatabaseWorkbenchFocus(writeSql, 'Database focus write.', 'this_week', demoInstance)
  const stateImport = await dbModule.writeDatabaseWorkbenchState(writeSql, {
    reviews: { 'db-demo': -1 },
    focuses: [{
      id: 'focus-state-db',
      text: 'Database state focus.',
      scope: 'ongoing',
      created_at: '2026-06-16T12:30:00.000Z',
    }],
  }, demoInstance)
  if (!writeSql.reviewWrites.some((write) => write.instance === 'demo' && write.recordId === 'db-demo' && write.review === 1)) {
    throw new Error(`workbench generic review write did not target review_state: ${JSON.stringify(writeSql.reviewWrites)}`)
  }
  if (!writeSql.reviewWrites.some((write) => write.instance === 'demo' && write.recordId === 'db-demo' && write.review === -1)) {
    throw new Error(`workbench generic state import did not target review_state: ${JSON.stringify(writeSql.reviewWrites)}`)
  }
  if (!writeSql.focusWrites.some((write) => write.instance === 'demo' && write.text === 'Database focus write.' && write.scope === 'this_week')) {
    throw new Error(`workbench generic focus write did not target focuses: ${JSON.stringify(writeSql.focusWrites)}`)
  }
  if (!writeSql.focusWrites.some((write) => write.instance === 'demo' && write.id === 'focus-state-db' && write.scope === 'ongoing')) {
    throw new Error(`workbench generic state import did not target focuses: ${JSON.stringify(writeSql.focusWrites)}`)
  }
  if (stateImport.importedReviews !== 1 || stateImport.importedFocuses !== 1) {
    throw new Error(`workbench generic state import returned wrong counts: ${JSON.stringify(stateImport)}`)
  }
  if (focus?.text !== 'Database focus write.' || focus?.scope !== 'this_week') {
    throw new Error(`workbench generic focus write did not return a focus: ${JSON.stringify(focus)}`)
  }

  const demoRecordsResponse = await call(recordsModule.default, 'GET', undefined, { instance: 'demo' })
  if (
    demoRecordsResponse.code !== 200
    || demoRecordsResponse.body?.instance?.id !== 'demo'
    || !demoRecordsResponse.body?.records?.some((record) => record.provenance?.adapter === 'demo-live-json')
  ) {
    throw new Error(`workbench records route did not resolve the demo instance: ${JSON.stringify(demoRecordsResponse.body)}`)
  }

  const demoStatusResponse = await call(statusModule.default, 'GET', undefined, { instance: 'demo' })
  if (
    demoStatusResponse.code !== 200
    || demoStatusResponse.body?.instance?.id !== 'demo'
    || demoStatusResponse.body?.writable !== false
    || demoStatusResponse.body?.recordCount !== demoRecordsResponse.body.records.length
  ) {
    throw new Error(`workbench status route did not resolve the demo instance: ${JSON.stringify(demoStatusResponse.body)}`)
  }
  const demoHealthResponse = await call(healthModule.default, 'GET', undefined, { instance: 'demo' })
  if (
    demoHealthResponse.code !== 200
    || demoHealthResponse.body?.instance?.id !== 'demo'
    || demoHealthResponse.body?.databaseContract?.compatibilityTables?.length !== 0
  ) {
    throw new Error(`workbench health route did not keep demo free of compatibility tables: ${JSON.stringify(demoHealthResponse.body)}`)
  }
  if (!demoHealthResponse.body?.supportedInstances?.some((instance) => instance.id === 'demo' && instance.basePath === '/demo/')) {
    throw new Error(`workbench health route did not expose supported instances: ${JSON.stringify(demoHealthResponse.body?.supportedInstances)}`)
  }
  if (!demoHealthResponse.body?.databaseContract?.reusableViews?.includes('workbench_records')) {
    throw new Error('workbench health route did not expose reusable database views')
  }
  if (!demoHealthResponse.body?.readSurfaces?.includes('records')) {
    throw new Error('workbench health route did not expose generic read surfaces')
  }
  if (!demoHealthResponse.body?.writeSurfaces?.includes('review') || !demoHealthResponse.body?.writeSurfaces?.includes('focus') || !demoHealthResponse.body?.writeSurfaces?.includes('state')) {
    throw new Error('workbench health route did not expose generic write surfaces')
  }

  const blocked = await call(recordsModule.default, 'DELETE', undefined, { instance: 'demo' })
  if (blocked.code !== 405) throw new Error('workbench records route did not reject DELETE')

  const demoReviewResponse = await call(reviewModule.default, 'POST', {
    recordId: 'demo-live-record-01',
    review: 1,
  }, { instance: 'demo' })
  if (demoReviewResponse.code !== 403 || demoReviewResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench review route did not keep read-only demo writes isolated: ${JSON.stringify(demoReviewResponse.body)}`)
  }
  const demoFocusResponse = await call(focusModule.default, 'POST', {
    text: 'Demo route focus.',
    scope: 'this_week',
  }, { instance: 'demo' })
  if (demoFocusResponse.code !== 403 || demoFocusResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench focus route did not keep read-only demo writes isolated: ${JSON.stringify(demoFocusResponse.body)}`)
  }
  const demoStateResponse = await call(stateModule.default, 'POST', {
    reviews: { 'demo-live-record-01': 1 },
  }, { instance: 'demo' })
  if (demoStateResponse.code !== 403 || demoStateResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench state route did not keep read-only demo writes isolated: ${JSON.stringify(demoStateResponse.body)}`)
  }
  const unknownInstanceResponse = await call(recordsModule.default, 'GET', undefined, { instance: 'unknown' })
  if (unknownInstanceResponse.code !== 400 || unknownInstanceResponse.body?.error !== 'unknown_workbench_instance') {
    throw new Error(`workbench records route did not reject unknown instances: ${JSON.stringify(unknownInstanceResponse.body)}`)
  }
} finally {
  delete process.env.VERCEL
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.NEON_DATABASE_URL
  await rm(stateDir, { recursive: true, force: true })
}

function fakeWorkbenchSql(expectedInstance = 'demo') {
  return {
    async query(sql, params = []) {
      if (params[0] && params[0] !== expectedInstance) {
        throw new Error(`expected workbench SQL instance ${expectedInstance}, received ${params[0]}`)
      }
      if (sql.includes('record_count')) {
        return [{
          record_count: 1,
          focus_count: 1,
          review_count: 1,
          source_run_count: 1,
          collection_plan_count: 1,
          generated_at: '2026-06-16T12:00:00.000Z',
        }]
      }
      if (sql.includes('from workbench_records')) {
        if (sql.includes('max(updated_at)')) {
          return [{ generated_at: '2026-06-16T12:00:00.000Z' }]
        }
        return [{
          id: 'db-demo',
          title: 'Demo database record',
          source: 'Demo Source',
          source_kind: 'fixture',
          url: 'https://example.com/demo',
          observed_at: '2026-06-16T12:00:00.000Z',
          subject: 'Demo Subject',
          topic: 'generic records',
          summary: 'Generic workbench database record.',
          tags: ['demo', 'generic'],
          score: 91,
          review: 1,
          provenance_json: {
            stage: 'fixture',
            adapter: 'fixture-adapter',
            source: 'Demo Source',
            source_kind: 'fixture',
            source_url: 'https://example.com/source',
            evidence_url: 'https://example.com/demo',
            subject: 'Demo Subject',
            matched_keywords: ['demo'],
          },
        }]
      }
      if (sql.includes('from workbench_focuses')) {
        return [{
          id: 'focus-db',
          text: 'Database focus',
          scope: 'this_week',
          created_at: '2026-06-16T12:00:00.000Z',
        }]
      }
      if (sql.includes('from workbench_source_runs')) {
        return [{
          source: 'Demo Source',
          kind: 'fixture',
          status: 'ok',
          item_count: 1,
          message: 'database source run',
          subject_counts: { 'Demo Subject': 1 },
        }]
      }
      if (sql.includes('from workbench_collection_plans')) {
        return [{
          subject: 'Demo Subject',
          topic: 'generic records',
          query: 'demo subject query',
          live_terms: ['demo'],
          tags: ['demo'],
          review_targets: [{
            source: 'Demo Source',
            label: 'Demo review target',
            url: 'https://example.com/demo-review',
            adapter: 'fixture-adapter',
          }],
          focus_terms: [],
        }]
      }
      throw new Error(`unexpected fake workbench SQL query: ${sql}`)
    },
  }
}

function fakeWorkbenchWriteSql() {
  const reviewWrites = []
  const focusWrites = []
  return {
    reviewWrites,
    focusWrites,
    async query(sql, params = []) {
      if (sql.includes('insert into review_state')) {
        reviewWrites.push({
          instance: params[0],
          recordId: params[1],
          review: params[2],
        })
        return []
      }
      if (sql.includes('insert into focuses')) {
        const row = {
          instance: params[0],
          id: params[1],
          text: params[2],
          scope: params[3],
          created_at: params[4],
        }
        focusWrites.push(row)
        return [row]
      }
      throw new Error(`unexpected fake workbench write SQL query: ${sql}`)
    },
  }
}

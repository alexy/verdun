import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
  const [dbSource, healthSource, instanceAdaptersSource, localAdapterTypesSource, registeredAdaptersSource, bundledAdaptersSource, garbageAdapterSource, garbageStoreShimSource, garbageStoreSource, garbageViewSmokeShimSource, garbageViewSmokeSource] = await Promise.all([
    readFile('api/workbench/_db.ts', 'utf8'),
    readFile('api/workbench/health.ts', 'utf8'),
    readFile('api/workbench/instance-adapters.ts', 'utf8'),
    readFile('api/workbench/local-adapter-types.ts', 'utf8'),
    readFile('api/instances/workbench-adapters.ts', 'utf8'),
    readFile('api/instances/bundled-workbench-adapters.ts', 'utf8'),
    readFile('api/instances/garbage/workbench.ts', 'utf8'),
    readFile('api/instances/garbage/newsletter-store.ts', 'utf8'),
    readFile('../apps/garbage/src/api/newsletter-store.ts', 'utf8'),
    readFile('scripts/instances/garbage/smoke-view-model.mjs', 'utf8'),
    readFile('../apps/garbage/scripts/smoke-view-model.mjs', 'utf8'),
  ])
  if (dbSource.includes('../instances/garbage/workbench') || dbSource.includes('instances/garbage/config')) {
    throw new Error('generic workbench DB helper still imports Garbage instance adapters directly')
  }
  if (healthSource.includes('newsletter_')) {
    throw new Error('generic workbench health route still names newsletter compatibility tables directly')
  }
  if (
    instanceAdaptersSource.includes('garbageInstance') ||
    instanceAdaptersSource.includes('newsletter_') ||
    instanceAdaptersSource.includes('../instances/garbage/')
  ) {
    throw new Error('generic workbench instance-adapter registry still embeds Garbage config or newsletter compatibility metadata')
  }
  if (!localAdapterTypesSource.includes('LocalWorkbenchAdapterRegistration')) {
    throw new Error('local workbench adapter registration contract is missing from the neutral workbench type module')
  }
  if (registeredAdaptersSource.includes('garbageLocalWorkbenchAdapter')) {
    throw new Error('local workbench adapter registry still consumes a Garbage-named adapter export instead of a neutral registration')
  }
  if (registeredAdaptersSource.includes('./garbage/')) {
    throw new Error('local workbench adapter registry still imports a resident instance directly instead of the bundled adapter manifest')
  }
  if (!bundledAdaptersSource.includes('./garbage/workbench.js') || !bundledAdaptersSource.includes('bundledLocalWorkbenchAdapterRegistrations')) {
    throw new Error('bundled API adapter manifest no longer owns the resident Garbage adapter import')
  }
  if (!garbageAdapterSource.includes('localWorkbenchAdapterRegistration') || !garbageAdapterSource.includes('compatibilityTables')) {
    throw new Error('Garbage local workbench adapter no longer exposes instance-owned registration metadata')
  }
  if (!garbageAdapterSource.includes('apps/garbage/src/workbench.ts')) {
    throw new Error('Garbage local workbench adapter should consume the parent-owned workbench projection')
  }
  if (!garbageAdapterSource.includes('apps/garbage/src/config.ts')) {
    throw new Error('Garbage local workbench adapter should consume the parent-owned Garbage config')
  }
  if (!garbageStoreShimSource.includes('apps/garbage/src/api/newsletter-store.ts')) {
    throw new Error('resident Garbage newsletter store should only shim to the parent package')
  }
  if (!garbageStoreSource.includes("from '../config.ts'")) {
    throw new Error('Garbage newsletter store should consume the parent-owned Garbage config locally')
  }
  if (!garbageStoreSource.includes("'public', 'data', 'newsletter-snapshot.json'")) {
    throw new Error('Garbage newsletter store should retain legacy static snapshot fallback while bundled in Verdun')
  }
  if (!garbageViewSmokeShimSource.includes('apps/garbage/scripts/smoke-view-model.mjs')) {
    throw new Error('resident Garbage view-model smoke should only shim to the parent package')
  }
  if (!garbageViewSmokeSource.includes('../src/workbench.ts')) {
    throw new Error('Garbage view-model smoke should exercise the parent-owned workbench projection')
  }
  if (existsSync('src/instances/garbage/workbench.ts')) {
    throw new Error('Garbage workbench projection should live in the parent package, not resident Verdun source')
  }
  if (existsSync('src/instances/garbage/config.ts')) {
    throw new Error('Garbage instance config should live in the parent package, not resident Verdun source')
  }
  if (existsSync('src/instances/garbage/newsletter.ts') || existsSync('src/instances/garbage/ontology.ts') || existsSync('src/instances/garbage/ontology.json')) {
    throw new Error('Garbage newsletter and ontology modules should live in the parent package, not resident Verdun source')
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
  const { module: greathouseConfigModule } = await runnerImport('./src/instances/greathouse/config.ts', {
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

  const greathouseInstance = greathouseConfigModule.greathouseInstance
  const greathouseSnapshot = await dbModule.readDatabaseWorkbenchSnapshot(fakeWorkbenchSql('greathouse'), greathouseInstance)
  if (greathouseSnapshot.instance.id !== 'greathouse' || greathouseSnapshot.records[0]?.subject !== 'Berkeley 2BR') {
    throw new Error(`workbench database reader did not honor Greathouse instance parameter: ${JSON.stringify(greathouseSnapshot)}`)
  }
  const greathouseStatus = await dbModule.readDatabaseWorkbenchStatus(fakeWorkbenchSql('greathouse'), greathouseInstance)
  if (greathouseStatus.instance.id !== 'greathouse' || greathouseStatus.recordCount !== 1) {
    throw new Error(`workbench database status did not honor Greathouse instance parameter: ${JSON.stringify(greathouseStatus)}`)
  }
  const greathouseWriteSql = fakeWorkbenchWriteSql()
  await dbModule.writeDatabaseWorkbenchReview(greathouseWriteSql, 'listing-redfin-berkeley-01', 1, greathouseInstance)
  await dbModule.writeDatabaseWorkbenchFocus(greathouseWriteSql, 'Greathouse database focus.', 'ongoing', greathouseInstance)
  if (!greathouseWriteSql.reviewWrites.some((write) => write.instance === 'greathouse' && write.recordId === 'listing-redfin-berkeley-01')) {
    throw new Error(`workbench generic review write did not honor Greathouse instance: ${JSON.stringify(greathouseWriteSql.reviewWrites)}`)
  }
  if (!greathouseWriteSql.focusWrites.some((write) => write.instance === 'greathouse' && write.text === 'Greathouse database focus.')) {
    throw new Error(`workbench generic focus write did not honor Greathouse instance: ${JSON.stringify(greathouseWriteSql.focusWrites)}`)
  }

  const greathouseRecordsResponse = await call(recordsModule.default, 'GET', undefined, { instance: 'greathouse' })
  if (
    greathouseRecordsResponse.code !== 200
    || greathouseRecordsResponse.body?.instance?.id !== 'greathouse'
    || !greathouseRecordsResponse.body?.records?.some((record) => record.provenance?.adapter === 'local-listing-json')
  ) {
    throw new Error(`workbench records route did not resolve the Greathouse instance: ${JSON.stringify(greathouseRecordsResponse.body)}`)
  }

  const greathouseStatusResponse = await call(statusModule.default, 'GET', undefined, { instance: 'greathouse' })
  if (
    greathouseStatusResponse.code !== 200
    || greathouseStatusResponse.body?.instance?.id !== 'greathouse'
    || greathouseStatusResponse.body?.writable !== false
    || greathouseStatusResponse.body?.recordCount !== greathouseRecordsResponse.body.records.length
  ) {
    throw new Error(`workbench status route did not resolve the Greathouse instance: ${JSON.stringify(greathouseStatusResponse.body)}`)
  }
  const greathouseHealthResponse = await call(healthModule.default, 'GET', undefined, { instance: 'greathouse' })
  if (
    greathouseHealthResponse.code !== 200
    || greathouseHealthResponse.body?.instance?.id !== 'greathouse'
    || greathouseHealthResponse.body?.databaseContract?.compatibilityTables?.length !== 0
  ) {
    throw new Error(`workbench health route did not keep Greathouse free of compatibility tables: ${JSON.stringify(greathouseHealthResponse.body)}`)
  }
  if (!greathouseHealthResponse.body?.supportedInstances?.some((instance) => instance.id === 'greathouse' && instance.basePath === '/greathouse/')) {
    throw new Error(`workbench health route did not expose supported instances: ${JSON.stringify(greathouseHealthResponse.body?.supportedInstances)}`)
  }
  if (!greathouseHealthResponse.body?.databaseContract?.reusableViews?.includes('workbench_records')) {
    throw new Error('workbench health route did not expose reusable database views')
  }
  if (!greathouseHealthResponse.body?.readSurfaces?.includes('records')) {
    throw new Error('workbench health route did not expose generic read surfaces')
  }
  if (!greathouseHealthResponse.body?.writeSurfaces?.includes('review') || !greathouseHealthResponse.body?.writeSurfaces?.includes('focus') || !greathouseHealthResponse.body?.writeSurfaces?.includes('state')) {
    throw new Error('workbench health route did not expose generic write surfaces')
  }

  const blocked = await call(recordsModule.default, 'DELETE', undefined, { instance: 'greathouse' })
  if (blocked.code !== 405) throw new Error('workbench records route did not reject DELETE')

  const greathouseReviewResponse = await call(reviewModule.default, 'POST', {
    recordId: 'listing-redfin-berkeley-01',
    review: 1,
  }, { instance: 'greathouse' })
  if (greathouseReviewResponse.code !== 403 || greathouseReviewResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench review route did not keep read-only Greathouse pilot writes isolated: ${JSON.stringify(greathouseReviewResponse.body)}`)
  }
  const greathouseFocusResponse = await call(focusModule.default, 'POST', {
    text: 'Greathouse route focus.',
    scope: 'this_week',
  }, { instance: 'greathouse' })
  if (greathouseFocusResponse.code !== 403 || greathouseFocusResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench focus route did not keep read-only Greathouse pilot writes isolated: ${JSON.stringify(greathouseFocusResponse.body)}`)
  }
  const greathouseStateResponse = await call(stateModule.default, 'POST', {
    reviews: { 'listing-redfin-berkeley-01': 1 },
  }, { instance: 'greathouse' })
  if (greathouseStateResponse.code !== 403 || greathouseStateResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench state route did not keep read-only Greathouse pilot writes isolated: ${JSON.stringify(greathouseStateResponse.body)}`)
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
        if (expectedInstance === 'greathouse') {
          return [{
            id: 'listing-redfin-berkeley-01',
            title: 'Berkeley two-bedroom with transit access',
            source: 'Redfin',
            source_kind: 'listing',
            url: 'https://example.com/greathouse/berkeley-two-bedroom',
            observed_at: '2026-06-16T12:00:00.000Z',
            subject: 'Berkeley 2BR',
            topic: 'buyer shortlist',
            summary: 'Generic Greathouse workbench database record.',
            tags: ['berkeley', '2br', 'transit'],
            score: 86,
            review: 1,
            provenance_json: {
              stage: 'local_json',
              adapter: 'local-listing-json',
              source: 'Redfin',
              source_kind: 'listing',
              source_url: 'https://example.com/redfin',
              evidence_url: 'https://example.com/greathouse/berkeley-two-bedroom',
              subject: 'Berkeley 2BR',
              matched_keywords: ['berkeley', '2br'],
            },
          }]
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
        if (expectedInstance === 'greathouse') {
          return [{
            source: 'Redfin',
            kind: 'listing',
            status: 'ok',
            item_count: 1,
            message: 'Greathouse source run',
            subject_counts: { 'Berkeley 2BR': 1 },
          }]
        }
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
        if (expectedInstance === 'greathouse') {
          return [{
            subject: 'Berkeley 2BR',
            topic: 'buyer shortlist',
            query: 'Berkeley 2BR transit comparable',
            live_terms: ['berkeley', '2br'],
            tags: ['berkeley'],
            review_targets: [{
              source: 'Redfin',
              label: 'Redfin Berkeley 2BR',
              url: 'https://example.com/redfin/search/berkeley-2br',
              adapter: 'local-listing-json',
            }],
            focus_terms: ['transit'],
          }]
        }
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

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runnerImport } from 'vite'

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
  const [dbSource, healthSource] = await Promise.all([
    readFile('api/workbench/_db.ts', 'utf8'),
    readFile('api/workbench/health.ts', 'utf8'),
  ])
  if (dbSource.includes('../instances/garbage/workbench') || dbSource.includes('instances/garbage/config')) {
    throw new Error('generic workbench DB helper still imports Garbage instance adapters directly')
  }
  if (healthSource.includes('newsletter_')) {
    throw new Error('generic workbench health route still names newsletter compatibility tables directly')
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

  const snapshot = await dbModule.readWorkbenchSnapshot()
  if (snapshot.instance.id !== 'garbage' || snapshot.instance.basePath !== '/rbage/') {
    throw new Error(`workbench snapshot did not expose the Garbage instance: ${JSON.stringify(snapshot.instance)}`)
  }
  if (snapshot.records.length < 23 || !snapshot.records.some((record) => record.subject === 'Pydantic')) {
    throw new Error('workbench snapshot did not expose generic records')
  }
  if (!snapshot.collectionPlans.some((plan) => plan.subject === 'Pydantic' && plan.query.includes('Pydantic'))) {
    throw new Error('workbench snapshot did not expose generic collection plans')
  }
  if (!snapshot.sourceRuns.some((run) => run.subjectCounts && typeof run.subjectCounts === 'object')) {
    throw new Error('workbench snapshot did not expose generic source-run subject counts')
  }

  const status = await dbModule.readWorkbenchStatus()
  if (status.recordCount !== snapshot.records.length || status.collectionPlanCount !== snapshot.collectionPlans.length) {
    throw new Error(`workbench status counts did not match snapshot: ${JSON.stringify(status)}`)
  }

  const databaseSnapshot = await dbModule.readDatabaseWorkbenchSnapshot(fakeWorkbenchSql())
  if (
    databaseSnapshot.editorialPersistence !== 'database'
    || databaseSnapshot.records[0]?.subject !== 'Pydantic'
    || databaseSnapshot.records[0]?.provenance?.subject !== 'Pydantic'
    || databaseSnapshot.sourceRuns[0]?.subjectCounts?.Pydantic !== 1
    || databaseSnapshot.collectionPlans[0]?.query !== 'Pydantic pydantic'
  ) {
    throw new Error(`workbench database-view reader did not map generic rows: ${JSON.stringify(databaseSnapshot)}`)
  }
  const databaseStatus = await dbModule.readDatabaseWorkbenchStatus(fakeWorkbenchSql())
  if (databaseStatus.recordCount !== 1 || databaseStatus.collectionPlanCount !== 1 || databaseStatus.editorialPersistence !== 'database') {
    throw new Error(`workbench database-view status did not map generic counts: ${JSON.stringify(databaseStatus)}`)
  }
  const writeSql = fakeWorkbenchWriteSql()
  await dbModule.writeDatabaseWorkbenchReview(writeSql, 'db-pydantic', 1)
  const focus = await dbModule.writeDatabaseWorkbenchFocus(writeSql, 'Database focus write.', 'this_week')
  const stateImport = await dbModule.writeDatabaseWorkbenchState(writeSql, {
    reviews: { 'db-pydantic': -1 },
    focuses: [{
      id: 'focus-state-db',
      text: 'Database state focus.',
      scope: 'ongoing',
      created_at: '2026-06-16T12:30:00.000Z',
    }],
  })
  if (!writeSql.reviewWrites.some((write) => write.recordId === 'db-pydantic' && write.review === 1)) {
    throw new Error(`workbench generic review write did not target review_state: ${JSON.stringify(writeSql.reviewWrites)}`)
  }
  if (!writeSql.reviewWrites.some((write) => write.recordId === 'db-pydantic' && write.review === -1)) {
    throw new Error(`workbench generic state import did not target review_state: ${JSON.stringify(writeSql.reviewWrites)}`)
  }
  if (!writeSql.focusWrites.some((write) => write.text === 'Database focus write.' && write.scope === 'this_week')) {
    throw new Error(`workbench generic focus write did not target focuses: ${JSON.stringify(writeSql.focusWrites)}`)
  }
  if (!writeSql.focusWrites.some((write) => write.id === 'focus-state-db' && write.scope === 'ongoing')) {
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

  const recordsResponse = await call(recordsModule.default)
  if (recordsResponse.code !== 200 || recordsResponse.body?.records?.length !== snapshot.records.length) {
    throw new Error('workbench records route did not return the generic snapshot')
  }

  const statusResponse = await call(statusModule.default)
  if (statusResponse.code !== 200 || statusResponse.body?.instance?.id !== 'garbage' || statusResponse.body?.recordCount !== snapshot.records.length) {
    throw new Error(`workbench status route did not return generic status: ${JSON.stringify(statusResponse.body)}`)
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
    throw new Error(`workbench health route did not keep Greathouse free of Garbage compatibility tables: ${JSON.stringify(greathouseHealthResponse.body)}`)
  }

  const healthResponse = await call(healthModule.default)
  if (healthResponse.code !== 200 || healthResponse.body?.service !== 'workbench') {
    throw new Error('workbench health route did not identify the generic workbench service')
  }
  if (!healthResponse.body?.supportedInstances?.some((instance) => instance.id === 'greathouse' && instance.basePath === '/greathouse/')) {
    throw new Error(`workbench health route did not expose supported instances: ${JSON.stringify(healthResponse.body?.supportedInstances)}`)
  }
  if (!healthResponse.body?.databaseContract?.reusableViews?.includes('workbench_records')) {
    throw new Error('workbench health route did not expose reusable database views')
  }
  if (!healthResponse.body?.databaseContract?.compatibilityTables?.includes('newsletter_items')) {
    throw new Error('workbench health route did not expose Garbage compatibility tables through instance metadata')
  }
  if (!healthResponse.body?.readSurfaces?.includes('records')) {
    throw new Error('workbench health route did not expose generic read surfaces')
  }
  if (!healthResponse.body?.writeSurfaces?.includes('review') || !healthResponse.body?.writeSurfaces?.includes('focus') || !healthResponse.body?.writeSurfaces?.includes('state')) {
    throw new Error('workbench health route did not expose generic write surfaces')
  }

  const blocked = await call(recordsModule.default, 'DELETE')
  if (blocked.code !== 405) throw new Error('workbench records route did not reject DELETE')

  const recordId = snapshot.records[0]?.id
  if (!recordId) throw new Error('workbench smoke could not find a record to review')
  const reviewResponse = await call(reviewModule.default, 'POST', { recordId, review: 1 })
  if (reviewResponse.code !== 200 || reviewResponse.body?.review !== 1) {
    throw new Error(`workbench review route did not accept a generic review: ${JSON.stringify(reviewResponse.body)}`)
  }
  const focusResponse = await call(focusModule.default, 'POST', {
    text: 'Workbench focus smoke note.',
    scope: 'this_week',
  })
  if (focusResponse.code !== 200 || focusResponse.body?.focus?.text !== 'Workbench focus smoke note.') {
    throw new Error(`workbench focus route did not accept a generic focus: ${JSON.stringify(focusResponse.body)}`)
  }
  const stateResponse = await call(stateModule.default, 'POST', {
    reviews: { [recordId]: -1 },
    focuses: [{
      id: 'focus-state-route',
      text: 'Workbench state route focus.',
      scope: 'ongoing',
      created_at: '2026-06-16T13:00:00.000Z',
    }],
  })
  if (stateResponse.code !== 200 || stateResponse.body?.importedReviews !== 1 || stateResponse.body?.importedFocuses !== 1) {
    throw new Error(`workbench state route did not accept generic state import: ${JSON.stringify(stateResponse.body)}`)
  }
  const greathouseReviewResponse = await call(reviewModule.default, 'POST', {
    recordId: 'listing-redfin-berkeley-01',
    review: 1,
  }, { instance: 'greathouse' })
  if (greathouseReviewResponse.code !== 403 || greathouseReviewResponse.body?.error !== 'workbench_instance_read_only') {
    throw new Error(`workbench review route did not keep read-only Greathouse pilot writes isolated: ${JSON.stringify(greathouseReviewResponse.body)}`)
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
  const updatedSnapshot = await dbModule.readWorkbenchSnapshot()
  if (!updatedSnapshot.records.some((record) => record.id === recordId && record.review === -1)) {
    throw new Error('workbench state route did not persist imported reviews into projected records')
  }
  if (!updatedSnapshot.focuses.some((focus) => focus.text === 'Workbench focus smoke note.')) {
    throw new Error('workbench focus route did not persist into projected focuses')
  }
  if (!updatedSnapshot.focuses.some((focus) => focus.text === 'Workbench state route focus.')) {
    throw new Error('workbench state route did not persist imported focuses into projected focuses')
  }

  const invalidReview = await call(reviewModule.default, 'POST', { recordId, review: 4 })
  if (invalidReview.code !== 400) throw new Error('workbench review route did not reject invalid review values')
} finally {
  delete process.env.VERCEL
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.NEON_DATABASE_URL
  await rm(stateDir, { recursive: true, force: true })
}

function fakeWorkbenchSql(expectedInstance = 'garbage') {
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
          id: 'db-pydantic',
          title: 'Pydantic database record',
          source: 'Hacker News',
          source_kind: 'community',
          url: 'https://example.com/pydantic',
          observed_at: '2026-06-16T12:00:00.000Z',
          subject: 'Pydantic',
          topic: 'typed AI',
          summary: 'Generic workbench database record.',
          tags: ['pydantic', 'typed-agents'],
          score: 91,
          review: 1,
          provenance_json: {
            stage: 'live',
            adapter: 'hn-algolia',
            source: 'Hacker News',
            source_kind: 'community',
            source_url: 'https://hn.algolia.com',
            evidence_url: 'https://example.com/pydantic',
            project: 'Pydantic',
            matched_keywords: ['pydantic'],
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
          source: 'Hacker News',
          kind: 'community',
          status: 'ok',
          item_count: 1,
          message: 'database source run',
          subject_counts: { Pydantic: 1 },
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
          subject: 'Pydantic',
          topic: 'typed AI',
          query: 'Pydantic pydantic',
          live_terms: ['pydantic'],
          tags: ['pydantic'],
          review_targets: [{
            source: 'Hacker News',
            label: 'HN: Pydantic',
            url: 'https://hn.algolia.com/?query=Pydantic',
            adapter: 'hn-algolia',
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

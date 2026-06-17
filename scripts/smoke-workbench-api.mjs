import { mkdtemp, rm } from 'node:fs/promises'
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

async function call(handler, method = 'GET', body = undefined) {
  const response = responseRecorder()
  await handler({ method, query: {}, body }, response)
  return response
}

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-workbench-api-'))
process.env.VERDUN_LOCAL_STATE_FILE = join(stateDir, 'editorial-state.json')
delete process.env.POSTGRES_URL
delete process.env.DATABASE_URL
delete process.env.NEON_DATABASE_URL

try {
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

  const recordsResponse = await call(recordsModule.default)
  if (recordsResponse.code !== 200 || recordsResponse.body?.records?.length !== snapshot.records.length) {
    throw new Error('workbench records route did not return the generic snapshot')
  }

  const statusResponse = await call(statusModule.default)
  if (statusResponse.code !== 200 || statusResponse.body?.instance?.id !== 'garbage' || statusResponse.body?.recordCount !== snapshot.records.length) {
    throw new Error(`workbench status route did not return generic status: ${JSON.stringify(statusResponse.body)}`)
  }

  const healthResponse = await call(healthModule.default)
  if (healthResponse.code !== 200 || healthResponse.body?.service !== 'workbench') {
    throw new Error('workbench health route did not identify the generic workbench service')
  }
  if (!healthResponse.body?.databaseContract?.reusableViews?.includes('workbench_records')) {
    throw new Error('workbench health route did not expose reusable database views')
  }
  if (!healthResponse.body?.readSurfaces?.includes('records')) {
    throw new Error('workbench health route did not expose generic read surfaces')
  }
  if (!healthResponse.body?.writeSurfaces?.includes('review') || !healthResponse.body?.writeSurfaces?.includes('focus')) {
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
  const updatedSnapshot = await dbModule.readWorkbenchSnapshot()
  if (!updatedSnapshot.records.some((record) => record.id === recordId && record.review === 1)) {
    throw new Error('workbench review route did not persist into projected records')
  }
  if (!updatedSnapshot.focuses.some((focus) => focus.text === 'Workbench focus smoke note.')) {
    throw new Error('workbench focus route did not persist into projected focuses')
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

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

async function call(handler, method = 'GET') {
  const response = responseRecorder()
  await handler({ method, query: {} }, response)
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

  const blocked = await call(recordsModule.default, 'DELETE')
  if (blocked.code !== 405) throw new Error('workbench records route did not reject DELETE')
} finally {
  delete process.env.VERCEL
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.NEON_DATABASE_URL
  await rm(stateDir, { recursive: true, force: true })
}

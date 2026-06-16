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

let healthHandler

async function callHealth(method = 'GET') {
  const response = responseRecorder()
  await healthHandler({ method, query: {} }, response)
  return response
}

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-health-'))
process.env.VERDUN_LOCAL_STATE_FILE = join(stateDir, 'editorial-state.json')
delete process.env.POSTGRES_URL
delete process.env.DATABASE_URL
delete process.env.NEON_DATABASE_URL

try {
  const { module } = await runnerImport('./api/newsletter/health.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  healthHandler = module.default

  const local = await callHealth()
  if (local.code !== 200) throw new Error(`health API returned ${local.code}`)
  if (local.body?.service !== 'newsletter' || local.body?.surface !== 'health') {
    throw new Error('health API did not identify the newsletter health surface')
  }
  if (local.body?.state !== 'database_not_configured' || local.body?.databaseConfigured !== false) {
    throw new Error(`health API did not report missing database env: ${JSON.stringify(local.body)}`)
  }
  if (local.body?.editorialPersistence !== 'local_file') {
    throw new Error(`local health API should report local_file persistence: ${local.body?.editorialPersistence}`)
  }
  if (!local.body?.readSurfaces?.includes('draft') || !local.body?.writeSurfaces?.includes('editorial-state')) {
    throw new Error('health API did not expose read/write surfaces')
  }
  if (!local.body?.publishingSurfaces?.includes('ghost:ready') || !local.body?.publishingSurfaces?.includes('ulysses:ready')) {
    throw new Error('health API did not expose publishing surfaces')
  }
  if (!local.body?.weeklyUpdate?.loader?.includes('db:deploy')) {
    throw new Error('health API did not expose the guarded DB loader command')
  }
  if (local.body?.weeklyUpdate?.activeSnapshot?.itemCount < 23) {
    throw new Error('health API active snapshot did not include item counts')
  }

  process.env.VERCEL = '1'
  const deployedNoDb = await callHealth()
  if (deployedNoDb.body?.editorialPersistence !== 'browser' || deployedNoDb.body?.weeklyUpdate?.activeSnapshot?.writable !== false) {
    throw new Error(`deployed no-DB health should report browser read-only state: ${JSON.stringify(deployedNoDb.body)}`)
  }
} finally {
  delete process.env.VERCEL
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.NEON_DATABASE_URL
  await rm(stateDir, { recursive: true, force: true })
}

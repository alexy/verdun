import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runnerImport } from 'vite'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-api-'))
const stateFile = join(stateDir, 'editorial-state.json')
process.env.VERDUN_LOCAL_STATE_FILE = stateFile

try {
  const { module } = await runnerImport('./api/newsletter/_db.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const firstSnapshot = await module.readSnapshot()
  if (firstSnapshot.editorialPersistence !== 'local_file') {
    throw new Error(`local API snapshot expected local_file persistence, found ${firstSnapshot.editorialPersistence}`)
  }
  const firstStatus = await module.readStatus()
  if (firstStatus.editorialPersistence !== 'local_file' || !firstStatus.writable) {
    throw new Error(`local API status expected writable local_file persistence: ${JSON.stringify(firstStatus)}`)
  }
  if (firstStatus.itemCount < 23 || firstStatus.queryPlanCount < 23) {
    throw new Error(`local API status reported incomplete snapshot counts: ${JSON.stringify(firstStatus)}`)
  }
  const item = firstSnapshot.items[0]
  if (!item) throw new Error('snapshot has no items')
  if (!item.provenance?.stage || !item.provenance?.evidenceUrl) {
    throw new Error('local API snapshot did not expose item provenance')
  }
  const pydanticPlan = firstSnapshot.queryPlans.find((plan) => plan.project === 'Pydantic')
  if (!pydanticPlan?.reviewTargets?.some((target) => target.source === 'LinkedIn' && target.url.startsWith('https://'))) {
    throw new Error('local API snapshot did not expose query-plan review targets')
  }

  await module.writeVote(item.id, 1)
  const focus = await module.writeFocus('More local graph databases with typed query planning.', 'this_week')
  if (!focus?.id) throw new Error('local focus was not returned')
  const importResult = await module.writeEditorialState({
    votes: {
      [item.id]: -1,
      'missing-smoke-item': 1,
    },
    focuses: [
      {
        id: 'focus-bulk-import',
        text: 'Bulk imported local editorial state.',
        scope: 'ongoing',
        created_at: '2026-06-15T13:00:00Z',
      },
    ],
  })
  if (importResult.importedVotes !== 2 || importResult.importedFocuses !== 1) {
    throw new Error(`unexpected local editorial state import counts: ${JSON.stringify(importResult)}`)
  }

  const secondSnapshot = await module.readSnapshot()
  const updatedItem = secondSnapshot.items.find((candidate) => candidate.id === item.id)
  if (updatedItem?.vote !== -1) throw new Error('local imported vote did not persist')
  if (!secondSnapshot.focuses.some((candidate) => candidate.id === focus.id)) {
    throw new Error('local focus did not persist')
  }
  if (!secondSnapshot.focuses.some((candidate) => candidate.text === 'Bulk imported local editorial state.')) {
    throw new Error('local imported focus did not persist')
  }

  const state = JSON.parse(await readFile(stateFile, 'utf8'))
  if (state.votes[item.id] !== -1) throw new Error('state file did not record imported vote')
  if (!state.focuses.some((candidate) => candidate.id === focus.id)) {
    throw new Error('state file did not record focus')
  }
  if (!state.focuses.some((candidate) => candidate.text === 'Bulk imported local editorial state.')) {
    throw new Error('state file did not record imported focus')
  }

  process.env.VERCEL = '1'
  const deployedSnapshot = await module.readSnapshot()
  if (deployedSnapshot.editorialPersistence !== 'browser') {
    throw new Error(`deployed no-database snapshot expected browser persistence, found ${deployedSnapshot.editorialPersistence}`)
  }
  const deployedStatus = await module.readStatus()
  if (deployedStatus.editorialPersistence !== 'browser' || deployedStatus.writable) {
    throw new Error(`deployed no-database status expected read-only browser persistence: ${JSON.stringify(deployedStatus)}`)
  }
  let blockedDeployedWrite = false
  try {
    await module.writeVote(item.id, -1)
  } catch (error) {
    blockedDeployedWrite = error?.statusCode === 503 && error?.code === 'editorial_persistence_unavailable'
  }
  if (!blockedDeployedWrite) throw new Error('deployed no-database writes should be reported as unavailable')
} finally {
  delete process.env.VERCEL
  await rm(stateDir, { recursive: true, force: true })
}

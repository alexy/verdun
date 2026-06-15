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
  const item = firstSnapshot.items[0]
  if (!item) throw new Error('snapshot has no items')

  await module.writeVote(item.id, 1)
  const focus = await module.writeFocus('More local graph databases with typed query planning.', 'this_week')
  if (!focus?.id) throw new Error('local focus was not returned')

  const secondSnapshot = await module.readSnapshot()
  const updatedItem = secondSnapshot.items.find((candidate) => candidate.id === item.id)
  if (updatedItem?.vote !== 1) throw new Error('local vote did not persist')
  if (!secondSnapshot.focuses.some((candidate) => candidate.id === focus.id)) {
    throw new Error('local focus did not persist')
  }

  const state = JSON.parse(await readFile(stateFile, 'utf8'))
  if (state.votes[item.id] !== 1) throw new Error('state file did not record vote')
  if (!state.focuses.some((candidate) => candidate.id === focus.id)) {
    throw new Error('state file did not record focus')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-draft-'))
const stateFile = join(stateDir, 'editorial-state.json')
process.env.VERDUN_LOCAL_STATE_FILE = stateFile

try {
  await writeFile(stateFile, JSON.stringify({
    votes: {
      'grust-sail-3683deba292c': 1,
    },
    focuses: [
      {
        id: 'focus-smoke-grust-sail',
        text: 'More Sail graph lowering and typed lakehouse execution details.',
        scope: 'this_week',
        created_at: '2026-06-15T14:00:00Z',
      },
    ],
  }))

  const snapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
  const item = snapshot.items.find((candidate) => candidate.id === 'grust-sail-3683deba292c')
  if (item?.vote !== 1) throw new Error('local Grust Sail vote was not applied to snapshot')
  if (!snapshot.focuses.some((focus) => focus.id === 'focus-smoke-grust-sail')) {
    throw new Error('local focus was not applied to snapshot')
  }

  const draft = await buildNewsletterDraft(snapshot)
  if (!draft.itemIds.includes('grust-sail-3683deba292c')) {
    throw new Error('local upvote did not promote Grust Sail into the draft')
  }
  if (!draft.markdown.includes('This week: More Sail graph lowering and typed lakehouse execution details.')) {
    throw new Error('local focus was not included in the draft')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

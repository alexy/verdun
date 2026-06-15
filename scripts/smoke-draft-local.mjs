import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertDraftReady, buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-draft-'))
const stateFile = join(stateDir, 'editorial-state.json')
process.env.VERDUN_LOCAL_STATE_FILE = stateFile

try {
  process.env.NEWSLETTER_APPLY_LOCAL_STATE = 'false'
  const rawSnapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
  const rawDraft = await buildNewsletterDraft(rawSnapshot)
  let rejectedRawDraft = false
  try {
    assertDraftReady(rawSnapshot, rawDraft, { requireUpvotes: true })
  } catch {
    rejectedRawDraft = true
  }
  if (!rejectedRawDraft) throw new Error('raw fallback draft was not rejected when upvotes were required')

  delete process.env.NEWSLETTER_APPLY_LOCAL_STATE
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
  assertDraftReady(snapshot, draft, { requireUpvotes: true })
  if (!draft.itemIds.includes('grust-sail-3683deba292c')) {
    throw new Error('local upvote did not promote Grust Sail into the draft')
  }
  if (!draft.markdown.includes('This week: More Sail graph lowering and typed lakehouse execution details.')) {
    throw new Error('local focus was not included in the draft')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

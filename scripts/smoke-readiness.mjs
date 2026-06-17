import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateNewsletterReadiness, loadSnapshotFile } from './instances/garbage/newsletter-draft.mjs'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-readiness-'))
const stateFile = join(stateDir, 'editorial-state.json')
process.env.VERDUN_LOCAL_STATE_FILE = stateFile

try {
  process.env.NEWSLETTER_APPLY_LOCAL_STATE = 'false'
  const rawSnapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
  const rawReadiness = await evaluateNewsletterReadiness(rawSnapshot)
  const rawUpvoteCheck = rawReadiness.checks.find((check) => check.id === 'upvotes')
  if (rawReadiness.status !== 'needs_review' || rawUpvoteCheck?.passed) {
    throw new Error('readiness should require an explicit upvote before publishing')
  }

  delete process.env.NEWSLETTER_APPLY_LOCAL_STATE
  await writeFile(stateFile, JSON.stringify({
    votes: {
      'grust-sail-3683deba292c': 1,
      'lakesail-e5ce5d36852a': 1,
    },
    focuses: [
      {
        id: 'focus-smoke-readiness',
        text: 'More typed lakehouse execution details with graph lowering.',
        scope: 'this_week',
        created_at: '2026-06-15T14:00:00Z',
      },
    ],
  }))

  const snapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
  const readiness = await evaluateNewsletterReadiness(snapshot)
  if (readiness.status !== 'ready') {
    throw new Error(`readiness should pass with upvotes, focus, source coverage, and healthy sources: ${readiness.summary}`)
  }
  if (readiness.upvotedCount !== 2 || readiness.focusCount < 1 || readiness.liveSourceCount < 3) {
    throw new Error('readiness counters did not reflect the editorial state')
  }
  const staleReadiness = await evaluateNewsletterReadiness({
    ...snapshot,
    generatedAt: '2026-01-01T00:00:00Z',
  })
  const staleCheck = staleReadiness.checks.find((check) => check.id === 'snapshot-freshness')
  if (staleReadiness.status !== 'needs_review' || staleCheck?.passed !== false || !staleCheck.detail.includes('rerun collect --live')) {
    throw new Error(`readiness should reject stale snapshots before publishing: ${JSON.stringify(staleCheck)}`)
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertDraftReady, buildNewsletterDraft, evaluateNewsletterProseQuality, loadSnapshotFile } from './instances/garbage/newsletter-draft.mjs'

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-draft-'))
const stateFile = join(stateDir, 'editorial-state.json')
process.env.VERDUN_LOCAL_STATE_FILE = stateFile

try {
  process.env.NEWSLETTER_APPLY_LOCAL_STATE = 'false'
  const rawSnapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
  const rawDraft = await buildNewsletterDraft(rawSnapshot)
  let rejectedRawDraft = false
  try {
    await assertDraftReady(rawSnapshot, rawDraft, { requireUpvotes: true })
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
  await assertDraftReady(snapshot, draft, { requireUpvotes: true, requireReady: true })
  if (!draft.itemIds.includes('grust-sail-3683deba292c')) {
    throw new Error('local upvote did not promote Grust Sail into the draft')
  }
  if (!draft.markdown.includes('This week: More Sail graph lowering and typed lakehouse execution details.')) {
    throw new Error('local focus was not included in the draft')
  }
  if (!draft.markdown.includes('## Weekly throughline')) {
    throw new Error('local draft did not include the weekly throughline')
  }
  if (!draft.markdown.includes('## Editor\'s letter')) {
    throw new Error('local draft did not include the editor letter')
  }
  if (!draft.markdown.includes('## Editorial arc')) {
    throw new Error('local draft did not include the editorial arc')
  }
  if (!draft.markdown.includes('## Closing note')) {
    throw new Error('local draft did not include the closing note')
  }
  if (!draft.markdown.includes('AI systems do not become safer or more useful by becoming more mystical')) {
    throw new Error('local draft editor letter did not include literary synthesis')
  }
  if (!draft.markdown.includes('Lead with Grust Sail')) {
    throw new Error('local draft editorial arc did not use the selected lead item')
  }
  if (draft.markdown.includes('Then let') && draft.markdown.includes('widens')) {
    throw new Error('local draft editorial arc did not use clean support phrasing')
  }
  if (!draft.markdown.includes('Evidence:')) {
    throw new Error('local draft did not include item provenance evidence')
  }
  if (!draft.markdown.includes('[Evidence link](')) {
    throw new Error('local draft evidence was not linked to the source evidence URL')
  }
  if (!draft.markdown.includes('The editorial intent asks for more sail graph lowering and typed lakehouse execution details')) {
    throw new Error('local draft throughline did not use the saved focus')
  }
  const weakDraft = {
    ...draft,
    markdown: draft.markdown.replace(/\nEvidence: [^\n]+/, ''),
  }
  const weakQuality = await evaluateNewsletterProseQuality(weakDraft, snapshot)
  if (weakQuality.status !== 'needs_review') {
    throw new Error('prose quality gate did not reject a selected item without source-linked evidence')
  }
  const evidenceCheck = weakQuality.checks.find((check) => check.id === 'evidence-lines')
  if (evidenceCheck?.passed || !evidenceCheck?.detail.includes('Grust Sail')) {
    throw new Error('prose quality evidence check did not identify the selected item missing evidence')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

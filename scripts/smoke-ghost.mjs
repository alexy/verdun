import { buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'
import { assertGhostPublishGates, assertGhostStatusAllowed, ghostEndpoint, ghostExcerpt, ghostJwt, ghostPostPayload, ghostSlug, parseGhostArgs } from './publish-ghost.mjs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const options = parseGhostArgs(['--dry-run', '--require-upvotes', '--require-ready', 'draft'], {
  GHOST_ADMIN_API_URL: 'https://collected.ga',
  GHOST_ADMIN_API_KEY: 'a'.repeat(24) + ':' + 'b'.repeat(64),
})
if (!options.dryRun) throw new Error('dry-run option was not parsed')
if (!options.requireUpvotes) throw new Error('require-upvotes option was not parsed')
if (!options.requireReady) throw new Error('require-ready option was not parsed')
if (options.allowNonDraft) throw new Error('allow-non-draft should default to false')
if (options.allowUngatedPublish) throw new Error('allow-ungated-publish should default to false')
if (options.status !== 'draft') throw new Error('draft status was not parsed')
if (ghostEndpoint(options.apiUrl) !== 'https://collected.ga/ghost/api/admin/posts/?source=html') {
  throw new Error('Ghost endpoint is not stable')
}
const manifestOptions = parseGhostArgs(['--dry-run', '--manifest-out', '/tmp/ghost.json', 'draft'], {})
if (manifestOptions.manifestOut !== '/tmp/ghost.json') throw new Error('manifest-out option was not parsed')
const manifestEqualsOptions = parseGhostArgs(['--dry-run', '--manifest-out=/tmp/ghost-equals.json', 'draft'], {})
if (manifestEqualsOptions.manifestOut !== '/tmp/ghost-equals.json') throw new Error('manifest-out equals option was not parsed')
const editorialStateOptions = parseGhostArgs(['--dry-run', '--editorial-state', '/tmp/editorial-state.json', 'draft'], {})
if (editorialStateOptions.editorialStateInput !== '/tmp/editorial-state.json') throw new Error('editorial-state option was not parsed')
const editorialStateEqualsOptions = parseGhostArgs(['--dry-run', '--editorial-state=/tmp/editorial-state-equals.json', 'draft'], {})
if (editorialStateEqualsOptions.editorialStateInput !== '/tmp/editorial-state-equals.json') throw new Error('editorial-state equals option was not parsed')
const unsafeOverrideOptions = parseGhostArgs(['--allow-ungated-publish', 'draft'], {})
if (!unsafeOverrideOptions.allowUngatedPublish) throw new Error('allow-ungated-publish option was not parsed')

const jwt = ghostJwt(options.apiKey)
if (jwt.split('.').length !== 3) throw new Error('Ghost JWT is malformed')

const snapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
const draft = await buildNewsletterDraft(snapshot)
const payload = ghostPostPayload(draft, options.status)
const post = payload.posts[0]
if (post.title !== draft.title) throw new Error('payload title does not match draft')
if (post.custom_excerpt !== draft.subtitle) throw new Error('payload excerpt does not match draft')
if (post.slug !== ghostSlug(draft.title)) throw new Error('payload slug is not deterministic')
if (post.meta_title !== draft.title) throw new Error('payload meta title does not match draft')
if (post.meta_description !== post.custom_excerpt) throw new Error('payload meta description does not match excerpt')
if (!post.html.includes('<h1>')) throw new Error('payload html is missing rendered headings')
if (!post.html.includes('<h2>Editor\'s letter</h2>')) throw new Error('payload html is missing the editor letter')
if (!post.html.includes('<h2>Editorial arc</h2>')) throw new Error('payload html is missing the editorial arc')
if (!post.html.includes('<h2>Closing note</h2>')) throw new Error('payload html is missing the closing note')
if (!post.html.includes('<strong>Typed contracts</strong>')) throw new Error('payload html is missing rendered strong text')
if (post.html.includes('**Typed contracts**')) throw new Error('payload html leaked markdown emphasis')
if (post.status !== 'draft') throw new Error('payload status does not match')
if (!post.tags.includes('strongly-typed')) throw new Error('payload tags are missing newsletter taxonomy')
const publishOptions = parseGhostArgs(['--dry-run', '--allow-non-draft', 'published'], {
  GHOST_ADMIN_API_URL: 'https://collected.ga',
  GHOST_ADMIN_API_KEY: 'a'.repeat(24) + ':' + 'b'.repeat(64),
})
if (publishOptions.status !== 'published' || !publishOptions.allowNonDraft) {
  throw new Error('non-draft status override was not parsed')
}
assertGhostStatusAllowed(publishOptions)
let blockedNonDraft = false
try {
  assertGhostStatusAllowed(parseGhostArgs(['published'], {}))
} catch (error) {
  blockedNonDraft = error.message.includes('refuses non-draft status')
}
if (!blockedNonDraft) throw new Error('Ghost helper did not block non-draft status without explicit override')
let blockedUngatedPublish = false
try {
  assertGhostPublishGates(parseGhostArgs(['draft'], {}))
} catch (error) {
  blockedUngatedPublish = error.message.includes('refuses real API writes')
}
if (!blockedUngatedPublish) throw new Error('Ghost helper did not block real ungated API writes')
assertGhostPublishGates(parseGhostArgs(['--dry-run', 'draft'], {}))
assertGhostPublishGates(parseGhostArgs(['--allow-ungated-publish', 'draft'], {}))
assertGhostPublishGates(parseGhostArgs(['--require-upvotes', '--require-ready', 'draft'], {}))
const { stdout: dryRunStdout, manifestText: dryRunManifestText } = await runGhostDryRun()
const dryRunOutput = JSON.parse(dryRunStdout)
if (dryRunOutput.endpoint !== 'https://collected.ga/ghost/api/admin/posts/?source=html') {
  throw new Error('dry-run output did not include the Ghost endpoint')
}
if (dryRunOutput.payload.posts[0].slug !== post.slug) {
  throw new Error('dry-run output did not include the Ghost payload')
}
const fileOutput = JSON.parse(dryRunManifestText)
if (fileOutput.payload.posts[0].slug !== dryRunOutput.payload.posts[0].slug) {
  throw new Error('ghost manifest file did not match dry-run output')
}
if (fileOutput.manifest.editorialStateInput !== dryRunOutput.manifest.editorialStateInput) {
  throw new Error('ghost manifest file did not preserve the editorial-state input')
}
if (!fileOutput.manifest.selectedItems?.length || fileOutput.manifest.selectedItems.some((item) => !item.selectionReason)) {
  throw new Error('ghost manifest file did not include selected item reasons')
}
if (fileOutput.manifest.proseQuality?.status !== 'ready') {
  throw new Error('ghost manifest file did not include ready prose quality')
}
if (!fileOutput.manifest.selectedEvidence?.sourceMix?.length) {
  throw new Error('ghost manifest file did not include selected evidence source mix')
}
if (!fileOutput.manifest.issue?.slug || fileOutput.manifest.issue.title !== fileOutput.manifest.title) {
  throw new Error('ghost manifest file did not include issue identity metadata')
}
if (dryRunOutput.manifest.snapshotInput !== 'public/data/newsletter-snapshot.json') {
  throw new Error('dry-run output did not include manifest snapshot input')
}
if (!dryRunOutput.manifest.editorialStateInput?.endsWith('editorial-state.json')) {
  throw new Error('dry-run output did not include manifest editorial-state input')
}
if (!dryRunOutput.manifest.itemIds?.length || !dryRunOutput.manifest.selectedItems?.length) {
  throw new Error('dry-run output did not include manifest selected item audit data')
}
if (dryRunOutput.manifest.gates.requireReady !== true || dryRunOutput.manifest.gates.requireUpvotes !== true) {
  throw new Error('dry-run output did not include manifest gate settings')
}
if (ghostSlug('Strongly Typed AI/Data Notes: June 15, 2026') !== 'strongly-typed-ai-data-notes-june-15-2026') {
  throw new Error('Ghost slug helper did not normalize the newsletter title')
}
if (ghostExcerpt('x'.repeat(320)).length > 280 || !ghostExcerpt('x'.repeat(320)).endsWith('...')) {
  throw new Error('Ghost excerpt helper did not bound long descriptions')
}

async function runGhostDryRun() {
  const { spawn } = await import('node:child_process')
  const stateDir = await mkdtemp(join(tmpdir(), 'verdun-ghost-state-'))
  const stateFile = join(stateDir, 'editorial-state.json')
  const manifestFile = join(stateDir, 'ghost.manifest.json')
  await writeFile(stateFile, JSON.stringify({
    votes: {
      'grust-sail-3683deba292c': 1,
      'lakesail-e5ce5d36852a': 1,
    },
    focuses: [
      {
        id: 'focus-smoke-ghost-ready',
        text: 'More typed lakehouse execution and graph lowering evidence.',
        scope: 'this_week',
        created_at: new Date().toISOString(),
      },
    ],
  }))
  return await new Promise((resolve, reject) => {
    const child = spawn('node', [
      'scripts/publish-ghost.mjs',
      '--dry-run',
      '--require-upvotes',
      '--require-ready',
      '--manifest-out',
      manifestFile,
      '--editorial-state',
      stateFile,
      'draft',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', async (status) => {
      if (status === 0) {
        try {
          const manifestText = await readFile(manifestFile, 'utf8')
          await rm(stateDir, { recursive: true, force: true })
          resolve({ stdout, manifestText })
        } catch (error) {
          await rm(stateDir, { recursive: true, force: true })
          reject(error)
        }
      } else {
        void rm(stateDir, { recursive: true, force: true })
        reject(new Error(`ghost dry-run exited ${status}\n${stdout}\n${stderr}`))
      }
    })
  })
}

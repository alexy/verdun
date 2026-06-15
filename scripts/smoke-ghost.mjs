import { buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'
import { ghostEndpoint, ghostJwt, ghostPostPayload, parseGhostArgs } from './publish-ghost.mjs'

const options = parseGhostArgs(['--dry-run', '--require-upvotes', '--require-ready', 'draft'], {
  GHOST_ADMIN_API_URL: 'https://collected.ga',
  GHOST_ADMIN_API_KEY: 'a'.repeat(24) + ':' + 'b'.repeat(64),
})
if (!options.dryRun) throw new Error('dry-run option was not parsed')
if (!options.requireUpvotes) throw new Error('require-upvotes option was not parsed')
if (!options.requireReady) throw new Error('require-ready option was not parsed')
if (options.status !== 'draft') throw new Error('draft status was not parsed')
if (ghostEndpoint(options.apiUrl) !== 'https://collected.ga/ghost/api/admin/posts/?source=html') {
  throw new Error('Ghost endpoint is not stable')
}

const jwt = ghostJwt(options.apiKey)
if (jwt.split('.').length !== 3) throw new Error('Ghost JWT is malformed')

const snapshot = await loadSnapshotFile('public/data/newsletter-snapshot.json')
const draft = await buildNewsletterDraft(snapshot)
const payload = ghostPostPayload(draft, options.status)
const post = payload.posts[0]
if (post.title !== draft.title) throw new Error('payload title does not match draft')
if (post.custom_excerpt !== draft.subtitle) throw new Error('payload excerpt does not match draft')
if (!post.html.includes('<h1>')) throw new Error('payload html is missing rendered headings')
if (!post.html.includes('<strong>Typed contracts</strong>')) throw new Error('payload html is missing rendered strong text')
if (post.html.includes('**Typed contracts**')) throw new Error('payload html leaked markdown emphasis')
if (post.status !== 'draft') throw new Error('payload status does not match')
if (!post.tags.includes('strongly-typed')) throw new Error('payload tags are missing newsletter taxonomy')

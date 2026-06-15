import { createHmac } from 'node:crypto'
import { buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'

const ghostStatuses = new Set(['draft', 'published', 'scheduled', 'sent'])
const firstArg = process.argv[2]
const secondArg = process.argv[3]
const input = firstArg && !ghostStatuses.has(firstArg)
  ? firstArg
  : process.env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
const status = secondArg ?? (firstArg && ghostStatuses.has(firstArg) ? firstArg : process.env.GHOST_POST_STATUS ?? 'draft')
const apiUrl = process.env.GHOST_ADMIN_API_URL
const apiKey = process.env.GHOST_ADMIN_API_KEY

if (!apiUrl || !apiKey) {
  console.error('Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY to publish a Ghost draft.')
  process.exit(2)
}

const snapshot = await loadSnapshotFile(input)
const draft = buildNewsletterDraft(snapshot)
const endpoint = `${apiUrl.replace(/\/$/, '')}/ghost/api/admin/posts/?source=html`
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Ghost ${ghostJwt(apiKey)}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    posts: [
      {
        title: draft.title,
        custom_excerpt: draft.subtitle,
        html: draft.html,
        status,
        tags: ['verdun', 'strongly-typed', 'ai-data'],
      },
    ],
  }),
})

const body = await response.text()
if (!response.ok) {
  console.error(body)
  throw new Error(`Ghost API returned ${response.status}`)
}

console.log(body)

function ghostJwt(adminApiKey) {
  const [id, secret] = adminApiKey.split(':')
  if (!id || !secret) throw new Error('GHOST_ADMIN_API_KEY must have id:secret format')
  const header = { alg: 'HS256', typ: 'JWT', kid: id }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iat: now,
    exp: now + 5 * 60,
    aud: '/admin/',
  }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

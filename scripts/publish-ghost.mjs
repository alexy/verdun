import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { assertDraftReady, buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'

const ghostStatuses = new Set(['draft', 'published', 'scheduled', 'sent'])

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = parseGhostArgs(process.argv.slice(2), process.env)
  const snapshot = await loadSnapshotFile(options.input)
  const draft = await buildNewsletterDraft(snapshot)
  await assertDraftReady(snapshot, draft, options)
  const payload = ghostPostPayload(draft, options.status)

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ endpoint: ghostEndpoint(options.apiUrl ?? 'https://collected.ga'), payload }, null, 2)}\n`)
  } else {
    const body = await publishGhostPayload(payload, options)
    console.log(body)
  }
}

export function parseGhostArgs(args, env = process.env) {
  const dryRun = args.includes('--dry-run')
  const requireUpvotes = args.includes('--require-upvotes') || env.NEWSLETTER_REQUIRE_UPVOTES === 'true'
  const requireReady = args.includes('--require-ready') || env.NEWSLETTER_REQUIRE_READY === 'true'
  const positional = args.filter((arg) => arg !== '--dry-run' && arg !== '--require-upvotes' && arg !== '--require-ready')
  const firstArg = positional[0]
  const secondArg = positional[1]
  const input = firstArg && !ghostStatuses.has(firstArg)
    ? firstArg
    : env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
  const status = secondArg ?? (firstArg && ghostStatuses.has(firstArg) ? firstArg : env.GHOST_POST_STATUS ?? 'draft')
  if (!ghostStatuses.has(status)) {
    throw new Error(`Ghost status must be one of ${Array.from(ghostStatuses).join(', ')}`)
  }
  return {
    dryRun,
    requireUpvotes,
    requireReady,
    input,
    status,
    apiUrl: env.GHOST_ADMIN_API_URL,
    apiKey: env.GHOST_ADMIN_API_KEY,
  }
}

export function ghostPostPayload(draft, status = 'draft') {
  return {
    posts: [
      {
        title: draft.title,
        custom_excerpt: draft.subtitle,
        html: draft.html,
        status,
        tags: ['verdun', 'strongly-typed', 'ai-data'],
      },
    ],
  }
}

export async function publishGhostPayload(payload, options) {
  if (!options.apiUrl || !options.apiKey) {
    throw new Error('Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY to publish a Ghost draft.')
  }
  const response = await fetch(ghostEndpoint(options.apiUrl), {
    method: 'POST',
    headers: {
      authorization: `Ghost ${ghostJwt(options.apiKey)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.text()
  if (!response.ok) {
    console.error(body)
    throw new Error(`Ghost API returned ${response.status}`)
  }
  return body
}

export function ghostEndpoint(apiUrl) {
  return `${apiUrl.replace(/\/$/, '')}/ghost/api/admin/posts/?source=html`
}

export function ghostJwt(adminApiKey) {
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

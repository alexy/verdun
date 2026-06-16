import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { buildNewsletterDraft, loadSnapshotFile } from './newsletter-draft.mjs'

process.env.NEWSLETTER_APPLY_LOCAL_STATE = 'false'

const snapshotJson = await readFile('public/data/newsletter-snapshot.json', 'utf8')
const server = createServer((request, response) => {
  if (request.url !== '/api/newsletter/items') {
    response.writeHead(404)
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(snapshotJson)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') {
  server.close()
  throw new Error('could not bind local snapshot server')
}

try {
  const snapshot = await loadSnapshotFile(`http://127.0.0.1:${address.port}/api/newsletter/items`)
  if (!snapshot.items.some((item) => item.project === 'Grust Sail')) {
    throw new Error('URL snapshot did not load expected items')
  }
  const draft = await buildNewsletterDraft(snapshot)
  if (!draft.html.includes('<h1>Strongly Typed AI/Data Notes:')) {
    throw new Error('URL snapshot did not build a draft')
  }
  if (draft.markdown.includes("belongs in this week's typed AI/data systems watch")) {
    throw new Error('fallback draft used watchlist seed items while live/manual items were available')
  }
  const projectCounts = new Map()
  for (const itemId of draft.itemIds) {
    const item = snapshot.items.find((candidate) => candidate.id === itemId)
    projectCounts.set(item.project, (projectCounts.get(item.project) ?? 0) + 1)
  }
  if (Array.from(projectCounts.values()).some((count) => count > 2)) {
    throw new Error('fallback draft did not keep project diversity')
  }
  if (!draft.markdown.includes('Coverage:')) {
    throw new Error('draft source section did not include project coverage')
  }
  if (!draft.markdown.includes('plus ')) {
    throw new Error('draft coverage gaps did not report hidden uncovered projects')
  }
  if (!draft.markdown.includes('Evidence:')) {
    throw new Error('draft item sections did not include provenance evidence')
  }
  if (!draft.markdown.includes('## Weekly throughline')) {
    throw new Error('draft did not include the weekly throughline section')
  }
  if (!draft.html.includes('<h2>Weekly throughline</h2>')) {
    throw new Error('draft HTML did not render the weekly throughline section')
  }
  if (!draft.markdown.includes('The selected queue clusters around')) {
    throw new Error('draft throughline did not synthesize the selected queue')
  }
  for (const roughText of ['Overview Long-form', 'Author: ', 'Stop Hand-Writing SurrealQL Strings in Rust Long-form', 'Medium surfaced this feed item']) {
    if (draft.markdown.includes(roughText)) {
      throw new Error(`draft leaked rough feed text: ${roughText}`)
    }
  }
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

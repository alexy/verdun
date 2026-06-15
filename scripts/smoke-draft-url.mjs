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
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

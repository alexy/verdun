import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { buildNewsletterDraft, evaluateNewsletterProseQuality, loadSnapshotFile } from './instances/garbage/newsletter-draft.mjs'

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
  const proseQuality = await evaluateNewsletterProseQuality(draft)
  if (proseQuality.status !== 'ready') {
    throw new Error(`draft prose quality should be ready: ${proseQuality.summary}`)
  }
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
  const selectedProjects = Array.from(projectCounts.keys())
  if (!selectedProjects.some((project) => ['BAML', 'DSPy', 'Ibis', 'Dagster'].includes(project))) {
    throw new Error('fallback draft did not preserve a functional/composable AI-data item')
  }
  if (!draft.markdown.includes('Coverage:')) {
    throw new Error('draft source section did not include project coverage')
  }
  if (!draft.markdown.includes('plus ')) {
    throw new Error('draft coverage gaps did not report hidden uncovered projects')
  }
  if (!draft.markdown.includes('Crawler query hints:') || !draft.markdown.includes('review: Hacker News, Substack, LinkedIn, X/Twitter')) {
    throw new Error('draft coverage gaps did not include crawler query hints')
  }
  if (!draft.markdown.includes('Evidence:')) {
    throw new Error('draft item sections did not include provenance evidence')
  }
  if (!draft.markdown.includes('Selection:')) {
    throw new Error('draft item sections did not include selection reasons')
  }
  if (!draft.markdown.includes('## Weekly throughline')) {
    throw new Error('draft did not include the weekly throughline section')
  }
  if (!draft.markdown.includes('## Editorial arc')) {
    throw new Error('draft did not include the editorial arc section')
  }
  if (!draft.html.includes('<h2>Weekly throughline</h2>')) {
    throw new Error('draft HTML did not render the weekly throughline section')
  }
  if (!draft.html.includes('<h2>Editorial arc</h2>')) {
    throw new Error('draft HTML did not render the editorial arc section')
  }
  if (!draft.markdown.includes('The selected queue clusters around')) {
    throw new Error('draft throughline did not synthesize the selected queue')
  }
  if (!draft.markdown.includes('Lead with')) {
    throw new Error('draft editorial arc did not identify a lead item')
  }
  for (const roughText of [
    'Overview Long-form',
    'Author: ',
    'Stop Hand-Writing SurrealQL Strings in Rust Long-form',
    'Medium surfaced this feed item',
    'Hacker News surfaced this item while tracking',
    'Lobste.rs matched this story against',
    'dev.to surfaced this item while tracking',
    'The Weekly Data Engineering Newsletter',
    'a quiet day',
  ]) {
    if (draft.markdown.includes(roughText)) {
      throw new Error(`draft leaked rough feed text: ${roughText}`)
    }
  }
  const roughDraft = {
    ...draft,
    markdown: `${draft.markdown}\n\nHacker News surfaced this item while tracking a smoke keyword.`,
  }
  const roughQuality = await evaluateNewsletterProseQuality(roughDraft)
  if (roughQuality.status !== 'needs_review' || !roughQuality.checks.some((check) => check.id === 'crawler-boilerplate' && !check.passed)) {
    throw new Error('prose quality gate did not catch crawler boilerplate')
  }
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

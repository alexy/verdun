import { runnerImport } from 'vite'

function responseRecorder() {
  return {
    body: undefined,
    code: undefined,
    headers: {},
    status(code) {
      this.code = code
      return this
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    json(body) {
      this.body = body
    },
    end(body) {
      this.body = body
    },
  }
}

async function callDraft(query = {}) {
  const response = responseRecorder()
  await draftHandler({ method: 'GET', query }, response)
  return response
}

const { module } = await runnerImport('./api/newsletter/draft.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const draftHandler = module.default

const json = await callDraft()
if (json.code !== 200) throw new Error(`draft JSON returned ${json.code}`)
if (!json.body?.draft?.markdown?.includes('## Weekly throughline')) {
  throw new Error('draft JSON did not include the generated markdown throughline')
}
if (!json.body?.manifest?.selectedItems?.length) {
  throw new Error('draft JSON manifest did not include selected items')
}
if (!json.body?.readiness?.checks?.length || !json.body?.proseQuality?.checks?.length) {
  throw new Error('draft JSON did not include readiness and prose checks')
}

const markdown = await callDraft({ format: 'markdown' })
if (markdown.code !== 200 || !markdown.headers['content-type']?.includes('text/markdown')) {
  throw new Error('draft markdown did not return text/markdown')
}
if (!String(markdown.body).includes('Strongly Typed AI/Data Notes')) {
  throw new Error('draft markdown did not include the newsletter title')
}

const manifest = await callDraft({ format: 'manifest' })
if (manifest.code !== 200 || manifest.body?.snapshotInput !== 'api/newsletter/items') {
  throw new Error('draft manifest did not report the API snapshot input')
}

const gated = await callDraft({ requireUpvotes: 'true' })
if (gated.code !== 409 || gated.body?.error !== 'draft_requires_upvotes') {
  throw new Error('draft API should require explicit upvotes when requireUpvotes=true')
}

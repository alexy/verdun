import { runnerImport } from 'vite'

const { module: snapshotModule } = await runnerImport('./src/instances/garbage/composables/useNewsletterSnapshot.ts', {
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})

const baseSnapshot = {
  generated_at: '2026-06-15T12:00:00Z',
  theme: 'Smoke newsletter snapshot',
  items: [
    {
      id: 'smoke-item',
      title: 'Smoke item for typed AI',
      source: 'Smoke',
      source_kind: 'community',
      url: 'https://example.com/smoke',
      published_at: '2026-06-15T10:00:00Z',
      project: 'Pydantic',
      topic: 'typed AI',
      summary: 'Smoke summary',
      why_it_matters: 'Smoke reason',
      tags: ['pydantic', 'typed'],
      score: 42,
    },
  ],
  focuses: [],
  source_runs: [],
  query_plans: [
    {
      project: 'Pydantic',
      topic: 'typed AI',
      hacker_news_query: 'Pydantic pydantic',
      live_terms: ['pydantic'],
      dev_to_tags: ['pydantic'],
      review_targets: [
        {
          source: 'LinkedIn',
          label: 'LinkedIn posts: Pydantic pydantic',
          url: 'https://www.linkedin.com/search/results/content/?keywords=Pydantic+pydantic',
          adapter: 'manual-review',
        },
      ],
    },
  ],
}
const workbenchSnapshot = {
  generatedAt: baseSnapshot.generated_at,
  instance: {
    id: 'garbage',
    name: 'Garbage',
    basePath: '/rbage/',
    theme: baseSnapshot.theme,
  },
  editorialPersistence: 'database',
  records: [
    {
      id: 'smoke-item',
      title: 'Smoke item for typed AI',
      source: 'Smoke',
      sourceKind: 'community',
      url: 'https://example.com/smoke',
      observedAt: '2026-06-15T10:00:00Z',
      subject: 'Pydantic',
      topic: 'typed AI',
      summary: 'Smoke summary',
      tags: ['pydantic', 'typed'],
      score: 42,
      review: 0,
      provenance: {
        stage: 'live',
        adapter: 'smoke-adapter',
        source: 'Smoke',
        sourceKind: 'community',
        sourceUrl: 'https://example.com/source',
        evidenceUrl: 'https://example.com/smoke',
        subject: 'Pydantic',
        matchedKeywords: ['pydantic'],
      },
    },
  ],
  focuses: [],
  sourceRuns: [
    {
      source: 'Smoke',
      kind: 'community',
      status: 'ok',
      itemCount: 1,
      message: 'Smoke source run',
      subjectCounts: { Pydantic: 1 },
    },
  ],
  collectionPlans: [
    {
      subject: 'Pydantic',
      topic: 'typed AI',
      query: 'Pydantic pydantic',
      liveTerms: ['pydantic'],
      tags: ['pydantic'],
      reviewTargets: [
        {
          source: 'LinkedIn',
          label: 'LinkedIn posts: Pydantic pydantic',
          url: 'https://www.linkedin.com/search/results/content/?keywords=Pydantic+pydantic',
          adapter: 'manual-review',
        },
      ],
      focusTerms: [],
    },
  ],
}

await smokeApiBackedSnapshot()
await smokeBrowserPersistenceSnapshot()
await smokeVoteRollback()
await smokeStaticFallbackSnapshot()

async function smokeApiBackedSnapshot() {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ options, url: String(url) })
    if (url === '/api/workbench/records?instance=garbage') return jsonResponse(workbenchSnapshot)
    if (url === '/api/workbench/review?instance=garbage') return jsonResponse({ ok: true })
    if (url === '/api/workbench/focus?instance=garbage') return jsonResponse({ ok: true })
    if (url === '/api/workbench/state?instance=garbage') return jsonResponse({ ok: true, importedReviews: 1, importedFocuses: 1 })
    return jsonResponse({ error: 'not_found' }, false, 404)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  if (state.loading.value) throw new Error('loading should be false after API snapshot load')
  if (state.error.value) throw new Error(`API snapshot load should not set error: ${state.error.value}`)
  if (state.snapshot.value.items[0]?.id !== 'smoke-item') throw new Error('API snapshot was not normalized into state')
  if (state.snapshot.value.queryPlans[0]?.reviewTargets[0]?.source !== 'LinkedIn') {
    throw new Error('workbench API snapshot collection-plan review targets were not normalized')
  }
  if (state.snapshot.value.sourceRuns[0]?.projectCounts?.Pydantic !== 1) {
    throw new Error('workbench API snapshot source-run subject counts were not normalized')
  }

  await state.setVote('smoke-item', 1)
  if (state.snapshot.value.items[0]?.vote !== 1) throw new Error('API vote was not applied optimistically')
  const voteCall = calls.find((call) => call.url === '/api/workbench/review?instance=garbage')
  const voteBody = voteCall ? JSON.parse(String(voteCall.options?.body)) : {}
  if (!voteCall || voteBody.recordId !== 'smoke-item' || voteBody.review !== 1) {
    throw new Error('workbench API review was not posted')
  }

  await state.saveFocus(' More typed boundaries ', 'this_week')
  if (!state.snapshot.value.focuses.some((focus) => focus.text === 'More typed boundaries')) {
    throw new Error('API focus was not added optimistically')
  }
  const focusCall = calls.find((call) => call.url === '/api/workbench/focus?instance=garbage')
  if (!focusCall || JSON.parse(String(focusCall.options?.body)).text !== 'More typed boundaries') {
    throw new Error('workbench API focus was not posted with trimmed text')
  }

  await state.importEditorialState({
    votes: { 'smoke-item': -1 },
    focuses: [
      {
        id: 'focus-api-import',
        text: 'Imported durable editorial state',
        scope: 'this_week',
        created_at: '2026-06-15T13:00:00Z',
      },
    ],
  })
  const importCall = calls.find((call) => call.url === '/api/workbench/state?instance=garbage')
  if (!importCall || JSON.parse(String(importCall.options?.body)).votes['smoke-item'] !== -1) {
    throw new Error('workbench state import was not posted')
  }
  if (state.snapshot.value.items[0]?.vote !== -1) throw new Error('API editorial state import did not update local view')
  if (!state.snapshot.value.focuses.some((focus) => focus.id === 'focus-api-import')) {
    throw new Error('API editorial state import did not update local focuses')
  }
}

async function smokeBrowserPersistenceSnapshot() {
  const calls = []
  const storage = new Map()
  globalThis.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  }
  globalThis.fetch = async (url, options) => {
    calls.push({ options, url: String(url) })
    if (url === '/api/workbench/records?instance=garbage') {
      return jsonResponse({
        ...workbenchSnapshot,
        editorialPersistence: 'browser',
      })
    }
    return jsonResponse({ error: 'unexpected_post' }, false, 500)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  if (state.editorialPersistence.value !== 'browser') throw new Error('browser-mode API did not expose browser persistence')
  await state.setVote('smoke-item', 1)
  await state.saveFocus('Browser-local focus', 'ongoing')
  if (calls.some((call) => call.options?.method === 'POST')) {
    throw new Error('browser persistence mode should not POST edits')
  }
  if (state.snapshot.value.items[0]?.vote !== 1) throw new Error('browser vote was not kept locally')
  if (!state.snapshot.value.focuses.some((focus) => focus.text === 'Browser-local focus')) {
    throw new Error('browser focus was not kept locally')
  }

  const reloaded = snapshotModule.useNewsletterSnapshot()
  await reloaded.loadSnapshot()
  if (reloaded.snapshot.value.items[0]?.vote !== 1) throw new Error('browser vote was not restored after reload')
  if (!reloaded.snapshot.value.focuses.some((focus) => focus.text === 'Browser-local focus')) {
    throw new Error('browser focus was not restored after reload')
  }
  delete globalThis.localStorage
}

async function smokeVoteRollback() {
  globalThis.fetch = async (url) => {
    if (url === '/api/workbench/records?instance=garbage') return jsonResponse(workbenchSnapshot)
    if (url === '/api/workbench/review?instance=garbage') return jsonResponse({ error: 'failed' }, false, 500)
    return jsonResponse({ error: 'not_found' }, false, 404)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  await state.setVote('smoke-item', 1)
  if (state.snapshot.value.items[0]?.vote !== 0) throw new Error('failed API vote did not roll back')
  if (!state.error.value.includes('review API returned 500')) throw new Error('failed API review did not set an error')
}

async function smokeStaticFallbackSnapshot() {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ options, url: String(url) })
    if (url === '/api/workbench/records?instance=garbage') return jsonResponse({ error: 'missing' }, false, 404)
    if (String(url).endsWith('/data/newsletter-snapshot.json')) return jsonResponse(baseSnapshot)
    return jsonResponse({ error: 'unexpected_post' }, false, 500)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  if (state.snapshot.value.items[0]?.id !== 'smoke-item') throw new Error('static fallback snapshot was not loaded')
  await state.setVote('smoke-item', -1)
  await state.saveFocus('Static-only focus', 'ongoing')
  if (state.snapshot.value.items[0]?.vote !== -1) throw new Error('static fallback vote was not kept locally')
  if (!state.snapshot.value.focuses.some((focus) => focus.text === 'Static-only focus')) {
    throw new Error('static fallback focus was not kept locally')
  }
  if (calls.some((call) => call.options?.method === 'POST')) {
    throw new Error('static fallback mode should not post vote or focus edits')
  }
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

import { runnerImport } from 'vite'

const { module: snapshotModule } = await runnerImport('./src/composables/useNewsletterSnapshot.ts', {
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

await smokeApiBackedSnapshot()
await smokeVoteRollback()
await smokeStaticFallbackSnapshot()

async function smokeApiBackedSnapshot() {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ options, url: String(url) })
    if (url === '/api/newsletter/items') return jsonResponse(baseSnapshot)
    if (url === '/api/newsletter/vote') return jsonResponse({ ok: true })
    if (url === '/api/newsletter/focus') return jsonResponse({ ok: true })
    return jsonResponse({ error: 'not_found' }, false, 404)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  if (state.loading.value) throw new Error('loading should be false after API snapshot load')
  if (state.error.value) throw new Error(`API snapshot load should not set error: ${state.error.value}`)
  if (state.snapshot.value.items[0]?.id !== 'smoke-item') throw new Error('API snapshot was not normalized into state')
  if (state.snapshot.value.queryPlans[0]?.reviewTargets[0]?.source !== 'LinkedIn') {
    throw new Error('API snapshot query-plan review targets were not normalized')
  }

  await state.setVote('smoke-item', 1)
  if (state.snapshot.value.items[0]?.vote !== 1) throw new Error('API vote was not applied optimistically')
  const voteCall = calls.find((call) => call.url === '/api/newsletter/vote')
  if (!voteCall || JSON.parse(String(voteCall.options?.body)).vote !== 1) {
    throw new Error('API vote was not posted')
  }

  await state.saveFocus(' More typed boundaries ', 'this_week')
  if (!state.snapshot.value.focuses.some((focus) => focus.text === 'More typed boundaries')) {
    throw new Error('API focus was not added optimistically')
  }
  const focusCall = calls.find((call) => call.url === '/api/newsletter/focus')
  if (!focusCall || JSON.parse(String(focusCall.options?.body)).text !== 'More typed boundaries') {
    throw new Error('API focus was not posted with trimmed text')
  }
}

async function smokeVoteRollback() {
  globalThis.fetch = async (url) => {
    if (url === '/api/newsletter/items') return jsonResponse(baseSnapshot)
    if (url === '/api/newsletter/vote') return jsonResponse({ error: 'failed' }, false, 500)
    return jsonResponse({ error: 'not_found' }, false, 404)
  }

  const state = snapshotModule.useNewsletterSnapshot()
  await state.loadSnapshot()
  await state.setVote('smoke-item', 1)
  if (state.snapshot.value.items[0]?.vote !== 0) throw new Error('failed API vote did not roll back')
  if (!state.error.value.includes('vote API returned 500')) throw new Error('failed API vote did not set an error')
}

async function smokeStaticFallbackSnapshot() {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ options, url: String(url) })
    if (url === '/api/newsletter/items') return jsonResponse({ error: 'missing' }, false, 404)
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

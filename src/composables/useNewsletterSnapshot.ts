import { ref } from 'vue'
import type { EditorialStateImportResult, NewsletterFocus, NewsletterSnapshot, VoteValue } from '../lib/newsletter'
import { applyEditorialStateExport, seedSnapshot } from '../lib/newsletter'
import { normalizeSnapshot } from '../lib/snapshot'

type SnapshotLoadResult = {
  apiAvailable: boolean
  snapshot: NewsletterSnapshot
}

export function useNewsletterSnapshot() {
  const snapshot = ref<NewsletterSnapshot>(seedSnapshot)
  const loading = ref(false)
  const error = ref('')
  const apiAvailable = ref(false)

  async function loadSnapshot(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const result = await fetchSnapshot()
      snapshot.value = result.snapshot
      apiAvailable.value = result.apiAvailable
    } catch (snapshotError) {
      error.value = snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
      snapshot.value = seedSnapshot
      apiAvailable.value = false
    } finally {
      loading.value = false
    }
  }

  async function setVote(itemId: string, vote: VoteValue): Promise<void> {
    const previous = snapshot.value
    snapshot.value = {
      ...snapshot.value,
      items: snapshot.value.items.map((item) => item.id === itemId ? { ...item, vote } : item),
    }
    if (!apiAvailable.value) return
    try {
      const response = await fetch('/api/newsletter/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, vote }),
      })
      if (!response.ok) throw new Error(`vote API returned ${response.status}`)
    } catch (voteError) {
      snapshot.value = previous
      error.value = voteError instanceof Error ? voteError.message : String(voteError)
    }
  }

  async function saveFocus(text: string, scope: 'this_week' | 'ongoing'): Promise<void> {
    text = text.trim()
    if (!text) return
    const focus: NewsletterFocus = {
      id: `local-${Date.now()}`,
      text,
      scope,
      createdAt: new Date().toISOString(),
    }
    snapshot.value = {
      ...snapshot.value,
      focuses: [focus, ...snapshot.value.focuses],
    }
    if (!apiAvailable.value) return
    try {
      const response = await fetch('/api/newsletter/focus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, scope }),
      })
      if (!response.ok) throw new Error(`focus API returned ${response.status}`)
    } catch (focusError) {
      error.value = focusError instanceof Error ? focusError.message : String(focusError)
    }
  }

  function importEditorialState(raw: unknown): EditorialStateImportResult {
    const result = applyEditorialStateExport(snapshot.value, raw)
    snapshot.value = result.snapshot
    return result
  }

  return {
    error,
    importEditorialState,
    loadSnapshot,
    loading,
    saveFocus,
    setVote,
    snapshot,
  }
}

async function fetchSnapshot(): Promise<SnapshotLoadResult> {
  const apiResult = await tryFetchSnapshot('/api/newsletter/items')
  if (apiResult) return { snapshot: apiResult, apiAvailable: true }
  const staticResult = await tryFetchSnapshot(`${import.meta.env.BASE_URL}data/newsletter-snapshot.json`)
  if (staticResult) return { snapshot: staticResult, apiAvailable: false }
  throw new Error('items API and static snapshot are unavailable')
}

async function tryFetchSnapshot(url: string): Promise<NewsletterSnapshot | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return normalizeSnapshot(await response.json())
  } catch {
    return null
  }
}

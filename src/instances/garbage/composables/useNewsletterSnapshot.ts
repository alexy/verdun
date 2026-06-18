import { ref } from 'vue'
import type { EditorialStateExport, EditorialStateImportResult, NewsletterFocus, NewsletterSnapshot, VoteValue } from '../../../../../apps/garbage/src/newsletter.ts'
import { applyEditorialStateExport, seedSnapshot } from '../../../../../apps/garbage/src/newsletter.ts'
import { normalizeSnapshot } from '../snapshot'

type SnapshotLoadResult = {
  apiAvailable: boolean
  apiWritable: boolean
  snapshot: NewsletterSnapshot
}

const browserEditorialStateKey = 'verdun:editorial-state'
const workbenchInstance = 'garbage'
const workbenchRecordsUrl = `/api/workbench/records?instance=${workbenchInstance}`
const workbenchReviewUrl = `/api/workbench/review?instance=${workbenchInstance}`
const workbenchFocusUrl = `/api/workbench/focus?instance=${workbenchInstance}`
const workbenchStateUrl = `/api/workbench/state?instance=${workbenchInstance}`

export function useNewsletterSnapshot() {
  const snapshot = ref<NewsletterSnapshot>(seedSnapshot)
  const loading = ref(false)
  const error = ref('')
  const apiAvailable = ref(false)
  const apiWritable = ref(false)
  const editorialPersistence = ref<NewsletterSnapshot['editorialPersistence']>('browser')

  async function loadSnapshot(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const result = await fetchSnapshot()
      snapshot.value = result.snapshot
      apiAvailable.value = result.apiAvailable
      apiWritable.value = result.apiWritable
      editorialPersistence.value = result.snapshot.editorialPersistence
    } catch (snapshotError) {
      error.value = snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
      snapshot.value = seedSnapshot
      apiAvailable.value = false
      apiWritable.value = false
      editorialPersistence.value = 'browser'
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
    if (!apiWritable.value) {
      saveBrowserEditorialState(snapshot.value)
      return
    }
    try {
      const response = await fetch(workbenchReviewUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recordId: itemId, review: vote }),
      })
      if (!response.ok) throw new Error(`review API returned ${response.status}`)
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
    if (!apiWritable.value) {
      saveBrowserEditorialState(snapshot.value)
      return
    }
    try {
      const response = await fetch(workbenchFocusUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, scope }),
      })
      if (!response.ok) throw new Error(`focus API returned ${response.status}`)
    } catch (focusError) {
      error.value = focusError instanceof Error ? focusError.message : String(focusError)
    }
  }

  async function importEditorialState(raw: unknown): Promise<EditorialStateImportResult> {
    const result = applyEditorialStateExport(snapshot.value, raw)
    snapshot.value = result.snapshot
    if (!apiWritable.value) {
      saveBrowserEditorialState(snapshot.value)
      return result
    }
    try {
      const response = await fetch(workbenchStateUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(raw),
      })
      if (!response.ok) throw new Error(`workbench state API returned ${response.status}`)
    } catch (importError) {
      error.value = importError instanceof Error ? importError.message : String(importError)
    }
    return result
  }

  return {
    error,
    editorialPersistence,
    importEditorialState,
    loadSnapshot,
    loading,
    saveFocus,
    setVote,
    snapshot,
  }
}

async function fetchSnapshot(): Promise<SnapshotLoadResult> {
  const apiResult = await tryFetchSnapshot(workbenchRecordsUrl)
  if (apiResult) {
    const apiWritable = apiResult.editorialPersistence === 'database' || apiResult.editorialPersistence === 'local_file'
    return {
      snapshot: apiWritable ? apiResult : applyBrowserEditorialState(apiResult),
      apiAvailable: true,
      apiWritable,
    }
  }
  const staticResult = await tryFetchSnapshot(`${import.meta.env.BASE_URL}data/newsletter-snapshot.json`)
  if (staticResult) return { snapshot: applyBrowserEditorialState(staticResult), apiAvailable: false, apiWritable: false }
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

function applyBrowserEditorialState(snapshot: NewsletterSnapshot): NewsletterSnapshot {
  const state = loadBrowserEditorialState()
  if (!state) return { ...snapshot, editorialPersistence: 'browser' }
  return {
    ...applyEditorialStateExport({ ...snapshot, editorialPersistence: 'browser' }, state).snapshot,
    editorialPersistence: 'browser',
  }
}

function saveBrowserEditorialState(snapshot: NewsletterSnapshot): void {
  if (typeof localStorage === 'undefined') return
  const state: EditorialStateExport = {
    votes: Object.fromEntries(
      snapshot.items
        .filter((item) => item.vote !== 0)
        .map((item) => [item.id, item.vote]),
    ),
    focuses: snapshot.focuses.map((focus) => ({
      id: focus.id,
      text: focus.text,
      scope: focus.scope,
      created_at: focus.createdAt,
    })),
  }
  localStorage.setItem(browserEditorialStateKey, JSON.stringify(state))
}

function loadBrowserEditorialState(): EditorialStateExport | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(browserEditorialStateKey) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return raw as EditorialStateExport
  } catch {
    return null
  }
}

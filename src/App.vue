<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpenText, Check, ClipboardCheck, Copy, Database, Download, FileText, Search, Send, Sparkles, X } from '@lucide/vue'
import AppHeader from './components/AppHeader.vue'
import NewsItemCard from './components/NewsItemCard.vue'
import SourceHealthPanel from './components/SourceHealthPanel.vue'
import type { NewsletterFocus, NewsletterSnapshot, VoteValue } from './lib/newsletter'
import { buildNewsletterDraft, evaluateNewsletterReadiness, seedSnapshot, sortedNewsItems } from './lib/newsletter'
import { ontologyNodes } from './lib/ontology'
import { normalizeSnapshot } from './lib/snapshot'

const snapshot = ref<NewsletterSnapshot>(seedSnapshot)
const loading = ref(false)
const error = ref('')
const focusText = ref('')
const focusScope = ref<'this_week' | 'ongoing'>('this_week')
const searchText = ref('')
const voteFilter = ref<'all' | 'unreviewed' | 'upvoted' | 'downvoted'>('all')
const projectFilter = ref('all')
const sourceFilter = ref('all')
const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const apiAvailable = ref(false)

const includedItems = computed(() => sortedNewsItems(snapshot.value.items).filter((item) => item.vote > 0))
const rejectedItems = computed(() => snapshot.value.items.filter((item) => item.vote < 0).length)
const unreviewedItems = computed(() => snapshot.value.items.filter((item) => item.vote === 0).length)
const sourceCount = computed(() => new Set(snapshot.value.items.map((item) => item.source)).size)
const sortedItems = computed(() => sortedNewsItems(snapshot.value.items))
const projectOptions = computed(() => uniqueSorted(snapshot.value.items.map((item) => item.project)))
const sourceOptions = computed(() => uniqueSorted(snapshot.value.items.map((item) => item.source)))
const filteredItems = computed(() => {
  const query = searchText.value.trim().toLowerCase()
  return sortedItems.value.filter((item) => {
    if (voteFilter.value === 'unreviewed' && item.vote !== 0) return false
    if (voteFilter.value === 'upvoted' && item.vote <= 0) return false
    if (voteFilter.value === 'downvoted' && item.vote >= 0) return false
    if (projectFilter.value !== 'all' && item.project !== projectFilter.value) return false
    if (sourceFilter.value !== 'all' && item.source !== sourceFilter.value) return false
    if (!query) return true
    const haystack = [
      item.title,
      item.project,
      item.source,
      item.sourceKind,
      item.topic,
      item.summary,
      item.whyItMatters,
      ...item.tags,
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
const liveSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'ok' && run.itemCount > 0).length)
const pendingSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'pending').length)
const draft = computed(() => buildNewsletterDraft(snapshot.value))
const readiness = computed(() => evaluateNewsletterReadiness(snapshot.value))
const draftDownloadHref = computed(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(draft.value.markdown)}`)
const draftFilename = computed(() => `${isoDate(snapshot.value.generatedAt)}-strongly-typed-ai-data-notes.md`)

onMounted(() => {
  void loadSnapshot()
})

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

async function fetchSnapshot(): Promise<{ snapshot: NewsletterSnapshot, apiAvailable: boolean }> {
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

async function saveFocus(): Promise<void> {
  const text = focusText.value.trim()
  if (!text) return
  const focus: NewsletterFocus = {
    id: `local-${Date.now()}`,
    text,
    scope: focusScope.value,
    createdAt: new Date().toISOString(),
  }
  focusText.value = ''
  snapshot.value = {
    ...snapshot.value,
    focuses: [focus, ...snapshot.value.focuses],
  }
  if (!apiAvailable.value) return
  try {
    const response = await fetch('/api/newsletter/focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, scope: focus.scope }),
    })
    if (!response.ok) throw new Error(`focus API returned ${response.status}`)
  } catch (focusError) {
    error.value = focusError instanceof Error ? focusError.message : String(focusError)
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function clearFilters(): void {
  searchText.value = ''
  voteFilter.value = 'all'
  projectFilter.value = 'all'
  sourceFilter.value = 'all'
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

async function copyDraftMarkdown(): Promise<void> {
  copyStatus.value = 'idle'
  try {
    await navigator.clipboard.writeText(draft.value.markdown)
    copyStatus.value = 'copied'
  } catch {
    copyStatus.value = 'failed'
  }
}

function isoDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

</script>

<template>
  <main class="shell">
    <AppHeader :loading="loading" @refresh="loadSnapshot" />

    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">Collected.ga editorial desk</p>
        <h1>Strongly typed AI and data news, ready for weekly judgement.</h1>
        <p>
          Triage project releases, community links, and social signals into a focused literary newsletter queue.
        </p>
      </div>
      <div class="metrics" aria-label="Newsletter queue metrics">
        <div>
          <span>{{ snapshot.items.length }}</span>
          <p>items</p>
        </div>
        <div>
          <span>{{ includedItems.length }}</span>
          <p>upvoted</p>
        </div>
        <div>
          <span>{{ rejectedItems }}</span>
          <p>downvoted</p>
        </div>
        <div>
          <span>{{ sourceCount }}</span>
          <p>sources</p>
        </div>
        <div>
          <span>{{ liveSourceCount }}</span>
          <p>live</p>
        </div>
      </div>
    </section>

    <section class="workspace">
      <aside class="briefing">
        <div class="panel-heading">
          <BookOpenText :size="18" aria-hidden="true" />
          <h2>Weekly intent</h2>
        </div>
        <textarea
          v-model="focusText"
          rows="6"
          placeholder="Ask for more: typed agents, Rust dataframes, graph databases, lakehouse runtimes, Postgres extensions..."
        />
        <div class="focus-controls">
          <label>
            <input v-model="focusScope" type="radio" value="this_week" />
            This week
          </label>
          <label>
            <input v-model="focusScope" type="radio" value="ongoing" />
            Ongoing
          </label>
          <button type="button" @click="saveFocus">
            <Send :size="16" aria-hidden="true" />
            Save
          </button>
        </div>

        <div class="focus-list">
          <h3>Active signals</h3>
          <p v-for="focus in snapshot.focuses" :key="focus.id">
            <strong>{{ focus.scope === 'this_week' ? 'This week' : 'Ongoing' }}</strong>
            {{ focus.text }}
          </p>
        </div>

        <SourceHealthPanel :pending-source-count="pendingSourceCount" :source-runs="snapshot.sourceRuns" />

        <div class="readiness" :class="`readiness--${readiness.status}`">
          <div class="panel-heading">
            <ClipboardCheck :size="18" aria-hidden="true" />
            <h2>Publishing readiness</h2>
          </div>
          <p class="readiness__summary">{{ readiness.summary }}</p>
          <ul>
            <li v-for="check in readiness.checks" :key="check.id" :class="{ passed: check.passed }">
              <span aria-hidden="true"></span>
              <div>
                <strong>{{ check.label }}</strong>
                <p>{{ check.detail }}</p>
              </div>
            </li>
          </ul>
        </div>

        <div class="ontology">
          <div class="panel-heading">
            <Sparkles :size="18" aria-hidden="true" />
            <h2>Strongly Typed AI ontology</h2>
          </div>
          <a v-for="node in ontologyNodes" :id="`ontology-${node.id}`" :key="node.id" :href="`#ontology-${node.id}`">
            <strong>{{ node.label }}</strong>
            <span>{{ node.description }}</span>
          </a>
        </div>

        <div class="draft">
          <div class="panel-heading">
            <Database :size="18" aria-hidden="true" />
            <h2>Draft spine</h2>
          </div>
          <ol>
            <li v-for="item in includedItems" :key="item.id">{{ item.project }}: {{ item.whyItMatters }}</li>
          </ol>
          <p v-if="!includedItems.length" class="empty">Upvote items to assemble the weekly spine.</p>
        </div>
      </aside>

      <section class="news-list" aria-label="News items">
        <div class="list-header">
          <div>
            <p class="eyebrow">Inbox</p>
            <h2>{{ snapshot.theme }}</h2>
          </div>
          <p v-if="error" class="status">Local fallback: {{ error }}</p>
          <p v-else class="status">Generated {{ formatDate(snapshot.generatedAt) }}</p>
        </div>

        <div class="inbox-controls" aria-label="Inbox filters">
          <label class="search-field">
            <Search :size="17" aria-hidden="true" />
            <input v-model="searchText" type="search" placeholder="Search titles, projects, tags..." />
          </label>
          <select v-model="voteFilter" aria-label="Vote status">
            <option value="all">All votes</option>
            <option value="unreviewed">Unreviewed ({{ unreviewedItems }})</option>
            <option value="upvoted">Upvoted ({{ includedItems.length }})</option>
            <option value="downvoted">Downvoted ({{ rejectedItems }})</option>
          </select>
          <select v-model="projectFilter" aria-label="Project">
            <option value="all">All projects</option>
            <option v-for="project in projectOptions" :key="project" :value="project">{{ project }}</option>
          </select>
          <select v-model="sourceFilter" aria-label="Source">
            <option value="all">All sources</option>
            <option v-for="source in sourceOptions" :key="source" :value="source">{{ source }}</option>
          </select>
          <button class="clear-filters" type="button" title="Clear filters" @click="clearFilters">
            <X :size="16" aria-hidden="true" />
          </button>
          <p>{{ filteredItems.length }} of {{ snapshot.items.length }}</p>
        </div>

        <article class="draft-preview">
          <div class="draft-preview__header">
            <div class="panel-heading">
              <FileText :size="18" aria-hidden="true" />
              <h2>Draft preview</h2>
            </div>
            <div class="draft-actions">
              <a :href="draftDownloadHref" :download="draftFilename">
                <Download :size="16" aria-hidden="true" />
                Markdown
              </a>
              <button type="button" @click="copyDraftMarkdown">
                <Check v-if="copyStatus === 'copied'" :size="16" aria-hidden="true" />
                <Copy v-else :size="16" aria-hidden="true" />
                {{ copyStatus === 'copied' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>
          <h3>{{ draft.title }}</h3>
          <p>{{ draft.subtitle }}</p>
          <p v-if="copyStatus === 'failed'" class="draft-copy-error">Clipboard access is unavailable in this browser session.</p>
          <div class="draft-preview__body" v-html="draft.html"></div>
        </article>

        <p v-if="!filteredItems.length" class="empty inbox-empty">No items match the current filters.</p>

        <NewsItemCard v-for="item in filteredItems" :key="item.id" :item="item" @vote="setVote" />
      </section>
    </section>
  </main>
</template>

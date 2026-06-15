<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, ArrowDown, ArrowUp, BookOpenText, Database, ExternalLink, FileText, RefreshCw, Send, Sparkles } from '@lucide/vue'
import type { NewsletterFocus, NewsletterSnapshot, VoteValue } from './lib/newsletter'
import { buildNewsletterDraft, seedSnapshot, sortedNewsItems } from './lib/newsletter'

const snapshot = ref<NewsletterSnapshot>(seedSnapshot)
const loading = ref(false)
const error = ref('')
const focusText = ref('')
const focusScope = ref<'this_week' | 'ongoing'>('this_week')

const includedItems = computed(() => sortedNewsItems(snapshot.value.items).filter((item) => item.vote > 0))
const rejectedItems = computed(() => snapshot.value.items.filter((item) => item.vote < 0).length)
const sourceCount = computed(() => new Set(snapshot.value.items.map((item) => item.source)).size)
const sortedItems = computed(() => sortedNewsItems(snapshot.value.items))
const liveSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'ok' && run.itemCount > 0).length)
const pendingSourceCount = computed(() => snapshot.value.sourceRuns.filter((run) => run.status === 'pending').length)
const draft = computed(() => buildNewsletterDraft(snapshot.value))

onMounted(() => {
  void loadSnapshot()
})

async function loadSnapshot(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/newsletter/items')
    if (!response.ok) throw new Error(`items API returned ${response.status}`)
    snapshot.value = await response.json() as NewsletterSnapshot
  } catch (apiError) {
    error.value = apiError instanceof Error ? apiError.message : String(apiError)
    snapshot.value = seedSnapshot
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
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <Sparkles :size="22" aria-hidden="true" />
        <span>Verdun</span>
      </div>
      <button class="icon-button" type="button" :disabled="loading" title="Refresh items" @click="loadSnapshot">
        <RefreshCw :size="18" aria-hidden="true" />
      </button>
    </header>

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
          <p>included</p>
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

        <div class="source-health">
          <div class="panel-heading">
            <Activity :size="18" aria-hidden="true" />
            <h2>Source health</h2>
          </div>
          <div class="source-row" v-for="run in snapshot.sourceRuns" :key="run.source">
            <span class="source-dot" :class="run.status" aria-hidden="true"></span>
            <div>
              <strong>{{ run.source }}</strong>
              <p>{{ run.itemCount }} items · {{ run.message }}</p>
            </div>
          </div>
          <p v-if="pendingSourceCount" class="empty">{{ pendingSourceCount }} credentialed or feed adapters still pending.</p>
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

        <article class="draft-preview">
          <div class="panel-heading">
            <FileText :size="18" aria-hidden="true" />
            <h2>Draft preview</h2>
          </div>
          <h3>{{ draft.title }}</h3>
          <p>{{ draft.subtitle }}</p>
          <div class="draft-preview__body" v-html="draft.html"></div>
        </article>

        <article v-for="item in sortedItems" :key="item.id" class="news-card" :class="{ included: item.vote > 0, rejected: item.vote < 0 }">
          <div class="vote-rail" aria-label="Vote controls">
            <button type="button" :class="{ active: item.vote > 0 }" title="Include" @click="setVote(item.id, item.vote === 1 ? 0 : 1)">
              <ArrowUp :size="18" aria-hidden="true" />
            </button>
            <span>{{ item.score }}</span>
            <button type="button" :class="{ active: item.vote < 0 }" title="Reject" @click="setVote(item.id, item.vote === -1 ? 0 : -1)">
              <ArrowDown :size="18" aria-hidden="true" />
            </button>
          </div>
          <div class="news-card__body">
            <div class="item-meta">
              <span>{{ item.project }}</span>
              <span>{{ item.sourceKind }}</span>
              <span>{{ formatDate(item.publishedAt) }}</span>
            </div>
            <h3>
              <a :href="item.url" target="_blank" rel="noreferrer">
                {{ item.title }}
                <ExternalLink :size="15" aria-hidden="true" />
              </a>
            </h3>
            <p>{{ item.summary }}</p>
            <p class="why">{{ item.whyItMatters }}</p>
            <div class="tags">
              <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>

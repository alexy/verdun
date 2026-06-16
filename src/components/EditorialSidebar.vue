<script setup lang="ts">
import { ref } from 'vue'
import { BookOpenText, ClipboardCheck, Database, Send, Sparkles } from '@lucide/vue'
import type { NewsItem, NewsletterFocus, NewsletterReadiness, ProjectQueryPlan, SourceCoverageSummary, SourceRun } from '../lib/newsletter'
import type { OntologyNode } from '../lib/ontology'
import type { DraftSourceSummary } from '../composables/useNewsletterView'
import SourceHealthPanel from './SourceHealthPanel.vue'

defineProps<{
  draftItems: NewsItem[]
  draftSourceSummary: DraftSourceSummary[]
  focuses: NewsletterFocus[]
  ontologyNodes: OntologyNode[]
  pendingSourceCount: number
  queryPlans: ProjectQueryPlan[]
  readiness: NewsletterReadiness
  sourceCoverage: SourceCoverageSummary
  sourceGapReviewFilename: string
  sourceGapReviewMarkdown: string
  sourceRuns: SourceRun[]
}>()

const emit = defineEmits<{
  saveFocus: [text: string, scope: 'this_week' | 'ongoing']
}>()

const focusText = ref('')
const focusScope = ref<'this_week' | 'ongoing'>('this_week')

function submitFocus(): void {
  const text = focusText.value.trim()
  if (!text) return
  emit('saveFocus', text, focusScope.value)
  focusText.value = ''
}
</script>

<template>
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
      <button type="button" @click="submitFocus">
        <Send :size="16" aria-hidden="true" />
        Save
      </button>
    </div>

    <div class="focus-list">
      <h3>Active signals</h3>
      <p v-for="focus in focuses" :key="focus.id">
        <strong>{{ focus.scope === 'this_week' ? 'This week' : 'Ongoing' }}</strong>
        {{ focus.text }}
      </p>
    </div>

    <SourceHealthPanel
      :pending-source-count="pendingSourceCount"
      :query-plans="queryPlans"
      :source-coverage="sourceCoverage"
      :source-gap-review-filename="sourceGapReviewFilename"
      :source-gap-review-markdown="sourceGapReviewMarkdown"
      :source-runs="sourceRuns"
      @save-focus="(text, scope) => emit('saveFocus', text, scope)"
    />

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
      <div v-if="draftSourceSummary.length" class="draft-source-mix" aria-label="Draft source mix">
        <strong>Source mix</strong>
        <p v-for="source in draftSourceSummary" :key="source.source">
          <span>{{ source.source }} {{ source.count }}</span>
          {{ source.projects.slice(0, 3).join(', ') }}
        </p>
      </div>
      <ol>
        <li v-for="item in draftItems" :key="item.id">
          <strong>{{ item.project }}</strong>
          {{ item.whyItMatters }}
        </li>
      </ol>
      <p v-if="!draftItems.length" class="empty">Upvote items to assemble the weekly spine.</p>
    </div>
  </aside>
</template>

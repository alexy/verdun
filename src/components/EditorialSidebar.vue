<script setup lang="ts">
import { ref } from 'vue'
import { BookOpenText, ClipboardCheck, Database, Send, Sparkles } from '@lucide/vue'
import type { NewsItem, NewsletterFocus, NewsletterReadiness, SourceCoverageSummary, SourceRun } from '../lib/newsletter'
import type { OntologyNode } from '../lib/ontology'
import SourceHealthPanel from './SourceHealthPanel.vue'

defineProps<{
  focuses: NewsletterFocus[]
  includedItems: NewsItem[]
  ontologyNodes: OntologyNode[]
  pendingSourceCount: number
  readiness: NewsletterReadiness
  sourceCoverage: SourceCoverageSummary
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
      :source-coverage="sourceCoverage"
      :source-runs="sourceRuns"
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
      <ol>
        <li v-for="item in includedItems" :key="item.id">{{ item.project }}: {{ item.whyItMatters }}</li>
      </ol>
      <p v-if="!includedItems.length" class="empty">Upvote items to assemble the weekly spine.</p>
    </div>
  </aside>
</template>

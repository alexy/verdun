<script setup lang="ts">
import { computed } from 'vue'
import { Activity } from '@lucide/vue'
import type { SourceRun } from '../lib/newsletter'

const props = defineProps<{
  pendingSourceCount: number
  sourceRuns: SourceRun[]
}>()

const coveredProjectCount = computed(() => new Set(
  props.sourceRuns.flatMap((run) => Object.keys(run.projectCounts)),
).size)

function projectSummary(run: SourceRun): string {
  const projects = Object.entries(run.projectCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([project, count]) => `${project} ${count}`)
  return projects.length ? projects.join(', ') : 'No project matches'
}
</script>

<template>
  <div class="source-health">
    <div class="panel-heading">
      <Activity :size="18" aria-hidden="true" />
      <h2>Source health</h2>
    </div>
    <p class="source-health__coverage">{{ coveredProjectCount }} projects covered by live/manual source matches.</p>
    <div class="source-row" v-for="run in sourceRuns" :key="run.source">
      <span class="source-dot" :class="run.status" aria-hidden="true"></span>
      <div>
        <strong>{{ run.source }}</strong>
        <p>{{ run.itemCount }} items · {{ run.message }}</p>
        <p class="source-row__projects">{{ projectSummary(run) }}</p>
      </div>
    </div>
    <p v-if="pendingSourceCount" class="empty">{{ pendingSourceCount }} credentialed or feed adapters still pending.</p>
  </div>
</template>

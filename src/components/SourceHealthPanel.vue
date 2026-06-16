<script setup lang="ts">
import { Activity } from '@lucide/vue'
import type { SourceCoverageSummary, SourceRun } from '../lib/newsletter'

defineProps<{
  pendingSourceCount: number
  sourceCoverage: SourceCoverageSummary
  sourceRuns: SourceRun[]
}>()

function projectSummary(run: SourceRun): string {
  const projects = Object.entries(run.projectCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([project, count]) => `${project} ${count}`)
  return projects.length ? projects.join(', ') : 'No project matches'
}

function extraGapCount(projects: string[]): number {
  return Math.max(0, projects.length - 8)
}
</script>

<template>
  <div class="source-health">
    <div class="panel-heading">
      <Activity :size="18" aria-hidden="true" />
      <h2>Source health</h2>
    </div>
    <p class="source-health__coverage">
      {{ sourceCoverage.coveredProjects.length }} of {{ sourceCoverage.watchedProjects.length }} watched projects covered by live/manual source matches.
    </p>
    <div v-if="sourceCoverage.uncoveredProjects.length" class="source-gaps">
      <strong>Coverage gaps</strong>
      <p>
        {{ sourceCoverage.uncoveredProjects.slice(0, 8).join(', ') }}
        <span v-if="extraGapCount(sourceCoverage.uncoveredProjects)">plus {{ extraGapCount(sourceCoverage.uncoveredProjects) }} more</span>
      </p>
    </div>
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

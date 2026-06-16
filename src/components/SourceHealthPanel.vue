<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Download, Plus } from '@lucide/vue'
import type { ProjectQueryPlan, SourceCoverageSummary, SourceRun } from '../lib/newsletter'

const props = defineProps<{
  pendingSourceCount: number
  queryPlans: ProjectQueryPlan[]
  sourceCoverage: SourceCoverageSummary
  sourceGapReviewFilename: string
  sourceGapReviewMarkdown: string
  sourceRuns: SourceRun[]
}>()

const emit = defineEmits<{
  saveFocus: [text: string, scope: 'this_week' | 'ongoing']
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

function queryPlanSummary(plan: ProjectQueryPlan): string {
  const terms = plan.liveTerms.slice(0, 3).join(', ')
  const tags = plan.devToTags.slice(0, 2).map((tag) => `#${tag}`).join(', ')
  const focus = plan.focusTerms.length ? `focus: ${plan.focusTerms.slice(0, 3).join(', ')}` : ''
  return [terms, tags, focus].filter(Boolean).join(' · ')
}

function visibleReviewTargets(plan: ProjectQueryPlan) {
  const preferred = ['Hacker News', 'Substack', 'LinkedIn', 'X/Twitter']
  return [...plan.reviewTargets]
    .sort((left, right) => preferredIndex(left.source, preferred) - preferredIndex(right.source, preferred))
    .slice(0, 4)
}

function preferredIndex(source: string, preferred: string[]): number {
  const index = preferred.indexOf(source)
  return index === -1 ? preferred.length : index
}

function coverageGapPlans(): ProjectQueryPlan[] {
  const uncovered = new Set(props.sourceCoverage.uncoveredProjects)
  return props.queryPlans.filter((plan) => uncovered.has(plan.project)).slice(0, 4)
}

const sourceGapReviewHref = computed(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(props.sourceGapReviewMarkdown)}`)

function requestMoreCoverage(plan: ProjectQueryPlan): void {
  emit('saveFocus', `More source material on ${plan.project}: ${queryPlanSummary(plan) || plan.hackerNewsQuery}.`, 'this_week')
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
      <a
        class="source-gaps__download"
        :href="sourceGapReviewHref"
        :download="sourceGapReviewFilename"
      >
        <Download :size="14" aria-hidden="true" />
        Gap checklist
      </a>
      <ul v-if="coverageGapPlans().length">
        <li v-for="plan in coverageGapPlans()" :key="plan.project">
          <div>
            <strong>{{ plan.project }}</strong>
            <span>{{ queryPlanSummary(plan) }}</span>
          </div>
          <button type="button" :title="`Ask for more ${plan.project}`" @click="requestMoreCoverage(plan)">
            <Plus :size="14" aria-hidden="true" />
          </button>
        </li>
      </ul>
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
    <details v-if="queryPlans.length" class="query-plans">
      <summary>Crawler query plan · {{ queryPlans.length }} projects</summary>
      <div class="query-plan-row" v-for="plan in queryPlans" :key="plan.project">
        <strong>{{ plan.project }}</strong>
        <p>{{ plan.hackerNewsQuery }}</p>
        <span>{{ queryPlanSummary(plan) }}</span>
        <div v-if="visibleReviewTargets(plan).length" class="review-targets">
          <a
            v-for="target in visibleReviewTargets(plan)"
            :key="`${plan.project}-${target.source}-${target.url}`"
            :href="target.url"
            target="_blank"
            rel="noreferrer"
          >
            {{ target.source }}
          </a>
        </div>
      </div>
    </details>
  </div>
</template>

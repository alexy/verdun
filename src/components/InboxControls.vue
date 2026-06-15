<script setup lang="ts">
import { Search, X } from '@lucide/vue'

defineProps<{
  downvotedCount: number
  error: string
  filteredCount: number
  generatedAt: string
  projectOptions: string[]
  sourceOptions: string[]
  theme: string
  totalCount: number
  unreviewedCount: number
  upvotedCount: number
}>()

const searchText = defineModel<string>('searchText', { required: true })
const voteFilter = defineModel<'all' | 'unreviewed' | 'upvoted' | 'downvoted'>('voteFilter', { required: true })
const projectFilter = defineModel<string>('projectFilter', { required: true })
const sourceFilter = defineModel<string>('sourceFilter', { required: true })

function clearFilters(): void {
  searchText.value = ''
  voteFilter.value = 'all'
  projectFilter.value = 'all'
  sourceFilter.value = 'all'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}
</script>

<template>
  <div class="list-header">
    <div>
      <p class="eyebrow">Inbox</p>
      <h2>{{ theme }}</h2>
    </div>
    <p v-if="error" class="status">Local fallback: {{ error }}</p>
    <p v-else class="status">Generated {{ formatDate(generatedAt) }}</p>
  </div>

  <div class="inbox-controls" aria-label="Inbox filters">
    <label class="search-field">
      <Search :size="17" aria-hidden="true" />
      <input v-model="searchText" type="search" placeholder="Search titles, projects, tags..." />
    </label>
    <select v-model="voteFilter" aria-label="Vote status">
      <option value="all">All votes</option>
      <option value="unreviewed">Unreviewed ({{ unreviewedCount }})</option>
      <option value="upvoted">Upvoted ({{ upvotedCount }})</option>
      <option value="downvoted">Downvoted ({{ downvotedCount }})</option>
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
    <p>{{ filteredCount }} of {{ totalCount }}</p>
  </div>
</template>

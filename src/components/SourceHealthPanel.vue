<script setup lang="ts">
import { Activity } from '@lucide/vue'
import type { SourceRun } from '../lib/newsletter'

defineProps<{
  pendingSourceCount: number
  sourceRuns: SourceRun[]
}>()
</script>

<template>
  <div class="source-health">
    <div class="panel-heading">
      <Activity :size="18" aria-hidden="true" />
      <h2>Source health</h2>
    </div>
    <div class="source-row" v-for="run in sourceRuns" :key="run.source">
      <span class="source-dot" :class="run.status" aria-hidden="true"></span>
      <div>
        <strong>{{ run.source }}</strong>
        <p>{{ run.itemCount }} items · {{ run.message }}</p>
      </div>
    </div>
    <p v-if="pendingSourceCount" class="empty">{{ pendingSourceCount }} credentialed or feed adapters still pending.</p>
  </div>
</template>

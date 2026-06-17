<script setup lang="ts">
import { computed } from 'vue'
import WorkbenchHero from './workbench/WorkbenchHero.vue'

type WorkbenchMetric = {
  label: string
  value: number | string
}

const props = defineProps<{
  downvotedCount: number
  itemCount: number
  liveSourceCount: number
  sourceCount: number
  upvotedCount: number
}>()

const metrics = computed<WorkbenchMetric[]>(() => [
  { value: props.itemCount, label: 'items' },
  { value: props.upvotedCount, label: 'upvoted' },
  { value: props.downvotedCount, label: 'downvoted' },
  { value: props.sourceCount, label: 'sources' },
  { value: props.liveSourceCount, label: 'live' },
])
</script>

<template>
  <WorkbenchHero
    eyebrow="Collected.ga editorial desk"
    title="Strongly typed AI and data news, ready for weekly judgement."
    description="Triage project releases, community links, and social signals into a focused literary newsletter queue."
    metrics-label="Newsletter queue metrics"
    :metrics="metrics"
  />
</template>

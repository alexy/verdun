<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import type { ReviewValue } from '../../core/workbench'

const props = withDefaults(defineProps<{
  includeLabel?: string
  includeTitle?: string
  review: ReviewValue
  score: number
  scoreLabel?: string
  skipLabel?: string
  skipTitle?: string
}>(), {
  includeLabel: 'Include',
  includeTitle: 'Include',
  scoreLabel: 'Source score',
  skipLabel: 'Skip',
  skipTitle: 'Skip',
})

const emit = defineEmits<{
  review: [review: ReviewValue]
}>()

function nextReview(target: ReviewValue): ReviewValue {
  return props.review === target ? 0 : target
}
</script>

<template>
  <div class="vote-rail" aria-label="Review controls">
    <span class="role-pill role-pill--action vote-role">Action</span>
    <button
      type="button"
      :aria-pressed="review > 0"
      :class="{ active: review > 0 }"
      :title="includeTitle"
      @click="emit('review', nextReview(1))"
    >
      <ArrowUp :size="18" aria-hidden="true" />
      <span class="vote-label">{{ includeLabel }}</span>
    </button>
    <span class="vote-score" :aria-label="scoreLabel">{{ score }}</span>
    <button
      type="button"
      :aria-pressed="review < 0"
      :class="{ active: review < 0 }"
      :title="skipTitle"
      @click="emit('review', nextReview(-1))"
    >
      <ArrowDown :size="18" aria-hidden="true" />
      <span class="vote-label">{{ skipLabel }}</span>
    </button>
  </div>
</template>

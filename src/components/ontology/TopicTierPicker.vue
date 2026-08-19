<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { TopicConcept, TopicLevel, TopicSnapshot } from '@querygraph/ontology/navigator'
import { useTopicNavigator } from '../../composables/useTopicNavigator'

const props = defineProps<{
  snapshot: TopicSnapshot | null
  /** Labels for the three tiers; defaults suit a Quora-like gauge. */
  tierLabels?: Partial<Record<TopicLevel, string>>
  selectLabel?: string
}>()

const emit = defineEmits<{
  (event: 'select', concept: TopicConcept): void
}>()

const navigator = useTopicNavigator(toRef(props, 'snapshot'))
const { bands, activeIds, trail, active, search, query, choose } = navigator

const labels = computed<Record<TopicLevel, string>>(() => ({
  area: props.tierLabels?.area ?? 'Higher-level',
  focus: props.tierLabels?.focus ?? 'Within it',
  topic: props.tierLabels?.topic ?? 'More specific',
}))

const tierOrder: TopicLevel[] = ['area', 'focus', 'topic']

function pick(concept: TopicConcept): void {
  choose(concept)
}

function confirm(): void {
  if (active.value) emit('select', active.value)
}

defineExpose({ navigator })
</script>

<template>
  <div class="topic-tier-picker">
    <input
      v-model="query"
      class="ttp-search"
      type="search"
      placeholder="Search topics…"
      aria-label="Search topics"
    >
    <div v-if="query.trim() && search.results.length" class="ttp-band">
      <span class="ttp-band-label">Matches</span>
      <div class="ttp-chips">
        <button
          v-for="concept in search.results"
          :key="concept.id"
          type="button"
          class="ttp-chip"
          @click="pick(concept)"
        >{{ concept.name }}</button>
      </div>
    </div>
    <template v-else>
      <div v-for="level in tierOrder" :key="level" class="ttp-band">
        <template v-if="bands[level].length">
          <span class="ttp-band-label">{{ labels[level] }}</span>
          <div class="ttp-chips">
            <button
              v-for="concept in bands[level]"
              :key="concept.id"
              type="button"
              class="ttp-chip"
              :class="{ on: activeIds[level] === concept.id }"
              :title="concept.summary"
              @click="pick(concept)"
            >{{ concept.name }}</button>
          </div>
        </template>
      </div>
    </template>
    <div v-if="active" class="ttp-footer">
      <span class="ttp-trail">{{ trail.map((concept) => concept.name).join(' › ') }}</span>
      <button type="button" class="ttp-select" @click="confirm">
        {{ selectLabel ?? 'Use this topic' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.topic-tier-picker { display: flex; flex-direction: column; gap: 10px; }
.ttp-search {
  width: 100%; padding: 9px 12px; border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 10px; font: inherit; background: transparent; color: inherit;
}
.ttp-band { display: flex; flex-direction: column; gap: 5px; }
.ttp-band-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  text-transform: uppercase; opacity: 0.6;
}
.ttp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ttp-chip {
  border: 1px solid rgba(128, 128, 128, 0.35); background: transparent; color: inherit;
  border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 13px; cursor: pointer;
}
.ttp-chip.on {
  background: var(--ttp-accent, #1c5cab);
  border-color: var(--ttp-accent, #1c5cab);
  color: var(--ttp-accent-ink, #fff);
}
.ttp-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ttp-trail { font-size: 12.5px; opacity: 0.75; }
.ttp-select {
  border: none; border-radius: 10px; padding: 8px 14px; font: inherit;
  font-weight: 600; cursor: pointer;
}
</style>

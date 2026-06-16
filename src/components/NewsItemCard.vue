<script setup lang="ts">
import { ArrowDown, ArrowUp, ExternalLink } from '@lucide/vue'
import type { NewsItem, VoteValue } from '../lib/newsletter'
import { credoBlurb, ontologyForItem } from '../lib/ontology'

const props = defineProps<{
  item: NewsItem
}>()

defineEmits<{
  vote: [itemId: string, vote: VoteValue]
}>()

function itemAnchor(itemId: string): string {
  return `item-${itemId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function sourceDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function nextVote(target: VoteValue): VoteValue {
  return props.item.vote === target ? 0 : target
}

function stageLabel(stage: string): string {
  if (stage === 'watchlist-seed') return 'watchlist seed'
  return stage.replace(/[-_]+/g, ' ')
}
</script>

<template>
  <article :id="itemAnchor(item.id)" class="news-card" :class="{ included: item.vote > 0, rejected: item.vote < 0 }">
    <div class="vote-rail" aria-label="Vote controls">
      <button type="button" :class="{ active: item.vote > 0 }" title="Upvote" @click="$emit('vote', item.id, nextVote(1))">
        <ArrowUp :size="18" aria-hidden="true" />
      </button>
      <span>{{ item.score }}</span>
      <button type="button" :class="{ active: item.vote < 0 }" title="Downvote" @click="$emit('vote', item.id, nextVote(-1))">
        <ArrowDown :size="18" aria-hidden="true" />
      </button>
    </div>
    <div class="news-card__body">
      <div class="item-meta">
        <span>{{ item.project }}</span>
        <span>{{ item.sourceKind }}</span>
        <span>{{ sourceDomain(item.url) }}</span>
        <span>{{ formatDate(item.publishedAt) }}</span>
      </div>
      <h3>
        <a :href="item.url" target="_blank" rel="noreferrer">
          {{ item.title }}
          <ExternalLink :size="15" aria-hidden="true" />
        </a>
      </h3>
      <p>{{ item.summary }}</p>
      <p class="why">{{ item.whyItMatters }}</p>
      <div v-if="item.provenance" class="item-evidence">
        <strong>Evidence</strong>
        <span>{{ stageLabel(item.provenance.stage) }} via {{ item.provenance.adapter }}</span>
        <span v-if="item.provenance.matchedKeywords.length">{{ item.provenance.matchedKeywords.slice(0, 3).join(', ') }}</span>
      </div>
      <div class="credo-fit">
        <strong>Credo fit</strong>
        <p>{{ credoBlurb(item) }}</p>
        <div>
          <a v-for="node in ontologyForItem(item)" :key="node.id" :href="`#ontology-${node.id}`">{{ node.label }}</a>
        </div>
      </div>
      <div class="item-actions">
        <a :href="`#${itemAnchor(item.id)}`" :aria-label="`Permalink for ${item.title}`">permalink</a>
        <a :href="item.url" target="_blank" rel="noreferrer">source</a>
      </div>
      <div class="tags">
        <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
      </div>
    </div>
  </article>
</template>

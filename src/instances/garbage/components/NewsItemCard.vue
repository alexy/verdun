<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import type { NewsItem, VoteValue } from '../newsletter'
import { credoBlurb, ontologyMatchesForItem } from '../ontology'
import WorkbenchReviewRail from '../../../components/workbench/WorkbenchReviewRail.vue'

defineProps<{
  inDraft: boolean
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

function stageLabel(stage: string): string {
  if (stage === 'watchlist-seed') return 'watchlist seed'
  return stage.replace(/[-_]+/g, ' ')
}
</script>

<template>
  <article :id="itemAnchor(item.id)" class="news-card" :class="{ included: item.vote > 0, rejected: item.vote < 0, 'in-draft': inDraft }">
    <WorkbenchReviewRail
      :review="item.vote"
      :score="item.score"
      include-title="Upvote"
      skip-title="Downvote"
      @review="(vote) => $emit('vote', item.id, vote)"
    />
    <div class="news-card__body">
      <div class="item-meta">
        <span>{{ item.project }}</span>
        <span>{{ item.sourceKind }}</span>
        <span v-if="inDraft" class="draft-chip">Draft spine</span>
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
        <div class="ontology-links">
          <a v-for="match in ontologyMatchesForItem(item)" :key="match.node.id" :href="`#ontology-${match.node.id}`">
            <span>{{ match.node.label }}</span>
            <small>{{ match.keywords.length ? match.keywords.join(', ') : 'fallback' }}</small>
          </a>
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

<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkbenchHero from '../../components/workbench/WorkbenchHero.vue'
import WorkbenchReviewRail from '../../components/workbench/WorkbenchReviewRail.vue'
import type { ReviewValue } from '../../core/workbench'
import { useWorkbenchView } from '../../composables/useWorkbenchView'
import { greathousePilotSnapshot } from './pilot'

const snapshot = ref(greathousePilotSnapshot())
const {
  coverage,
  filteredRecords,
  includedRecords,
  liveSourceCount,
  rejectedRecordCount,
  reviewFilter,
  searchText,
  sourceCount,
  sourceFilter,
  sourceOptions,
  subjectFilter,
  subjectOptions,
  unreviewedRecordCount,
} = useWorkbenchView(snapshot)

const metrics = computed(() => [
  { label: 'records', value: snapshot.value.records.length },
  { label: 'included', value: includedRecords.value.length },
  { label: 'sources', value: sourceCount.value },
  { label: 'live sources', value: liveSourceCount.value },
])

function setReview(recordId: string, review: ReviewValue): void {
  snapshot.value = {
    ...snapshot.value,
    records: snapshot.value.records.map((record) => record.id === recordId ? { ...record, review } : record),
  }
}
</script>

<template>
  <main class="shell">
    <WorkbenchHero
      eyebrow="Greathouse"
      title="Property intelligence workbench"
      description="Review property-listing evidence and source diagnostics through Verdun's generic workbench contract."
      metrics-label="Greathouse workbench metrics"
      :metrics="metrics"
    />

    <section class="workspace">
      <section class="news-list" aria-label="Greathouse records">
        <section class="filters action-panel" aria-label="Greathouse filters">
          <span class="role-pill role-pill--action">Action</span>
          <label>
            <span>Search</span>
            <input v-model="searchText" type="search" placeholder="Search listings and diagnostics" />
          </label>
          <label>
            <span>Subject</span>
            <select v-model="subjectFilter">
              <option value="all">All subjects</option>
              <option v-for="subject in subjectOptions" :key="subject" :value="subject">{{ subject }}</option>
            </select>
          </label>
          <label>
            <span>Source</span>
            <select v-model="sourceFilter">
              <option value="all">All sources</option>
              <option v-for="source in sourceOptions" :key="source" :value="source">{{ source }}</option>
            </select>
          </label>
          <label>
            <span>Review</span>
            <select v-model="reviewFilter">
              <option value="all">All records</option>
              <option value="included">Included</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </section>

        <section class="source-health info-panel" aria-label="Greathouse source health">
          <span class="role-pill role-pill--info">Info</span>
          <h2>Source health</h2>
          <p>{{ coverage.coveredSubjects.length }} of {{ coverage.watchedSubjects.length }} watched subjects have live source coverage.</p>
          <p v-if="coverage.uncoveredSubjects.length">Coverage gaps: {{ coverage.uncoveredSubjects.join(', ') }}</p>
          <p>{{ unreviewedRecordCount }} unreviewed records · {{ rejectedRecordCount }} rejected records.</p>
        </section>

        <p v-if="!filteredRecords.length" class="empty inbox-empty">No records match the current filters.</p>

        <article
          v-for="record in filteredRecords"
          :key="record.id"
          class="news-card"
          :class="{ included: record.review > 0, rejected: record.review < 0 }"
        >
          <WorkbenchReviewRail :review="record.review" :score="record.score" @review="setReview(record.id, $event)" />
          <div class="news-card__body">
            <div class="item-meta">
              <span>{{ record.source }}</span>
              <span>{{ record.sourceKind }}</span>
              <span>{{ record.subject }}</span>
            </div>
            <h2><a :href="record.url">{{ record.title }}</a></h2>
            <p>{{ record.summary }}</p>
            <p v-if="record.provenance" class="evidence">
              Evidence: {{ record.provenance.stage }} via {{ record.provenance.adapter }}.
            </p>
            <div class="tags" aria-label="Record tags">
              <span v-for="tag in record.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>

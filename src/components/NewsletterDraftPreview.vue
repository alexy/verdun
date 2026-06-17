<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Download, FileJson, FileText, Upload } from '@lucide/vue'
import type { NewsletterDraft, NewsletterPublishManifest } from '../instances/garbage/newsletter'

const props = defineProps<{
  draft: NewsletterDraft
  editorialStateFilename: string
  editorialStateJson: string
  filename: string
  importSummary: string
  publishManifest: NewsletterPublishManifest
  publishManifestFilename: string
  publishManifestJson: string
}>()

const emit = defineEmits<{
  importEditorialState: [state: unknown]
}>()

const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const importStatus = ref('')
const stateInput = ref<HTMLInputElement | null>(null)
const draftDownloadHref = computed(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(props.draft.markdown)}`)
const editorialStateDownloadHref = computed(() => `data:application/json;charset=utf-8,${encodeURIComponent(props.editorialStateJson)}`)
const publishManifestDownloadHref = computed(() => `data:application/json;charset=utf-8,${encodeURIComponent(props.publishManifestJson)}`)
const serverMarkdownHref = '/api/newsletter/draft?format=markdown'
const serverManifestHref = '/api/newsletter/draft?format=manifest'
const failedReadinessChecks = computed(() => props.publishManifest.readiness.checks.filter((check) => !check.passed).slice(0, 2))
const failedProseChecks = computed(() => props.publishManifest.proseQuality.checks.filter((check) => !check.passed).slice(0, 2))

async function copyDraftMarkdown(): Promise<void> {
  copyStatus.value = 'idle'
  try {
    await navigator.clipboard.writeText(props.draft.markdown)
    copyStatus.value = 'copied'
  } catch {
    copyStatus.value = 'failed'
  }
}

function openStateImport(): void {
  stateInput.value?.click()
}

async function importStateFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    importStatus.value = ''
    emit('importEditorialState', JSON.parse(await file.text()))
    importStatus.value = `Imported ${file.name}`
  } catch {
    importStatus.value = 'Import failed'
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <article class="draft-preview">
    <div class="draft-preview__header">
      <div class="panel-heading">
        <FileText :size="18" aria-hidden="true" />
        <h2>Draft preview</h2>
        <span class="role-pill role-pill--info">Info</span>
      </div>
      <div class="draft-actions">
        <span class="role-pill role-pill--action">Action</span>
        <a :href="draftDownloadHref" :download="filename">
          <Download :size="16" aria-hidden="true" />
          Markdown
        </a>
        <a :href="editorialStateDownloadHref" :download="editorialStateFilename">
          <FileJson :size="16" aria-hidden="true" />
          Editorial state
        </a>
        <a :href="publishManifestDownloadHref" :download="publishManifestFilename">
          <FileJson :size="16" aria-hidden="true" />
          Manifest
        </a>
        <a :href="serverMarkdownHref" download="server-newsletter-draft.md">
          <FileText :size="16" aria-hidden="true" />
          Server Markdown
        </a>
        <a :href="serverManifestHref" download="server-newsletter-draft.manifest.json">
          <FileJson :size="16" aria-hidden="true" />
          Server Manifest
        </a>
        <button type="button" @click="openStateImport">
          <Upload :size="16" aria-hidden="true" />
          Import state
        </button>
        <input ref="stateInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importStateFile" />
        <button type="button" @click="copyDraftMarkdown">
          <Check v-if="copyStatus === 'copied'" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          {{ copyStatus === 'copied' ? 'Copied' : 'Copy' }}
        </button>
      </div>
    </div>
    <h3>{{ draft.title }}</h3>
    <p>{{ draft.subtitle }}</p>
    <section class="publish-audit info-panel" aria-label="Publish audit">
      <div>
        <strong>{{ publishManifest.issue.date }}</strong>
        <span>{{ publishManifest.issue.slug }}</span>
      </div>
      <dl>
        <div>
          <dt>Selected</dt>
          <dd>{{ publishManifest.issue.selectedItemCount }}</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd>{{ publishManifest.issue.projectCount }}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{{ publishManifest.issue.sourceCount }}</dd>
        </div>
        <div>
          <dt>Focus</dt>
          <dd>{{ publishManifest.issue.focusCount }}</dd>
        </div>
        <div>
          <dt>Live</dt>
          <dd>{{ publishManifest.selectedEvidence.liveCount }}</dd>
        </div>
        <div>
          <dt>Manual</dt>
          <dd>{{ publishManifest.selectedEvidence.manualCount }}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd>{{ publishManifest.selectedEvidence.seedCount }}</dd>
        </div>
      </dl>
      <p v-if="publishManifest.selectedEvidence.sourceMix.length" class="publish-audit__source-mix">
        Evidence mix:
        {{ publishManifest.selectedEvidence.sourceMix.map((source) => `${source.source} ${source.count}`).slice(0, 4).join(' · ') }}
      </p>
      <p>
        <span :class="`audit-pill audit-pill--${publishManifest.readiness.status}`">
          Readiness: {{ publishManifest.readiness.status === 'ready' ? 'ready' : 'needs review' }}
        </span>
        <span :class="`audit-pill audit-pill--${publishManifest.proseQuality.status}`">
          Prose: {{ publishManifest.proseQuality.status === 'ready' ? 'ready' : 'needs review' }}
        </span>
      </p>
      <ul v-if="failedReadinessChecks.length || failedProseChecks.length">
        <li v-for="check in failedReadinessChecks" :key="`readiness-${check.id}`">{{ check.label }}: {{ check.detail }}</li>
        <li v-for="check in failedProseChecks" :key="`prose-${check.id}`">{{ check.label }}: {{ check.detail }}</li>
      </ul>
    </section>
    <p v-if="importStatus || importSummary" class="draft-import-status">{{ importStatus }}<span v-if="importStatus && importSummary"> · </span>{{ importSummary }}</p>
    <p v-if="copyStatus === 'failed'" class="draft-copy-error">Clipboard access is unavailable in this browser session.</p>
    <div class="draft-preview__body" v-html="draft.html"></div>
  </article>
</template>

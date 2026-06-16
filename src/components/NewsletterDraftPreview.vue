<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Download, FileJson, FileText, Upload } from '@lucide/vue'
import type { NewsletterDraft } from '../lib/newsletter'

const props = defineProps<{
  draft: NewsletterDraft
  editorialStateFilename: string
  editorialStateJson: string
  filename: string
  importSummary: string
}>()

const emit = defineEmits<{
  importEditorialState: [state: unknown]
}>()

const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const importStatus = ref('')
const stateInput = ref<HTMLInputElement | null>(null)
const draftDownloadHref = computed(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(props.draft.markdown)}`)
const editorialStateDownloadHref = computed(() => `data:application/json;charset=utf-8,${encodeURIComponent(props.editorialStateJson)}`)

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
      </div>
      <div class="draft-actions">
        <a :href="draftDownloadHref" :download="filename">
          <Download :size="16" aria-hidden="true" />
          Markdown
        </a>
        <a :href="editorialStateDownloadHref" :download="editorialStateFilename">
          <FileJson :size="16" aria-hidden="true" />
          Editorial state
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
    <p v-if="importStatus || importSummary" class="draft-import-status">{{ importStatus }}<span v-if="importStatus && importSummary"> · </span>{{ importSummary }}</p>
    <p v-if="copyStatus === 'failed'" class="draft-copy-error">Clipboard access is unavailable in this browser session.</p>
    <div class="draft-preview__body" v-html="draft.html"></div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Download, FileText } from '@lucide/vue'
import type { NewsletterDraft } from '../lib/newsletter'

const props = defineProps<{
  draft: NewsletterDraft
  filename: string
}>()

const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const draftDownloadHref = computed(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(props.draft.markdown)}`)

async function copyDraftMarkdown(): Promise<void> {
  copyStatus.value = 'idle'
  try {
    await navigator.clipboard.writeText(props.draft.markdown)
    copyStatus.value = 'copied'
  } catch {
    copyStatus.value = 'failed'
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
        <button type="button" @click="copyDraftMarkdown">
          <Check v-if="copyStatus === 'copied'" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          {{ copyStatus === 'copied' ? 'Copied' : 'Copy' }}
        </button>
      </div>
    </div>
    <h3>{{ draft.title }}</h3>
    <p>{{ draft.subtitle }}</p>
    <p v-if="copyStatus === 'failed'" class="draft-copy-error">Clipboard access is unavailable in this browser session.</p>
    <div class="draft-preview__body" v-html="draft.html"></div>
  </article>
</template>

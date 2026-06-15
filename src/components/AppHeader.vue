<script setup lang="ts">
import { RefreshCw, Sparkles } from '@lucide/vue'

defineProps<{
  loading: boolean
}>()

defineEmits<{
  refresh: []
}>()
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <Sparkles :size="22" aria-hidden="true" />
      <span>Verdun</span>
    </div>
    <button class="icon-button" type="button" :disabled="loading" title="Refresh items" @click="$emit('refresh')">
      <RefreshCw :size="18" aria-hidden="true" />
    </button>
  </header>
</template>

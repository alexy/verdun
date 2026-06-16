<script setup lang="ts">
import { Menu, RefreshCw, Sparkles } from '@lucide/vue'

defineProps<{
  infoOpen: boolean
  loading: boolean
}>()

defineEmits<{
  refresh: []
  toggleInfo: []
}>()
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <Sparkles :size="22" aria-hidden="true" />
      <span>Verdun</span>
    </div>
    <div class="topbar__actions">
      <button
        class="icon-button"
        type="button"
        :aria-expanded="infoOpen"
        aria-controls="info-drawer"
        title="Open info menu"
        @click="$emit('toggleInfo')"
      >
        <Menu :size="18" aria-hidden="true" />
      </button>
      <button class="icon-button" type="button" :disabled="loading" title="Refresh items" @click="$emit('refresh')">
        <RefreshCw :size="18" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

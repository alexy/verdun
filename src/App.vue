<script setup lang="ts">
import { computed } from 'vue'
import { resolveWorkbenchAppForPath } from './instances/app-registry'

const activeApp = computed(() => {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  return resolveWorkbenchAppForPath(pathname)
})
</script>

<template>
  <component :is="activeApp" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GarbageApp from './instances/garbage/GarbageApp.vue'
import GreathouseApp from './instances/greathouse/GreathouseApp.vue'
import { resolveWorkbenchInstanceForPath } from './instances/registry'

const appComponents = {
  garbage: GarbageApp,
  greathouse: GreathouseApp,
}

const activeApp = computed(() => {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  const instance = resolveWorkbenchInstanceForPath(pathname)
  return appComponents[instance.id as keyof typeof appComponents] ?? GarbageApp
})
</script>

<template>
  <component :is="activeApp" />
</template>

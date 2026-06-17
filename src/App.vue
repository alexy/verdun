<script setup lang="ts">
import { computed } from 'vue'
import GarbageApp from './instances/garbage/GarbageApp.vue'
import GreathouseApp from './instances/greathouse/GreathouseApp.vue'

const activeApp = computed(() => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/greathouse/')) {
    return GreathouseApp
  }
  return GarbageApp
})
</script>

<template>
  <component :is="activeApp" />
</template>

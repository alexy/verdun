<script setup lang="ts">
type WorkbenchMetric = {
  label: string
  value: number | string
}

defineProps<{
  description: string
  eyebrow: string
  metrics: WorkbenchMetric[]
  metricsLabel: string
  title: string
}>()
</script>

<template>
  <section class="hero">
    <div class="hero__copy">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div class="metrics" :aria-label="metricsLabel">
      <span class="role-pill role-pill--info">Info</span>
      <div v-for="metric in metrics" :key="metric.label">
        <span>{{ metric.value }}</span>
        <p>{{ metric.label }}</p>
      </div>
    </div>
  </section>
</template>

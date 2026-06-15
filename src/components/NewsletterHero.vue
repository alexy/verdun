<script setup lang="ts">
defineProps<{
  downvotedCount: number
  itemCount: number
  liveSourceCount: number
  sourceCount: number
  upvotedCount: number
}>()
</script>

<template>
  <section class="hero">
    <div class="hero__copy">
      <p class="eyebrow">Collected.ga editorial desk</p>
      <h1>Strongly typed AI and data news, ready for weekly judgement.</h1>
      <p>
        Triage project releases, community links, and social signals into a focused literary newsletter queue.
      </p>
    </div>
    <div class="metrics" aria-label="Newsletter queue metrics">
      <div>
        <span>{{ itemCount }}</span>
        <p>items</p>
      </div>
      <div>
        <span>{{ upvotedCount }}</span>
        <p>upvoted</p>
      </div>
      <div>
        <span>{{ downvotedCount }}</span>
        <p>downvoted</p>
      </div>
      <div>
        <span>{{ sourceCount }}</span>
        <p>sources</p>
      </div>
      <div>
        <span>{{ liveSourceCount }}</span>
        <p>live</p>
      </div>
    </div>
  </section>
</template>

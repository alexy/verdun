<script lang="ts">
import { defineComponent, h } from 'vue'
import NewsletterHero from '../../../../../apps/garbage/src/app/components/NewsletterHero.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(NewsletterHero as any, attrs)
  },
})
</script>

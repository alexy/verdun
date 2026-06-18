<script lang="ts">
import { defineComponent, h } from 'vue'
import NewsletterDraftPreview from '../../../../../apps/garbage/src/app/components/NewsletterDraftPreview.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(NewsletterDraftPreview as any, attrs)
  },
})
</script>

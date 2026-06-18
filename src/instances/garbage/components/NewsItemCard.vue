<script lang="ts">
import { defineComponent, h } from 'vue'
import NewsItemCard from '../../../../../apps/garbage/src/app/components/NewsItemCard.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(NewsItemCard as any, attrs)
  },
})
</script>

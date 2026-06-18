<script lang="ts">
import { defineComponent, h } from 'vue'
import SourceHealthPanel from '../../../../../apps/garbage/src/app/components/SourceHealthPanel.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(SourceHealthPanel as any, attrs)
  },
})
</script>

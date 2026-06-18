<script lang="ts">
import { defineComponent, h } from 'vue'
import InboxControls from '../../../../../apps/garbage/src/app/components/InboxControls.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(InboxControls as any, attrs)
  },
})
</script>

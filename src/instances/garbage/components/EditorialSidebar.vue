<script lang="ts">
import { defineComponent, h } from 'vue'
import EditorialSidebar from '../../../../../apps/garbage/src/app/components/EditorialSidebar.vue'

export default defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h(EditorialSidebar as any, attrs)
  },
})
</script>

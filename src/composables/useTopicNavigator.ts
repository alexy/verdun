import { computed, ref, type Ref } from 'vue'
import {
  localTopicSearch,
  topicBandActiveIds,
  topicNavigatorBands,
  topicNavigatorRoute,
  topicRouteActiveId,
  topicRouteAfterChoice,
  topicRouteTrail,
  type TopicConcept,
  type TopicNavigatorRoute,
  type TopicSnapshot,
} from '@querygraph/ontology/navigator'

/**
 * Reactive wrapper over the framework-neutral three-tier navigator from
 * @querygraph/ontology: one Area / Focus / Specific route, derived bands,
 * bounded local search, and selection. Verdun owns the interaction layer;
 * the ontology package owns the semantics.
 */
export function useTopicNavigator(snapshot: Ref<TopicSnapshot | null | undefined>) {
  const route = ref<TopicNavigatorRoute>({})
  const query = ref('')

  const bands = computed(() => {
    const value = snapshot.value
    if (!value) return { area: [], focus: [], topic: [] }
    return topicNavigatorBands(value, route.value)
  })

  const activeIds = computed(() => {
    const value = snapshot.value
    return value ? topicBandActiveIds(value, route.value) : {}
  })

  const trail = computed(() => {
    const value = snapshot.value
    return value ? topicRouteTrail(value, route.value) : []
  })

  const active = computed<TopicConcept | null>(() => {
    const value = snapshot.value
    if (!value) return null
    const id = topicRouteActiveId(topicNavigatorRoute(value, route.value))
    return value.concepts.find((concept) => concept.id === id) ?? null
  })

  const search = computed(() => {
    const value = snapshot.value
    if (!value || !query.value.trim()) return { results: [], canSuggest: false }
    return localTopicSearch(value, query.value)
  })

  function choose(concept: TopicConcept): void {
    const value = snapshot.value
    if (!value) return
    route.value = topicRouteAfterChoice(value, route.value, concept)
    query.value = ''
  }

  function reset(): void {
    route.value = {}
    query.value = ''
  }

  return { route, query, bands, activeIds, trail, active, search, choose, reset }
}

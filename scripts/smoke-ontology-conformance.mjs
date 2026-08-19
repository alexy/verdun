// Proves the Vue chooser composable replays the shared chooser-conformance
// scenario from @querygraph/ontology exactly — the composable may wrap the
// navigator, never re-derive it. Relies on Node's native type stripping to
// import the .ts composable (Node 23+).
import { ref } from 'vue'
import {
  buildSeedSnapshot,
  referenceChooserAdapter,
  runChooserConformance,
} from '@querygraph/ontology'
import { useTopicNavigator } from '../src/composables/useTopicNavigator.ts'

function composableAdapter() {
  let snapshotRef = ref(buildSeedSnapshot())
  let navigator = useTopicNavigator(snapshotRef)
  return {
    reset(snapshot) {
      snapshotRef = ref(snapshot)
      navigator = useTopicNavigator(snapshotRef)
    },
    choose(conceptId) {
      const concept = snapshotRef.value.concepts.find((candidate) => candidate.id === conceptId)
      if (concept) navigator.choose(concept)
    },
    bands() {
      const bands = navigator.bands.value
      return {
        area: bands.area.map((concept) => concept.id),
        focus: bands.focus.map((concept) => concept.id),
        topic: bands.topic.map((concept) => concept.id),
      }
    },
    activeIds() {
      return navigator.activeIds.value
    },
    activeId() {
      return navigator.active.value?.id ?? ''
    },
    search(query) {
      navigator.query.value = query
      return navigator.search.value.results.map((concept) => concept.id)
    },
  }
}

const referenceFailures = runChooserConformance(referenceChooserAdapter())
if (referenceFailures.length > 0) {
  console.error('reference adapter failed — the pinned ontology package is inconsistent', referenceFailures)
  process.exit(1)
}

const failures = runChooserConformance(composableAdapter())
if (failures.length > 0) {
  console.error('useTopicNavigator diverged from the shared chooser contract:')
  for (const failure of failures) console.error(JSON.stringify(failure))
  process.exit(1)
}
console.log('ontology chooser conformance: useTopicNavigator matches the shared contract.')

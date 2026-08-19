# Verdun operations guidance

- `APP.md` defines what Verdun owns versus external apps; `PUBLIC_SURFACE.md`
  is the supported package surface; `EXTERNAL_APP.md` is the consumer guide.
  Never let apps import outside the published surface.
- **Ontology layering** (see `ONTOLOGY.md` in querygraph/ontology): ontology
  data engineering — durable normalization, matching, the three-tier
  navigator view-model, the cold-start seed, topic extraction from text —
  lives in `@querygraph/ontology`. Verdun owns the *interactive* layer only:
  `frontend/ontology-view` (`useTopicNavigator`) and `frontend/ontology-ui`
  (`TopicTierPicker`, the Quora-like Area / Focus / Specific gauge).
  Applications (devreal, disappointed) reuse and specialize; selection
  semantics must not fork into apps.
- Pin `@querygraph/ontology` to an exact commit; upgrading it is an explicit
  reviewed change because normalization keys are durable.

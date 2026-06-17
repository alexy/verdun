export const garbageDeployCheckProfile = {
  id: 'garbage',
  defaultBaseUrl: 'https://collected.ga/rbage/',
  previewBaseUrl: 'http://127.0.0.1:5174/rbage/',
  devAppBaseUrl: 'http://127.0.0.1:5176/rbage/',
  sourceSnapshotPath: 'public/data/newsletter-snapshot.json',
  staticSnapshotPath: 'data/newsletter-snapshot.json',
  minRecords: 23,
  minCollectionPlans: 23,
  requiredSubjects: ['Pydantic', 'LakeSail', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Turso', 'LanceDB', 'HelixDB', 'SurrealDB', 'pgGraph', 'Garde', 'zod-rs'],
  requiredPlans: ['BAML', 'DSPy', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Ibis', 'Dagster', 'Garde', 'zod-rs'],
  draft: {
    apiPath: '/api/garbage/newsletter/draft',
    markdownIncludes: ['Strongly Typed AI/Data Notes', '## Sources watched'],
    manifestSnapshotInput: 'api/garbage/newsletter/items',
  },
}

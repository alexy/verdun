export const deployCheckProfile = {
  id: 'greathouse',
  basePath: '/greathouse/',
  previewBaseUrl: 'http://127.0.0.1:5174/greathouse/',
  devAppBaseUrl: 'http://127.0.0.1:5176/greathouse/',
  staticSnapshotPath: 'data/greathouse-snapshot.json',
  smokeFixtureModule: './instances/greathouse/deployed-check-smoke-fixture.mjs',
  genericSqlSmoke: {
    sqlPath: '/tmp/verdun-greathouse-generic-load.sql',
    itemsPath: '/tmp/verdun-greathouse-items.json',
    sourceRunsPath: '/tmp/verdun-greathouse-source-runs.json',
    publicSnapshotPath: '/tmp/verdun-greathouse-public-snapshot.json',
    genericSnapshotPath: '/tmp/verdun-greathouse-generic-snapshot.json',
    loaderArgs: ['--allow-custom-instance'],
  },
  smokeAllCommands: [
    'smoke:greathouse-workbench',
  ],
  minRecords: 2,
  minSourceRuns: 2,
  minCollectionPlans: 1,
  requiredSubjects: ['Berkeley 2BR', 'Oakland blocked source'],
  requiredPlans: ['Berkeley 2BR', 'Oakland blocked source'],
}

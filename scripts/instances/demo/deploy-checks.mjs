export const deployCheckProfile = {
  id: 'demo',
  default: true,
  defaultBaseUrl: 'https://example.com/demo/',
  basePath: '/demo/',
  previewBaseUrl: 'http://127.0.0.1:5174/demo/',
  devAppBaseUrl: 'http://127.0.0.1:5176/demo/',
  staticSnapshotPath: 'data/demo-snapshot.json',
  smokeFixtureModule: './instances/demo/deployed-check-smoke-fixture.mjs',
  smokeAllCommands: [
    'smoke:demo-workbench',
  ],
  minRecords: 2,
  minSourceRuns: 2,
  minCollectionPlans: 2,
  requiredSubjects: ['Reusable workbench', 'Source diagnostics'],
  requiredPlans: ['Reusable workbench', 'Source diagnostics'],
}

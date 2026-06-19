export const workbenchApiModulePaths = {
  database: 'api/workbench/_db.ts',
  recordsRoute: 'api/workbench/records.ts',
  statusRoute: 'api/workbench/status.ts',
  healthRoute: 'api/workbench/health.ts',
  reviewRoute: 'api/workbench/review.ts',
  focusRoute: 'api/workbench/focus.ts',
  stateRoute: 'api/workbench/state.ts',
}

export const workbenchApiSourceGuardPaths = {
  database: workbenchApiModulePaths.database,
  healthRoute: workbenchApiModulePaths.healthRoute,
  instanceAdapters: 'api/workbench/instance-adapters.ts',
}

export const bundledProofModulePaths = {
  greathouseConfig: 'src/instances/greathouse/config.ts',
}

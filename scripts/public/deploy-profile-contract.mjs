export function validateDeployCheckProfile(profile, source = 'deploy-check profile') {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${source} must export a deployCheckProfile object`)
  }
  if (!nonEmptyString(profile.id)) {
    throw new Error(`${source} must define a non-empty id`)
  }
  if (!basePath(profile.basePath)) {
    throw new Error(`${source} ${profile.id} must define basePath as an absolute path ending in /`)
  }
  if (profile.defaultBaseUrl !== undefined && !absoluteUrl(profile.defaultBaseUrl)) {
    throw new Error(`${source} ${profile.id} defaultBaseUrl must be an absolute URL`)
  }
  for (const key of ['previewBaseUrl', 'devAppBaseUrl']) {
    if (profile[key] !== undefined && !absoluteUrl(profile[key])) {
      throw new Error(`${source} ${profile.id} ${key} must be an absolute URL`)
    }
  }
  if (profile.staticSnapshotPath !== undefined && !nonEmptyString(profile.staticSnapshotPath)) {
    throw new Error(`${source} ${profile.id} staticSnapshotPath must be a non-empty string`)
  }
  if (profile.sourceSnapshotPath !== undefined && !nonEmptyString(profile.sourceSnapshotPath)) {
    throw new Error(`${source} ${profile.id} sourceSnapshotPath must be a non-empty string`)
  }
  if (profile.smokeFixtureModule !== undefined && !nonEmptyString(profile.smokeFixtureModule)) {
    throw new Error(`${source} ${profile.id} smokeFixtureModule must be a non-empty module path or URL`)
  }
  if (profile.readinessCheckModule !== undefined && !nonEmptyString(profile.readinessCheckModule)) {
    throw new Error(`${source} ${profile.id} readinessCheckModule must be a non-empty module path or URL`)
  }
  for (const key of ['accountMigrationCommand', 'accountReadinessCommand', 'accountSessionCleanupCommand', 'accountLiveEnvCommand', 'accountLiveAcceptanceCommand', 'accountLiveCheckCommand']) {
    if (profile[key] !== undefined && !nonEmptyString(profile[key])) {
      throw new Error(`${source} ${profile.id} ${key} must be a non-empty string`)
    }
  }
  if (profile.migrationPaths !== undefined && !stringArray(profile.migrationPaths)) {
    throw new Error(`${source} ${profile.id} migrationPaths must be an array of strings`)
  }
  for (const key of ['smokeCommands', 'smokeAllCommands', 'uiSmokeCommands', 'publishingCommands', 'removedGenericCommands', 'requiredSubjects', 'requiredPlans']) {
    if (profile[key] !== undefined && !stringArray(profile[key])) {
      throw new Error(`${source} ${profile.id} ${key} must be an array of strings`)
    }
  }
  if (profile.commandRunner !== undefined) validateCommandRunner(profile.commandRunner, source, profile.id)
  if (profile.compatibilitySqlSmoke !== undefined) validateSqlSmoke(profile.compatibilitySqlSmoke, 'compatibilitySqlSmoke', source, profile.id)
  if (profile.genericSqlSmoke !== undefined) validateSqlSmoke(profile.genericSqlSmoke, 'genericSqlSmoke', source, profile.id)
  if (profile.draft !== undefined) validateDraft(profile.draft, source, profile.id)
  return profile
}

function validateCommandRunner(runner, source, id) {
  if (!runner || typeof runner !== 'object' || Array.isArray(runner)) {
    throw new Error(`${source} ${id} commandRunner must be an object`)
  }
  if (runner.kind !== 'npm-workspace') {
    throw new Error(`${source} ${id} commandRunner.kind must be npm-workspace`)
  }
  for (const key of ['workspaceRoot', 'workspace']) {
    if (!nonEmptyString(runner[key])) {
      throw new Error(`${source} ${id} commandRunner.${key} must be a non-empty string`)
    }
  }
  if (runner.scriptPrefix !== undefined && typeof runner.scriptPrefix !== 'string') {
    throw new Error(`${source} ${id} commandRunner.scriptPrefix must be a string`)
  }
  if (runner.scriptMap !== undefined && (!runner.scriptMap || typeof runner.scriptMap !== 'object' || Array.isArray(runner.scriptMap))) {
    throw new Error(`${source} ${id} commandRunner.scriptMap must be an object`)
  }
}

function validateSqlSmoke(smoke, key, source, id) {
  if (!smoke || typeof smoke !== 'object' || Array.isArray(smoke)) {
    throw new Error(`${source} ${id} ${key} must be an object`)
  }
  if (!nonEmptyString(smoke.sqlPath)) {
    throw new Error(`${source} ${id} ${key}.sqlPath must be a non-empty string`)
  }
  if (smoke.target !== undefined && !nonEmptyString(smoke.target)) {
    throw new Error(`${source} ${id} ${key}.target must be a non-empty string`)
  }
  if (smoke.loaderCommand !== undefined && !nonEmptyString(smoke.loaderCommand)) {
    throw new Error(`${source} ${id} ${key}.loaderCommand must be a non-empty string`)
  }
  for (const pathKey of ['itemsPath', 'sourceRunsPath', 'publicSnapshotPath', 'genericSnapshotPath']) {
    if (smoke[pathKey] !== undefined && !nonEmptyString(smoke[pathKey])) {
      throw new Error(`${source} ${id} ${key}.${pathKey} must be a non-empty string`)
    }
  }
  if (smoke.loaderArgs !== undefined && !stringArray(smoke.loaderArgs)) {
    throw new Error(`${source} ${id} ${key}.loaderArgs must be an array of strings`)
  }
}

function validateDraft(draft, source, id) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error(`${source} ${id} draft must be an object`)
  }
  if (!nonEmptyString(draft.apiPath)) {
    throw new Error(`${source} ${id} draft.apiPath must be a non-empty string`)
  }
  if (draft.checkModule !== undefined && !nonEmptyString(draft.checkModule)) {
    throw new Error(`${source} ${id} draft.checkModule must be a non-empty module path or URL`)
  }
  if (draft.markdownIncludes !== undefined && !stringArray(draft.markdownIncludes)) {
    throw new Error(`${source} ${id} draft.markdownIncludes must be an array of strings`)
  }
  if (draft.manifestSnapshotInput !== undefined && !nonEmptyString(draft.manifestSnapshotInput)) {
    throw new Error(`${source} ${id} draft.manifestSnapshotInput must be a non-empty string`)
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString)
}

function basePath(value) {
  return nonEmptyString(value) && value.startsWith('/') && value.endsWith('/')
}

function absoluteUrl(value) {
  if (!nonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.host)
  } catch {
    return false
  }
}

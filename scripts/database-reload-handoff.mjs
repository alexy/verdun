import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function databaseEnvStatus(databaseUrl) {
  return databaseUrl ? 'provided' : 'not_provided'
}

export function redactedDatabaseUrlArg(databaseUrl) {
  return databaseUrl ? ['--database-url', '<redacted>'] : []
}

export function cargoRunCommand(manifestPath, args = []) {
  return [
    'cargo',
    'run',
    '--manifest-path',
    manifestPath,
    '--',
    ...args,
  ]
}

export function nodeApplySqlCommand({
  scriptPath,
  leadingArgs = [],
  sqlPath,
  snapshotPath,
  trailingArgs = [],
  databaseUrl,
  apply = false,
}) {
  return [
    'node',
    scriptPath,
    ...leadingArgs,
    '--sql',
    sqlPath,
    '--snapshot',
    snapshotPath,
    ...trailingArgs,
    ...redactedDatabaseUrlArg(databaseUrl),
    ...(apply ? ['--apply'] : []),
  ]
}

export function databaseReloadStatus(apply) {
  return apply ? 'applied' : 'preflight'
}

export function databaseReloadHandoff({
  apply,
  kind,
  instance,
  displayName = null,
  generatedSql,
  snapshotPath,
  sqlPath,
  databaseUrl,
  vercelEnvChecked,
  deployedCheckSkipped,
  deployedCheckCommand,
  commands,
  generatedAt = new Date().toISOString(),
  extra = {},
}) {
  return {
    schemaVersion: 1,
    generatedAt,
    kind,
    status: databaseReloadStatus(apply),
    apply,
    generatedSql,
    instance,
    displayName,
    snapshotPath,
    sqlPath,
    databaseEnv: databaseEnvStatus(databaseUrl),
    vercelEnvChecked,
    deployedCheck: {
      skipped: deployedCheckSkipped,
      command: deployedCheckCommand,
    },
    commands,
    ...extra,
  }
}

export function writeDatabaseReloadHandoff(path, payload) {
  const dir = dirname(path)
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

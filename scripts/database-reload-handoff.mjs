import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function databaseEnvStatus(databaseUrl) {
  return databaseUrl ? 'provided' : 'not_provided'
}

export function redactedDatabaseUrlArg(databaseUrl) {
  return databaseUrl ? ['--database-url', '<redacted>'] : []
}

export function writeDatabaseReloadHandoff(path, payload) {
  const dir = dirname(path)
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

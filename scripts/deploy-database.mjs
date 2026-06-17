import { pathToFileURL } from 'node:url'

export * from './instances/garbage/deploy-database.mjs'
import { runDeployDatabaseCli } from './instances/garbage/deploy-database.mjs'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runDeployDatabaseCli(process.argv.slice(2), process.env)
}

import { pathToFileURL } from 'node:url'

export * from './instances/garbage/publish-ghost.mjs'
import { runGhostPublishCli } from './instances/garbage/publish-ghost.mjs'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runGhostPublishCli(process.argv.slice(2), process.env)
}

import { runGhostPublishCli } from '../../../../apps/garbage/scripts/publish-ghost.mjs'

await runGhostPublishCli(process.argv.slice(2), process.env)

import { runDeployDatabaseCli } from '../../../../apps/garbage/scripts/deploy-database.mjs'

await runDeployDatabaseCli(process.argv.slice(2), process.env)

import { pathToFileURL } from 'node:url'

export * from './instances/garbage/apply-newsletter-sql.mjs'
import { runApplyNewsletterSqlCli } from './instances/garbage/apply-newsletter-sql.mjs'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runApplyNewsletterSqlCli(process.argv.slice(2), process.env)
}

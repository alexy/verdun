import { runApplyNewsletterSqlCli } from '../../../../apps/garbage/scripts/apply-newsletter-sql.mjs'

await runApplyNewsletterSqlCli(process.argv.slice(2), process.env)

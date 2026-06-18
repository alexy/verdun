import { runNewsletterDraftCli } from '../../../../apps/garbage/scripts/newsletter-draft.mjs'

await runNewsletterDraftCli(process.argv.slice(2))

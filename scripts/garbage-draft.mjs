import { pathToFileURL } from 'node:url'

export * from './instances/garbage/newsletter-draft.mjs'
import { runNewsletterDraftCli } from './instances/garbage/newsletter-draft.mjs'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runNewsletterDraftCli(process.argv.slice(2))
}

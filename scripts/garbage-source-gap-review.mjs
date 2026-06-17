import { pathToFileURL } from 'node:url'

export * from './instances/garbage/source-gap-review.mjs'
import { runSourceGapReviewCli } from './instances/garbage/source-gap-review.mjs'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runSourceGapReviewCli(process.argv.slice(2))
}

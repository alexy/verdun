import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { runnerImport } from 'vite'
import { loadSnapshotFile } from './newsletter-draft.mjs'

const options = parseArgs(process.argv.slice(2))
const snapshotPath = options.get('--snapshot') ?? 'public/data/newsletter-snapshot.json'
const outPath = options.get('--out') ?? 'crawler/data/source-gap-review.md'
const snapshot = await loadSnapshotFile(snapshotPath)
const markdown = await buildSourceGapReview(snapshot, snapshotPath)

if (outPath === '-') {
  process.stdout.write(markdown)
} else {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, markdown)
  console.log(`wrote source gap review to ${outPath}`)
}

export async function buildSourceGapReview(snapshot, snapshotPath = 'public/data/newsletter-snapshot.json') {
  const { module } = await runnerImport('./src/lib/newsletter.ts', {
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return module.buildSourceGapReviewMarkdown(snapshot, snapshotPath)
}

function parseArgs(args) {
  const options = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--snapshot' || arg === '--out') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`)
      options.set(arg, value)
      index += 1
    } else if (arg.startsWith('--snapshot=')) {
      options.set('--snapshot', arg.slice('--snapshot='.length))
    } else if (arg.startsWith('--out=')) {
      options.set('--out', arg.slice('--out='.length))
    } else {
      throw new Error(`Unknown option ${arg}`)
    }
  }
  return options
}

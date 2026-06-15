import { readFile } from 'node:fs/promises'

const snapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const sinceDays = Number(process.env.NEWSLETTER_SINCE_DAYS ?? 45)
const generatedAt = Date.parse(snapshot.generated_at ?? snapshot.generatedAt)
const cutoff = generatedAt - sinceDays * 24 * 60 * 60 * 1000

if (!Number.isFinite(generatedAt)) {
  throw new Error('snapshot generated_at is not a valid date')
}

for (const item of snapshot.items ?? []) {
  const stage = item.raw_json?.collection_stage
  if (stage !== 'live' && stage !== 'manual') continue
  const publishedAt = Date.parse(item.published_at ?? item.publishedAt)
  if (!Number.isFinite(publishedAt)) {
    throw new Error(`${item.id} has an invalid published_at date`)
  }
  if (publishedAt < cutoff) {
    throw new Error(`${item.id} is older than ${sinceDays} days for a weekly live/manual snapshot`)
  }
}

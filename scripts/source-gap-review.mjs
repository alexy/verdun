import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const options = parseArgs(process.argv.slice(2))
const snapshotPath = options.get('--snapshot') ?? 'public/data/newsletter-snapshot.json'
const outPath = options.get('--out') ?? 'crawler/data/source-gap-review.md'
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
const markdown = buildSourceGapReview(snapshot, snapshotPath)

if (outPath === '-') {
  process.stdout.write(markdown)
} else {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, markdown)
  console.log(`wrote source gap review to ${outPath}`)
}

export function buildSourceGapReview(snapshot, snapshotPath = 'public/data/newsletter-snapshot.json') {
  const plans = normalizeQueryPlans(snapshot.query_plans ?? snapshot.queryPlans)
  const sourceRuns = normalizeSourceRuns(snapshot.source_runs ?? snapshot.sourceRuns)
  const covered = coveredProjects(sourceRuns)
  const uncoveredPlans = plans.filter((plan) => !covered.has(plan.project))
  const generatedAt = snapshot.generated_at ?? snapshot.generatedAt ?? new Date().toISOString()
  const lines = [
    `# Source Gap Review: ${isoDate(generatedAt)}`,
    '',
    `Snapshot: \`${snapshotPath}\``,
    '',
    `Coverage: ${plans.length - uncoveredPlans.length} of ${plans.length} watched projects have live/manual source matches.`,
    '',
  ]

  if (!uncoveredPlans.length) {
    lines.push('All watched projects have current live/manual source coverage.', '')
    return lines.join('\n')
  }

  lines.push(
    'Use this checklist before Ulysses export. For useful social/manual finds, add a reviewed entry to `crawler/data/manual/linkedin.json` or `crawler/data/manual/x-twitter.json`, then rerun `collect --live`.',
    '',
  )

  for (const plan of uncoveredPlans) {
    lines.push(`## ${plan.project}`, '')
    if (plan.topic) lines.push(`Topic: ${plan.topic}`, '')
    lines.push(`HN query: \`${plan.hackerNewsQuery}\``)
    if (plan.liveTerms.length) lines.push(`Live terms: ${plan.liveTerms.map((term) => `\`${term}\``).join(', ')}`)
    if (plan.devToTags.length) lines.push(`dev.to tags: ${plan.devToTags.map((tag) => `\`#${tag}\``).join(', ')}`)
    if (plan.focusTerms.length) lines.push(`Editorial focus terms: ${plan.focusTerms.map((term) => `\`${term}\``).join(', ')}`)
    lines.push('', 'Review targets:')
    for (const target of orderedTargets(plan.reviewTargets)) {
      lines.push(`- [ ] ${target.source}: [${target.label}](${target.url}) (${target.adapter})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function normalizeQueryPlans(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((plan) => ({
      project: stringValue(plan.project),
      topic: stringValue(plan.topic),
      hackerNewsQuery: stringValue(plan.hacker_news_query ?? plan.hackerNewsQuery),
      liveTerms: stringArray(plan.live_terms ?? plan.liveTerms),
      devToTags: stringArray(plan.dev_to_tags ?? plan.devToTags),
      focusTerms: stringArray(plan.focus_terms ?? plan.focusTerms),
      reviewTargets: normalizeReviewTargets(plan.review_targets ?? plan.reviewTargets),
    }))
    .filter((plan) => plan.project)
}

function normalizeSourceRuns(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((run) => ({
    status: stringValue(run.status),
    itemCount: Number(run.item_count ?? run.itemCount ?? 0),
    projectCounts: normalizeProjectCounts(run.project_counts ?? run.projectCounts),
  }))
}

function normalizeReviewTargets(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((target) => ({
      source: stringValue(target.source),
      label: stringValue(target.label),
      url: stringValue(target.url),
      adapter: stringValue(target.adapter) || stringValue(target.source),
    }))
    .filter((target) => target.source && target.label && target.url)
}

function coveredProjects(sourceRuns) {
  const covered = new Set()
  for (const run of sourceRuns) {
    if (run.status !== 'ok' || run.itemCount <= 0) continue
    for (const [project, count] of Object.entries(run.projectCounts)) {
      if (count > 0) covered.add(project)
    }
  }
  return covered
}

function orderedTargets(targets) {
  const preferred = ['Hacker News', 'Lobste.rs', 'dev.to', 'Medium', 'Substack', 'LinkedIn', 'X/Twitter']
  return [...targets].sort((left, right) => {
    const sourceDelta = preferredIndex(left.source, preferred) - preferredIndex(right.source, preferred)
    return sourceDelta || left.label.localeCompare(right.label)
  })
}

function preferredIndex(source, preferred) {
  const index = preferred.indexOf(source)
  return index === -1 ? preferred.length : index
}

function normalizeProjectCounts(projectCounts) {
  if (!projectCounts || typeof projectCounts !== 'object' || Array.isArray(projectCounts)) return {}
  return Object.fromEntries(
    Object.entries(projectCounts)
      .map(([project, count]) => [project, Number(count)])
      .filter(([project, count]) => project && Number.isFinite(count) && count > 0),
  )
}

function stringArray(raw) {
  return Array.isArray(raw) ? raw.map((value) => String(value)).filter(Boolean) : []
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function isoDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
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

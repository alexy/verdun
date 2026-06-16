import { credoBlurb, ontologyForItem, ontologyNodes } from './ontology.js'

export type NewsItem = {
  id: string
  title: string
  source: string
  sourceKind: string
  url: string
  publishedAt: string
  project: string
  topic: string
  summary: string
  whyItMatters: string
  tags: string[]
  score: number
  vote: -1 | 0 | 1
  provenance?: NewsItemProvenance
}

export type NewsItemProvenance = {
  stage: string
  adapter: string
  source: string
  sourceKind: string
  sourceUrl: string
  evidenceUrl: string
  project: string
  matchedKeywords: string[]
}

export type NewsletterFocus = {
  id: string
  text: string
  scope: 'this_week' | 'ongoing'
  createdAt: string
}

export type SourceRunStatus = 'ok' | 'error' | 'pending' | 'skipped'

export type SourceRun = {
  source: string
  kind: string
  status: SourceRunStatus
  itemCount: number
  message: string
  projectCounts: Record<string, number>
}

export type ProjectQueryPlan = {
  project: string
  topic: string
  hackerNewsQuery: string
  liveTerms: string[]
  devToTags: string[]
  reviewTargets: ReviewTarget[]
  focusTerms: string[]
}

export type ReviewTarget = {
  source: string
  label: string
  url: string
  adapter: string
}

export type NewsletterSnapshot = {
  generatedAt: string
  theme: string
  editorialPersistence: 'database' | 'local_file' | 'browser'
  items: NewsItem[]
  focuses: NewsletterFocus[]
  sourceRuns: SourceRun[]
  queryPlans: ProjectQueryPlan[]
}

export type VoteValue = -1 | 0 | 1

export type NewsletterDraft = {
  title: string
  subtitle: string
  markdown: string
  html: string
  itemIds: string[]
}

export type NewsletterReadinessCheck = {
  id: string
  label: string
  passed: boolean
  detail: string
}

export type NewsletterReadiness = {
  status: 'ready' | 'needs_review'
  summary: string
  selectedCount: number
  upvotedCount: number
  liveSourceCount: number
  focusCount: number
  checks: NewsletterReadinessCheck[]
}

export type NewsletterProseQualityCheck = {
  id: string
  label: string
  passed: boolean
  detail: string
}

export type NewsletterProseQuality = {
  status: 'ready' | 'needs_review'
  summary: string
  checks: NewsletterProseQualityCheck[]
}

export type EditorialStateExport = {
  votes: Record<string, VoteValue>
  focuses: Array<{
    id: string
    text: string
    scope: 'this_week' | 'ongoing'
    created_at: string
  }>
}

export type EditorialStateImportResult = {
  snapshot: NewsletterSnapshot
  importedVotes: number
  importedFocuses: number
}

export type SourceCoverageSummary = {
  watchedProjects: string[]
  coveredProjects: string[]
  uncoveredProjects: string[]
}

export type SelectedEvidenceAudit = {
  liveCount: number
  manualCount: number
  seedCount: number
  unknownCount: number
  sourceMix: Array<{
    source: string
    count: number
  }>
  evidenceStages: Array<{
    stage: string
    count: number
  }>
}

export type NewsletterIssueMetadata = {
  date: string
  slug: string
  title: string
  subtitle: string
  snapshotGeneratedAt: string
  selectedItemCount: number
  upvotedItemCount: number
  projectCount: number
  sourceCount: number
  focusCount: number
}

export type NewsletterPublishManifest = {
  generatedAt: string
  snapshotGeneratedAt: string
  issue: NewsletterIssueMetadata
  title: string
  subtitle: string
  markdownPath?: string
  snapshotInput?: string
  editorialStateInput?: string
  ulyssesMode: boolean
  gates: {
    requireUpvotes: boolean
    requireReady: boolean
  }
  itemIds: string[]
  selectedItems: Array<{
    id: string
    title: string
    project: string
    topic: string
    source: string
    sourceKind: string
    url: string
    publishedAt: string
    vote: VoteValue
    selectionReason: string
  }>
  votes: Record<string, VoteValue>
  focuses: Array<{
    id: string
    text: string
    scope: 'this_week' | 'ongoing'
    createdAt: string
  }>
  readiness: NewsletterReadiness
  proseQuality: NewsletterProseQuality
  sourceCoverage: SourceCoverageSummary
  selectedEvidence: SelectedEvidenceAudit
  sourceRuns: SourceRun[]
  queryPlanCount: number
}

export type NewsletterPublishManifestOptions = {
  generatedAt?: string
  markdownPath?: string
  snapshotInput?: string
  editorialStateInput?: string
  ulyssesMode?: boolean
  requireUpvotes?: boolean
  requireReady?: boolean
}

export const seedSnapshot: NewsletterSnapshot = {
  generatedAt: new Date().toISOString(),
  theme: 'Strongly typed and functional AI/data systems',
  editorialPersistence: 'browser',
  queryPlans: [],
  sourceRuns: [
    {
      source: 'Seed',
      kind: 'local',
      status: 'skipped',
      itemCount: 7,
      message: 'Built-in fallback snapshot',
      projectCounts: {},
    },
  ],
  focuses: [
    {
      id: 'focus-local-first-graphs',
      text: 'More strongly typed graph/database work that can run locally before cloud deployment.',
      scope: 'ongoing',
      createdAt: new Date().toISOString(),
    },
  ],
  items: [
    {
      id: 'pydantic-ai-typed-agents',
      title: 'Pydantic AI keeps pushing typed agent interfaces toward ordinary Python ergonomics',
      source: 'Pydantic',
      sourceKind: 'project',
      url: 'https://github.com/pydantic/pydantic-ai',
      publishedAt: '2026-06-10T12:00:00Z',
      project: 'Pydantic',
      topic: 'typed AI',
      summary: 'Typed validation, tool calling, and structured outputs continue to converge into a practical agent boundary for Python teams.',
      whyItMatters: 'It is a bellwether for AI systems that treat schemas as executable contracts rather than documentation.',
      tags: ['python', 'agents', 'validation'],
      score: 86,
      vote: 0,
    },
    {
      id: 'lakesail-rust-spark',
      title: 'LakeSail points Spark-compatible analytics toward a Rust-native lakehouse core',
      source: 'GitHub and project feeds',
      sourceKind: 'project',
      url: 'https://github.com/lakehq/sail',
      publishedAt: '2026-06-09T12:00:00Z',
      project: 'LakeSail',
      topic: 'typed dataframes',
      summary: 'The project is a useful lens on how DataFusion, Arrow, and Spark Connect-style contracts can meet without surrendering local execution.',
      whyItMatters: 'Strong typing in the planner and execution boundary is becoming the language of portable lakehouse systems.',
      tags: ['rust', 'spark', 'arrow'],
      score: 91,
      vote: 1,
    },
    {
      id: 'turso-embedded-data',
      title: 'Turso keeps making embedded databases feel like a distributed systems primitive',
      source: 'Hacker News and project feeds',
      sourceKind: 'community',
      url: 'https://turso.tech',
      publishedAt: '2026-06-08T12:00:00Z',
      project: 'Turso',
      topic: 'edge data',
      summary: 'SQLite-derived systems are becoming a serious substrate for edge AI workflows that need replication without a heavyweight control plane.',
      whyItMatters: 'Newsletter readers care when operational simplicity and correctness start reinforcing each other.',
      tags: ['sqlite', 'edge', 'replication'],
      score: 78,
      vote: 0,
    },
    {
      id: 'lancedb-multimodal-indexes',
      title: 'LanceDB is a useful signal for multimodal storage moving closer to columnar data systems',
      source: 'Project blog and social feeds',
      sourceKind: 'project',
      url: 'https://lancedb.com',
      publishedAt: '2026-06-07T12:00:00Z',
      project: 'LanceDB',
      topic: 'vector data',
      summary: 'Vector search is steadily being absorbed into a broader columnar and lakehouse conversation rather than living as a separate service tier.',
      whyItMatters: 'The interesting story is not another vector database; it is typed multimodal data with cheaper movement across tools.',
      tags: ['vectors', 'multimodal', 'lakehouse'],
      score: 74,
      vote: 0,
    },
    {
      id: 'helixdb-graph-local',
      title: 'HelixDB and newer graph engines sharpen the local-first graph database question',
      source: 'GitHub watchlist',
      sourceKind: 'project',
      url: 'https://github.com/HelixDB/helix-db',
      publishedAt: '2026-06-06T12:00:00Z',
      project: 'HelixDB',
      topic: 'graph database',
      summary: 'New graph stores are competing on latency, developer experience, and whether graph workloads can be made ergonomic outside the enterprise stack.',
      whyItMatters: 'Graph is re-entering the AI/data stack as a modeling primitive, not only as a query language checkbox.',
      tags: ['graph', 'rust', 'local-first'],
      score: 69,
      vote: 0,
    },
    {
      id: 'surrealdb-multimodel-apps',
      title: 'SurrealDB remains a pressure test for multimodel app databases',
      source: 'Project releases and community links',
      sourceKind: 'project',
      url: 'https://surrealdb.com',
      publishedAt: '2026-06-05T12:00:00Z',
      project: 'SurrealDB',
      topic: 'multimodel data',
      summary: 'Document, graph, and realtime APIs in one system remain attractive for AI product teams trying to reduce glue code.',
      whyItMatters: 'The hard question is whether multimodel convenience can preserve type discipline as systems grow.',
      tags: ['multimodel', 'graph', 'realtime'],
      score: 71,
      vote: 0,
    },
    {
      id: 'pggraph-postgres-graph',
      title: 'Postgres graph extensions keep asking whether graph should be a database or a capability',
      source: 'Postgres ecosystem watchlist',
      sourceKind: 'project',
      url: 'https://github.com/apache/age',
      publishedAt: '2026-06-04T12:00:00Z',
      project: 'pgGraph',
      topic: 'postgres graph',
      summary: 'The Postgres ecosystem continues to absorb graph ideas through extensions, typed schemas, and query lowering layers.',
      whyItMatters: 'For production teams, adding graph to the database they already operate may beat adopting an isolated graph store.',
      tags: ['postgres', 'cypher', 'graph'],
      score: 82,
      vote: 1,
    },
  ],
}

export function sortedNewsItems(items: NewsItem[]): NewsItem[] {
  return [...items].sort((left, right) => {
    const voteDelta = right.vote - left.vote
    if (voteDelta !== 0) return voteDelta
    const scoreDelta = right.score - left.score
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
  })
}

export function draftSelection(items: NewsItem[], limit = 7): NewsItem[] {
  const included = sortedNewsItems(items).filter((item) => item.vote > 0)
  if (included.length) return included.slice(0, limit)

  const acceptable = sortedNewsItems(items).filter((item) => item.vote >= 0)
  const collected = acceptable.filter((item) => !isWatchlistSeed(item))
  return ontologyBalancedSelection(collected.length ? collected : acceptable, limit)
}

export function buildNewsletterDraft(snapshot: NewsletterSnapshot): NewsletterDraft {
  const items = draftSelection(snapshot.items)
  const brief = editorialBrief(snapshot.focuses)
  const date = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(snapshot.generatedAt))
  const title = `Strongly Typed AI/Data Notes: ${date}`
  const subtitle = items.length
    ? `This week follows ${unique(items.map((item) => item.project)).slice(0, 4).join(', ')} and the systems around them.`
    : 'No items have been selected yet.'
  const sections = [
    `# ${title}`,
    '',
    subtitle,
    '',
    openingParagraph(items, brief),
    '',
    ...editorLetterSection(items, brief),
    ...throughlineSection(items, brief),
    ...briefSection(brief),
    ...editorialArcSection(items, brief),
    ...items.flatMap((item, index) => itemSection(item, index + 1)),
    '## Strongly Typed AI ontology',
    '',
    ...ontologyNodes.map((node) => `- **${node.label}**: ${node.description}`),
    '',
    '## Editorial thread',
    '',
    editorialThread(items, brief),
    '',
    ...closingNoteSection(items, brief),
    '## Sources watched',
    '',
    ...snapshot.sourceRuns.map(sourceRunLine),
    ...coverageGapSection(snapshot),
    '',
  ]
  const markdown = sections.join('\n')
  return {
    title,
    subtitle,
    markdown,
    html: markdownToHtml(markdown),
    itemIds: items.map((item) => item.id),
  }
}

export function evaluateSourceCoverage(snapshot: NewsletterSnapshot): SourceCoverageSummary {
  const watchedProjects = unique(
    snapshot.queryPlans.length
      ? snapshot.queryPlans.map((plan) => plan.project)
      : snapshot.items.map((item) => item.project),
  )
    .sort((left, right) => left.localeCompare(right))
  const coveredProjects = unique(
    snapshot.sourceRuns
      .filter((run) => run.status === 'ok' && run.itemCount > 0)
      .flatMap((run) => Object.entries(run.projectCounts)
        .filter(([, count]) => count > 0)
        .map(([project]) => project)),
  ).sort((left, right) => left.localeCompare(right))
  const covered = new Set(coveredProjects)
  return {
    watchedProjects,
    coveredProjects,
    uncoveredProjects: watchedProjects.filter((project) => !covered.has(project)),
  }
}

export function buildSourceGapReviewMarkdown(
  snapshot: NewsletterSnapshot,
  snapshotLabel = 'public/data/newsletter-snapshot.json',
): string {
  const covered = coveredProjectsFromRuns(snapshot.sourceRuns)
  const watchedProjects = unique(snapshot.queryPlans.map((plan) => plan.project))
  const watchedProjectCount = watchedProjects.length
  const coveredWatchedCount = watchedProjects.filter((project) => covered.has(project)).length
  const uncovered = new Set(watchedProjects.filter((project) => !covered.has(project)))
  const uncoveredPlans = snapshot.queryPlans.filter((plan) => uncovered.has(plan.project))
  const lines = [
    `# Source Gap Review: ${isoDate(snapshot.generatedAt)}`,
    '',
    `Snapshot: \`${snapshotLabel}\``,
    '',
    `Coverage: ${coveredWatchedCount} of ${watchedProjectCount} watched projects have live/manual source matches.`,
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
    for (const target of orderedReviewTargets(plan.reviewTargets)) {
      lines.push(`- [ ] ${target.source}: [${target.label}](${target.url}) (${target.adapter})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function evaluateNewsletterReadiness(snapshot: NewsletterSnapshot): NewsletterReadiness {
  const selectedItems = draftSelection(snapshot.items)
  const upvotedCount = snapshot.items.filter((item) => item.vote > 0).length
  const liveSourceCount = snapshot.sourceRuns.filter((run) => run.status === 'ok' && run.itemCount > 0).length
  const liveProjectCount = unique(snapshot.sourceRuns.flatMap((run) => Object.keys(run.projectCounts))).length
  const focusCount = snapshot.focuses.filter((focus) => focus.text.trim()).length
  const selectedProjectCount = unique(selectedItems.map((item) => item.project)).length
  const sourceErrorCount = snapshot.sourceRuns.filter((run) => run.status === 'error').length
  const freshness = snapshotFreshness(snapshot.generatedAt)

  const checks: NewsletterReadinessCheck[] = [
    {
      id: 'upvotes',
      label: 'Editorial picks',
      passed: upvotedCount > 0,
      detail: upvotedCount > 0
        ? `${upvotedCount} upvoted item${upvotedCount === 1 ? '' : 's'} will lead the draft.`
        : 'Upvote at least one item before exporting a publishable draft.',
    },
    {
      id: 'source-coverage',
      label: 'Live source coverage',
      passed: liveSourceCount >= 3 && liveProjectCount >= 3,
      detail: `${liveSourceCount} source${liveSourceCount === 1 ? '' : 's'} returned live items across ${liveProjectCount} project${liveProjectCount === 1 ? '' : 's'}.`,
    },
    {
      id: 'project-spread',
      label: 'Project spread',
      passed: selectedProjectCount >= 2 || selectedItems.length <= 1,
      detail: selectedItems.length
        ? `${selectedProjectCount} project${selectedProjectCount === 1 ? '' : 's'} represented in the selected spine.`
        : 'No items are selected yet.',
    },
    {
      id: 'editorial-intent',
      label: 'Editorial intent',
      passed: focusCount > 0,
      detail: focusCount > 0
        ? `${focusCount} saved focus signal${focusCount === 1 ? '' : 's'} will shape the brief.`
        : 'Add this-week or ongoing focus before drafting.',
    },
    {
      id: 'source-health',
      label: 'Source health',
      passed: sourceErrorCount === 0,
      detail: sourceErrorCount === 0
        ? 'No watched source is currently reporting an error.'
        : `${sourceErrorCount} watched source${sourceErrorCount === 1 ? '' : 's'} need attention.`,
    },
    {
      id: 'snapshot-freshness',
      label: 'Snapshot freshness',
      passed: freshness.fresh,
      detail: freshness.detail,
    },
  ]
  const passedCount = checks.filter((check) => check.passed).length
  const status = checks.every((check) => check.passed) ? 'ready' : 'needs_review'
  return {
    status,
    summary: status === 'ready'
      ? 'Ready for Ulysses export.'
      : `${passedCount}/${checks.length} readiness checks pass.`,
    selectedCount: selectedItems.length,
    upvotedCount,
    liveSourceCount,
    focusCount,
    checks,
  }
}

function snapshotFreshness(generatedAt: string): { fresh: boolean, detail: string } {
  const generated = Date.parse(generatedAt)
  if (!Number.isFinite(generated)) {
    return {
      fresh: false,
      detail: 'Snapshot generated_at is not a valid date.',
    }
  }
  const ageDays = Math.floor(Math.max(0, Date.now() - generated) / (24 * 60 * 60 * 1000))
  if (ageDays <= 14) {
    return {
      fresh: true,
      detail: ageDays === 0 ? 'Snapshot was generated today.' : `Snapshot was generated ${ageDays} day${ageDays === 1 ? '' : 's'} ago.`,
    }
  }
  return {
    fresh: false,
    detail: `Snapshot was generated ${ageDays} days ago; rerun collect --live before publishing.`,
  }
}

export function evaluateNewsletterProseQuality(draft: NewsletterDraft): NewsletterProseQuality {
  const markdown = draft.markdown
  const lowerMarkdown = markdown.toLowerCase()
  const roughPhrases = [
    'hacker news surfaced this item while tracking',
    'lobste.rs matched this story against',
    'dev.to surfaced this item while tracking',
    'medium surfaced this feed item',
    'substack surfaced this feed item',
    'the weekly data engineering newsletter',
    'author:',
    'continue reading',
    'a quiet day',
  ]
  const leakedPhrase = roughPhrases.find((phrase) => lowerMarkdown.includes(phrase))
  const checks: NewsletterProseQualityCheck[] = [
    {
      id: 'throughline',
      label: 'Weekly throughline',
      passed: markdown.includes('## Editor\'s letter') && markdown.includes('## Weekly throughline') && markdown.includes('## Editorial arc') && markdown.includes('## Closing note'),
      detail: markdown.includes('## Editor\'s letter') && markdown.includes('## Weekly throughline') && markdown.includes('## Editorial arc') && markdown.includes('## Closing note')
        ? 'Draft includes a synthesized letter, throughline, editorial arc, and closing note.'
        : 'Add the editor letter, weekly throughline, editorial arc, and closing note before publishing.',
    },
    {
      id: 'crawler-boilerplate',
      label: 'Crawler boilerplate',
      passed: !leakedPhrase,
      detail: leakedPhrase
        ? `Draft still contains crawler/feed boilerplate: ${leakedPhrase}.`
        : 'Crawler and feed boilerplate has been rewritten into prose.',
    },
    {
      id: 'evidence-lines',
      label: 'Source evidence',
      passed: !draft.itemIds.length || markdown.includes('Evidence:'),
      detail: !draft.itemIds.length || markdown.includes('Evidence:')
        ? 'Selected items include source evidence where available.'
        : 'Selected items need source evidence lines for editorial audit.',
    },
    {
      id: 'credo-fit',
      label: 'Credo fit',
      passed: !draft.itemIds.length || markdown.includes('Credo fit:') && markdown.includes('Related ontology:'),
      detail: !draft.itemIds.length || markdown.includes('Credo fit:') && markdown.includes('Related ontology:')
        ? 'Selected items are tied back to the Strongly Typed AI ontology.'
        : 'Tie selected items back to the Strongly Typed AI ontology.',
    },
    {
      id: 'selection-audit',
      label: 'Selection audit',
      passed: !draft.itemIds.length || markdown.includes('Selection:'),
      detail: !draft.itemIds.length || markdown.includes('Selection:')
        ? 'Selected items include a visible selection reason.'
        : 'Add selection reasons for selected items.',
    },
  ]
  const passedCount = checks.filter((check) => check.passed).length
  const status = checks.every((check) => check.passed) ? 'ready' : 'needs_review'
  return {
    status,
    summary: status === 'ready'
      ? 'Draft prose is ready for Ulysses review.'
      : `${passedCount}/${checks.length} prose quality checks pass.`,
    checks,
  }
}

export function buildEditorialStateExport(snapshot: NewsletterSnapshot): EditorialStateExport {
  return {
    votes: Object.fromEntries(
      snapshot.items
        .filter((item) => item.vote !== 0)
        .map((item) => [item.id, item.vote]),
    ),
    focuses: snapshot.focuses.map((focus) => ({
      id: focus.id,
      text: focus.text,
      scope: focus.scope,
      created_at: focus.createdAt,
    })),
  }
}

export function buildPublishManifest(
  draft: NewsletterDraft,
  snapshot: NewsletterSnapshot,
  options: NewsletterPublishManifestOptions = {},
): NewsletterPublishManifest {
  const itemsById = new Map(snapshot.items.map((item) => [item.id, item]))
  const selectedItems = draft.itemIds
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is NewsItem => Boolean(item))
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    snapshotGeneratedAt: snapshot.generatedAt,
    issue: issueMetadata(draft, snapshot, selectedItems),
    title: draft.title,
    subtitle: draft.subtitle,
    markdownPath: options.markdownPath,
    snapshotInput: options.snapshotInput,
    editorialStateInput: options.editorialStateInput,
    ulyssesMode: Boolean(options.ulyssesMode),
    gates: {
      requireUpvotes: Boolean(options.requireUpvotes),
      requireReady: Boolean(options.requireReady),
    },
    itemIds: draft.itemIds,
    selectedItems: selectedItems.map((item) => ({
      id: item.id,
      title: item.title,
      project: item.project,
      topic: item.topic,
      source: item.source,
      sourceKind: item.sourceKind,
      url: item.url,
      publishedAt: item.publishedAt,
      vote: item.vote,
      selectionReason: selectionReason(item),
    })),
    votes: buildEditorialStateExport(snapshot).votes,
    focuses: snapshot.focuses.map((focus) => ({
      id: focus.id,
      text: focus.text,
      scope: focus.scope,
      createdAt: focus.createdAt,
    })),
    readiness: evaluateNewsletterReadiness(snapshot),
    proseQuality: evaluateNewsletterProseQuality(draft),
    sourceCoverage: evaluateSourceCoverage(snapshot),
    selectedEvidence: selectedEvidenceAudit(selectedItems),
    sourceRuns: snapshot.sourceRuns,
    queryPlanCount: snapshot.queryPlans.length,
  }
}

function selectedEvidenceAudit(items: NewsItem[]): SelectedEvidenceAudit {
  const sourceCounts = new Map<string, number>()
  const stageCounts = new Map<string, number>()
  for (const item of items) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1)
    const stage = item.provenance?.stage ?? 'unknown'
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1)
  }
  const count = (stage: string) => stageCounts.get(stage) ?? 0
  return {
    liveCount: count('live'),
    manualCount: count('manual'),
    seedCount: count('watchlist-seed'),
    unknownCount: count('unknown'),
    sourceMix: Array.from(sourceCounts.entries())
      .map(([source, sourceCount]) => ({ source, count: sourceCount }))
      .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source)),
    evidenceStages: Array.from(stageCounts.entries())
      .map(([stage, stageCount]) => ({ stage, count: stageCount }))
      .sort((left, right) => right.count - left.count || left.stage.localeCompare(right.stage)),
  }
}

function issueMetadata(
  draft: NewsletterDraft,
  snapshot: NewsletterSnapshot,
  selectedItems: NewsItem[],
): NewsletterIssueMetadata {
  return {
    date: isoDate(snapshot.generatedAt),
    slug: slug(draft.title),
    title: draft.title,
    subtitle: draft.subtitle,
    snapshotGeneratedAt: snapshot.generatedAt,
    selectedItemCount: selectedItems.length,
    upvotedItemCount: snapshot.items.filter((item) => item.vote > 0).length,
    projectCount: unique(selectedItems.map((item) => item.project)).length,
    sourceCount: unique(selectedItems.map((item) => item.source)).length,
    focusCount: snapshot.focuses.filter((focus) => focus.text.trim()).length,
  }
}

export function applyEditorialStateExport(snapshot: NewsletterSnapshot, raw: unknown): EditorialStateImportResult {
  const state = normalizeEditorialStateExport(raw)
  const importedVoteIds = new Set(Object.keys(state.votes))
  const existingFocusIds = new Set(snapshot.focuses.map((focus) => focus.id))
  const importedFocuses = state.focuses.filter((focus) => !existingFocusIds.has(focus.id))
  return {
    snapshot: {
      ...snapshot,
      items: snapshot.items.map((item) => ({
        ...item,
        vote: state.votes[item.id] ?? item.vote,
      })),
      focuses: [...importedFocuses.map(fromEditorialStateFocus), ...snapshot.focuses].slice(0, 25),
    },
    importedVotes: snapshot.items.filter((item) => importedVoteIds.has(item.id)).length,
    importedFocuses: importedFocuses.length,
  }
}

function normalizeEditorialStateExport(raw: unknown): EditorialStateExport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { votes: {}, focuses: [] }
  const record = raw as Record<string, unknown>
  return {
    votes: normalizeEditorialVotes(record.votes),
    focuses: normalizeEditorialFocuses(record.focuses),
  }
}

function normalizeEditorialVotes(raw: unknown): Record<string, VoteValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const votes: Record<string, VoteValue> = {}
  for (const [itemId, rawVote] of Object.entries(raw)) {
    const vote = Number(rawVote)
    if (itemId && (vote === -1 || vote === 0 || vote === 1)) votes[itemId] = vote
  }
  return votes
}

function normalizeEditorialFocuses(raw: unknown): EditorialStateExport['focuses'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((focus) => {
      if (!focus || typeof focus !== 'object' || Array.isArray(focus)) return null
      const record = focus as Record<string, unknown>
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      if (!text) return null
      return {
        id: typeof record.id === 'string' && record.id ? record.id : `imported-${Date.now()}`,
        text,
        scope: record.scope === 'ongoing' ? 'ongoing' : 'this_week',
        created_at: typeof record.created_at === 'string'
          ? record.created_at
          : typeof record.createdAt === 'string'
            ? record.createdAt
            : new Date().toISOString(),
      }
    })
    .filter((focus): focus is EditorialStateExport['focuses'][number] => Boolean(focus))
    .slice(0, 25)
}

function fromEditorialStateFocus(focus: EditorialStateExport['focuses'][number]): NewsletterFocus {
  return {
    id: focus.id,
    text: focus.text,
    scope: focus.scope,
    createdAt: focus.created_at,
  }
}

type EditorialBrief = {
  weekly: string[]
  ongoing: string[]
  all: string[]
}

function editorialBrief(focuses: NewsletterFocus[]): EditorialBrief {
  const ordered = focuses
    .map((focus) => ({ ...focus, text: focus.text.trim() }))
    .filter((focus) => focus.text)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

  return {
    weekly: ordered.filter((focus) => focus.scope === 'this_week').map((focus) => focus.text).slice(0, 3),
    ongoing: ordered.filter((focus) => focus.scope === 'ongoing').map((focus) => focus.text).slice(0, 3),
    all: ordered.map((focus) => focus.text).slice(0, 4),
  }
}

function briefSection(brief: EditorialBrief): string[] {
  if (!brief.all.length) return []
  return [
    '## Editorial brief',
    '',
    ...brief.weekly.map((text) => `- This week: ${text}`),
    ...brief.ongoing.map((text) => `- Ongoing: ${text}`),
    '',
  ]
}

function editorLetterSection(items: NewsItem[], brief: EditorialBrief): string[] {
  if (!items.length) return []
  const lead = items[0]
  const supporting = items.find((item) => item.project !== lead.project)
  const final = items[items.length - 1]
  const intent = brief.weekly[0] ?? brief.ongoing[0]
  const intentClause = intent
    ? `The brief asks for ${stripTerminalPunctuation(intent).toLowerCase()}, so this issue follows the projects that make that wish operational.`
    : 'This issue follows the projects that turn architecture taste into operational evidence.'
  const supportClause = supporting
    ? `${supporting.project} gives the lead a second witness; ${final.project} keeps the question honest at the data substrate.`
    : `${final.project} keeps the question honest at the data substrate.`
  return [
    '## Editor\'s letter',
    '',
    `${lead.project} is the front door this week because it makes the abstract problem concrete: AI systems do not become safer or more useful by becoming more mystical; they become useful when their memory, data, and interfaces can be inspected.`,
    '',
    `${intentClause} ${supportClause}`,
    '',
  ]
}

function editorialArcSection(items: NewsItem[], brief: EditorialBrief): string[] {
  if (!items.length) return []
  const lead = items[0]
  const support = items.find((item) => item.project !== lead.project) ?? items[1]
  const final = items[items.length - 1]
  const leadOntology = ontologyForItem(lead)[0]?.label.toLowerCase() ?? lead.topic
  const supportPhrase = support
    ? `Bring in ${support.project} to widen that into ${ontologyForItem(support)[0]?.label.toLowerCase() ?? support.topic}`
    : `Let ${lead.project} carry the issue by itself`
  const nextQuestion = brief.weekly[0] ?? brief.ongoing[0]
    ? `Does this make ${stripTerminalPunctuation(brief.weekly[0] ?? brief.ongoing[0] ?? '').toLowerCase()} more concrete, or merely easier to describe?`
    : `Which of these projects turns typed ambition into a smaller operational surface area?`
  return [
    '## Editorial arc',
    '',
    `Lead with ${lead.project}: it gives the issue its ${leadOntology} center of gravity.`,
    '',
    `${supportPhrase}, so the reader can see the stack rather than a single project.`,
    '',
    `${final.project} closes the loop by asking the practical question: ${nextQuestion}`,
    '',
  ]
}

function throughlineSection(items: NewsItem[], brief: EditorialBrief): string[] {
  if (!items.length) return []
  const projects = unique(items.map((item) => item.project))
  const topics = unique(items.map((item) => item.topic))
  const ontologyLabels = unique(items.flatMap((item) => ontologyForItem(item).map((node) => node.label))).slice(0, 4)
  const sources = unique(items.map((item) => item.source))
  const sourceMix = sources.length > 1
    ? `${sources.length} source surfaces`
    : sources[0] ?? 'the selected source'
  const focus = brief.weekly[0] ?? brief.ongoing[0]
  const focusSentence = focus
    ? `The editorial intent asks for ${stripTerminalPunctuation(focus).toLowerCase()}; the selected items answer by showing where that desire is becoming infrastructure instead of taste.`
    : 'The selection should read as infrastructure evidence, not a catalog of isolated releases.'
  return [
    '## Weekly throughline',
    '',
    `The selected queue clusters around ${sentenceList(ontologyLabels.map((label) => label.toLowerCase()))}: ${sentenceList(projects.slice(0, 6))} are all negotiating how much structure AI/data systems should expose to developers.`,
    '',
    `${sourceMix} supply the evidence, from community discussion to long-form adoption notes and manually reviewed social signals. Across ${sentenceList(topics.slice(0, 5))}, the useful pattern is the same: make the boundary typed, keep the runtime close, and let databases carry more of the context load.`,
    '',
    focusSentence,
    '',
  ]
}

function sourceRunLine(run: SourceRun): string {
  const projects = Object.entries(run.projectCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([project, count]) => `${project} ${count}`)
  const coverage = projects.length ? ` Coverage: ${projects.join(', ')}.` : ''
  return `- ${run.source}: ${run.status}, ${run.itemCount} items. ${run.message}.${coverage}`
}

function coverageGapSection(snapshot: NewsletterSnapshot): string[] {
  const coverage = evaluateSourceCoverage(snapshot)
  if (!coverage.uncoveredProjects.length) return []
  const hints = coverageGapHints(coverage.uncoveredProjects, snapshot.queryPlans)
  return [
    '',
    '## Coverage gaps',
    '',
    `Ask for more source material on ${coverageGapSummary(coverage.uncoveredProjects)}.`,
    ...hints,
  ]
}

function coverageGapHints(projects: string[], queryPlans: ProjectQueryPlan[]): string[] {
  const projectSet = new Set(projects)
  const hints = queryPlans
    .filter((plan) => projectSet.has(plan.project))
    .slice(0, 5)
    .map((plan) => `- ${plan.project}: ${queryPlanHint(plan)}`)
  return hints.length ? ['', 'Crawler query hints:', '', ...hints] : []
}

function queryPlanHint(plan: ProjectQueryPlan): string {
  const terms = plan.liveTerms.slice(0, 3).join(', ')
  const tags = plan.devToTags.slice(0, 2).map((tag) => `#${tag}`).join(', ')
  const preferredSources = ['Hacker News', 'Substack', 'LinkedIn', 'X/Twitter']
  const sources = unique(plan.reviewTargets.map((target) => target.source))
    .sort((left, right) => preferredReviewSourceIndex(left, preferredSources) - preferredReviewSourceIndex(right, preferredSources))
    .slice(0, 4)
    .join(', ')
  const focus = plan.focusTerms.length ? `focus: ${plan.focusTerms.slice(0, 3).join(', ')}` : ''
  const review = sources ? `review: ${sources}` : ''
  return [terms, tags, review, focus].filter(Boolean).join(' · ')
}

function preferredReviewSourceIndex(source: string, preferredSources: string[]): number {
  const index = preferredSources.indexOf(source)
  return index === -1 ? preferredSources.length : index
}

function coveredProjectsFromRuns(sourceRuns: SourceRun[]): Set<string> {
  const covered = new Set<string>()
  for (const run of sourceRuns) {
    if (run.status !== 'ok' || run.itemCount <= 0) continue
    for (const [project, count] of Object.entries(run.projectCounts)) {
      if (count > 0) covered.add(project)
    }
  }
  return covered
}

function orderedReviewTargets(targets: ReviewTarget[]): ReviewTarget[] {
  const preferred = ['Hacker News', 'Lobste.rs', 'dev.to', 'Medium', 'Substack', 'LinkedIn', 'X/Twitter']
  return [...targets].sort((left, right) => {
    const sourceDelta = preferredReviewSourceIndex(left.source, preferred) - preferredReviewSourceIndex(right.source, preferred)
    return sourceDelta || left.label.localeCompare(right.label)
  })
}

function coverageGapSummary(projects: string[]): string {
  const visible = projects.slice(0, 8)
  const hiddenCount = projects.length - visible.length
  const suffix = hiddenCount > 0 ? `, plus ${hiddenCount} more` : ''
  return `${sentenceList(visible)}${suffix}`
}

function ontologyBalancedSelection(items: NewsItem[], limit: number): NewsItem[] {
  const selected: NewsItem[] = []
  const projectCounts = new Map<string, number>()
  const sorted = sortedNewsItems(items)

  const addCandidate = (candidate: NewsItem): boolean => {
    if (selected.some((item) => item.id === candidate.id)) return false
    const projectCount = projectCounts.get(candidate.project) ?? 0
    if (projectCount >= 2) return false
    selected.push(candidate)
    projectCounts.set(candidate.project, projectCount + 1)
    return selected.length >= limit
  }

  for (const node of ontologyNodes) {
    const candidate = sorted.find((item) => ontologyForItem(item).some((itemNode) => itemNode.id === node.id))
    if (candidate && addCandidate(candidate)) return selected
  }

  for (const item of sorted) {
    if (addCandidate(item)) return selected
  }

  return selected
}

function isWatchlistSeed(item: NewsItem): boolean {
  return item.title.includes("belongs in this week's typed AI/data systems watch")
    || item.summary.includes('is being tracked for')
}

function openingParagraph(items: NewsItem[], brief: EditorialBrief): string {
  if (!items.length) {
    return 'The queue is empty. Upvote a few items before drafting the week.'
  }
  const projects = unique(items.map((item) => item.project))
  const focusText = brief.all.slice(0, 3).map(stripTerminalPunctuation)
  const focusSentence = brief.all.length
    ? `The editorial brief sets the test: ${sentenceList(focusText)}. The useful links are the ones that turn that appetite into architecture.`
    : 'The useful links are the ones that turn release notes into architecture.'
  return `The week reads less like a parade of releases than a negotiation over where contracts should live: in Python schemas, Rust planners, Postgres extensions, graph stores, and the data systems that increasingly have to host AI without becoming vague. ${focusSentence} ${sentenceList(projects.slice(0, 5))} give the issue concrete shape.`
}

function itemSection(item: NewsItem, index: number): string[] {
  return [
    `## ${index}. ${item.project}: ${item.title}`,
    '',
    itemNarrative(item),
    '',
    `Credo fit: ${credoBlurb(item)} Related ontology: ${ontologyForItem(item).map((node) => node.label).join(', ')}.`,
    '',
    `Selection: ${selectionReason(item)}`,
    '',
    `Source: [${item.source}](${item.url}) · ${item.topic} · ${item.tags.slice(0, 4).join(', ')}`,
    ...itemEvidenceLine(item),
    '',
  ]
}

function itemEvidenceLine(item: NewsItem): string[] {
  if (!item.provenance) return []
  const keywords = item.provenance.matchedKeywords.slice(0, 4)
  const keywordText = keywords.length ? ` Matched: ${keywords.join(', ')}.` : ''
  return [
    '',
    `Evidence: ${stageLabel(item.provenance.stage)} via ${item.provenance.adapter}.${keywordText}`,
  ]
}

function selectionReason(item: NewsItem): string {
  if (item.vote > 0) {
    return `explicit editorial upvote; score ${item.score}`
  }
  if (item.provenance?.stage === 'manual') {
    return `manually reviewed source evidence; score ${item.score}`
  }
  if (item.provenance?.stage === 'live') {
    return `live source ranking from ${item.source}; score ${item.score}`
  }
  if (isWatchlistSeed(item)) {
    return `watchlist fallback coverage; score ${item.score}`
  }
  return `fallback ranking; score ${item.score}`
}

function stageLabel(stage: string): string {
  if (stage === 'watchlist-seed') return 'watchlist seed'
  return stage.replace(/[-_]+/g, ' ')
}

function itemNarrative(item: NewsItem): string {
  const summary = draftSummary(item)
  const matter = sentence(item.whyItMatters)
  if (summary === matter) return summary
  return `${summary} ${matter}`
}

function draftSummary(item: NewsItem): string {
  const summary = normalizeSentence(item.summary)
  if (!isThinSummary(summary) && !isCrawlerBoilerplateSummary(summary, item)) return summary
  const title = stripTerminalPunctuation(item.title)
  const ontology = ontologyForItem(item)[0]?.label.toLowerCase() ?? item.topic
  const sourceContext = sourceContextPhrase(item)
  return sentence(
    `${sourceContext} "${title}" puts ${item.project} into the ${item.topic} conversation, a useful signal for ${ontology} moving from idea to developer practice`,
  )
}

function sourceContextPhrase(item: NewsItem): string {
  if (item.source === 'Hacker News') return 'The community discussion around'
  if (item.source === 'Lobste.rs') return 'The systems-reader discussion around'
  if (item.source === 'dev.to') return 'The developer write-up around'
  if (item.source === 'Medium') return 'The long-form essay'
  if (item.source === 'Substack') return 'The newsletter item'
  if (item.sourceKind === 'social') return 'The manually reviewed social signal'
  if (item.provenance?.stage === 'manual') return 'The manually reviewed source note'
  return 'The source item'
}

function isCrawlerBoilerplateSummary(summary: string, item: NewsItem): boolean {
  const normalized = summary.trim().toLowerCase()
  return normalized.startsWith('hacker news surfaced this item while tracking')
    || normalized.startsWith('lobste.rs matched this story against')
    || normalized.startsWith('dev.to surfaced this item while tracking')
    || normalized.startsWith('medium surfaced this feed item while tracking')
    || normalized.startsWith('substack surfaced this feed item while tracking')
    || normalized === 'the weekly data engineering newsletter.'
    || normalized === 'the weekly data engineering newsletter'
    || normalized === 'a quiet day.'
    || normalized === 'a quiet day'
    || normalized === `${item.source.toLowerCase()} surfaced this feed item while tracking ${item.project.toLowerCase()} signals: ${item.tags.join(', ').toLowerCase()}.`
}

function isThinSummary(summary: string): boolean {
  const normalized = summary.trim().toLowerCase()
  if (!normalized) return true
  if (['overview', 'author'].includes(normalized)) return true
  if (['a quiet day', 'a quiet day.', 'the weekly data engineering newsletter', 'the weekly data engineering newsletter.'].includes(normalized)) return true
  if (normalized.startsWith('author:')) return true
  if (normalized.startsWith('continue reading')) return true
  if (normalized.startsWith('stop hand-writing')) return true
  if (normalized.startsWith('medium surfaced this feed item')) return true
  if (normalized.length < 56 && !/[.!?]$/.test(normalized)) return true
  return false
}

function normalizeSentence(value: string): string {
  return sentence(
    value
      .replace(/^Author:\s*/i, '')
      .replace(/^Overview\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function sentence(value: string): string {
  const text = value.trim()
  if (!text) return ''
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function editorialThread(items: NewsItem[], brief: EditorialBrief): string {
  if (!items.length) return 'No editorial thread yet.'
  const topics = unique(items.map((item) => item.topic))
  const intent = brief.weekly[0] ?? brief.ongoing[0]
  const intentSentence = intent
    ? `That makes "${stripTerminalPunctuation(intent)}" the test: each included item should either sharpen it, complicate it, or show where the stack is already moving.`
    : 'Each included item should either sharpen the stack, complicate it, or show where production practice is already moving.'
  return `The connective tissue is ${sentenceList(topics)}. The most interesting pieces are not merely announcing tools; they suggest a stack where typed boundaries, local execution, and database-native intelligence become the ordinary way to build AI/data products. ${intentSentence}`
}

function closingNoteSection(items: NewsItem[], brief: EditorialBrief): string[] {
  if (!items.length) return []
  const projects = unique(items.map((item) => item.project)).slice(0, 4)
  const intent = brief.weekly[0] ?? brief.ongoing[0]
  const finalQuestion = intent
    ? `Next week, the useful test is whether ${stripTerminalPunctuation(intent).toLowerCase()} produces better evidence, not just better slogans.`
    : 'Next week, the useful test is whether the stack produces better evidence, not just better slogans.'
  return [
    '## Closing note',
    '',
    `${sentenceList(projects)} are worth watching together because they pull the same thread from different ends: explicit contracts, inspectable data movement, and state that can survive contact with production.`,
    '',
    finalQuestion,
    '',
  ]
}

function sentenceList(values: string[]): string {
  if (!values.length) return 'the selected items'
  if (values.length === 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function stripTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/g, '')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function isoDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const html: string[] = []
  let listOpen = false
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!listOpen) {
        html.push('<ul>')
        listOpen = true
      }
      html.push(`<li>${inlineMarkdown(line.slice(2))}</li>`)
      continue
    }
    if (listOpen) {
      html.push('</ul>')
      listOpen = false
    }
    if (line.startsWith('# ')) html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
    else if (line.startsWith('## ')) html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
    else if (line.trim()) html.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  if (listOpen) html.push('</ul>')
  return html.join('\n')
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

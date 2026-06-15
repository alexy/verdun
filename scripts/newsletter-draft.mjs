import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = process.argv[2] ?? 'public/data/newsletter-snapshot.json'
  const out = process.argv[3]
  const snapshot = normalizeSnapshot(JSON.parse(await readFile(input, 'utf8')))
  const draft = buildNewsletterDraft(snapshot)

  if (out) {
    await writeFile(out, draft.markdown)
    console.log(`wrote newsletter draft to ${out}`)
  } else {
    process.stdout.write(draft.markdown)
  }
}

export function normalizeSnapshot(raw) {
  return {
    generatedAt: raw.generated_at ?? raw.generatedAt ?? new Date().toISOString(),
    theme: raw.theme ?? 'Strongly typed and functional AI/data systems',
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      sourceKind: item.source_kind ?? item.sourceKind,
      url: item.url,
      publishedAt: item.published_at ?? item.publishedAt,
      project: item.project,
      topic: item.topic,
      summary: item.summary,
      whyItMatters: item.why_it_matters ?? item.whyItMatters,
      tags: item.tags ?? [],
      score: item.score ?? 0,
      vote: item.vote ?? 0,
    })),
    focuses: raw.focuses ?? [],
    sourceRuns: (raw.source_runs ?? raw.sourceRuns ?? []).map((run) => ({
      source: run.source,
      kind: run.kind,
      status: run.status,
      itemCount: run.item_count ?? run.itemCount ?? 0,
      message: run.message,
    })),
  }
}

export function buildNewsletterDraft(snapshot) {
  const items = draftSelection(snapshot.items)
  const date = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(snapshot.generatedAt))
  const title = `Strongly Typed AI/Data Notes: ${date}`
  const subtitle = items.length
    ? `This week follows ${unique(items.map((item) => item.project)).slice(0, 4).join(', ')} and the systems around them.`
    : 'No items have been selected yet.'
  const markdown = [
    `# ${title}`,
    '',
    subtitle,
    '',
    openingParagraph(items),
    '',
    ...items.flatMap((item, index) => itemSection(item, index + 1)),
    '## Editorial thread',
    '',
    editorialThread(items),
    '',
    '## Sources watched',
    '',
    ...snapshot.sourceRuns.map((run) => `- ${run.source}: ${run.status}, ${run.itemCount} items. ${run.message}`),
    '',
  ].join('\n')

  return {
    title,
    subtitle,
    markdown,
    html: markdownToHtml(markdown),
    itemIds: items.map((item) => item.id),
  }
}

function draftSelection(items, limit = 7) {
  const sorted = sortedNewsItems(items)
  const included = sorted.filter((item) => item.vote > 0)
  return (included.length ? included : sorted.filter((item) => item.vote >= 0)).slice(0, limit)
}

function sortedNewsItems(items) {
  return [...items].sort((left, right) => {
    const voteDelta = right.vote - left.vote
    if (voteDelta !== 0) return voteDelta
    const scoreDelta = right.score - left.score
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
  })
}

function openingParagraph(items) {
  if (!items.length) return 'The queue is empty. Upvote a few items before drafting the week.'
  const projects = unique(items.map((item) => item.project))
  return `The week reads less like a parade of releases than a negotiation over where contracts should live: in Python schemas, Rust planners, Postgres extensions, graph stores, and the data systems that increasingly have to host AI without becoming vague. ${sentenceList(projects.slice(0, 5))} give the issue concrete shape.`
}

function itemSection(item, index) {
  return [
    `## ${index}. ${item.project}: ${item.title}`,
    '',
    `${item.summary} ${item.whyItMatters}`,
    '',
    `Source: [${item.source}](${item.url}) · ${item.topic} · ${item.tags.slice(0, 4).join(', ')}`,
    '',
  ]
}

function editorialThread(items) {
  if (!items.length) return 'No editorial thread yet.'
  const topics = unique(items.map((item) => item.topic))
  return `The connective tissue is ${sentenceList(topics)}. The most interesting pieces are not merely announcing tools; they suggest a stack where typed boundaries, local execution, and database-native intelligence become the ordinary way to build AI/data products.`
}

function sentenceList(values) {
  if (!values.length) return 'the selected items'
  if (values.length === 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function markdownToHtml(markdown) {
  const lines = markdown.split('\n')
  const html = []
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

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

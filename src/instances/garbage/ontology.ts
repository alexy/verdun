import ontologyNodesJson from './ontology.json' with { type: 'json' }
import type { NewsItem } from './newsletter.js'

export type OntologyNode = {
  id: string
  label: string
  description: string
  keywords: string[]
}

export type OntologyMatch = {
  node: OntologyNode
  keywords: string[]
}

export const ontologyNodes = ontologyNodesJson as OntologyNode[]

export function ontologyForItem(item: NewsItem): OntologyNode[] {
  return ontologyMatchesForItem(item).map((match) => match.node)
}

export function ontologyMatchesForItem(item: NewsItem): OntologyMatch[] {
  const text = [
    item.title,
    item.project,
    item.topic,
    item.summary,
    item.whyItMatters,
    ...item.tags,
  ].join(' ').toLowerCase()
  const matches = ontologyNodes
    .map((node) => ({
      node,
      keywords: node.keywords.filter((keyword) => text.includes(keyword)).slice(0, 3),
    }))
    .filter((match) => match.keywords.length)
  return matches.length ? matches.slice(0, 3) : [{ node: ontologyNodes[0], keywords: [] }]
}

export function credoBlurb(item: NewsItem): string {
  const matches = ontologyMatchesForItem(item)
  const nodes = matches.map((match) => match.node.label.toLowerCase())
  const reason = matches[0]?.node.description.toLowerCase() ?? 'typed systems that make AI/data boundaries explicit.'
  return `${item.project} matters here because it touches ${sentenceList(nodes)} in the Strongly Typed AI stack: ${reason}`
}

function sentenceList(values: string[]): string {
  if (!values.length) return 'typed systems'
  if (values.length === 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

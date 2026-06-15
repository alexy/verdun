import ontologyNodesJson from './ontology.json'
import type { NewsItem } from './newsletter'

export type OntologyNode = {
  id: string
  label: string
  description: string
  keywords: string[]
}

export const ontologyNodes = ontologyNodesJson as OntologyNode[]

export function ontologyForItem(item: NewsItem): OntologyNode[] {
  const text = [
    item.title,
    item.project,
    item.topic,
    item.summary,
    item.whyItMatters,
    ...item.tags,
  ].join(' ').toLowerCase()
  const matches = ontologyNodes.filter((node) => node.keywords.some((keyword) => text.includes(keyword)))
  return matches.length ? matches.slice(0, 3) : [ontologyNodes[0]]
}

export function credoBlurb(item: NewsItem): string {
  const nodes = ontologyForItem(item).map((node) => node.label.toLowerCase())
  return `${item.project} matters here because it touches ${sentenceList(nodes)} in the Strongly Typed AI stack.`
}

function sentenceList(values: string[]): string {
  if (!values.length) return 'typed systems'
  if (values.length === 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

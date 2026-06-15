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
}

export type NewsletterSnapshot = {
  generatedAt: string
  theme: string
  items: NewsItem[]
  focuses: NewsletterFocus[]
  sourceRuns: SourceRun[]
}

export type VoteValue = -1 | 0 | 1

export const seedSnapshot: NewsletterSnapshot = {
  generatedAt: new Date().toISOString(),
  theme: 'Strongly typed and functional AI/data systems',
  sourceRuns: [
    {
      source: 'Seed',
      kind: 'local',
      status: 'skipped',
      itemCount: 7,
      message: 'Built-in fallback snapshot',
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

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const signalRules = [
  { project: 'Grust', patterns: [/crates\/grust"/, /\bgrust\b/i] },
  { project: 'Grust Sail', patterns: [/crates\/grust-sail"/, /\bgrust-sail\b/i, /\bSpark Connect\b/i] },
  { project: 'HelixDB', patterns: [/crates\/grust-helix"/, /\bhelix-db\b/i, /\bHelixDB\b/i] },
  { project: 'SurrealDB', patterns: [/crates\/grust-surreal"/, /\bsurrealdb\b/i, /\bSurrealDB\b/i] },
  { project: 'pgGraph', patterns: [/crates\/grust-pggraph"/, /\bpgGraph\b/i, /\btokio-postgres\b/i] },
  { project: 'FalkorDB', patterns: [/crates\/grust-falkor"/, /\bFalkorDB\b/i, /\bRedis GRAPH\b/i, /\bredis\s*=/i] },
  { project: 'LadybugDB', patterns: [/crates\/grust-ladybug"/, /\bLadybugDB\b/i, /\blbug\b/i] },
  { project: 'LanceDB', patterns: [/crates\/grust-lancedb"/, /\blancedb\b/i, /\bLanceDB\b/i] },
  { project: 'CocoIndex', patterns: [/crates\/grust-cocoindex"/, /\bCocoIndex\b/i] },
  { project: 'Garde', patterns: [/\bgarde\s*=/i, /\bgarde::Validate\b/i, /\btyped-garde\b/i] },
  { project: 'zod-rs', patterns: [/\bzod-rs\b/i, /\bzod_rs\b/i] },
  { project: 'Apache Arrow', patterns: [/\bApache Arrow\b/i, /\bArrow IPC\b/i, /\bArrow-native\b/i] },
  { project: 'Delta Lake', patterns: [/\bDelta tables\b/i, /\bDelta Lake\b/i] },
]

const options = parseArgs(process.argv.slice(2))
const grustRoot = options.get('--grust-root') ?? '/Users/alexy/src/grust'
const watchlistPath = options.get('--watchlist') ?? 'crawler/instances/garbage/watchlist.toml'
const outPath = options.get('--out') ?? 'crawler/data/grust-watchlist-audit.md'

const audit = await buildGrustWatchlistAudit({ grustRoot, watchlistPath })
const markdown = renderAuditMarkdown(audit)

if (outPath === '-') {
  process.stdout.write(markdown)
} else {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, markdown)
  console.log(`wrote Grust watchlist audit to ${outPath}`)
}

if (audit.missing.length) {
  throw new Error(`Verdun watchlist is missing Grust-derived projects: ${audit.missing.join(', ')}`)
}

export async function buildGrustWatchlistAudit({ grustRoot, watchlistPath }) {
  const [watchlist, grustText] = await Promise.all([
    readFile(watchlistPath, 'utf8'),
    readGrustSignalText(grustRoot),
  ])
  const watchedProjects = parseWatchlistProjects(watchlist)
  const watched = new Set(watchedProjects)
  const signals = signalRules
    .map((rule) => ({
      project: rule.project,
      evidence: matchingEvidence(rule.patterns, grustText),
    }))
    .filter((signal) => signal.evidence.length)
  const requiredProjects = signals.map((signal) => signal.project)
  const missing = requiredProjects.filter((project) => !watched.has(project))
  return {
    grustRoot,
    watchlistPath,
    watchedProjects,
    signals,
    covered: requiredProjects.filter((project) => watched.has(project)),
    missing,
  }
}

async function readGrustSignalText(grustRoot) {
  const paths = [
    'Cargo.toml',
    'README.md',
    'docs/Arrow.md',
    'docs/sail-backend-proposal.md',
    'docs/cocoindex-integration-proposal.md',
    'docs/garde-typed-graphs-proposal.md',
    'docs/lancedb-backend-plan.md',
    'docs/ladybug-backend-proposal.md',
    'docs/pggraph-backend-study.md',
  ]
  const chunks = []
  for (const path of paths) {
    try {
      chunks.push(`\n--- ${path} ---\n${await readFile(join(grustRoot, path), 'utf8')}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  if (!chunks.length) throw new Error(`No Grust signal files found under ${grustRoot}`)
  return chunks.join('\n')
}

function parseWatchlistProjects(toml) {
  const projects = []
  let inProject = false
  for (const line of toml.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '[[projects]]') {
      inProject = true
      continue
    }
    if (trimmed.startsWith('[[') && trimmed !== '[[projects]]') {
      inProject = false
      continue
    }
    if (!inProject) continue
    const match = /^name\s*=\s*"([^"]+)"/.exec(trimmed)
    if (match?.[1]) projects.push(match[1])
  }
  return projects
}

function matchingEvidence(patterns, text) {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source)
}

function renderAuditMarkdown(audit) {
  const lines = [
    '# Grust Watchlist Audit',
    '',
    `Grust root: \`${audit.grustRoot}\``,
    `Verdun watchlist: \`${audit.watchlistPath}\``,
    '',
    `Coverage: ${audit.covered.length} of ${audit.signals.length} Grust-derived signals are watched by Verdun.`,
    '',
    '## Covered',
    '',
    ...audit.signals
      .filter((signal) => audit.covered.includes(signal.project))
      .map((signal) => `- ${signal.project}: ${signal.evidence.length} local signal${signal.evidence.length === 1 ? '' : 's'}`),
    '',
    '## Missing',
    '',
    ...(audit.missing.length ? audit.missing.map((project) => `- ${project}`) : ['No missing Grust-derived projects.']),
    '',
  ]
  return lines.join('\n')
}

function parseArgs(args) {
  const options = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--grust-root' || arg === '--watchlist' || arg === '--out') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      options.set(arg, value)
      index += 1
    } else if (arg.startsWith('--grust-root=')) {
      options.set('--grust-root', arg.slice('--grust-root='.length))
    } else if (arg.startsWith('--watchlist=')) {
      options.set('--watchlist', arg.slice('--watchlist='.length))
    } else if (arg.startsWith('--out=')) {
      options.set('--out', arg.slice('--out='.length))
    } else {
      throw new Error(`Unknown option ${arg}`)
    }
  }
  return options
}

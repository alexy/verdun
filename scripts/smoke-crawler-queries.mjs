import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const result = spawnSync('cargo', [
  'run',
  '--manifest-path',
  'crawler/Cargo.toml',
  '--',
  'queries',
], { encoding: 'utf8' })

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`crawler queries failed\n${result.stdout}\n${result.stderr}`)
}

const jsonStart = result.stdout.indexOf('[')
if (jsonStart < 0) throw new Error('crawler queries did not print JSON')

const plans = JSON.parse(result.stdout.slice(jsonStart))
const byProject = new Map(plans.map((plan) => [subjectOf(plan), plan]))

for (const project of ['BAML', 'DSPy', 'Instructor', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Ibis', 'Dagster', 'Garde', 'zod-rs']) {
  const plan = byProject.get(project)
  if (!plan) throw new Error(`queries output is missing ${project}`)
  if (!plan.query.includes(project)) {
    throw new Error(`${project} query does not include the project name`)
  }
  if (!Array.isArray(plan.live_terms) || !plan.live_terms.length) {
    throw new Error(`${project} has no distinctive live terms`)
  }
  if (!Array.isArray(plan.tags) || !plan.tags.length) {
    throw new Error(`${project} has no collection tags`)
  }
}

if (byProject.get('BAML')?.live_terms.includes('schema')) {
  throw new Error('BAML live terms leaked generic schema keyword')
}
if (!byProject.get('Ibis')?.live_terms.includes('ibis')) {
  throw new Error('Ibis live terms lost the project name')
}
if (!byProject.get('Apache Arrow')?.live_terms.includes('apache arrow')) {
  throw new Error('Apache Arrow live terms lost the distinctive project term')
}
if (!byProject.get('DataFusion')?.live_terms.includes('datafusion')) {
  throw new Error('DataFusion live terms lost the project name')
}
if (!byProject.get('Delta Lake')?.live_terms.includes('delta lake')) {
  throw new Error('Delta Lake live terms lost the distinctive project term')
}
if (!byProject.get('Garde')?.live_terms.includes('garde')) {
  throw new Error('Garde live terms lost the project name')
}
if (!byProject.get('zod-rs')?.live_terms.includes('zod-rs')) {
  throw new Error('zod-rs live terms lost the crate name')
}
const pydanticTargets = byProject.get('Pydantic')?.review_targets ?? []
for (const source of ['Hacker News', 'Substack', 'LinkedIn', 'X/Twitter']) {
  if (!pydanticTargets.some((target) => target.source === source && /^https:\/\//.test(target.url))) {
    throw new Error(`Pydantic query plan is missing ${source} review target`)
  }
}
if (!pydanticTargets.some((target) => target.source === 'LinkedIn' && target.adapter === 'manual-review')) {
  throw new Error('LinkedIn review target should be marked for manual review')
}

const stateDir = await mkdtemp(join(tmpdir(), 'verdun-query-focus-'))
try {
  const stateFile = join(stateDir, 'editorial-state.json')
  await writeFile(stateFile, JSON.stringify({
    focuses: [
      {
        id: 'focus-query-smoke',
        text: 'More source material on Apache Arrow: arrow flight and typed columnar memory.',
        scope: 'this_week',
        created_at: new Date().toISOString(),
      },
    ],
  }))
  const focusedResult = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'queries',
    '--editorial-state',
    stateFile,
  ], { encoding: 'utf8' })
  if (focusedResult.error) throw focusedResult.error
  if (focusedResult.status !== 0) {
    throw new Error(`focused crawler queries failed\n${focusedResult.stdout}\n${focusedResult.stderr}`)
  }
  const focusedJsonStart = focusedResult.stdout.indexOf('[')
  const focusedPlans = JSON.parse(focusedResult.stdout.slice(focusedJsonStart))
  const apacheArrow = focusedPlans.find((plan) => subjectOf(plan) === 'Apache Arrow')
  if (!apacheArrow?.focus_terms?.includes('flight') || !apacheArrow.focus_terms.includes('columnar')) {
    throw new Error('focused crawler queries did not attach editorial focus terms to Apache Arrow')
  }
  const pydantic = focusedPlans.find((plan) => subjectOf(plan) === 'Pydantic')
  if (pydantic?.focus_terms?.length) {
    throw new Error('focused crawler queries leaked Apache Arrow focus terms into Pydantic')
  }
  const snapshotPath = join(stateDir, 'snapshot.json')
  const collectResult = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--editorial-state',
    stateFile,
    '--out',
    join(stateDir, 'items.json'),
    '--source-runs-out',
    join(stateDir, 'source-runs.json'),
    '--public-out',
    snapshotPath,
  ], { encoding: 'utf8' })
  if (collectResult.error) throw collectResult.error
  if (collectResult.status !== 0) {
    throw new Error(`focused crawler collect failed\n${collectResult.stdout}\n${collectResult.stderr}`)
  }
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const snapshotApacheArrow = snapshot.query_plans.find((plan) => plan.project === 'Apache Arrow')
  if (!snapshotApacheArrow?.focus_terms?.includes('flight')) {
    throw new Error('focused crawler collect did not write editorial focus terms into the public snapshot')
  }
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

function subjectOf(plan) {
  return plan.subject ?? plan.project
}

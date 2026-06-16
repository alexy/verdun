import { spawnSync } from 'node:child_process'

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
const byProject = new Map(plans.map((plan) => [plan.project, plan]))

for (const project of ['BAML', 'DSPy', 'Instructor', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Ibis', 'Dagster', 'Garde', 'zod-rs']) {
  const plan = byProject.get(project)
  if (!plan) throw new Error(`queries output is missing ${project}`)
  if (!plan.hacker_news_query.includes(project)) {
    throw new Error(`${project} HN query does not include the project name`)
  }
  if (!Array.isArray(plan.live_terms) || !plan.live_terms.length) {
    throw new Error(`${project} has no distinctive live terms`)
  }
  if (!Array.isArray(plan.dev_to_tags) || !plan.dev_to_tags.length) {
    throw new Error(`${project} has no dev.to tags`)
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

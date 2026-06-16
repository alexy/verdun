import { readFile } from 'node:fs/promises'

const requiredProjects = [
  'Pydantic',
  'BAML',
  'DSPy',
  'Instructor',
  'LakeSail',
  'Ibis',
  'Dagster',
  'Grust Sail',
  'Turso',
  'LanceDB',
  'HelixDB',
  'SurrealDB',
  'pgGraph',
  'Grust',
  'TypeSec',
  'FalkorDB',
  'LadybugDB',
  'CocoIndex',
]

const snapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const projects = new Set((snapshot.items ?? []).map((item) => item.project))
const missing = requiredProjects.filter((project) => !projects.has(project))

if (missing.length) {
  throw new Error(`public snapshot is missing watchlist projects: ${missing.join(', ')}`)
}

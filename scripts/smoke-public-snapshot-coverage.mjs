import { readFile } from 'node:fs/promises'

const watchlist = await readFile('crawler/config/watchlist.toml', 'utf8')
const requiredProjects = projectNames(watchlist)
const snapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const projects = new Set((snapshot.items ?? []).map((item) => item.project))
const missing = requiredProjects.filter((project) => !projects.has(project))
const extra = Array.from(projects).filter((project) => !requiredProjects.includes(project)).sort()
const queryPlans = Array.isArray(snapshot.query_plans) ? snapshot.query_plans : []
const queryPlanProjects = new Set(queryPlans.map((plan) => plan.project))
const missingQueryPlans = requiredProjects.filter((project) => !queryPlanProjects.has(project))
const extraQueryPlans = Array.from(queryPlanProjects).filter((project) => !requiredProjects.includes(project)).sort()

if (missing.length) {
  throw new Error(`public snapshot is missing watchlist projects: ${missing.join(', ')}`)
}

if (extra.length) {
  throw new Error(`public snapshot has projects outside the watchlist: ${extra.join(', ')}`)
}

if (missingQueryPlans.length) {
  throw new Error(`public snapshot is missing query plans: ${missingQueryPlans.join(', ')}`)
}

if (extraQueryPlans.length) {
  throw new Error(`public snapshot has query plans outside the watchlist: ${extraQueryPlans.join(', ')}`)
}

for (const plan of queryPlans) {
  if (!plan.project || !plan.hacker_news_query) {
    throw new Error('public snapshot has an incomplete query plan')
  }
  if (!Array.isArray(plan.live_terms) || !plan.live_terms.length) {
    throw new Error(`${plan.project} query plan has no distinctive live terms`)
  }
  if (!Array.isArray(plan.dev_to_tags) || !plan.dev_to_tags.length) {
    throw new Error(`${plan.project} query plan has no dev.to tags`)
  }
}

const baml = queryPlans.find((plan) => plan.project === 'BAML')
if (baml?.live_terms.includes('schema')) {
  throw new Error('BAML public snapshot query plan leaked generic schema keyword')
}

const ibis = queryPlans.find((plan) => plan.project === 'Ibis')
if (!ibis?.live_terms.includes('ibis')) {
  throw new Error('Ibis public snapshot query plan lost the project name')
}

function projectNames(toml) {
  return toml
    .split(/\n\[\[projects]]\n/g)
    .slice(1)
    .map((block) => block.match(/^name\s*=\s*"([^"]+)"/m)?.[1])
    .filter(Boolean)
}

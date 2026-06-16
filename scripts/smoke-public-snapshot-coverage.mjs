import { readFile } from 'node:fs/promises'

const watchlist = await readFile('crawler/config/watchlist.toml', 'utf8')
const requiredProjects = projectNames(watchlist)
const snapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const projects = new Set((snapshot.items ?? []).map((item) => item.project))
const missing = requiredProjects.filter((project) => !projects.has(project))
const extra = Array.from(projects).filter((project) => !requiredProjects.includes(project)).sort()

if (missing.length) {
  throw new Error(`public snapshot is missing watchlist projects: ${missing.join(', ')}`)
}

if (extra.length) {
  throw new Error(`public snapshot has projects outside the watchlist: ${extra.join(', ')}`)
}

function projectNames(toml) {
  return toml
    .split(/\n\[\[projects]]\n/g)
    .slice(1)
    .map((block) => block.match(/^name\s*=\s*"([^"]+)"/m)?.[1])
    .filter(Boolean)
}

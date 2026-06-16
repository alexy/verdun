import { spawnSync } from 'node:child_process'

const sqlPath = '/tmp/verdun-newsletter-load.sql'
const snapshotPath = 'public/data/newsletter-snapshot.json'

const steps = [
  ['npm', ['run', 'build']],
  ['cargo', ['check', '--manifest-path', 'crawler/Cargo.toml']],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'verify']],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--snapshot', snapshotPath, '--out', sqlPath]],
  ['npm', ['run', 'smoke:loader', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:db-apply', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:manual-source']],
  ['npm', ['run', 'smoke:check-deployed']],
  ['npm', ['run', 'smoke:api']],
  ['npm', ['run', 'smoke:api-http']],
  ['npm', ['run', 'smoke:crawler-dedupe']],
  ['npm', ['run', 'smoke:feed-content']],
  ['npm', ['run', 'smoke:crawler-provenance']],
  ['npm', ['run', 'smoke:draft']],
  ['npm', ['run', 'smoke:draft-url']],
  ['npm', ['run', 'smoke:ghost']],
  ['npm', ['run', 'smoke:public-snapshot']],
  ['npm', ['run', 'smoke:queries']],
  ['npm', ['run', 'smoke:readiness']],
  ['npm', ['run', 'smoke:recency']],
  ['npm', ['run', 'smoke:snapshot']],
  ['npm', ['run', 'smoke:ulysses']],
  ['npm', ['run', 'smoke:view']],
]

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
}

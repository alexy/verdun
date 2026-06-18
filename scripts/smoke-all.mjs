import { spawnSync } from 'node:child_process'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const sqlPath = '/tmp/verdun-generic-load.sql'
const newsletterSqlPath = '/tmp/verdun-newsletter-load.sql'
const customGenericSqlPath = '/tmp/verdun-greathouse-generic-load.sql'
const profile = deployCheckProfile(defaultDeployCheckProfileId())
const snapshotPath = profile?.sourceSnapshotPath ?? 'public/data/workbench-snapshot.json'

const steps = [
  ['npm', ['run', 'smoke:vercel-config']],
  ['npm', ['run', 'build']],
  ['cargo', ['check', '--manifest-path', 'crawler/Cargo.toml']],
  ['cargo', ['test', '--manifest-path', 'crawler/Cargo.toml']],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'verify']],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--snapshot', snapshotPath, '--out', sqlPath]],
  ['npm', ['run', 'smoke:generic-loader', '--', sqlPath, snapshotPath]],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--target', 'newsletter', '--snapshot', snapshotPath, '--out', newsletterSqlPath]],
  ['npm', ['run', 'garbage:smoke:loader', '--', newsletterSqlPath, snapshotPath]],
  ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--target', 'generic', '--instance', 'greathouse', '--snapshot', snapshotPath, '--out', customGenericSqlPath]],
  ['npm', ['run', 'smoke:generic-loader', '--', customGenericSqlPath, snapshotPath, '--allow-custom-instance', '--expect-instance', 'greathouse', '--expect-base-path', '/greathouse/']],
  ['npm', ['run', 'smoke:greathouse-workbench']],
  ['npm', ['run', 'smoke:db-apply', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:db-deploy', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:db-deploy', '--', customGenericSqlPath, snapshotPath, '--instance', 'greathouse']],
  ['npm', ['run', 'smoke:manual-source']],
  ['npm', ['run', 'smoke:check-deployed']],
  ['npm', ['run', 'smoke:api']],
  ['npm', ['run', 'smoke:api-http']],
  ['npm', ['run', 'garbage:smoke:health']],
  ['npm', ['run', 'smoke:crawler-dedupe']],
  ['npm', ['run', 'smoke:crawler-instance']],
  ['npm', ['run', 'smoke:feed-content']],
  ['npm', ['run', 'smoke:crawler-provenance']],
  ['npm', ['run', 'garbage:smoke:draft-api']],
  ['npm', ['run', 'garbage:smoke:draft']],
  ['npm', ['run', 'garbage:smoke:draft-url']],
  ['npm', ['run', 'garbage:smoke:ghost']],
  ['npm', ['run', 'garbage:smoke:grust-watchlist']],
  ['npm', ['run', 'garbage:smoke:public-snapshot']],
  ['npm', ['run', 'smoke:queries']],
  ['npm', ['run', 'garbage:smoke:readiness']],
  ['npm', ['run', 'garbage:smoke:recency']],
  ['npm', ['run', 'smoke:snapshot']],
  ['npm', ['run', 'garbage:smoke:source-gap-review']],
  ['npm', ['run', 'garbage:smoke:ulysses']],
  ['npm', ['run', 'smoke:view']],
  ['npm', ['run', 'smoke:workbench']],
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

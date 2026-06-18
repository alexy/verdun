import { spawnSync } from 'node:child_process'
import { defaultDeployCheckProfileId, deployCheckProfile, supportedDeployCheckProfiles } from './instances/deploy-check-profiles.mjs'

const sqlPath = '/tmp/verdun-generic-load.sql'
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
  ['npm', ['run', 'smoke:db-apply', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:db-deploy', '--', sqlPath, snapshotPath]],
  ['npm', ['run', 'smoke:check-deployed']],
  ['npm', ['run', 'smoke:api-http']],
  ['npm', ['run', 'smoke:crawler-dedupe']],
  ['npm', ['run', 'smoke:crawler-instance']],
  ['npm', ['run', 'smoke:feed-content']],
  ['npm', ['run', 'smoke:crawler-provenance']],
  ['npm', ['run', 'smoke:queries']],
  ['npm', ['run', 'smoke:workbench']],
]

for (const instanceProfile of supportedDeployCheckProfiles()) {
  if (instanceProfile.compatibilitySqlSmoke) {
    const smoke = instanceProfile.compatibilitySqlSmoke
    steps.push(
      ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--target', smoke.target, '--snapshot', snapshotPath, '--out', smoke.sqlPath]],
      ['npm', ['run', smoke.loaderCommand, '--', smoke.sqlPath, snapshotPath]],
    )
  }
  if (instanceProfile.genericSqlSmoke) {
    const smoke = instanceProfile.genericSqlSmoke
    const smokeSnapshotPath = smoke.genericSnapshotPath ?? snapshotPath
    if (smoke.genericSnapshotPath) {
      steps.push(['cargo', [
        'run',
        '--manifest-path',
        'crawler/Cargo.toml',
        '--',
        'collect',
        '--instance',
        instanceProfile.id,
        '--out',
        smoke.itemsPath,
        '--source-runs-out',
        smoke.sourceRunsPath,
        '--public-out',
        smoke.publicSnapshotPath,
        '--generic-out',
        smoke.genericSnapshotPath,
        '--live',
      ]])
    }
    steps.push(
      ['cargo', ['run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql', '--target', 'generic', '--instance', instanceProfile.id, '--snapshot', smokeSnapshotPath, '--out', smoke.sqlPath]],
      ['npm', ['run', 'smoke:generic-loader', '--', smoke.sqlPath, smokeSnapshotPath, ...(smoke.loaderArgs ?? []), '--expect-instance', instanceProfile.id, '--expect-base-path', instanceProfile.basePath]],
      ['npm', ['run', 'smoke:db-deploy', '--', smoke.sqlPath, smokeSnapshotPath, '--instance', instanceProfile.id]],
    )
  }
  for (const scriptName of instanceProfile.smokeAllCommands ?? []) {
    steps.push(['npm', ['run', scriptName]])
  }
}

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

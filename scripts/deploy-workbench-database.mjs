import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cargoRunCommand, databaseReloadHandoff, nodeApplySqlCommand, writeDatabaseReloadHandoff } from './database-reload-handoff.mjs'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const verdunRoot = dirname(scriptDir)
const applySqlScript = join(scriptDir, 'workbench-apply-sql.mjs')
const crawlerManifest = join(verdunRoot, 'crawler/Cargo.toml')

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runDeployWorkbenchDatabaseCli(process.argv.slice(2), process.env)
}

export async function runDeployWorkbenchDatabaseCli(args, env = process.env) {
  const apply = args.includes('--apply')
  const generate = !args.includes('--no-generate')
  const skipVercelEnv = args.includes('--skip-vercel-env')
  const skipDeployedCheck = args.includes('--skip-deployed-check')
  const requireReady = args.includes('--require-ready')
  const sqlPath = optionValue(args, '--sql') ?? env.WORKBENCH_SQL_FILE ?? env.VERDUN_SQL_FILE ?? '/tmp/verdun-workbench-load.sql'
  const instance = optionValue(args, '--instance') ?? env.WORKBENCH_INSTANCE ?? env.VERDUN_INSTANCE ?? defaultDeployCheckProfileId()
  const profile = deployCheckProfile(instance)
  const snapshotPath = optionValue(args, '--snapshot') ?? env.WORKBENCH_SNAPSHOT_FILE ?? env.VERDUN_SNAPSHOT_FILE ?? profile?.sourceSnapshotPath ?? 'public/data/workbench-snapshot.json'
  const instanceName = optionValue(args, '--instance-name') ?? env.WORKBENCH_INSTANCE_NAME
  const basePath = optionValue(args, '--base-path') ?? env.WORKBENCH_BASE_PATH ?? profile?.basePath
  const staticSnapshotPath = optionValue(args, '--static-snapshot') ?? env.WORKBENCH_STATIC_SNAPSHOT ?? profile?.staticSnapshotPath
  const databaseUrl = optionValue(args, '--database-url') ?? env.POSTGRES_URL ?? env.DATABASE_URL ?? env.NEON_DATABASE_URL
  const baseUrl = optionValue(args, '--base-url') ?? env.VERDUN_DEPLOYED_URL
  const handoffOut = optionValue(args, '--handoff-out') ?? env.WORKBENCH_DB_HANDOFF_FILE
  const loaderArgs = [
    ...(instance !== defaultDeployCheckProfileId() ? ['--allow-custom-instance', '--expect-instance', instance] : []),
    ...(basePath ? ['--expect-base-path', basePath] : []),
    ...repeatArg('--expect-subject', profile?.requiredSubjects ?? []),
    ...repeatArg('--expect-plan', profile?.requiredPlans ?? []),
  ]
  const deployedCheckArgs = [
    ...(baseUrl ? [baseUrl] : []),
    ...(instance ? ['--instance', instance] : []),
    ...(basePath ? ['--asset-base', basePath] : []),
    ...(staticSnapshotPath ? ['--static-snapshot', staticSnapshotPath] : []),
    '--require-database',
    ...(requireReady ? ['--require-ready'] : []),
  ]

  if (generate) {
    run('cargo', [
      'run',
      '--manifest-path',
      crawlerManifest,
      '--',
      'export-sql',
      '--snapshot',
      snapshotPath,
      '--out',
      sqlPath,
      ...(instance ? ['--instance', instance] : []),
      ...(instanceName ? ['--instance-name', instanceName] : []),
      ...(basePath ? ['--base-path', basePath] : []),
    ])
  } else {
    assertFile(sqlPath, 'SQL load file')
  }
  assertFile(snapshotPath, 'snapshot file')

  if (apply && !skipVercelEnv) assertVercelDatabaseEnv()

  run('node', [
    applySqlScript,
    '--instance',
    instance,
    '--sql',
    sqlPath,
    '--snapshot',
    snapshotPath,
    ...loaderArgs,
    ...(databaseUrl ? ['--database-url', databaseUrl] : []),
    ...(apply ? ['--apply'] : []),
  ])

  if (apply && !skipDeployedCheck) {
    run('npm', [
      'run',
      'check:deployed',
      '--',
      ...deployedCheckArgs,
    ])
  }

  if (skipDeployedCheck || !apply) {
    console.log(`deployed check target: ${deployedCheckArgs.join(' ')}`)
  }
  if (handoffOut) {
    writeDatabaseReloadHandoff(handoffOut, databaseReloadHandoff({
      kind: 'verdun_generic_workbench_database_reload',
      apply,
      generatedSql: generate,
      instance,
      displayName: profile?.name ?? null,
      snapshotPath,
      sqlPath,
      databaseUrl,
      vercelEnvChecked: Boolean(apply && !skipVercelEnv),
      deployedCheckSkipped: Boolean(skipDeployedCheck || !apply),
      deployedCheckCommand: ['npm', 'run', 'check:deployed', '--', ...deployedCheckArgs],
      commands: {
        exportSql: generate
          ? cargoRunCommand(crawlerManifest, [
              'export-sql',
              '--snapshot',
              snapshotPath,
              '--out',
              sqlPath,
              ...(instance ? ['--instance', instance] : []),
              ...(instanceName ? ['--instance-name', instanceName] : []),
              ...(basePath ? ['--base-path', basePath] : []),
            ])
          : null,
        applySql: nodeApplySqlCommand({
          scriptPath: applySqlScript,
          leadingArgs: ['--instance', instance],
          sqlPath,
          snapshotPath,
          trailingArgs: loaderArgs,
          databaseUrl,
          apply,
        }),
      },
      extra: {
        instanceName: instanceName ?? null,
        basePath: basePath ?? null,
        staticSnapshotPath: staticSnapshotPath ?? null,
        migrationPaths: profile?.migrationPaths ?? null,
      },
    }))
    console.log(`wrote generic workbench database handoff ${handoffOut}`)
  }
  console.log(apply
    ? 'generic workbench database load applied and deployed database gate passed'
    : 'generic workbench database deployment preflight passed (dry run only; add --apply to load external Postgres)')
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function repeatArg(name, values) {
  return values.flatMap((value) => [name, value])
}

function assertFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
}

function assertVercelDatabaseEnv() {
  const result = spawnSync('npx', ['vercel', 'env', 'ls', 'production'], {
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`could not inspect Vercel production env vars; run \`npx vercel env ls production\` from the linked project\n${result.stderr}`)
  }
  const output = `${result.stdout}\n${result.stderr}`
  const configuredName = ['POSTGRES_URL', 'DATABASE_URL', 'NEON_DATABASE_URL'].find((name) => output.includes(name))
  if (!configuredName) {
    throw new Error('Vercel production is missing POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL. Add one with `npx vercel env add POSTGRES_URL production`, redeploy, then rerun this command.')
  }
  console.log(`verified Vercel production database env var: ${configuredName}`)
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} exited with ${result.status}`)
  }
}

import { spawnSync } from 'node:child_process'

export function runDeployProfileScript(profile, scriptName, args = []) {
  const runner = profile?.commandRunner
  if (runner?.kind === 'npm-workspace') {
    const packageScript = mapWorkspaceScript(runner, scriptName)
    return runCommand('npm', ['--workspace', runner.workspace, 'run', packageScript, '--', ...args], {
      cwd: runner.workspaceRoot,
    })
  }

  return runCommand('npm', ['run', scriptName, '--', ...args])
}

export function runCommand(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
}

function mapWorkspaceScript(runner, scriptName) {
  if (runner.scriptMap?.[scriptName]) {
    return runner.scriptMap[scriptName]
  }
  const prefix = runner.scriptPrefix ?? ''
  if (prefix && scriptName.startsWith(prefix)) {
    return scriptName.slice(prefix.length)
  }
  return scriptName
}

import { spawn } from 'node:child_process'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'
import { runCommand, runDeployProfileScript } from './instance-command-runner.mjs'

const profile = deployCheckProfile(defaultDeployCheckProfileId())
const previewUrl = process.argv[2] ?? profile?.previewBaseUrl ?? 'http://127.0.0.1:5174/'
const startupTimeoutMs = 20_000

async function waitForPreview(server) {
  const deadline = Date.now() + startupTimeoutMs
  let exitCode = null
  server.once('exit', (code, signal) => {
    exitCode = signal ?? code
  })

  while (Date.now() < deadline) {
    if (exitCode !== null) throw new Error(`preview server exited before smoke test: ${exitCode}`)
    try {
      const response = await fetch(previewUrl)
      if (response.ok) return
    } catch {
      // Vite preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`preview server did not become ready at ${previewUrl}`)
}

async function stopPreview(server) {
  if (server.exitCode !== null || server.signalCode !== null) return

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      server.kill('SIGTERM')
      resolve()
    }, 2_000)
    server.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    server.kill('SIGINT')
  })
}

if (profile?.commandRunner?.kind === 'npm-workspace') {
  runCommand('npm', ['--workspace', profile.commandRunner.workspace, 'run', 'build:app'], {
    cwd: profile.commandRunner.workspaceRoot,
  })
} else {
  runCommand('npm', ['run', 'prod:build'])
}

const previewCommand = profile?.commandRunner?.kind === 'npm-workspace'
  ? ['npm', ['--workspace', profile.commandRunner.workspace, 'run', 'preview:app'], { cwd: profile.commandRunner.workspaceRoot }]
  : ['npm', ['run', 'prod:app'], {}]

console.log(`\n> ${previewCommand[0]} ${previewCommand[1].join(' ')}`)
const server = spawn(previewCommand[0], previewCommand[1], {
  stdio: ['ignore', 'pipe', 'pipe'],
  ...previewCommand[2],
})

server.stdout.on('data', (chunk) => process.stdout.write(chunk))
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

try {
  await waitForPreview(server)
  for (const scriptName of profile?.uiSmokeCommands ?? []) {
    runDeployProfileScript(profile, scriptName, [previewUrl])
  }
} finally {
  await stopPreview(server)
}

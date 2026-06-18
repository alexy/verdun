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

runCommand('npm', ['run', 'prod:build'])

console.log('\n> npm run prod:app')
const server = spawn('npm', ['run', 'prod:app'], {
  stdio: ['ignore', 'pipe', 'pipe'],
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

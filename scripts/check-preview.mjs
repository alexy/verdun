import { spawnSync } from 'node:child_process'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const args = process.argv.slice(2)
const instance = optionValue('--instance') ?? process.env.VERDUN_INSTANCE ?? defaultDeployCheckProfileId()
const profile = deployCheckProfile(instance)
const baseUrl = positionalArg() ?? process.env.VERDUN_PREVIEW_URL ?? profile?.previewBaseUrl

if (!baseUrl) {
  throw new Error(`No preview URL configured for ${instance}. Pass a URL, set VERDUN_PREVIEW_URL, or add previewBaseUrl to the instance deploy profile.`)
}

const checkArgs = [
  'scripts/check-deployed.mjs',
  baseUrl,
  '--instance',
  instance,
  '--static-only',
  ...args.filter((arg, index) => {
    if (arg === '--instance') return false
    if (index > 0 && args[index - 1] === '--instance') return false
    return arg !== baseUrl
  }),
]

const result = spawnSync('node', checkArgs, { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`preview check failed for ${instance}`)
}

function optionValue(name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function positionalArg() {
  return args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--instance')
}

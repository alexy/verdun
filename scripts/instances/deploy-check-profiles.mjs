import { readdir } from 'node:fs/promises'

const registeredDeployCheckProfiles = await discoverDeployCheckProfiles()

const deployCheckProfiles = new Map(registeredDeployCheckProfiles.map((profile) => [profile.id, profile]))

export function defaultDeployCheckProfileId() {
  return (registeredDeployCheckProfiles.find((profile) => profile.default) ?? registeredDeployCheckProfiles[0])?.id
}

export function deployCheckProfile(instance) {
  return deployCheckProfiles.get(instance) ?? null
}

export function supportedDeployCheckProfiles() {
  return registeredDeployCheckProfiles
}

async function discoverDeployCheckProfiles() {
  const instanceDirectory = new URL('.', import.meta.url)
  const entries = await readdir(instanceDirectory, { withFileTypes: true })
  const profiles = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const module = await import(new URL(`${entry.name}/deploy-checks.mjs`, instanceDirectory).href)
      return module.deployCheckProfile ?? null
    }))
  return profiles
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
}

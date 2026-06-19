import { access, readdir } from 'node:fs/promises'
import { externalDeployCheckProfileModules } from './external-deploy-check-profile-modules.mjs'
import { validateDeployCheckProfile } from '../public/deploy-profile-contract.mjs'

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
  const bundledProfileModules = []
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    const profileModuleUrl = new URL(`${entry.name}/deploy-checks.mjs`, instanceDirectory)
    try {
      await access(profileModuleUrl)
      bundledProfileModules.push(profileModuleUrl.href)
    } catch {
      // Some instance directories contain only migration shims while their profile is external.
    }
  }
  const profiles = await Promise.all([
    ...bundledProfileModules,
    ...externalDeployCheckProfileModules,
  ].map(async (profileModuleUrl) => {
    const module = await import(profileModuleUrl)
    const profile = module.deployCheckProfile ?? null
    return profile ? validateDeployCheckProfile(profile, profileModuleUrl) : null
  }))
  return profiles
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
}

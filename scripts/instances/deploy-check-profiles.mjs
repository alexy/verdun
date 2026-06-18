import * as garbageProfile from './garbage/deploy-checks.mjs'
import * as greathouseProfile from './greathouse/deploy-checks.mjs'

const registeredDeployCheckProfiles = [
  garbageProfile.deployCheckProfile,
  greathouseProfile.deployCheckProfile,
]

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

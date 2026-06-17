import { garbageDeployCheckProfile } from './garbage/deploy-checks.mjs'

const deployCheckProfiles = new Map([
  [garbageDeployCheckProfile.id, garbageDeployCheckProfile],
])

export function defaultDeployCheckProfileId() {
  return garbageDeployCheckProfile.id
}

export function deployCheckProfile(instance) {
  return deployCheckProfiles.get(instance) ?? null
}

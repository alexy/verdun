import type { WorkbenchAppRegistration } from '../app-types'
import GarbageApp from './GarbageApp.vue'
import { garbageInstance } from './config'

export const workbenchAppRegistration = {
  instanceId: garbageInstance.id,
  component: GarbageApp,
} satisfies WorkbenchAppRegistration

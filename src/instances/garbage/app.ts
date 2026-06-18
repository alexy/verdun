import type { WorkbenchAppRegistration } from '../app-types'
import GarbageApp from './GarbageApp.vue'
import { garbageInstance } from '../../../../apps/garbage/src/config.ts'

export const workbenchAppRegistration = {
  instanceId: garbageInstance.id,
  component: GarbageApp,
} satisfies WorkbenchAppRegistration

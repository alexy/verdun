import type { WorkbenchAppRegistration } from '../app-types'
import GreathouseApp from './GreathouseApp.vue'
import { greathouseInstance } from './config'

export const greathouseWorkbenchApp = {
  instanceId: greathouseInstance.id,
  component: GreathouseApp,
} satisfies WorkbenchAppRegistration

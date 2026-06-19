import type { WorkbenchAppRegistration } from '../app-types'
import DemoApp from './DemoApp.vue'
import { demoInstance } from './config'

export const workbenchAppRegistration = {
  instanceId: demoInstance.id,
  component: DemoApp,
} satisfies WorkbenchAppRegistration

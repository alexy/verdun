import type { WorkbenchAppRegistration } from './app-types'
import { garbageWorkbenchApp } from './garbage/app'
import { greathouseWorkbenchApp } from './greathouse/app'

export const registeredWorkbenchApps: WorkbenchAppRegistration[] = [
  garbageWorkbenchApp,
  greathouseWorkbenchApp,
]

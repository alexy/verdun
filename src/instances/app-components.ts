import type { WorkbenchAppRegistration } from './app-types'
import * as garbageApp from './garbage/app'
import * as greathouseApp from './greathouse/app'

export const registeredWorkbenchApps: WorkbenchAppRegistration[] = [
  garbageApp.workbenchAppRegistration,
  greathouseApp.workbenchAppRegistration,
]

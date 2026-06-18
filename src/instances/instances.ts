import type { WorkbenchInstanceRegistration } from './instance-types'
import * as garbageInstance from './garbage/instance'
import * as greathouseInstance from './greathouse/instance'

export const registeredWorkbenchInstances: WorkbenchInstanceRegistration[] = [
  garbageInstance.workbenchInstanceRegistration,
  greathouseInstance.workbenchInstanceRegistration,
]

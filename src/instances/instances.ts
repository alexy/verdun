import type { WorkbenchInstanceRegistration } from './instance-types'
import { garbageWorkbenchInstance } from './garbage/instance'
import { greathouseWorkbenchInstance } from './greathouse/instance'

export const registeredWorkbenchInstances: WorkbenchInstanceRegistration[] = [
  garbageWorkbenchInstance,
  greathouseWorkbenchInstance,
]

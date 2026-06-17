import type { WorkbenchInstanceRegistration } from '../instance-types'
import { garbageInstance } from './config'

export const garbageWorkbenchInstance = {
  instance: garbageInstance,
  default: true,
} satisfies WorkbenchInstanceRegistration

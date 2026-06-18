import type { WorkbenchInstanceRegistration } from '../instance-types'
import { garbageInstance } from './config'

export const workbenchInstanceRegistration = {
  instance: garbageInstance,
  default: true,
} satisfies WorkbenchInstanceRegistration

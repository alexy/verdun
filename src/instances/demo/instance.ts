import type { WorkbenchInstanceRegistration } from '../instance-types'
import { demoInstance } from './config'
import { demoPilotSnapshot } from './pilot'

export const workbenchInstanceRegistration = {
  instance: demoInstance,
  default: true,
  staticSnapshot: demoPilotSnapshot,
} satisfies WorkbenchInstanceRegistration

import type { WorkbenchInstanceRegistration } from '../instance-types'
import { greathouseInstance } from './config'
import { greathousePilotSnapshot } from './pilot'

export const workbenchInstanceRegistration = {
  instance: greathouseInstance,
  staticSnapshot: greathousePilotSnapshot,
} satisfies WorkbenchInstanceRegistration

import type { WorkbenchInstanceRegistration } from '../instance-types'
import { garbageInstance } from '../../../../apps/garbage/src/config.ts'

export const workbenchInstanceRegistration = {
  instance: garbageInstance,
  default: true,
} satisfies WorkbenchInstanceRegistration

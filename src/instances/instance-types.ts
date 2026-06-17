import type { WorkbenchInstance, WorkbenchSnapshot } from '../core/workbench'

export type WorkbenchInstanceRegistration = {
  instance: WorkbenchInstance
  default?: boolean
  staticSnapshot?: () => WorkbenchSnapshot
}

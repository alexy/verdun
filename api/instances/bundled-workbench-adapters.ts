import { localWorkbenchAdapterRegistration } from './garbage/workbench.js'
import type { LocalWorkbenchAdapterRegistration } from '../workbench/local-adapter-types'

export const bundledLocalWorkbenchAdapterRegistrations: LocalWorkbenchAdapterRegistration[] = [
  localWorkbenchAdapterRegistration,
]

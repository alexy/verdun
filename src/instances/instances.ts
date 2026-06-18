import type { WorkbenchInstanceRegistration } from './instance-types'

type GlobImportMeta = {
  glob<T>(pattern: string, options: { eager: true }): Record<string, T>
}

const instanceModules = (import.meta as unknown as GlobImportMeta).glob<{ workbenchInstanceRegistration: WorkbenchInstanceRegistration }>('./*/instance.ts', {
  eager: true,
})

export const registeredWorkbenchInstances: WorkbenchInstanceRegistration[] = Object.entries(instanceModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, module]) => module.workbenchInstanceRegistration)

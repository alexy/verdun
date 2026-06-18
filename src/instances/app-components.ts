import type { WorkbenchAppRegistration } from './app-types'

type GlobImportMeta = {
  glob<T>(pattern: string, options: { eager: true }): Record<string, T>
}

const appModules = (import.meta as unknown as GlobImportMeta).glob<{ workbenchAppRegistration: WorkbenchAppRegistration }>('./*/app.ts', {
  eager: true,
})

export const registeredWorkbenchApps: WorkbenchAppRegistration[] = Object.entries(appModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, module]) => module.workbenchAppRegistration)

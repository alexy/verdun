import type {
  ReviewValue,
  WorkbenchFocus,
  WorkbenchSnapshot,
  WorkbenchStateExport,
  WorkbenchStateImportResult,
} from '../../src/core/workbench'

export type LocalWorkbenchStatus = {
  editorialPersistence: WorkbenchSnapshot['editorialPersistence']
  generatedAt: string
  recordCount: number
  focusCount: number
  reviewCount: number
  sourceRunCount: number
  collectionPlanCount: number
  writable: boolean
}

export type LocalWorkbenchAdapter = {
  compatibilityTables?: string[]
  readSnapshot: () => Promise<WorkbenchSnapshot>
  readStatus: () => Promise<LocalWorkbenchStatus>
  writeReview?: (recordId: string, review: ReviewValue) => Promise<void>
  writeFocus?: (text: string, scope: WorkbenchFocus['scope']) => Promise<WorkbenchFocus | null>
  writeState?: (state: WorkbenchStateExport) => Promise<WorkbenchStateImportResult>
}

export type LocalWorkbenchAdapterRegistration = {
  instanceId: string
  adapter: LocalWorkbenchAdapter
}

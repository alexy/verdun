import { readSnapshot, readStatus, writeEditorialState, writeFocus, writeVote } from './newsletter-store.js'
import { garbageSnapshotToWorkbench } from '../../../../apps/garbage/src/workbench.ts'
import { garbageInstance } from '../../../../apps/garbage/src/config.ts'
import type { LocalWorkbenchAdapterRegistration } from '../../workbench/local-adapter-types'
import type { ReviewValue, WorkbenchFocus, WorkbenchSnapshot } from '../../../src/core/workbench'
import type { WorkbenchStateExport, WorkbenchStateImportResult } from '../../../src/core/workbench'

export type GarbageWorkbenchStatus = {
  editorialPersistence: WorkbenchSnapshot['editorialPersistence']
  generatedAt: string
  recordCount: number
  focusCount: number
  reviewCount: number
  sourceRunCount: number
  collectionPlanCount: number
  writable: boolean
}

export async function readGarbageWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
  return garbageSnapshotToWorkbench(await readSnapshot())
}

export async function readGarbageWorkbenchStatus(): Promise<GarbageWorkbenchStatus> {
  const status = await readStatus()
  return {
    editorialPersistence: status.editorialPersistence,
    generatedAt: status.generatedAt,
    recordCount: status.itemCount,
    focusCount: status.focusCount,
    reviewCount: status.voteCount,
    sourceRunCount: status.sourceRunCount,
    collectionPlanCount: status.queryPlanCount,
    writable: status.writable,
  }
}

export async function writeGarbageWorkbenchReview(recordId: string, review: ReviewValue): Promise<void> {
  return writeVote(recordId, review)
}

export async function writeGarbageWorkbenchFocus(text: string, scope: WorkbenchFocus['scope']): Promise<WorkbenchFocus | null> {
  return writeFocus(text, scope)
}

export async function writeGarbageWorkbenchState(state: WorkbenchStateExport): Promise<WorkbenchStateImportResult> {
  const result = await writeEditorialState({
    votes: state.reviews,
    focuses: state.focuses,
  })
  return {
    importedReviews: result.importedVotes,
    importedFocuses: result.importedFocuses,
  }
}

export const localWorkbenchAdapterRegistration = {
  instanceId: garbageInstance.id,
  adapter: {
    compatibilityTables: ['newsletter_items', 'newsletter_source_runs', 'newsletter_query_plans', 'newsletter_votes', 'newsletter_focuses'],
    readSnapshot: readGarbageWorkbenchSnapshot,
    readStatus: readGarbageWorkbenchStatus,
    writeReview: writeGarbageWorkbenchReview,
    writeFocus: writeGarbageWorkbenchFocus,
    writeState: writeGarbageWorkbenchState,
  },
} satisfies LocalWorkbenchAdapterRegistration

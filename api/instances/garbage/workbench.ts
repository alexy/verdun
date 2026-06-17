import { readSnapshot, readStatus, writeFocus, writeVote } from '../../newsletter/_db.js'
import { garbageSnapshotToWorkbench } from '../../../src/instances/garbage/workbench'
import type { ReviewValue, WorkbenchFocus, WorkbenchSnapshot } from '../../../src/core/workbench'

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

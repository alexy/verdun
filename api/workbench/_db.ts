import { readSnapshot, readStatus } from '../newsletter/_db.js'
import { garbageSnapshotToWorkbench } from '../../src/instances/garbage/workbench'
import type { WorkbenchSnapshot } from '../../src/core/workbench'

export type WorkbenchStatus = {
  instance: WorkbenchSnapshot['instance']
  editorialPersistence: WorkbenchSnapshot['editorialPersistence']
  generatedAt: string
  recordCount: number
  focusCount: number
  reviewCount: number
  sourceRunCount: number
  collectionPlanCount: number
  writable: boolean
}

export async function readWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
  return garbageSnapshotToWorkbench(await readSnapshot())
}

export async function readWorkbenchStatus(): Promise<WorkbenchStatus> {
  const newsletterStatus = await readStatus()
  const snapshot = await readWorkbenchSnapshot()
  return {
    instance: snapshot.instance,
    editorialPersistence: newsletterStatus.editorialPersistence,
    generatedAt: newsletterStatus.generatedAt,
    recordCount: newsletterStatus.itemCount,
    focusCount: newsletterStatus.focusCount,
    reviewCount: newsletterStatus.voteCount,
    sourceRunCount: newsletterStatus.sourceRunCount,
    collectionPlanCount: newsletterStatus.queryPlanCount,
    writable: newsletterStatus.writable,
  }
}

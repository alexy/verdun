import {
  readGarbageWorkbenchSnapshot,
  readGarbageWorkbenchStatus,
  writeGarbageWorkbenchFocus,
  writeGarbageWorkbenchReview,
  writeGarbageWorkbenchState,
} from '../instances/garbage/workbench.js'
import { garbageInstance } from '../../src/instances/garbage/config'
import { staticWorkbenchSnapshot } from '../../src/instances/registry'
import type {
  ReviewValue,
  WorkbenchFocus,
  WorkbenchInstance,
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
  readSnapshot: () => Promise<WorkbenchSnapshot>
  readStatus: () => Promise<LocalWorkbenchStatus>
  writeReview?: (recordId: string, review: ReviewValue) => Promise<void>
  writeFocus?: (text: string, scope: WorkbenchFocus['scope']) => Promise<WorkbenchFocus | null>
  writeState?: (state: WorkbenchStateExport) => Promise<WorkbenchStateImportResult>
}

const garbageWorkbenchAdapter: LocalWorkbenchAdapter = {
  readSnapshot: readGarbageWorkbenchSnapshot,
  readStatus: readGarbageWorkbenchStatus,
  writeReview: writeGarbageWorkbenchReview,
  writeFocus: writeGarbageWorkbenchFocus,
  writeState: writeGarbageWorkbenchState,
}

export function localWorkbenchAdapter(instance: WorkbenchInstance): LocalWorkbenchAdapter | null {
  if (instance.id === garbageInstance.id) return garbageWorkbenchAdapter
  const snapshot = staticWorkbenchSnapshot(instance)
  if (!snapshot) return null
  return readOnlySnapshotAdapter(snapshot)
}

function readOnlySnapshotAdapter(snapshot: WorkbenchSnapshot): LocalWorkbenchAdapter {
  return {
    async readSnapshot() {
      return snapshot
    },
    async readStatus() {
      return {
        editorialPersistence: snapshot.editorialPersistence,
        generatedAt: snapshot.generatedAt,
        recordCount: snapshot.records.length,
        focusCount: snapshot.focuses.length,
        reviewCount: snapshot.records.filter((record) => record.review !== 0).length,
        sourceRunCount: snapshot.sourceRuns.length,
        collectionPlanCount: snapshot.collectionPlans.length,
        writable: false,
      }
    },
  }
}

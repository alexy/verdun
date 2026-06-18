import { registeredLocalWorkbenchAdapters } from '../instances/workbench-adapters.js'
import { staticWorkbenchSnapshot } from '../../src/instances/registry'
import type { WorkbenchInstance, WorkbenchSnapshot } from '../../src/core/workbench'
import type { LocalWorkbenchAdapter } from './local-adapter-types'

export type { LocalWorkbenchAdapter, LocalWorkbenchAdapterRegistration, LocalWorkbenchStatus } from './local-adapter-types'

export function localWorkbenchAdapter(instance: WorkbenchInstance): LocalWorkbenchAdapter | null {
  const registeredAdapter = registeredLocalWorkbenchAdapters.find((entry) => entry.instanceId === instance.id)?.adapter
  if (registeredAdapter) return registeredAdapter
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

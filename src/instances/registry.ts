import type { WorkbenchInstance, WorkbenchSnapshot } from '../core/workbench'
import { garbageInstance } from './garbage/config'
import { greathouseInstance } from './greathouse/config'
import { greathousePilotSnapshot } from './greathouse/pilot'

const instances = [garbageInstance, greathouseInstance]

export function defaultWorkbenchInstance(): WorkbenchInstance {
  return garbageInstance
}

export function supportedWorkbenchInstances(): WorkbenchInstance[] {
  return instances
}

export function resolveWorkbenchInstance(value: unknown): WorkbenchInstance {
  const instanceId = Array.isArray(value) ? value[0] : value
  if (!instanceId) return defaultWorkbenchInstance()
  const instance = instances.find((candidate) => candidate.id === instanceId)
  if (instance) return instance
  const error = new Error(`unknown workbench instance ${JSON.stringify(instanceId)}; supported instances: ${instances.map((candidate) => candidate.id).join(', ')}`)
  Object.assign(error, { statusCode: 400, code: 'unknown_workbench_instance' })
  throw error
}

export function resolveWorkbenchInstanceForPath(pathname: string): WorkbenchInstance {
  const normalizedPath = pathname.endsWith('/') ? pathname : `${pathname}/`
  const instance = instances
    .filter((candidate) => candidate.basePath !== '/')
    .find((candidate) => normalizedPath.startsWith(candidate.basePath))
  return instance ?? defaultWorkbenchInstance()
}

export function staticWorkbenchSnapshot(instance: WorkbenchInstance): WorkbenchSnapshot | null {
  if (instance.id === greathouseInstance.id) return greathousePilotSnapshot()
  return null
}

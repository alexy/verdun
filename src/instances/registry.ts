import type { WorkbenchInstance, WorkbenchSnapshot } from '../core/workbench'
import type { WorkbenchInstanceRegistration } from './instance-types'
import { registeredWorkbenchInstances } from './instances'

const instances = registeredWorkbenchInstances.map((entry) => entry.instance)

export function defaultWorkbenchInstance(): WorkbenchInstance {
  return defaultWorkbenchEntry().instance
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
  return registeredWorkbenchInstances.find((entry) => entry.instance.id === instance.id)?.staticSnapshot?.() ?? null
}

function defaultWorkbenchEntry(): WorkbenchInstanceRegistration {
  return registeredWorkbenchInstances.find((entry) => entry.default) ?? registeredWorkbenchInstances[0]
}

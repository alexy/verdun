import type { Component } from 'vue'
import { registeredWorkbenchApps } from './app-components'
import { defaultWorkbenchInstance, resolveWorkbenchInstanceForPath } from './registry'

const appComponents = Object.fromEntries(
  registeredWorkbenchApps.map((entry) => [entry.instanceId, entry.component]),
) as Record<string, Component>

function defaultWorkbenchApp(): Component {
  const component = appComponents[defaultWorkbenchInstance().id] ?? registeredWorkbenchApps[0]?.component
  if (!component) {
    throw new Error('No workbench app components are registered')
  }
  return component
}

export function resolveWorkbenchAppForPath(pathname: string): Component {
  const instance = resolveWorkbenchInstanceForPath(pathname)
  return appComponents[instance.id] ?? defaultWorkbenchApp()
}

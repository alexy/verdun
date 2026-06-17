import type { Component } from 'vue'
import GarbageApp from './garbage/GarbageApp.vue'
import GreathouseApp from './greathouse/GreathouseApp.vue'
import { defaultWorkbenchInstance, resolveWorkbenchInstanceForPath } from './registry'

const appComponents: Record<string, Component> = {
  garbage: GarbageApp,
  greathouse: GreathouseApp,
}

export function resolveWorkbenchAppForPath(pathname: string): Component {
  const instance = resolveWorkbenchInstanceForPath(pathname)
  return appComponents[instance.id] ?? appComponents[defaultWorkbenchInstance().id]
}

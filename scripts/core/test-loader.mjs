import { resolve } from 'node:path'

export function createVerdunCoreTsLoader({
  coreRoot,
  runnerImport,
  moduleAliases = {},
  dedupe = [],
} = {}) {
  if (!coreRoot) {
    throw new Error('createVerdunCoreTsLoader requires coreRoot')
  }
  if (typeof runnerImport !== 'function') {
    throw new Error('createVerdunCoreTsLoader requires a Vite runnerImport function')
  }

  return async function loadVerdunCoreTs(input) {
    const modulePath = input.startsWith('/') || input.startsWith('file:')
      ? input
      : resolve(coreRoot, input)
    return runnerImport(modulePath, {
      logLevel: 'error',
      optimizeDeps: { noDiscovery: true },
      resolve: {
        alias: moduleAliases,
        dedupe,
      },
    })
  }
}

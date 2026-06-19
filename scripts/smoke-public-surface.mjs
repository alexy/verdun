import { access, readFile } from 'node:fs/promises'

const expectedExports = {
  './api/public/http': './api/public/http.ts',
  './api/public/workbench-local-adapter': './api/public/workbench-local-adapter.ts',
  './db/public/workbench-migrations': './db/public/workbench-migrations.mjs',
  './frontend/workbench-style.css': './frontend/workbench-style.css',
  './frontend/workbench-ui': './frontend/workbench-ui.ts',
  './scripts/public/check-deployed': './scripts/public/check-deployed.mjs',
  './scripts/public/test-loader': './scripts/public/test-loader.mjs',
  './scripts/public/workbench-api-modules': './scripts/public/workbench-api-modules.mjs',
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const documentedSurface = await readFile('PUBLIC_SURFACE.md', 'utf8')

const actualExports = packageJson.exports ?? {}
const expectedKeys = Object.keys(expectedExports).sort()
const actualKeys = Object.keys(actualExports).sort()

if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error(`Verdun package exports drifted from PUBLIC_SURFACE.md\nexpected: ${expectedKeys.join(', ')}\nactual: ${actualKeys.join(', ')}`)
}

for (const [subpath, target] of Object.entries(expectedExports)) {
  if (actualExports[subpath] !== target) {
    throw new Error(`Verdun export ${subpath} should point at ${target}, found ${actualExports[subpath]}`)
  }
  await access(target.replace(/^\.\//, ''))

  const publicImport = `verdun/${subpath.replace(/^\.\//, '')}`
  if (!documentedSurface.includes(publicImport)) {
    throw new Error(`PUBLIC_SURFACE.md does not document ${publicImport}`)
  }
}

for (const forbidden of ['verdun/src/core/', 'verdun/api/core/', 'verdun/db/core/', 'verdun/scripts/core/']) {
  if (!documentedSurface.includes(forbidden)) {
    throw new Error(`PUBLIC_SURFACE.md should explicitly tell apps not to import ${forbidden}`)
  }
}

if (!documentedSurface.includes('verdun_crawler::sdk')) {
  throw new Error('PUBLIC_SURFACE.md does not document the Rust crawler SDK facade')
}

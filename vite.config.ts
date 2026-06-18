import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// @ts-expect-error deploy profiles are runtime Node modules shared with smoke scripts.
import { defaultDeployCheckProfileId, deployCheckProfile } from './scripts/instances/deploy-check-profiles.mjs'

const instance = process.env.VERDUN_INSTANCE ?? process.env.WORKBENCH_INSTANCE ?? defaultDeployCheckProfileId()
const deployProfile = deployCheckProfile(instance)
const basePath = process.env.VERDUN_BASE_PATH ?? process.env.WORKBENCH_BASE_PATH ?? deployProfile?.basePath ?? '/'

export default defineConfig({
  base: basePath,
  plugins: [vue()],
})

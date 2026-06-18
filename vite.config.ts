import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error deploy profiles are runtime Node modules shared with smoke scripts.
import { defaultDeployCheckProfileId, deployCheckProfile } from './scripts/instances/deploy-check-profiles.mjs'

const instance = process.env.VERDUN_INSTANCE ?? process.env.WORKBENCH_INSTANCE ?? defaultDeployCheckProfileId()
const deployProfile = deployCheckProfile(instance)
const basePath = process.env.VERDUN_BASE_PATH ?? process.env.WORKBENCH_BASE_PATH ?? deployProfile?.basePath ?? '/'

export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      '@lucide/vue': fileURLToPath(new URL('./node_modules/@lucide/vue/dist/esm/lucide-vue.mjs', import.meta.url)),
      vue: fileURLToPath(new URL('./node_modules/vue/dist/vue.runtime.esm-bundler.js', import.meta.url)),
    },
    dedupe: ['@lucide/vue', 'vue'],
  },
  plugins: [vue()],
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { garbageInstance } from './src/instances/garbage/config'

export default defineConfig({
  base: garbageInstance.basePath,
  plugins: [vue()],
})

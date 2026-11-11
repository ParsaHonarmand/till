import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre loads its worker from a file next to its own module; pre-bundling breaks that path (see PinMap.tsx)
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
})

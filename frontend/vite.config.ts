import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Optional: use relative /api when VITE_API_BASE is unset and you prefer proxying.
      // Default client still targets http://localhost:8000 directly (CORS enabled).
    },
  },
})

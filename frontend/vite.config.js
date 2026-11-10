import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Extra hosts (e.g. a tunnel domain) are opt-in: VITE_ALLOWED_HOSTS=host1,host2
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || '.ngrok-free.app,.ngrok.app,.ngrok.io')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  return {
    plugins: [react()],
    server: {
      ...(allowedHosts.length ? { allowedHosts } : {}),
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})

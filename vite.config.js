import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.ngrok-free.app'], // or specific host like '8142-102-70-101-148.ngrok-free.app'
    port: 5173, // optional: define your dev server port
    host: true  // allows access from LAN or tunnels
  }
})

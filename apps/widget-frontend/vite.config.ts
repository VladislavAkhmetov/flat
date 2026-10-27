import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                client: resolve(__dirname, 'client.html')
            }
        }
    },
    server: {
        host: '0.0.0.0',
        port: Number(process.env.FLAT_WIDGET_PORT || 5180),
        proxy: {
            '/api': process.env.FLAT_API_ORIGIN || 'http://127.0.0.1:3000'
        }
    }
})

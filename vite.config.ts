import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Cotizaciones · Facturas · Préstamos',
        short_name: 'Cotizaciones',
        description: 'Sistema de Gestión Móvil para Cotizaciones, Facturas, Pagos y Préstamos',
        // Deben coincidir con el <meta name="theme-color"> de index.html.
        // Estaban en #0f172a (oscuro) y la pantalla de arranque parpadeaba
        // en negro antes de mostrar la aplicación, que es clara.
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})

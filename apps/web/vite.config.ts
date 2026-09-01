import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const webPort = Number(env.WEB_PORT || 5173);
  const codespacesHost = env.CODESPACE_NAME
    ? `${env.CODESPACE_NAME}-${webPort}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}`
    : undefined;

  return {
    envDir: '../../',
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(
        mode === 'demo' ? 'true' : env.VITE_DEMO_MODE || 'false',
      ),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['brand-mark.svg'],
        manifest: {
          name: 'IlmSaathi — Learn. Teach. Rise.',
          short_name: 'IlmSaathi',
          description: 'A trusted learning circle built for women.',
          theme_color: '#4f1f3d',
          background_color: '#fbf7f1',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: '/pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'ilmsaathi-images',
                expiration: { maxEntries: 40, maxAgeSeconds: 2592000 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: webPort,
      strictPort: true,
      allowedHosts: codespacesHost ? [codespacesHost] : [],
      proxy: {
        '/api': {
          target: env.API_INTERNAL_URL || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
    preview: { port: webPort, strictPort: true },
  };
});

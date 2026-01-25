import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

// SPA fallback plugin for client-side routing
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';

          // Extract pathname without query string
          const pathname = url.split('?')[0];

          // Skip if it's an API request, HMR, or has a file extension
          if (
            url.startsWith('/socket.io') ||
            url.startsWith('/@') ||
            url.startsWith('/src/') ||
            url.startsWith('/node_modules/') ||
            /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|map)$/i.test(pathname)
          ) {
            return next();
          }

          // For all other routes, serve index.html to let React Router handle it
          req.url = '/index.html';
          next();
        });
      };
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: {
          clientPort: 443,
        },
        allowedHosts: [
          '.ngrok-free.dev',
          '.ngrok-free.app',
          '.ngrok.io',
          'localhost'
        ],
        proxy: {
          '/socket.io': {
            target: 'http://localhost:3001',
            ws: true,
            changeOrigin: true
          }
        }
      },
      plugins: [react(), spaFallback()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
      }
    };
});

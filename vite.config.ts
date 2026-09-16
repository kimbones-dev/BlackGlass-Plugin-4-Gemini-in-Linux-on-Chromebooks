import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { handleApiMiddleware } from './api-handler.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Ensure process.env has GEMINI_API_KEY if defined in .env
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      target: 'esnext',
    },
    plugins: [
      tailwindcss(),
      {
        name: 'local-api-middleware',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/api/')) {
              handleApiMiddleware(req, res, next).catch(next);
            } else {
              next();
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});


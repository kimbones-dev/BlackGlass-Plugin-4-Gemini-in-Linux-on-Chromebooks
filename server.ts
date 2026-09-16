import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiMiddleware } from './api-handler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// API routes
app.use('/api', (req, res, next) => {
  handleApiMiddleware(req, res, next).catch(next);
});

// Serve static files from production build dist directory
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback all other requests to index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

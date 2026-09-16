import type { IncomingMessage, ServerResponse } from 'http';

const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

function normalizeModel(requestedModel?: string): string {
  if (!requestedModel) return 'gemini-3.6-flash';
  let clean = requestedModel.replace(/^models\//, '');
  // Map outdated or deprecated models
  if (
    clean === 'gemini-2.5-flash' ||
    clean === 'gemini-2.0-flash' ||
    clean === 'gemini-1.5-flash' ||
    clean === 'gemini-1.5-pro' ||
    clean === 'gemini-pro'
  ) {
    return 'gemini-3.6-flash';
  }
  return clean;
}

export async function processChatCompletion(payload: any): Promise<{ status: number; data: any }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      data: {
        error: {
          message: 'GEMINI_API_KEY environment variable is not configured on the server.',
          code: 500,
        },
      },
    };
  }

  const requestedModel = normalizeModel(payload.model);
  const messages = payload.messages || [];

  const candidateModels = [
    requestedModel,
    ...FALLBACK_MODELS.filter((m) => m !== requestedModel),
  ];

  let lastStatus = 500;
  let lastData: any = { error: { message: 'Failed to contact Generative Language service.' } };

  for (const model of candidateModels) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'aistudio-build',
          },
          body: JSON.stringify({
            ...payload,
            model,
            messages,
          }),
        }
      );

      const status = response.status;
      const data = await response.json().catch(() => null);

      if (status === 200 && data) {
        return { status: 200, data };
      }

      lastStatus = status;
      lastData = data || { error: { message: `Upstream service returned HTTP ${status}` } };

      // Only fallback if model was 503 (demand spike) or 404 (model retired)
      if (status !== 503 && status !== 404) {
        break;
      }
    } catch (err: any) {
      lastData = { error: { message: err?.message || 'Network error connecting to Gemini API' } };
    }
  }

  return { status: lastStatus, data: lastData };
}

export async function handleApiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void
): Promise<void> {
  const url = req.url || '';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(204);
    res.end();
    return;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (
    (url.startsWith('/api/openai/chat/completions') || url.startsWith('/api/chat')) &&
    req.method === 'POST'
  ) {
    try {
      let rawBody = '';
      for await (const chunk of req) {
        rawBody += chunk;
      }
      const body = rawBody ? JSON.parse(rawBody) : {};
      const { status, data } = await processChatCompletion(body);

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(status);
      res.end(JSON.stringify(data));
      return;
    } catch (err: any) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: {
            message: err?.message || 'Internal server error while processing request.',
          },
        })
      );
      return;
    }
  }

  if (url === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', hasKey: !!process.env.GEMINI_API_KEY }));
    return;
  }

  if (next) {
    next();
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

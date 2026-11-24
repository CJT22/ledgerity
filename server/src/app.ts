import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZodError } from 'zod';
import { BadRequestError, NotFoundError } from './lib/errors';
import { createApiRouter } from './routes';
import { createServices, ServiceContext, Services } from './services';

/** Header the frontend sends on every write; plain cross-site form posts can't add it. */
export const CSRF_HEADER = 'x-ledgerity-client';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Accept only Host headers that point at this machine (localhost, an IP, or its hostname).
 * Blocks DNS-rebinding, where a malicious site's domain is re-pointed at 127.0.0.1.
 */
function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.replace(/:\d+$/, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (IPV4.test(host) || host.startsWith('[')) return true;
  const machine = os.hostname().toLowerCase();
  return host === machine || host === `${machine}.local` || host.endsWith('.local');
}

export function createApp(ctx: ServiceContext): { app: express.Express; services: Services } {
  const services = createServices(ctx);
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use((req, res, next) => {
    if (!isAllowedHost(req.headers.host)) {
      res.status(403).type('text/plain').send('Forbidden host');
      return;
    }
    // Standard hardening headers: no MIME sniffing, no embedding in other sites' frames
    // (clickjacking), no referrer leaks, isolated browsing context.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (ctx.config.serveClient) {
      // Everything is bundled locally, so the page may only load its own files.
      // 'unsafe-inline' styles are needed for chart/style attributes set by React.
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; ')
      );
    }
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: '25mb' }));
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get(CSRF_HEADER) !== '1') {
      res.status(403).json({ error: 'Missing client header' });
      return;
    }
    next();
  });
  api.use('/v1', createApiRouter(services));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Unknown API endpoint' });
  });
  app.use('/api', api);

  if (ctx.config.serveClient) {
    const dist = ctx.config.clientDistDir;
    const indexHtml = path.join(dist, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      console.warn(`[ledgerity] Built frontend not found at ${dist}. Run "npm run build".`);
    }
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // Error handler (must have 4 args)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      const first = issues[0];
      res.status(400).json({
        error: first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input',
        issues,
      });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large' });
      return;
    }
    console.error('[ledgerity] Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong on the server. Check the terminal for details.' });
  });

  return { app, services };
}

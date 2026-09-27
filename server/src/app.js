import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import catalogRoutes from './routes/catalogRoutes.js';
import trackedProductRoutes from './routes/trackedProductRoutes.js';
import scrapeRoutes from './routes/scrapeRoutes.js';
import { AppError } from './utils/errors.js';

export const app = express();

// ── CORS Configuration ─────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server, cron-job)
    if (!origin) return callback(null, true);

    if (env.ALLOWED_ORIGINS.includes('*') || env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // Allow localhost during local development
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow Vercel preview and production deployments
    if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new AppError(`Origin ${origin} not allowed by CORS`, 403, 'CORS_DISALLOWED'));
  },
  credentials: true,
}));

app.use(express.json());

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'storewatch-server',
  });
});

// ── Route Registrations ───────────────────────────────────────────────────────
app.use('/api/catalog', catalogRoutes);
app.use('/api/tracked-products', trackedProductRoutes);
app.use('/internal', scrapeRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
  });
});

// ── Centralized Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal error occurred';

  // Log error safely without dumping sensitive auth headers
  console.error(`[API Error] ${req.method} ${req.originalUrl} [${statusCode} ${code}]:`, message);

  // Return clean, consistent JSON payload without leaking stack traces or credentials
  res.status(statusCode).json({
    error: message,
    code,
    ...(err.details ? { details: err.details } : {}),
  });
});

// ── Server Bootstrap ──────────────────────────────────────────────────────────
// Start server if executed directly
const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;

if (isMain || process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`[StoreWatch] Server listening on port ${env.PORT}`);
    console.log(`[StoreWatch] Health check available at http://localhost:${env.PORT}/health`);
  });
}

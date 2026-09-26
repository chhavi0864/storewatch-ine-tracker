import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server root (or process.cwd())
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  SUPABASE_URL: (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, ''),
  SUPABASE_SECRET_KEY: (process.env.SUPABASE_SECRET_KEY || '').trim(),
  CRON_SECRET: process.env.CRON_SECRET || '',
  INE_BASE_URL: process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com',
  PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS === 'true',
  SCRAPER_TIMEOUT_MS: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
};

export function validateSupabaseConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in server/.env');
  }
}

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  // Optional: with no Redis the app still works, just without caching, rate limiting and the job queue
  REDIS_URL: z.string().optional(),
  // Optional: with no SMTP settings, emails are only printed in the worker's terminal
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('CampusFlow <no-reply@campusflow.local>'),
});

// Crashes on startup with a clear error if any env var is missing/invalid
export const env = schema.parse(process.env);

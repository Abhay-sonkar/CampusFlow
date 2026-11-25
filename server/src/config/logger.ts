import pino from 'pino';
import { env } from './env';

// Dev: colored, readable one-line-per-event. Prod: plain JSON (what log platforms like Render expect).
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  // Never let a secret end up in a log line, even if someone logs the wrong object by mistake
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.accessToken', '*.refreshToken'], censor: '[redacted]' },
});

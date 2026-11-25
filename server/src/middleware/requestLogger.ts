import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      id: string; // one id per request, so every log line for it can be found with one search
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id']?.toString() || randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const entry = { reqId: req.id, method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms), userId: req.user?.id };
    // 5xx = something broke on our side, 4xx = the client's request was wrong, otherwise routine
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](entry, `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(ms)}ms`);
  });
  next();
}

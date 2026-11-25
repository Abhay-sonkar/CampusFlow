import { NextFunction, Request, Response } from 'express';

/*
 * Blocks NoSQL injection: a client sending {"email": {"$gt": ""}} as JSON could otherwise make
 * Mongo match "any email" instead of comparing a string, bypassing checks like the login filter.
 * This walks req.body/query/params and strips any key starting with "$" or containing ".".
 * (Express 5's req.query is a getter, so we throw away bad keys from a plain copy instead of mutating it.)
 */
function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      clean[key] = strip(v);
    }
    return clean;
  }
  return value;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body) req.body = strip(req.body);
  if (req.params) req.params = strip(req.params) as typeof req.params;
  Object.defineProperty(req, 'query', { value: strip(req.query), writable: true, configurable: true });
  next();
}

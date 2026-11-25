import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message;
    return res.status(400).json({ success: false, message });
  }
  if (err instanceof ApiError) {
    // A 4xx is the client's mistake (routine); a 5xx ApiError is still worth a closer look
    if (err.statusCode >= 500) logger.error({ reqId: req.id, err }, err.message);
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}` });
  }
  if ((err as { code?: number })?.code === 11000) {
    return res.status(409).json({ success: false, message: 'That value already exists' });
  }

  // Anything else is a genuine bug: log the full error, but never leak its details to the client
  logger.error({ reqId: req.id, err }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Internal server error', requestId: req.id });
}

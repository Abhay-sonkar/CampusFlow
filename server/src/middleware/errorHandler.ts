import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
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
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}` });
  }
  // Duplicate value on a unique index (two people creating the same thing at once)
  if ((err as { code?: number })?.code === 11000) {
    return res.status(409).json({ success: false, message: 'That value already exists' });
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

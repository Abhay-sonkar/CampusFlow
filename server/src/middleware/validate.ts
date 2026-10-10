import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

// Validates req.body; a failure is a ZodError handled by errorHandler (400)
export const validate = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body);
  next();
};

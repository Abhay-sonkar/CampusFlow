import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, registerSchema } from '../validators/auth.schema';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(auth.register));
router.post('/login', validate(loginSchema), asyncHandler(auth.login));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));
router.get('/me', authenticate, asyncHandler(auth.me));

// Temporary route to test role-based access. Remove after testing.
router.get('/admin-check', authenticate, authorize('COLLEGE_ADMIN'), (_req, res) => {
  res.json({ success: true, message: 'You are a COLLEGE_ADMIN' });
});

export default router;

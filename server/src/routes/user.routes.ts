import { Router } from 'express';
import * as users from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { updateProfileSchema } from '../validators/user.schema';

const router = Router();
router.use(authenticate);

router.patch('/me', validate(updateProfileSchema), asyncHandler(users.updateMe));

export default router;

import { Router } from 'express';
import * as applications from '../controllers/application.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { updateApplicationSchema } from '../validators/application.schema';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(applications.list));
router.patch('/:id', validate(updateApplicationSchema), asyncHandler(applications.update));
router.delete('/:id', asyncHandler(applications.remove));

export default router;

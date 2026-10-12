import { Router } from 'express';
import * as resources from '../controllers/resource.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createResourceSchema, updateResourceSchema } from '../validators/resource.schema';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(resources.list));
router.get('/:id', asyncHandler(resources.getOne));
router.get('/:id/availability', asyncHandler(resources.availability));

router.post('/', authorize('COLLEGE_ADMIN'), validate(createResourceSchema), asyncHandler(resources.create));
router.patch('/:id', authorize('COLLEGE_ADMIN'), validate(updateResourceSchema), asyncHandler(resources.update));

export default router;

import { Router } from 'express';
import * as departments from '../controllers/department.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createDepartmentSchema, updateDepartmentSchema } from '../validators/department.schema';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(departments.list)); // students need this list to file a complaint
router.post('/', authorize('COLLEGE_ADMIN'), validate(createDepartmentSchema), asyncHandler(departments.create));
router.patch('/:id', authorize('COLLEGE_ADMIN'), validate(updateDepartmentSchema), asyncHandler(departments.update));

export default router;

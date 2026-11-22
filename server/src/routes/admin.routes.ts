import { Router } from 'express';
import * as admin from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, authorize('COLLEGE_ADMIN'));

router.get('/jobs/stats', asyncHandler(admin.jobStats));
router.post('/jobs/deadline-scan', asyncHandler(admin.triggerDeadlineScan));

export default router;

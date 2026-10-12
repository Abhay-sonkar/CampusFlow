import { Router } from 'express';
import * as complaints from '../controllers/complaint.controller';
import { authenticate, authorize } from '../middleware/auth';
import { uploadEvidence } from '../middleware/uploadEvidence';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  assignSchema,
  commentSchema,
  createComplaintSchema,
  reopenSchema,
  statusSchema,
} from '../validators/complaint.schema';

const router = Router();
router.use(authenticate);

// Role gates here are the coarse check; the service does the precise per-complaint check
router.get('/', asyncHandler(complaints.list));
router.post('/', validate(createComplaintSchema), asyncHandler(complaints.create));
router.get('/:id', asyncHandler(complaints.getOne));

router.post('/:id/assign', authorize('COLLEGE_ADMIN'), validate(assignSchema), asyncHandler(complaints.assign));
router.post(
  '/:id/status',
  authorize('FACULTY', 'CLUB_ADMIN', 'COLLEGE_ADMIN'),
  validate(statusSchema),
  asyncHandler(complaints.changeStatus)
);
router.post('/:id/confirm', asyncHandler(complaints.confirm));
router.post('/:id/reopen', validate(reopenSchema), asyncHandler(complaints.reopen));

router.post('/:id/comments', validate(commentSchema), asyncHandler(complaints.comment));
router.post('/:id/evidence', uploadEvidence.array('files', 5), asyncHandler(complaints.uploadEvidence));

export default router;

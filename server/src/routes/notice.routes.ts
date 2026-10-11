import { Router } from 'express';
import * as notices from '../controllers/notice.controller';
import { authenticate, authorize } from '../middleware/auth';
import { uploadPdf } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createNoticeSchema, updateNoticeSchema } from '../validators/notice.schema';

const router = Router();
const canManage = authorize('FACULTY', 'CLUB_ADMIN', 'COLLEGE_ADMIN');

router.use(authenticate); // every notice route needs a logged-in user

router.get('/', asyncHandler(notices.listFeed));
// Must come before '/:id', otherwise "manage" would be read as an id
router.get('/manage', canManage, asyncHandler(notices.listManaged));
router.get('/:id', asyncHandler(notices.getOne));

router.post('/', canManage, validate(createNoticeSchema), asyncHandler(notices.create));
router.patch('/:id', canManage, validate(updateNoticeSchema), asyncHandler(notices.update));
router.delete('/:id', canManage, asyncHandler(notices.remove));
router.post('/:id/publish', canManage, asyncHandler(notices.publish));
router.post('/:id/unpublish', canManage, asyncHandler(notices.unpublish));
router.post('/:id/attachment', canManage, uploadPdf.single('file'), asyncHandler(notices.uploadAttachment));

export default router;

import { Router } from 'express';
import * as notifications from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(notifications.list));
// Fixed words before '/:id', otherwise they would be read as an id
router.get('/unread-count', asyncHandler(notifications.unreadCount));
router.post('/read-all', asyncHandler(notifications.markAllRead));
router.post('/:id/read', asyncHandler(notifications.markRead));

export default router;

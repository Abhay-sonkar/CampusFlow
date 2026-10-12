import { Router } from 'express';
import * as bookings from '../controllers/booking.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createBookingSchema, rejectSchema } from '../validators/booking.schema';

const router = Router();
router.use(authenticate);

router.post('/', validate(createBookingSchema), asyncHandler(bookings.create));
// '/mine' must come before '/:id', otherwise "mine" would be read as an id
router.get('/mine', asyncHandler(bookings.listMine));
router.get('/', authorize('COLLEGE_ADMIN'), asyncHandler(bookings.listAll));
router.get('/:id', asyncHandler(bookings.getOne));

router.post('/:id/approve', authorize('COLLEGE_ADMIN'), asyncHandler(bookings.approve));
router.post('/:id/reject', authorize('COLLEGE_ADMIN'), validate(rejectSchema), asyncHandler(bookings.reject));
router.post('/:id/cancel', asyncHandler(bookings.cancel)); // owner or admin; checked in the service

export default router;

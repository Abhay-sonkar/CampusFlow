import { Router } from 'express';
import * as opportunities from '../controllers/opportunity.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { applySchema } from '../validators/application.schema';
import { createOpportunitySchema, updateOpportunitySchema } from '../validators/opportunity.schema';

const router = Router();
const canPost = authorize('FACULTY', 'CLUB_ADMIN', 'COLLEGE_ADMIN');
router.use(authenticate);

router.get('/', asyncHandler(opportunities.browse));
// Fixed words must come before '/:id', otherwise they would be read as an id
router.get('/recommended', asyncHandler(opportunities.recommended));
router.get('/bookmarks', asyncHandler(opportunities.listBookmarks));
router.get('/:id', asyncHandler(opportunities.getOne));

router.post('/', canPost, validate(createOpportunitySchema), asyncHandler(opportunities.create));
router.patch('/:id', canPost, validate(updateOpportunitySchema), asyncHandler(opportunities.update));
router.delete('/:id', canPost, asyncHandler(opportunities.remove));

router.post('/:id/bookmark', asyncHandler(opportunities.bookmark));
router.delete('/:id/bookmark', asyncHandler(opportunities.unbookmark));
router.post('/:id/apply', validate(applySchema), asyncHandler(opportunities.apply));

export default router;

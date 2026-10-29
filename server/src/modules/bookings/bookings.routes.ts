import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import * as controller from './bookings.controller';

const router = Router();

router.post('/', requireAuth, asyncHandler(controller.create));
router.post('/hold', requireAuth, asyncHandler(controller.hold));
router.get('/mine', requireAuth, asyncHandler(controller.listMine));
router.get('/holds', requireAuth, asyncHandler(controller.listHolds));
router.get('/blocked-seats', requireAuth, asyncHandler(controller.listBlockedSeats));
router.post('/:id/confirm', requireAuth, asyncHandler(controller.confirm));
router.post('/:id/cancel', requireAuth, asyncHandler(controller.cancel));

export default router;

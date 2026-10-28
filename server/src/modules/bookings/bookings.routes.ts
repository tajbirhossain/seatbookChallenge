import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './bookings.controller';

const router = Router();

router.post('/', requireAuth, controller.create);
router.post('/hold', requireAuth, controller.hold);
router.get('/mine', requireAuth, controller.listMine);
router.get('/holds', requireAuth, controller.listHolds);
router.post('/:id/confirm', requireAuth, controller.confirm);
router.post('/:id/cancel', requireAuth, controller.cancel);

export default router;

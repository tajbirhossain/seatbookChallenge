import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './bookings.controller';

const router = Router();

router.post('/', requireAuth, controller.create);
router.get('/mine', requireAuth, controller.listMine);
router.post('/:id/cancel', requireAuth, controller.cancel);

export default router;

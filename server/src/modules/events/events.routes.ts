import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './events.controller';

const router = Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', requireAuth, controller.create);

export default router;

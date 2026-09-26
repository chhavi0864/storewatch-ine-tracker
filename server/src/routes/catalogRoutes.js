import { Router } from 'express';
import { catalogController } from '../controllers/catalogController.js';

const router = Router();

router.get('/search', catalogController.search);
router.get('/:productId', catalogController.getDetail);

export default router;

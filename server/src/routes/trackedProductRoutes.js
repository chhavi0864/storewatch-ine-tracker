import { Router } from 'express';
import { trackedProductController } from '../controllers/trackedProductController.js';

const router = Router();

router.post('/', trackedProductController.create);
router.get('/', trackedProductController.list);
router.get('/:id/attempts', trackedProductController.getAttempts);
router.post('/:id/scrape', trackedProductController.scrapeSingle);
router.get('/:id/export.csv', trackedProductController.exportCsv);

export default router;

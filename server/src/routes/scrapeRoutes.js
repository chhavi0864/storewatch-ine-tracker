import { Router } from 'express';
import { scrapeController } from '../controllers/scrapeController.js';

const router = Router();

router.post('/scrape-all', scrapeController.scrapeAll);

export default router;

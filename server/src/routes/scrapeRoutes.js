import { Router } from 'express';
import { scrapeController } from '../controllers/scrapeController.js';

const router = Router();

router.route('/scrape-all')
  .post(scrapeController.scrapeAll)
  .get(scrapeController.scrapeAll);

export default router;

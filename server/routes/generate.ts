import { Router } from 'express';

const router = Router();

router.post('/model', (_req, res) => {
  res.status(501).json({ message: 'Model generation not implemented yet — Phase 1' });
});

router.get('/model/:taskId', (_req, res) => {
  res.status(501).json({ message: 'Model status polling not implemented yet — Phase 1' });
});

export default router;

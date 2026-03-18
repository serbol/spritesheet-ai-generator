import { Router } from 'express';

const router = Router();

router.post('/frames', (_req, res) => {
  res.status(501).json({ message: 'Style transfer not implemented yet — Phase 4' });
});

export default router;

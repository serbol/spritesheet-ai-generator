import { Router } from 'express';

const router = Router();

router.get('/:type/:filename', (_req, res) => {
  res.status(501).json({ message: 'Asset retrieval not implemented yet' });
});

export default router;

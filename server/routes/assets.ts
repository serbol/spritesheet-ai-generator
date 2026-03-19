import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const ANIMATIONS_DIR = path.join(__dirname, '..', 'assets', 'animations');
const SUPPORTED_EXTENSIONS = ['.glb', '.fbx', '.gltf'];

// GET /api/assets/animations — list available animation files
router.get('/animations', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(ANIMATIONS_DIR)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(ANIMATIONS_DIR);
    const animations = files
      .filter((f) => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map((f) => {
        const ext = path.extname(f);
        const name = path.basename(f, ext);
        // Derive a display name: "Walking" from "Walking.fbx"
        const displayName = name
          .replace(/[-_]/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .trim();

        return {
          name: displayName,
          filename: f,
          format: ext.replace('.', '') as string,
          url: `/api/static/animations/${f}`,
        };
      });

    res.json(animations);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list animations' });
  }
});

router.get('/:type/:filename', (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Asset retrieval not implemented yet' });
});

export default router;

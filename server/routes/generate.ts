import { Router, Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const router = Router();

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const MODELS_DIR = path.join(__dirname, '..', 'assets', 'models');

interface GenerateRequest {
  text: string;
  referenceImageUrl?: string | null;
  artStyle: 'realistic' | 'stylized' | 'low-poly';
  topology: 'quad' | 'triangle';
  polyCount: 'low' | 'medium' | 'high';
  symmetry: boolean;
}

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  progress: number;
  modelUrl?: string;
  modelFilename?: string;
  hasRig?: boolean;
  polyCount?: number;
  textureCount?: number;
  error?: string;
}

const taskStore = new Map<string, TaskStatus>();

// POST /api/generate/model — kick off 3D model generation
router.post('/model', async (req: Request, res: Response) => {
  const body = req.body as GenerateRequest;

  if (!body.text?.trim()) {
    res.status(400).json({ error: 'Text prompt is required' });
    return;
  }

  const tripoKey = process.env['TRIPO_API_KEY'];

  if (!tripoKey) {
    res
      .status(500)
      .json({ error: 'No API key configured. Set TRIPO_API_KEY in .env' });
    return;
  }

  try {
    const taskStatus = await createTripoTask(body, tripoKey);
    taskStore.set(taskStatus.taskId, taskStatus);
    res.json(taskStatus);
  } catch (err: any) {
    const tripoError = err.response?.data?.message || err.response?.data?.suggestion;
    const message = tripoError || err.message || 'Model generation failed';
    const status = err.response?.status || 500;
    res.status(status).json({ error: message });
  }
});

// GET /api/generate/model/:taskId/status — poll task status
router.get('/model/:taskId/status', async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const cached = taskStore.get(taskId as string);

  if (!cached) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (cached.status === 'succeeded' || cached.status === 'failed') {
    res.json(cached);
    return;
  }

  try {
    const updated = await pollTripoTask(taskId as string, process.env['TRIPO_API_KEY']!);

    // If succeeded, download the model file
    if (updated.status === 'succeeded' && updated.modelUrl && !updated.modelFilename) {
      const filename = `${randomUUID()}.glb`;
      const filePath = path.join(MODELS_DIR, filename);
      await downloadFile(updated.modelUrl, filePath);
      updated.modelFilename = filename;
      updated.modelUrl = `/api/static/models/${filename}`;
    }

    taskStore.set(taskId as string, updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to poll task status' });
  }
});

// POST /api/generate/model/:taskId/rig — auto-rig an unrigged model
router.post('/model/:taskId/rig', async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const cached = taskStore.get(taskId as string);

  if (!cached || cached.status !== 'succeeded') {
    res.status(400).json({ error: 'Task not found or model not ready' });
    return;
  }

  if (cached.hasRig) {
    res.json({ ...cached, message: 'Model is already rigged' });
    return;
  }

  try {
    const tripoKey = process.env['TRIPO_API_KEY'];
    if (!tripoKey) {
      res.status(500).json({ error: 'No API key available for rigging' });
      return;
    }

    const rigTaskStatus = await createTripoRigTask(cached.modelUrl!, tripoKey);

    taskStore.set(rigTaskStatus.taskId, rigTaskStatus);
    res.json(rigTaskStatus);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Rigging failed' });
  }
});

// === Tripo API ===

async function createTripoTask(body: GenerateRequest, apiKey: string): Promise<TaskStatus> {
  const payload: Record<string, any> = {
    type: 'text_to_model',
    prompt: body.text,
    model_version: 'v2.0-20240919',
  };

  const response = await axios.post(`${TRIPO_BASE}/task`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    taskId: response.data.data.task_id,
    status: 'pending',
    progress: 0,
  };
}

async function pollTripoTask(taskId: string, apiKey: string): Promise<TaskStatus> {
  const response = await axios.get(`${TRIPO_BASE}/task/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = response.data.data;
  const status =
    data.status === 'success'
      ? 'succeeded'
      : data.status === 'failed'
        ? 'failed'
        : data.status === 'running'
          ? 'in_progress'
          : 'pending';

  return {
    taskId,
    status,
    progress: data.progress ?? 0,
    modelUrl: data.output?.pbr_model ?? data.output?.model ?? undefined,
    hasRig: data.output?.has_rig ?? false,
    polyCount: data.output?.polycount ?? undefined,
    textureCount: data.output?.texture_count ?? 0,
    error: data.message,
  };
}

async function createTripoRigTask(modelUrl: string, apiKey: string): Promise<TaskStatus> {
  const response = await axios.post(
    `${TRIPO_BASE}/task`,
    {
      type: 'rig',
      original_model_task_id: modelUrl,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return {
    taskId: response.data.data.task_id,
    status: 'pending',
    progress: 0,
    hasRig: false,
  };
}

// === Utilities ===

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream' });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

export default router;

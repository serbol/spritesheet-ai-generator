import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import generateRouter from './routes/generate';
import stylizeRouter from './routes/stylize';
import assetsRouter from './routes/assets';

dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/static', express.static(path.join(__dirname, 'assets')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/generate', generateRouter);
app.use('/api/stylize', stylizeRouter);
app.use('/api/assets', assetsRouter);

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
});

import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 }) : null;
const schema = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
let schemaPromise;
async function ensureSchema() {
  if (!pool) throw new Error('Tiger Data is not configured. Set DATABASE_URL.');
  if (!schemaPromise) schemaPromise = pool.query(schema).catch(err => { schemaPromise = null; throw err; });
  await schemaPromise;
}
function validPayload(body) {
  if (body?.consent !== true) return 'Explicit consent is required.';
  if (!Array.isArray(body.embedding) || body.embedding.length !== 1024 || !body.embedding.every(n => Number.isFinite(n) && Math.abs(n) < 1e6)) return 'Expected a 1024-value finite YAMNet embedding.';
  const required = ['Birds', 'Traffic', 'Water', 'People'];
  if (!body.scores || required.some(k => !Number.isFinite(body.scores[k]) || body.scores[k] < 0 || body.scores[k] > 1)) return 'Invalid category scores.';
  return null;
}
function pgVector(vector) { return `[${vector.join(',')}]`; }
const app = express();
app.use(express.json({ limit: '64kb' }));
app.get('/api/health', async (_req, res) => {
  if (!pool) return res.json({ configured: false, provider: null });
  try {
    await pool.query('SELECT 1');
    res.json({ configured: true, provider: 'Tiger Data / PostgreSQL + pgvector' });
  } catch (error) {
    console.error('Tiger Data health check failed:', error.message);
    res.status(503).json({ configured: false, provider: null });
  }
});
app.post('/api/observations', async (req, res) => {
  const problem = validPayload(req.body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `INSERT INTO hushmap_observations (observed_at, place_label, scores, embedding)
       VALUES ($1, $2, $3::jsonb, $4::vector) RETURNING id, observed_at`,
      [req.body.observedAt || new Date().toISOString(), typeof req.body.placeLabel === 'string' ? req.body.placeLabel.slice(0, 80) : null, JSON.stringify(req.body.scores), pgVector(req.body.embedding)],
    );
    res.status(201).json({ id: rows[0].id, observedAt: rows[0].observed_at });
  } catch (error) {
    console.error('Tiger Data observation insert failed:', error.message);
    res.status(503).json({ error: 'Could not save to Tiger Data. Check DATABASE_URL and pgvector availability.' });
  }
});
app.post('/api/similar', async (req, res) => {
  if (req.body?.consent !== true || !Array.isArray(req.body.embedding) || req.body.embedding.length !== 1024 || !req.body.embedding.every(n => Number.isFinite(n) && Math.abs(n) < 1e6)) return res.status(400).json({ error: 'Explicit consent and a valid YAMNet embedding are required.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT place_label, observed_at, scores, 1 - (embedding <=> $1::vector) AS similarity
       FROM hushmap_observations ORDER BY embedding <=> $1::vector LIMIT 5`,
      [pgVector(req.body.embedding)],
    );
    res.json({ matches: rows });
  } catch (error) {
    console.error('Tiger Data similarity query failed:', error.message);
    res.status(503).json({ error: 'Could not search Tiger Data. Check DATABASE_URL and pgvector availability.' });
  }
});
const dist = path.resolve(__dirname, '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(dist, 'index.html'));
    next();
  });
}
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(port, host, () => console.log(`Hushmap API listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await pool?.end(); process.exit(0); });

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const uploadDir = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const publicDir = path.join(__dirname, 'public');

fs.mkdirSync(uploadDir, { recursive: true });

const databaseUrl = process.env.DATABASE_URL;
const needsSsl = process.env.DATABASE_SSL === 'true' || databaseUrl?.includes('sslmode=require');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined
});

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 8
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Only image uploads are supported.'));
      return;
    }
    callback(null, true);
  }
});

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(publicDir));

function parseMetrics(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeEntry(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    activityType: row.activity_type,
    title: row.title,
    content: row.content,
    metrics: row.metrics || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: row.images || []
  };
}

async function fetchEntry(client, id) {
  const result = await client.query(
    `
      SELECT
        e.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'originalName', i.original_name,
              'mimeType', i.mime_type,
              'fileSize', i.file_size,
              'url', i.url,
              'createdAt', i.created_at
            )
            ORDER BY i.created_at
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS images
      FROM entries e
      LEFT JOIN entry_images i ON i.entry_id = e.id
      WHERE e.id = $1
      GROUP BY e.id
    `,
    [id]
  );

  return result.rows[0] ? normalizeEntry(result.rows[0]) : null;
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: 'Database is not reachable.',
      detail: error.code || error.message
    });
  }
});

app.get('/api/entries', async (req, res, next) => {
  try {
    const { activityType, start, end, q } = req.query;
    const where = [];
    const params = [];

    if (activityType && activityType !== 'all') {
      params.push(activityType);
      where.push(`e.activity_type = $${params.length}`);
    }

    if (start) {
      params.push(start);
      where.push(`e.occurred_at >= $${params.length}`);
    }

    if (end) {
      params.push(end);
      where.push(`e.occurred_at <= $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(e.title ILIKE $${params.length} OR e.content ILIKE $${params.length})`);
    }

    const result = await pool.query(
      `
        SELECT
          e.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', i.id,
                'originalName', i.original_name,
                'mimeType', i.mime_type,
                'fileSize', i.file_size,
                'url', i.url,
                'createdAt', i.created_at
              )
              ORDER BY i.created_at
            ) FILTER (WHERE i.id IS NOT NULL),
            '[]'::json
          ) AS images
        FROM entries e
        LEFT JOIN entry_images i ON i.entry_id = e.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY e.id
        ORDER BY e.occurred_at DESC
        LIMIT 300
      `,
      params
    );

    res.json({ entries: result.rows.map(normalizeEntry) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/entries/:id', async (req, res, next) => {
  try {
    const entry = await fetchEntry(pool, req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

app.post('/api/entries', upload.array('images'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { occurredAt, activityType, title, content } = req.body;
    if (!occurredAt || !activityType || !title) {
      res.status(400).json({ error: 'occurredAt, activityType, and title are required.' });
      return;
    }

    await client.query('BEGIN');
    const created = await client.query(
      `
        INSERT INTO entries (occurred_at, activity_type, title, content, metrics)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [occurredAt, activityType, title.trim(), content || '', JSON.stringify(parseMetrics(req.body.metrics))]
    );

    const entryId = created.rows[0].id;
    for (const file of req.files || []) {
      await client.query(
        `
          INSERT INTO entry_images (entry_id, original_name, mime_type, file_size, url)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [entryId, file.originalname, file.mimetype, file.size, `/uploads/${file.filename}`]
      );
    }

    const entry = await fetchEntry(client, entryId);
    await client.query('COMMIT');
    res.status(201).json({ entry });
  } catch (error) {
    await client.query('ROLLBACK');
    for (const file of req.files || []) {
      fs.rm(file.path, { force: true }, () => {});
    }
    next(error);
  } finally {
    client.release();
  }
});

app.put('/api/entries/:id', async (req, res, next) => {
  try {
    const { occurredAt, activityType, title, content, metrics } = req.body;
    const result = await pool.query(
      `
        UPDATE entries
        SET occurred_at = $1,
            activity_type = $2,
            title = $3,
            content = $4,
            metrics = $5::jsonb
        WHERE id = $6
        RETURNING id
      `,
      [occurredAt, activityType, title, content || '', JSON.stringify(parseMetrics(metrics)), req.params.id]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const entry = await fetchEntry(pool, req.params.id);
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/entries/:id', async (req, res, next) => {
  try {
    const images = await pool.query('SELECT url FROM entry_images WHERE entry_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);

    if (!result.rowCount) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    for (const image of images.rows) {
      const filename = path.basename(image.url);
      fs.rm(path.join(uploadDir, filename), { force: true }, () => {});
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`Quick Record is running at http://localhost:${port}`);
});

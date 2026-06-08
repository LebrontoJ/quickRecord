import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import pg from 'pg';
import WordExtractor from 'word-extractor';

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

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
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

function parseTags(value) {
  let rawTags = Array.isArray(value) ? value : null;

  if (!rawTags) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      rawTags = Array.isArray(parsed) ? parsed : null;
    } catch {
      rawTags = null;
    }
  }

  rawTags ||= String(value || '').split(',');
  const seen = new Set();

  return rawTags
    .map((tag) => String(tag).trim().replace(/^#/, ''))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function normalizeEntry(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    activityType: row.activity_type,
    title: row.title,
    content: row.content,
    metrics: row.metrics || {},
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: row.images || []
  };
}

function entrySelectSql(whereSql = '') {
  return `
    SELECT
      e.*,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', i.id,
          'originalName', i.original_name,
          'mimeType', i.mime_type,
          'fileSize', i.file_size,
          'url', i.url,
          'createdAt', i.created_at
        )) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS images,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', t.id,
          'name', t.name
        )) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
      ) AS tags
    FROM entries e
    LEFT JOIN entry_images i ON i.entry_id = e.id
    LEFT JOIN entry_tags et ON et.entry_id = e.id
    LEFT JOIN tags t ON t.id = et.tag_id
    ${whereSql}
    GROUP BY e.id
  `;
}

async function syncTags(client, entryId, tags) {
  await client.query('DELETE FROM entry_tags WHERE entry_id = $1', [entryId]);

  for (const tag of tags) {
    const result = await client.query(
      `
        INSERT INTO tags (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [tag]
    );

    await client.query(
      `
        INSERT INTO entry_tags (entry_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [entryId, result.rows[0].id]
    );
  }
}

async function fetchEntry(client, id) {
  const result = await client.query(
    `
      ${entrySelectSql('WHERE e.id = $1')}
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

app.post('/api/extract-text', documentUpload.single('document'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Please upload a document.' });
      return;
    }

    const extension = path.extname(file.originalname).toLowerCase();
    let text = '';

    if (['.txt', '.md', '.markdown'].includes(extension)) {
      text = file.buffer.toString('utf8');
    } else if (extension === '.docx') {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (extension === '.doc') {
      const extractor = new WordExtractor();
      const result = await extractor.extract(file.buffer);
      text = result.getBody();
    } else if (extension === '.pdf') {
      const result = await pdfParse(file.buffer);
      text = result.text;
    } else {
      res.status(415).json({ error: 'Supported formats: .txt, .md, .doc, .docx, and .pdf.' });
      return;
    }

    res.json({
      filename: file.originalname,
      text: text.replace(/\r\n/g, '\n').trim()
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/entries', async (req, res, next) => {
  try {
    const { activityType, start, end, q, tag } = req.query;
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

    if (tag && tag !== 'all') {
      params.push(tag);
      where.push(`
        EXISTS (
          SELECT 1
          FROM entry_tags filter_et
          JOIN tags filter_t ON filter_t.id = filter_et.tag_id
          WHERE filter_et.entry_id = e.id AND filter_t.name = $${params.length}
        )
      `);
    }

    const result = await pool.query(
      `
        ${entrySelectSql(where.length ? `WHERE ${where.join(' AND ')}` : '')}
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

app.get('/api/tags', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT t.id, t.name, COUNT(et.entry_id)::int AS count
        FROM tags t
        LEFT JOIN entry_tags et ON et.tag_id = t.id
        GROUP BY t.id
        ORDER BY count DESC, t.name ASC
      `
    );

    res.json({ tags: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/stats', async (_req, res, next) => {
  try {
    const [overview, byType, recent, tagResult] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_entries,
            COUNT(DISTINCT occurred_at::date)::int AS active_days,
            COALESCE(SUM((metrics->>'problemCount')::numeric), 0)::int AS total_problems,
            COALESCE(SUM((metrics->>'workoutMinutes')::numeric), 0)::int AS total_workout_minutes,
            COALESCE(ROUND(AVG(NULLIF((metrics->>'bodyWeight')::numeric, 0)), 1), 0) AS average_body_weight
          FROM entries
          WHERE occurred_at >= now() - interval '30 days'
        `
      ),
      pool.query(
        `
          SELECT activity_type, COUNT(*)::int AS count
          FROM entries
          WHERE occurred_at >= now() - interval '30 days'
          GROUP BY activity_type
          ORDER BY count DESC
        `
      ),
      pool.query(
        `
          SELECT
            occurred_at::date AS day,
            COUNT(*)::int AS entry_count,
            COALESCE(SUM((metrics->>'problemCount')::numeric), 0)::int AS problem_count,
            COALESCE(SUM((metrics->>'workoutMinutes')::numeric), 0)::int AS workout_minutes
          FROM entries
          WHERE occurred_at >= now() - interval '14 days'
          GROUP BY day
          ORDER BY day ASC
        `
      ),
      pool.query(
        `
          SELECT t.name, COUNT(et.entry_id)::int AS count
          FROM tags t
          JOIN entry_tags et ON et.tag_id = t.id
          JOIN entries e ON e.id = et.entry_id
          WHERE e.occurred_at >= now() - interval '30 days'
          GROUP BY t.name
          ORDER BY count DESC, t.name ASC
          LIMIT 8
        `
      )
    ]);

    res.json({
      overview: overview.rows[0],
      byType: byType.rows,
      recent: recent.rows,
      topTags: tagResult.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/calendar', async (req, res, next) => {
  try {
    const month = String(req.query.month || '').match(/^\d{4}-\d{2}$/)
      ? req.query.month
      : new Date().toISOString().slice(0, 7);

    const result = await pool.query(
      `
        SELECT
          occurred_at::date AS day,
          COUNT(*)::int AS entry_count,
          COUNT(*) FILTER (WHERE activity_type = 'coding')::int AS coding_count,
          COUNT(*) FILTER (WHERE activity_type = 'fitness')::int AS fitness_count,
          COALESCE(SUM((metrics->>'problemCount')::numeric), 0)::int AS problem_count,
          COALESCE(SUM((metrics->>'workoutMinutes')::numeric), 0)::int AS workout_minutes
        FROM entries
        WHERE occurred_at >= $1::date
          AND occurred_at < ($1::date + interval '1 month')
        GROUP BY day
        ORDER BY day ASC
      `,
      [`${month}-01`]
    );

    res.json({ month, days: result.rows });
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
  let client;
  try {
    client = await pool.connect();
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
    await syncTags(client, entryId, parseTags(req.body.tags));

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
    if (client) await client.query('ROLLBACK').catch(() => {});
    for (const file of req.files || []) {
      fs.rm(file.path, { force: true }, () => {});
    }
    next(error);
  } finally {
    if (client) client.release();
  }
});

app.put('/api/entries/:id', async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    const { occurredAt, activityType, title, content, metrics, tags } = req.body;

    await client.query('BEGIN');
    const result = await client.query(
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
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    await syncTags(client, req.params.id, parseTags(tags));
    const entry = await fetchEntry(client, req.params.id);
    await client.query('COMMIT');
    res.json({ entry });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    if (client) client.release();
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
  if (error.code === 'ECONNREFUSED') {
    res.status(503).json({
      error: 'Database is not reachable. Please start PostgreSQL and run migrations.'
    });
    return;
  }

  if (error.code === '42P01') {
    res.status(500).json({
      error: 'Database schema is missing a table. Please run npm run db:migrate.'
    });
    return;
  }

  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`Quick Record is running at http://localhost:${port}`);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDB, queryAll, queryOne, execute, lastInsertId } = require('./db/init');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db; // will be set after async init

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// ═══════════════════════════════════════════
//  TABS API
// ═══════════════════════════════════════════

app.get('/api/tabs', (req, res) => {
  const tabs = queryAll(db, 'SELECT * FROM tabs ORDER BY sort_order ASC');
  res.json(tabs);
});

app.post('/api/tabs', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const maxResult = queryOne(db, 'SELECT MAX(sort_order) as max_order FROM tabs');
  const sortOrder = (maxResult?.max_order || 0) + 1;

  execute(db, 'INSERT INTO tabs (name, color, sort_order) VALUES (?, ?, ?)', [name, color || '#6C63FF', sortOrder]);
  const id = lastInsertId(db);
  const tab = queryOne(db, 'SELECT * FROM tabs WHERE id = ?', [id]);
  res.status(201).json(tab);
});

app.put('/api/tabs/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, sort_order } = req.body;

  const existing = queryOne(db, 'SELECT * FROM tabs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Tab not found' });

  execute(db, 'UPDATE tabs SET name = ?, color = ?, sort_order = ? WHERE id = ?', [
    name ?? existing.name,
    color ?? existing.color,
    sort_order ?? existing.sort_order,
    id
  ]);
  const tab = queryOne(db, 'SELECT * FROM tabs WHERE id = ?', [id]);
  res.json(tab);
});

app.delete('/api/tabs/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne(db, 'SELECT * FROM tabs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Tab not found' });

  // Manually cascade delete notes since sql.js foreign key support can be limited
  execute(db, 'DELETE FROM notes WHERE tab_id = ?', [id]);
  execute(db, 'UPDATE events SET tab_id = NULL WHERE tab_id = ?', [id]);
  execute(db, 'DELETE FROM tabs WHERE id = ?', [id]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
//  NOTES API
// ═══════════════════════════════════════════

app.get('/api/notes', (req, res) => {
  const { tab_id, search } = req.query;

  if (search) {
    const notes = queryAll(db,
      "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
      [`%${search}%`, `%${search}%`]
    );
    return res.json(notes);
  }

  if (!tab_id) return res.status(400).json({ error: 'tab_id is required' });

  const notes = queryAll(db, 'SELECT * FROM notes WHERE tab_id = ? ORDER BY updated_at DESC', [tab_id]);
  res.json(notes);
});

app.post('/api/notes', (req, res) => {
  const { tab_id, title, content } = req.body;
  if (!tab_id || !title) return res.status(400).json({ error: 'tab_id and title are required' });

  execute(db, 'INSERT INTO notes (tab_id, title, content) VALUES (?, ?, ?)', [tab_id, title, content || '']);
  const id = lastInsertId(db);
  const note = queryOne(db, 'SELECT * FROM notes WHERE id = ?', [id]);
  res.status(201).json(note);
});

app.put('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  const existing = queryOne(db, 'SELECT * FROM notes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  const now = new Date().toISOString();
  execute(db, 'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?', [
    title ?? existing.title,
    content ?? existing.content,
    now,
    id
  ]);
  const note = queryOne(db, 'SELECT * FROM notes WHERE id = ?', [id]);
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne(db, 'SELECT * FROM notes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  // Delete attached files from disk
  const files = queryAll(db, 'SELECT * FROM files WHERE note_id = ?', [id]);
  for (const file of files) {
    const filePath = path.join(__dirname, 'public', 'uploads', file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  execute(db, 'DELETE FROM notes WHERE id = ?', [id]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
//  FILES API
// ═══════════════════════════════════════════

app.get('/api/notes/:id/files', (req, res) => {
  const { id } = req.params;
  const files = queryAll(db, 'SELECT * FROM files WHERE note_id = ? ORDER BY created_at ASC', [id]);
  res.json(files);
});

app.post('/api/notes/:id/files', upload.single('file'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  execute(db, 'INSERT INTO files (note_id, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?)', [
    id,
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size
  ]);

  const fileId = lastInsertId(db);
  const file = queryOne(db, 'SELECT * FROM files WHERE id = ?', [fileId]);
  res.status(201).json(file);
});

app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const file = queryOne(db, 'SELECT * FROM files WHERE id = ?', [id]);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const filePath = path.join(__dirname, 'public', 'uploads', file.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  execute(db, 'DELETE FROM files WHERE id = ?', [id]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
//  VISION BOARD API
// ═══════════════════════════════════════════

app.get('/api/vision', (req, res) => {
  const items = queryAll(db, 'SELECT * FROM vision_items ORDER BY created_at DESC');
  res.json(items);
});

app.post('/api/vision/quote', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  execute(db, "INSERT INTO vision_items (type, content) VALUES ('quote', ?)", [content]);
  const id = lastInsertId(db);
  const item = queryOne(db, 'SELECT * FROM vision_items WHERE id = ?', [id]);
  res.status(201).json(item);
});

app.post('/api/vision/image', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  execute(db, "INSERT INTO vision_items (type, content) VALUES ('image', ?)", [req.file.filename]);
  const id = lastInsertId(db);
  const item = queryOne(db, 'SELECT * FROM vision_items WHERE id = ?', [id]);
  res.status(201).json(item);
});

app.delete('/api/vision/:id', (req, res) => {
  const { id } = req.params;
  const item = queryOne(db, 'SELECT * FROM vision_items WHERE id = ?', [id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (item.type === 'image') {
    const filePath = path.join(__dirname, 'public', 'uploads', item.content);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  execute(db, 'DELETE FROM vision_items WHERE id = ?', [id]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
//  EVENTS API
// ═══════════════════════════════════════════

app.get('/api/events', (req, res) => {
  const { month } = req.query;

  if (month) {
    const startOfMonth = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const events = queryAll(db, `
      SELECT e.*, t.name as tab_name, t.color as tab_color
      FROM events e
      LEFT JOIN tabs t ON e.tab_id = t.id
      WHERE e.start_date >= ? AND e.start_date < ?
      ORDER BY e.start_date ASC
    `, [startOfMonth, nextMonth]);
    return res.json(events);
  }

  const events = queryAll(db, `
    SELECT e.*, t.name as tab_name, t.color as tab_color
    FROM events e
    LEFT JOIN tabs t ON e.tab_id = t.id
    ORDER BY e.start_date ASC
  `);
  res.json(events);
});

app.get('/api/events/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const events = queryAll(db, `
    SELECT e.*, t.name as tab_name, t.color as tab_color
    FROM events e
    LEFT JOIN tabs t ON e.tab_id = t.id
    WHERE e.start_date >= ? OR e.status = 'ongoing'
    ORDER BY e.start_date ASC
    LIMIT 20
  `, [today]);
  res.json(events);
});

app.get('/api/events/reminders', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const events = queryAll(db, `
    SELECT e.*, t.name as tab_name, t.color as tab_color
    FROM events e
    LEFT JOIN tabs t ON e.tab_id = t.id
    WHERE e.reminder_date IS NOT NULL AND e.reminder_date <= ? AND e.status != 'done'
    ORDER BY e.reminder_date ASC
  `, [today]);
  res.json(events);
});

app.post('/api/events', (req, res) => {
  const { tab_id, title, description, start_date, end_date, reminder_date, status } = req.body;
  if (!title || !start_date) return res.status(400).json({ error: 'title and start_date are required' });

  execute(db, `
    INSERT INTO events (tab_id, title, description, start_date, end_date, reminder_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [tab_id || null, title, description || '', start_date, end_date || null, reminder_date || null, status || 'upcoming']);

  const id = lastInsertId(db);
  const event = queryOne(db, `
    SELECT e.*, t.name as tab_name, t.color as tab_color
    FROM events e
    LEFT JOIN tabs t ON e.tab_id = t.id
    WHERE e.id = ?
  `, [id]);
  res.status(201).json(event);
});

app.put('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const { tab_id, title, description, start_date, end_date, reminder_date, status } = req.body;

  const existing = queryOne(db, 'SELECT * FROM events WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  execute(db, `
    UPDATE events SET tab_id = ?, title = ?, description = ?, start_date = ?, end_date = ?, reminder_date = ?, status = ?
    WHERE id = ?
  `, [
    tab_id !== undefined ? (tab_id || null) : existing.tab_id,
    title ?? existing.title,
    description ?? existing.description,
    start_date ?? existing.start_date,
    end_date !== undefined ? (end_date || null) : existing.end_date,
    reminder_date !== undefined ? (reminder_date || null) : existing.reminder_date,
    status ?? existing.status,
    id
  ]);

  const event = queryOne(db, `
    SELECT e.*, t.name as tab_name, t.color as tab_color
    FROM events e
    LEFT JOIN tabs t ON e.tab_id = t.id
    WHERE e.id = ?
  `, [id]);
  res.json(event);
});

app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne(db, 'SELECT * FROM events WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  execute(db, 'DELETE FROM events WHERE id = ?', [id]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════

(async () => {
  db = await initDB();
  app.listen(PORT, () => {
    console.log(`\n🖤 Productivity App running at http://localhost:${PORT}\n`);
  });
})();

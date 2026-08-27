const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file =>
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });

  let db;

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6C63FF',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER REFERENCES tabs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT,
      reminder_date TEXT,
      status TEXT DEFAULT 'upcoming'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vision_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'quote' or 'image'
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default tabs if the table is empty
  const result = db.exec('SELECT COUNT(*) as count FROM tabs');
  const tabCount = result[0]?.values[0][0] || 0;

  if (tabCount === 0) {
    const defaultTabs = [
      { name: 'Work', color: '#ffffff', order: 0 },
      { name: 'Research', color: '#aaaaaa', order: 1 },
      { name: 'Projects', color: '#888888', order: 2 },
      { name: 'Startup', color: '#666666', order: 3 },
      { name: 'Resume/CV', color: '#cccccc', order: 4 },
    ];

    for (const tab of defaultTabs) {
      db.run('INSERT INTO tabs (name, color, sort_order) VALUES (?, ?, ?)', [tab.name, tab.color, tab.order]);
    }
    console.log('✓ Seeded default tabs');
  }

  // Save to disk
  saveDB(db);
  console.log('✓ Database initialized');
  return db;
}

function saveDB(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper: run a SELECT query and return array of objects
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a SELECT query and return one object
function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows[0] || null;
}

// Helper: run INSERT/UPDATE/DELETE
function execute(db, sql, params = []) {
  db.run(sql, params);
  saveDB(db);
}

// Helper: get last insert rowid
function lastInsertId(db) {
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0]?.values[0][0];
}

module.exports = { initDB, saveDB, queryAll, queryOne, execute, lastInsertId };

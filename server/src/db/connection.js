// ─── Database Connection ────────────────────────────────────────────────
// Singleton connection to SQLite for caching CFDI data locally.
// Uses better-sqlite3 for synchronous, high-performance access.
// ─────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Get or create the SQLite database connection.
 * @param {string} [dbPath] - Optional custom path for the database file.
 * @returns {Database.Database} The SQLite database instance.
 */
export function getDatabase(dbPath) {
  if (db) return db;

  const resolvedPath = dbPath || process.env.DB_PATH || path.join(__dirname, '../../data/fiscally.db');
  const dir = path.dirname(resolvedPath);

  // Ensure the data directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

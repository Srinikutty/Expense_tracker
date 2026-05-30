// DB helper with MySQL primary and SQLite fallback when MySQL isn't available.
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'expense_tracker_db';
const DB_PORT = Number(process.env.DB_PORT || 3306);

let mode = 'mysql';
let pool = null;
let sqliteDb = null;

async function initMySQL() {
  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });

  // Ensure database exists (connect without database then create)
  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'expense',
      user_id VARCHAR(36) NOT NULL DEFAULT '',
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await pool.query(createTableSql);
  await migrateTypeColumn();
  await migrateUserIdColumn();
}

// SQLite fallback implementation
async function initSQLite() {
  const sqlite3 = require('sqlite3').verbose();
  const Database = sqlite3.Database;
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  const dbPath = path.join(dataDir, 'expenses.sqlite');
  sqliteDb = new Database(dbPath);

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      user_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await new Promise((resolve, reject) => {
    sqliteDb.run(createTableSql, (err) => (err ? reject(err) : resolve()));
  });
  await migrateTypeColumn();
  await migrateUserIdColumn();
}

async function migrateUserIdColumn() {
  const alterSql =
    mode === 'mysql'
      ? `ALTER TABLE expenses ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT ''`
      : `ALTER TABLE expenses ADD COLUMN user_id TEXT DEFAULT ''`;

  try {
    await query(alterSql);
  } catch (err) {
    const msg = String(err.message || err).toLowerCase();
    if (!msg.includes('duplicate') && !msg.includes('already exists')) {
      throw err;
    }
  }

  await query(`UPDATE expenses SET user_id = '' WHERE user_id IS NULL`);
}

async function migrateTypeColumn() {
  const alterSql =
    mode === 'mysql'
      ? `ALTER TABLE expenses ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'expense'`
      : `ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'`;

  try {
    await query(alterSql);
  } catch (err) {
    const msg = String(err.message || err).toLowerCase();
    if (!msg.includes('duplicate') && !msg.includes('already exists')) {
      throw err;
    }
  }

  await query(`UPDATE expenses SET type = 'expense' WHERE type IS NULL OR type = ''`);
}

async function init() {
  // Try MySQL first, fall back to SQLite on connection errors.
  try {
    mode = 'mysql';
    await initMySQL();
    console.log('DB: connected to MySQL');
  } catch (err) {
    console.warn('DB: MySQL unavailable, falling back to SQLite:', err.message);
    mode = 'sqlite';
    await initSQLite();
    console.log('DB: using SQLite at', path.join(__dirname, 'data', 'expenses.sqlite'));
  }
}

async function query(sql, params) {
  if (mode === 'mysql') {
    return pool.execute(sql, params);
  }

  // sqlite path: normalize parameter markers from ? to ? and execute accordingly
  return new Promise((resolve, reject) => {
    const trimmed = sql.trim().toLowerCase();
    if (trimmed.startsWith('select')) {
      sqliteDb.all(sql, params || [], (err, rows) => {
        if (err) return reject(err);
        resolve([rows]);
      });
    } else if (trimmed.startsWith('insert')) {
      sqliteDb.run(sql, params || [], function (err) {
        if (err) return reject(err);
        resolve([{ insertId: this.lastID }]);
      });
    } else {
      // update, delete, create table, etc.
      sqliteDb.run(sql, params || [], function (err) {
        if (err) return reject(err);
        resolve([{ affectedRows: this.changes }]);
      });
    }
  });
}

module.exports = { init, query };

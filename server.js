const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const db = require('./db');
const { isAuthEnabled, requireAuth, getPublicConfig } = require('./auth');

// #region agent log
const DEBUG_LOG = path.join(__dirname, '.cursor', 'debug-329b86.log');
function agentLog(location, message, data, hypothesisId) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(
      DEBUG_LOG,
      `${JSON.stringify({ sessionId: '329b86', location, message, data, timestamp: Date.now(), hypothesisId })}\n`
    );
  } catch (_) {}
}
// #endregion

const app = express();
const PORT = process.env.PORT || 3000;
let initialized = false;

async function initApp() {
  if (!initialized) {
    await db.init();
    initialized = true;
  }
}

async function adoptLegacyExpensesForUser(userId) {
  // Pre-auth rows used empty user_id; reclaim any non-UUID placeholder owners for this account.
  await db.query(
    `UPDATE expenses SET user_id = ?
     WHERE user_id = '' OR user_id IS NULL
        OR (user_id != ? AND LENGTH(COALESCE(user_id, '')) < 36)`,
    [userId, userId]
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, authEnabled: isAuthEnabled() });
});

app.get('/api/config', (req, res) => {
  res.json(getPublicConfig());
});

app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    await adoptLegacyExpensesForUser(req.user.id);
    const [rows] = await db.query(
      'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC',
      [req.user.id]
    );
    // #region agent log
    agentLog('server.js:GET/expenses', 'expenses listed', { userId: req.user.id, count: rows.length, sampleTypes: rows.slice(0, 3).map((r) => ({ id: r.id, type: r.type, amount: r.amount, date: r.date, user_id: r.user_id })) }, 'C');
    // #endregion
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load expenses' });
  }
});

app.get('/api/summary', requireAuth, async (req, res) => {
  try {
    await adoptLegacyExpensesForUser(req.user.id);
    const [summaryRows] = await db.query(
      `SELECT
        SUM(CASE WHEN COALESCE(type, 'expense') = 'income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN COALESCE(type, 'expense') = 'expense' THEN amount ELSE 0 END) AS expense
      FROM expenses WHERE user_id = ?`,
      [req.user.id]
    );

    const summary = summaryRows[0] || {};
    const income = Number(summary.income || 0);
    const expense = Number(summary.expense || 0);
  // #region agent log
    agentLog('server.js:GET/summary', 'summary computed', { userId: req.user.id, income, expense, total: income - expense }, 'D');
    // #endregion
    res.json({
      income,
      expense,
      total: income - expense
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to calculate summary' });
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  const { description, amount, category, date, type } = req.body;
  if (!description || !amount || !category || !date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const entryType = type === 'income' ? 'income' : 'expense';

  try {
    const [result] = await db.query(
      'INSERT INTO expenses (description, amount, category, type, user_id, date) VALUES (?, ?, ?, ?, ?, ?)',
      [description.trim(), Number(amount), category, entryType, req.user.id, date]
    );
    const [rows] = await db.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [
      result.insertId,
      req.user.id
    ]);
    // #region agent log
    agentLog('server.js:POST/expenses', 'expense inserted', { userId: req.user.id, insertId: result.insertId, entryType, payload: { amount: Number(amount), date, type: entryType }, saved: rows[0] || null }, 'A');
    // #endregion
    res.status(201).json(rows[0]);
  } catch (error) {
    // #region agent log
    agentLog('server.js:POST/expenses', 'insert failed', { userId: req.user.id, error: String(error.message || error) }, 'A');
    // #endregion
    console.error(error);
    res.status(500).json({ error: 'Unable to save expense' });
  }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to delete expense' });
  }
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

function isAppResponding(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function start() {
  if (!isAuthEnabled()) {
    console.warn(
      'WARNING: SUPABASE_URL and SUPABASE_ANON_KEY are not set. Auth will not work until you configure .env'
    );
  }

  try {
    await initApp();

    const server = app.listen(PORT, () => {
      console.log(`Expense tracker running on http://localhost:${PORT}`);
      console.log(`Sign in at http://localhost:${PORT}/login.html`);
    });

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        const alreadyRunning = await isAppResponding(PORT);
        if (alreadyRunning) {
          console.log(`Expense tracker is already running on http://localhost:${PORT}`);
          process.exit(0);
        }
        console.error(
          `Port ${PORT} is already in use by another program.\n` +
            `  Stop it:  npx --yes kill-port ${PORT}\n` +
            `  Or use:   set PORT=3001 && npm start`
        );
        process.exit(1);
      }
      console.error('Server startup failed:', err);
      process.exit(1);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, initApp };

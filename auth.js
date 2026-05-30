require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabase = null;
if (authEnabled) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function isAuthEnabled() {
  return authEnabled;
}

async function requireAuth(req, res, next) {
  if (!authEnabled) {
    return res.status(503).json({
      error: 'Authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env'
    });
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please sign in to continue' });
  }

  const token = header.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  req.user = data.user;
  next();
}

module.exports = {
  isAuthEnabled,
  requireAuth,
  getPublicConfig: () => ({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    authEnabled
  })
};

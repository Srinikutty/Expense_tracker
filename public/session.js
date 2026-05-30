let supabaseClient = null;

async function initSupabase() {
  if (supabaseClient) return supabaseClient;

  const res = await fetch('/api/config');
  const config = await res.json().catch(() => ({}));
  if (!res.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(config.error || 'Server auth configuration is invalid. Restart the app after fixing .env');
  }

  if (!config.authEnabled) {
    window.location.href = '/login.html';
    throw new Error('Auth not configured');
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
}

async function getSession() {
  const sb = await initSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) console.error(error);
  return data.session;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

async function authFetch(url, options = {}) {
  const session = await requireAuth();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${session.access_token}`
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const sb = await initSupabase();
    await sb.auth.signOut();
    window.location.href = '/login.html';
    throw new Error('Session expired');
  }

  return response;
}

async function logout() {
  const sb = await initSupabase();
  await sb.auth.signOut();
  window.location.href = '/login.html';
}

function setActiveNavLink() {
  const path = window.location.pathname;
  const isProfile = path.includes('profile');
  document.querySelectorAll('.nav-link[data-nav]').forEach((link) => {
    const nav = link.getAttribute('data-nav');
    const active =
      (nav === 'profile' && isProfile) || (nav === 'dashboard' && !isProfile);
    link.classList.toggle('active', active);
  });
}

function setupNavbar() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.replaceWith(logoutBtn.cloneNode(true));
    document.getElementById('logout-btn').addEventListener('click', logout);
  }

  setActiveNavLink();

  const toggle = document.getElementById('navbar-toggle');
  const menu = document.getElementById('navbar-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
}

async function setupAuthUI() {
  const session = await requireAuth();
  if (!session) return null;

  setupNavbar();
  return session;
}

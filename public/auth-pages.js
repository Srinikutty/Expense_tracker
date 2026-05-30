let supabaseClient = null;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const res = await fetch('/api/config');
  const config = await res.json();

  if (!config.authEnabled) {
    throw new Error(
      'Supabase is not configured on the server. Add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file.'
    );
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
}

function showError(message) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
}

function hideError() {
  const el = document.getElementById('auth-error');
  if (el) el.classList.remove('visible');
}

function showSuccess(message) {
  const el = document.getElementById('auth-success');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
}

async function redirectIfLoggedIn() {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    if (data.session) {
      window.location.href = '/';
    }
  } catch {
    /* config missing — stay on auth page */
  }
}

async function initAuthPage(mode) {
  await redirectIfLoggedIn();

  const form = document.getElementById(mode === 'login' ? 'login-form' : 'register-form');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const email = form.email.value.trim();
    const password = form.password.value;

    if (mode === 'register') {
      const confirm = form['confirm-password'].value;
      if (password !== confirm) {
        showError('Passwords do not match.');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';

    try {
      const sb = await getSupabase();

      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/';
        return;
      }

      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        window.location.href = '/';
        return;
      }

      showSuccess('Account created! Check your email to confirm, then sign in.');
      form.reset();
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    }
  });
}

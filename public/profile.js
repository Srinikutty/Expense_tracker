const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function showFeedback(el, message, type) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('success', 'error');
  if (message && type) el.classList.add(type);
}

function getInitials(user) {
  const meta = user.user_metadata || {};
  const fromName = meta.full_name || meta.name;
  if (fromName) {
    const parts = String(fromName).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user.email || '';
  const local = email.split('@')[0] || '?';
  return local.slice(0, 2).toUpperCase();
}

function setAvatarDisplay(user) {
  const url = user.user_metadata?.avatar_url;
  const img = document.getElementById('profile-avatar-img');
  const initials = document.getElementById('profile-avatar-initials');
  const removeBtn = document.getElementById('avatar-remove-btn');

  if (url) {
    img.src = url;
    img.hidden = false;
    initials.hidden = true;
    removeBtn.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    initials.hidden = false;
    initials.textContent = getInitials(user);
    removeBtn.hidden = true;
  }
}

function resizeImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.onerror = () => reject(new Error('Could not read image.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

async function updateAvatarMetadata(avatarUrl) {
  const sb = await initSupabase();
  const { data, error } = await sb.auth.updateUser({
    data: { avatar_url: avatarUrl || '' }
  });
  if (error) throw error;
  return data.user;
}

function setupAvatarUpload(user) {
  const input = document.getElementById('avatar-input');
  const uploadBtn = document.getElementById('avatar-upload-btn');
  const removeBtn = document.getElementById('avatar-remove-btn');
  const messageEl = document.getElementById('avatar-message');

  uploadBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    showFeedback(messageEl, '', null);

    if (file.size > MAX_AVATAR_BYTES) {
      showFeedback(messageEl, 'Image must be 2 MB or smaller.', 'error');
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';

    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const updated = await updateAvatarMetadata(dataUrl);
      setAvatarDisplay(updated);
      showFeedback(messageEl, 'Profile photo updated.', 'success');
    } catch (err) {
      showFeedback(messageEl, err.message || 'Failed to upload photo.', 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload photo';
    }
  });

  removeBtn.addEventListener('click', async () => {
    showFeedback(messageEl, '', null);
    removeBtn.disabled = true;
    uploadBtn.disabled = true;

    try {
      const updated = await updateAvatarMetadata('');
      setAvatarDisplay(updated);
      showFeedback(messageEl, 'Profile photo removed.', 'success');
    } catch (err) {
      showFeedback(messageEl, err.message || 'Failed to remove photo.', 'error');
    } finally {
      removeBtn.disabled = false;
      uploadBtn.disabled = false;
    }
  });

  setAvatarDisplay(user);
}

function setupCopyUserId(user) {
  const copyBtn = document.getElementById('copy-id-btn');
  const messageEl = document.getElementById('copy-id-message');

  copyBtn.addEventListener('click', async () => {
    const id = user.id;
    if (!id) return;

    try {
      await navigator.clipboard.writeText(id);
      showFeedback(messageEl, 'User ID copied.', 'success');
    } catch {
      showFeedback(messageEl, 'Could not copy. Select the ID and copy manually.', 'error');
    }
  });
}

function setupPasswordForm() {
  const form = document.getElementById('password-form');
  const messageEl = document.getElementById('password-message');
  const submitBtn = document.getElementById('password-submit-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(messageEl, '', null);

    const newPassword = form['new-password'].value;
    const confirmPassword = form['confirm-password'].value;

    if (newPassword.length < 6) {
      showFeedback(messageEl, 'Password must be at least 6 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showFeedback(messageEl, 'Passwords do not match.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';

    try {
      const sb = await initSupabase();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      form.reset();
      showFeedback(messageEl, 'Password updated successfully.', 'success');
    } catch (err) {
      showFeedback(messageEl, err.message || 'Failed to update password.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update password';
    }
  });
}

async function loadProfile() {
  const session = await setupAuthUI();
  if (!session) return;

  const user = session.user;
  document.getElementById('profile-email').textContent = user.email || '—';
  document.getElementById('profile-id').textContent = user.id || '—';

  setupAvatarUpload(user);
  setupCopyUserId(user);
  setupPasswordForm();
}

loadProfile().catch(console.error);

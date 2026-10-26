document.addEventListener('DOMContentLoaded', async () => {
  const currentPage = document.body.dataset.authPage;
  const protectedPage = document.body.hasAttribute('data-protected');
  const message = document.querySelector('[data-message]');
  const passwordToggle = document.querySelector('[data-password-toggle]');
  const passwordInput = document.querySelector('#password');
  const oauthButtons = [...document.querySelectorAll('[data-oauth-provider]')];
  const oauthErrors = {
    google_unavailable: 'Google sign-in is not configured on the server yet.',
    google_failed: 'Google sign-in could not be completed. Please try again.',
    google_email_unverified: 'Google did not provide a verified email address.',
  };
  let user = null;

  const query = new URLSearchParams(window.location.search);
  const oauthError = query.get('oauth_error');
  if (oauthError) {
    showMessage(message, oauthErrors[oauthError] || 'Social sign-in could not be completed.');
    query.delete('oauth_error');
    const queryString = query.toString();
    window.history.replaceState({}, document.title, `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`);
  }

  oauthButtons.forEach((button) => {
    button.addEventListener('click', () => {
      window.location.assign(`${API_BASE}/auth/${button.dataset.oauthProvider}`);
    });
  });

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const showPassword = passwordInput.type === 'password';
      passwordInput.type = showPassword ? 'text' : 'password';
      passwordToggle.setAttribute('aria-pressed', String(showPassword));
      passwordToggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
      passwordToggle.textContent = showPassword ? 'Hide' : 'Show';
    });
  }

  try {
    const session = await apiRequest('/auth/me');
    user = session.user;
    oauthButtons.forEach((button) => {
      if (button.dataset.oauthProvider === 'google' && !session.google_sign_in_available) {
        button.disabled = true;
        button.textContent = 'Google sign-in unavailable';
        button.title = 'Google sign-in is not configured on the server.';
      }
    });
  } catch (error) {
    if (protectedPage) window.location.replace('login.html');
    return;
  }

  if (protectedPage && !user) {
    window.location.replace('login.html');
    return;
  }
  if (user && currentPage) {
    window.location.replace('dashboard.html');
    return;
  }

  if (user) {
    document.querySelectorAll('[data-user-name]').forEach((node) => { node.textContent = user.name; });
    document.querySelectorAll('[data-avatar]').forEach((node) => { node.textContent = user.name.slice(0, 1).toUpperCase(); });
  }

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      try { await apiRequest('/auth/logout', { method: 'POST' }); } finally { window.location.replace('login.html'); }
    });
  });

  const form = document.querySelector('[data-auth-form]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(message);
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await apiRequest(currentPage === 'signup' ? '/auth/signup' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      window.location.replace('dashboard.html');
    } catch (error) {
      showMessage(message, error.message);
      submitButton.disabled = false;
    }
  });
});
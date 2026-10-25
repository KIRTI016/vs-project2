const API_BASE = (typeof window !== 'undefined' && window.LEDGERLY_API_BASE_URL
  ? window.LEDGERLY_API_BASE_URL
  : 'http://127.0.0.1:5000/api').replace(/\/+$/, '');

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function showMessage(element, message) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('d-none');
}

function hideMessage(element) {
  if (element) element.classList.add('d-none');
}
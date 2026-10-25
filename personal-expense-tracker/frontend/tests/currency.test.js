const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');
const context = {};
vm.runInNewContext(apiSource, context);

test('formats monetary values in Indian rupees with Indian digit grouping', () => {
  assert.equal(context.formatMoney(1234567.89), '₹12,34,567.89');
});

test('formats zero and negative monetary values in rupees', () => {
  assert.equal(context.formatMoney(0), '₹0.00');
  assert.equal(context.formatMoney(-1200.5), '-₹1,200.50');
});

test('uses the configured API base URL and removes trailing slashes', async () => {
  let requestedUrl;
  const configuredContext = {
    window: { LEDGERLY_API_BASE_URL: 'https://ledgerly-api.example.com/api/' },
    fetch: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ status: 'ok' }) };
    },
  };
  vm.runInNewContext(apiSource, configuredContext);

  await configuredContext.apiRequest('/health');

  assert.equal(requestedUrl, 'https://ledgerly-api.example.com/api/health');
});

test('loads API configuration before api.js on every frontend page', () => {
  const frontendDirectory = path.join(__dirname, '..');
  const pages = fs.readdirSync(frontendDirectory).filter((file) => file.endsWith('.html'));

  for (const page of pages) {
    const html = fs.readFileSync(path.join(frontendDirectory, page), 'utf8');
    const apiScriptIndex = html.indexOf('js/api.js');
    if (apiScriptIndex === -1) continue;

    const configScriptIndex = html.indexOf('js/config.js');
    assert.notEqual(configScriptIndex, -1, `${page} must load js/config.js`);
    assert.ok(configScriptIndex < apiScriptIndex, `${page} must load config before api.js`);
  }
});

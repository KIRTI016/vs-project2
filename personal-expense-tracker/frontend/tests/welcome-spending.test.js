const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(frontendRoot, 'js', 'api.js'), 'utf8');
const welcomeSource = fs.readFileSync(path.join(frontendRoot, 'js', 'welcome-spending.js'), 'utf8');
const welcomeHtml = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');

class FakeNode {
  constructor() {
    this.textContent = '';
    this.children = [];
    this.attributes = {};
    this.classes = new Set();
    this.style = { properties: {}, setProperty: (key, value) => { this.style.properties[key] = value; } };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    };
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

async function renderWelcome(responses) {
  const selectors = [
    '[data-spending-total]',
    '[data-spending-caption]',
    '[data-spending-status]',
    '[data-spending-chart]',
    '[data-entry-actions]',
  ];
  const nodes = new Map(selectors.map((selector) => [selector, new FakeNode()]));
  let onReady;
  let requestIndex = 0;
  const document = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') onReady = callback;
    },
    querySelector: (selector) => nodes.get(selector),
    createElement: () => new FakeNode(),
  };
  const context = vm.createContext({
    document,
    Intl,
    Date,
    Number,
    Set,
    Math,
  });
  vm.runInContext(apiSource, context);
  context.apiRequest = async (requestPath) => {
    const response = responses[requestIndex];
    requestIndex += 1;
    assert.equal(requestPath, requestIndex === 1 ? '/auth/me' : '/dashboard/spending-history');
    if (response instanceof Error) throw response;
    return response;
  };
  vm.runInContext(welcomeSource, context);
  await onReady();
  return { nodes, requestIndex, context };
}

function monthRecord(month, total, expense_count = total > 0 ? 1 : 0) {
  return { month, total, expense_count };
}

function historyResponse() {
  const months = [
    monthRecord('2026-04', 100),
    monthRecord('2026-05', 0, 0),
    monthRecord('2026-06', 200),
    monthRecord('2026-07', 50),
    monthRecord('2026-08', 300),
    monthRecord('2026-09', 75),
    monthRecord('2026-10', 125),
  ];
  return {
    current_month: months[6],
    months,
  };
}

test('welcome page has no hardcoded spending or decorative fake bars', () => {
  assert.doesNotMatch(welcomeHtml, /₹2,840|height:\s*\d+%/);
});

test('renders the authenticated monthly total and database-derived month bars', async () => {
  const { nodes, requestIndex, context } = await renderWelcome([
    { user: { id: 1 } },
    historyResponse(),
  ]);
  const chart = nodes.get('[data-spending-chart]');

  assert.equal(requestIndex, 2);
  assert.equal(nodes.get('[data-spending-total]').textContent, context.formatMoney(125));
  assert.equal(nodes.get('[data-spending-status]').textContent, 'Based on your expenses over the last seven months.');
  assert.equal(chart.children.length, 7);
  assert.equal(chart.children[0].children[0].style.properties['--spending-scale'], '0.3333333333333333');
  assert.match(chart.attributes['aria-label'], /₹/);
  assert.equal(nodes.get('[data-entry-actions]').children[0].textContent, 'Open your dashboard');
});

test('shows zero and an empty state without drawing bars for a new user', async () => {
  const months = Array.from({ length: 7 }, (_, index) => monthRecord(`2026-${String(index + 4).padStart(2, '0')}`, 0, 0));
  const { nodes, requestIndex, context } = await renderWelcome([
    { user: { id: 1 } },
    { current_month: months[6], months },
  ]);

  assert.equal(requestIndex, 2);
  assert.equal(nodes.get('[data-spending-total]').textContent, context.formatMoney(0));
  assert.equal(nodes.get('[data-spending-status]').textContent, 'Your spending insights will appear here once you add expenses.');
  assert.equal(nodes.get('[data-spending-chart]').children.length, 0);
});

test('does not request financial data or show amounts when the visitor is signed out', async () => {
  const { nodes, requestIndex } = await renderWelcome([{ user: null }]);

  assert.equal(requestIndex, 1);
  assert.equal(nodes.get('[data-spending-total]').textContent, '—');
  assert.match(nodes.get('[data-spending-status]').textContent, /Sign in/);
  assert.equal(nodes.get('[data-spending-chart]').children.length, 0);
});

test('shows an unavailable state rather than fabricated totals when the API fails', async () => {
  const { nodes, requestIndex } = await renderWelcome([
    { user: { id: 1 } },
    new Error('network unavailable'),
  ]);

  assert.equal(requestIndex, 2);
  assert.equal(nodes.get('[data-spending-total]').textContent, 'Unavailable');
  assert.match(nodes.get('[data-spending-status]').textContent, /unavailable/);
  assert.equal(nodes.get('[data-spending-chart]').children.length, 0);
});

test('rejects malformed API data and leaves the chart empty', async () => {
  const { nodes } = await renderWelcome([
    { user: { id: 1 } },
    { current_month: monthRecord('2026-10', 999), months: [] },
  ]);

  assert.equal(nodes.get('[data-spending-total]').textContent, 'Unavailable');
  assert.equal(nodes.get('[data-spending-chart]').children.length, 0);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(frontendRoot, 'js', 'api.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(frontendRoot, 'js', 'insights.js'), 'utf8');

class FakeNode {
  constructor() {
    this.textContent = '';
    this.children = [];
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        if (force ?? !this.classes.has(name)) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains: (name) => this.classes.has(name),
    };
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }
}

async function runInsights(data) {
  const nodes = new Map();
  let onReady;
  const document = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') onReady = callback;
    },
    querySelector: (selector) => {
      if (!nodes.has(selector)) {
        const node = new FakeNode();
        if (selector.includes('data-insights-error')
          || selector.includes('data-insights-empty')
          || selector.includes('data-insights-table-wrap')) {
          node.classList.add('d-none');
        }
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    createElement: () => new FakeNode(),
  };
  const context = vm.createContext({
    document,
    showMessage: (node, message) => {
      node.textContent = message;
      node.classList.remove('d-none');
    },
  });

  vm.runInContext(apiSource, context);
  context.apiRequest = async (requestPath) => {
    assert.equal(requestPath, '/insights');
    return data;
  };
  vm.runInContext(insightsSource, context);
  await onReady();
  return { context, nodes };
}

test('renders real spending totals and category comparison in rupees', async () => {
  const { context, nodes } = await runInsights({
    current_month: {
      start: '2026-10-01',
      end: '2026-10-25',
      total: 150,
      expense_count: 1,
    },
    previous_month: {
      start: '2026-09-01',
      end: '2026-09-25',
      total: 100,
      expense_count: 1,
    },
    comparison_available: true,
    categories: [{
      category: '<Food>',
      current_amount: 150,
      previous_amount: 100,
      change_amount: 50,
      change_percent: 50,
    }],
  });

  assert.equal(nodes.get('[data-insights-total]').textContent, context.formatMoney(150));
  assert.match(nodes.get('[data-insights-period]').textContent, /1 Oct 2026/);
  assert.match(nodes.get('[data-insights-period]').textContent, /25 Sept 2026/);
  assert.match(nodes.get('[data-insights-comparison]').textContent, /₹150\.00/);
  assert.equal(nodes.get('[data-insights-categories]').children[0].children[0].textContent, '<Food>');
  assert.match(nodes.get('[data-insights-categories]').children[0].children[3].textContent, /Higher by ₹50\.00 \(50%\)/);
  assert.equal(nodes.get('[data-insights-table-wrap]').classList.contains('d-none'), false);
});

test('shows a clear empty state when there are no saved expenses', async () => {
  const { nodes } = await runInsights({
    current_month: {
      start: '2026-10-01',
      end: '2026-10-25',
      total: 0,
      expense_count: 0,
    },
    previous_month: {
      start: '2026-09-01',
      end: '2026-09-25',
      total: null,
      expense_count: 0,
    },
    comparison_available: false,
    categories: [],
  });

  assert.match(nodes.get('[data-insights-comparison]').textContent, /comparison is not available yet/);
  assert.match(nodes.get('[data-insights-empty]').textContent, /No expenses are recorded/);
  assert.equal(nodes.get('[data-insights-empty]').classList.contains('d-none'), false);
  assert.equal(nodes.get('[data-insights-table-wrap]').classList.contains('d-none'), true);
});

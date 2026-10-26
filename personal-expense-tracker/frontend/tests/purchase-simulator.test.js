const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'purchase-simulator.js'),
  'utf8',
);

class FakeNode {
  constructor() {
    this.textContent = '';
    this.children = [];
    this.classes = new Set();
    this.listeners = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  reportValidity() {
    return true;
  }
}

async function runSimulator(response, fields = {
  name: 'Headphones',
  amount: '150',
  category: 'Food',
}) {
  const nodes = new Map();
  let onReady;
  const requests = [];
  const document = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') onReady = callback;
    },
    querySelector: (selector) => {
      if (!nodes.has(selector)) {
        const node = new FakeNode();
        if (selector === '[data-purchase-result]' || selector === '[data-purchase-error]') {
          node.classList.add('d-none');
        }
        if (selector === '#budget-month') node.value = '2026-10';
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    createElement: () => new FakeNode(),
  };
  const context = vm.createContext({
    document,
    FormData: class {
      entries() {
        return Object.entries(fields);
      }
    },
    apiRequest: async (requestPath, options) => {
      requests.push({ requestPath, options });
      if (response instanceof Error) throw response;
      return response;
    },
    formatMoney: (amount) => new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(Number(amount) || 0),
    hideMessage: (node) => node.classList.add('d-none'),
    showMessage: (node, message) => {
      node.textContent = message;
      node.classList.remove('d-none');
    },
  });
  vm.runInContext(source, context);
  await onReady();
  const form = nodes.get('[data-purchase-form]');
  await form.listeners.submit({ preventDefault() {} });
  return { nodes, requests };
}

function textContent(node) {
  return [node.textContent, ...node.children.map(textContent)].join(' ');
}

test('submits a read-only simulation and renders category and overall impact', async () => {
  const { nodes, requests } = await runSimulator({
    purchase_name: 'Headphones',
    purchase_amount: 150,
    category: 'Food',
    category_impact: {
      budget: 200,
      spent_before: 70,
      remaining_before: 130,
      remaining_after: -20,
      would_exceed: true,
    },
    overall_impact: {
      budget: 500,
      spent_before: 180,
      remaining_before: 320,
      remaining_after: 170,
      would_exceed: false,
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].requestPath, '/budgets/simulate');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: 'Headphones',
    amount: 150,
    category: 'Food',
    month: '2026-10',
  });
  assert.equal(requests.some(({ requestPath }) => requestPath.startsWith('/expenses')), false);
  assert.equal(nodes.get('[data-purchase-result]').classList.contains('d-none'), false);
  assert.match(textContent(nodes.get('[data-purchase-result]')), /₹200\.00/);
  assert.match(textContent(nodes.get('[data-purchase-result]')), /₹70\.00/);
  assert.match(textContent(nodes.get('[data-purchase-result]')), /-₹20\.00/);
  assert.match(textContent(nodes.get('[data-purchase-result]')), /would exceed the budget/);
  assert.match(textContent(nodes.get('[data-purchase-result]')), /Overall monthly budget/);
});

test('renders missing-budget guidance and an unnamed simulation', async () => {
  const { nodes } = await runSimulator({
    purchase_name: null,
    purchase_amount: 20,
    category: 'Food',
    category_impact: {
      budget: null,
      spent_before: 10,
      remaining_before: null,
      remaining_after: null,
      would_exceed: null,
    },
    overall_impact: null,
  }, {
    name: '',
    amount: '20',
    category: 'Food',
  });
  const result = textContent(nodes.get('[data-purchase-result]'));

  assert.match(result, /Estimated budget impact/);
  assert.match(result, /No budget set/);
  assert.match(result, /Set a budget to check/);
  assert.match(result, /No overall monthly budget is set/);
});

test('shows server validation errors without showing a result', async () => {
  const { nodes, requests } = await runSimulator(new Error('Choose a valid purchase category'));

  assert.equal(requests[0].requestPath, '/budgets/simulate');
  assert.equal(nodes.get('[data-purchase-error]').textContent, 'Choose a valid purchase category');
  assert.equal(nodes.get('[data-purchase-error]').classList.contains('d-none'), false);
  assert.equal(nodes.get('[data-purchase-result]').classList.contains('d-none'), true);
});

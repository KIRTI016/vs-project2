const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendRoot, 'js', 'recurring.js'), 'utf8');

class FakeNode {
  constructor() {
    this.textContent = '';
    this.children = [];
    this.classes = new Set();
    this.listeners = {};
    this.dataset = {};
    this.elements = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains: (name) => this.classes.has(name),
    };
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  reset() {}

  reportValidity() {
    return true;
  }

  scrollIntoView() {}

  setAttribute() {}
}

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const result = findNode(child, predicate);
    if (result) return result;
  }
  return null;
}

async function setupRecurring(failMutation = false) {
  const nodes = new Map();
  let onReady;
  const calls = [];
  let items = [];
  const document = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') onReady = callback;
    },
    querySelector: (selector) => {
      if (!nodes.has(selector)) {
        const node = new FakeNode();
        if (selector.includes('error') || selector === '[data-empty-recurring]' || selector === '[data-cancel-recurring-edit]') {
          node.classList.add('d-none');
        }
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    createElement: () => new FakeNode(),
  };
  const form = document.querySelector('[data-recurring-form]');
  for (const [key, value] of Object.entries({
    name: '',
    amount: '',
    category: '',
    frequency: '',
    start_date: '',
    next_due_date: '',
    notes: '',
    is_active: true,
  })) {
    form.elements[key] = { value, checked: value === true };
  }
  const responseFor = async (requestPath, options) => {
    calls.push({ requestPath, options });
    if (failMutation && options && options.method === 'POST') {
      throw new Error('Name must be between 1 and 100 characters');
    }
    if (requestPath === '/recurring' && !options) {
      return {
        recurring_expenses: items,
        summary: { monthly_estimate: 100, upcoming_count: 1, upcoming_total: 100 },
      };
    }
    if (requestPath === '/recurring' && options.method === 'POST') {
      const created = { ...JSON.parse(options.body), id: 7 };
      items = [created];
      return { recurring_expense: created };
    }
    if (requestPath === '/recurring/7' && options.method === 'PUT') {
      const updated = { ...JSON.parse(options.body), id: 7 };
      items = [updated];
      return { recurring_expense: updated };
    }
    if (requestPath === '/recurring/7' && options.method === 'DELETE') {
      items = [];
      return { message: 'Recurring payment deleted' };
    }
    throw new Error('Unexpected request');
  };
  const context = vm.createContext({
    document,
    window: { confirm: () => true },
    FormData: class {
      constructor(targetForm) {
        this.targetForm = targetForm;
      }

      entries() {
        return Object.entries(this.targetForm.elements)
          .filter(([key]) => key !== 'is_active')
          .map(([key, control]) => [key, control.value]);
      }
    },
    apiRequest: responseFor,
    formatMoney: (amount) => `₹${Number(amount).toFixed(2)}`,
    localDateString: () => '2026-10-26',
    hideMessage: (node) => node.classList.add('d-none'),
    showMessage: (node, message) => {
      node.textContent = message;
      node.classList.remove('d-none');
    },
  });
  vm.runInContext(source, context);
  await onReady();
  return { nodes, calls, form, items: () => items };
}

test('creates, edits, and deletes recurring schedules without calling expenses API', async () => {
  const { nodes, calls, form, items } = await setupRecurring();
  Object.assign(form.elements.name, { value: 'Streaming plan' });
  Object.assign(form.elements.amount, { value: '100' });
  Object.assign(form.elements.category, { value: 'Entertainment' });
  Object.assign(form.elements.frequency, { value: 'monthly' });
  Object.assign(form.elements.start_date, { value: '2026-10-26' });
  Object.assign(form.elements.next_due_date, { value: '2026-10-26' });
  Object.assign(form.elements.notes, { value: 'Family plan' });

  await form.listeners.submit({ preventDefault() {} });

  const postCall = calls.find((call) => call.options && call.options.method === 'POST');
  assert.equal(postCall.requestPath, '/recurring');
  assert.deepEqual(JSON.parse(postCall.options.body), {
    name: 'Streaming plan',
    amount: 100,
    category: 'Entertainment',
    frequency: 'monthly',
    start_date: '2026-10-26',
    next_due_date: '2026-10-26',
    notes: 'Family plan',
    is_active: true,
  });
  assert.equal(items().length, 1);
  assert.equal(nodes.get('[data-monthly-estimate]').textContent, '₹100.00');
  assert.equal(nodes.get('[data-upcoming-count]').textContent, '1 upcoming payment');

  const editButton = findNode(nodes.get('[data-recurring-list]'), (node) => node.dataset.editRecurring === '7');
  await nodes.get('[data-recurring-list]').listeners.click({
    target: { closest: (selector) => selector === '[data-edit-recurring]' ? editButton : null },
  });
  assert.equal(form.elements.name.value, 'Streaming plan');
  form.elements.name.value = 'Updated plan';
  form.elements.is_active.checked = false;
  await form.listeners.submit({ preventDefault() {} });

  const putCall = calls.find((call) => call.options && call.options.method === 'PUT');
  assert.equal(putCall.requestPath, '/recurring/7');
  assert.equal(JSON.parse(putCall.options.body).name, 'Updated plan');
  assert.equal(JSON.parse(putCall.options.body).is_active, false);

  const deleteButton = findNode(nodes.get('[data-recurring-list]'), (node) => node.dataset.deleteRecurring === '7');
  await nodes.get('[data-recurring-list]').listeners.click({
    target: { closest: (selector) => selector === '[data-delete-recurring]' ? deleteButton : null },
  });
  assert.ok(calls.some((call) => call.requestPath === '/recurring/7' && call.options.method === 'DELETE'));
  assert.equal(items().length, 0);
  assert.equal(calls.some((call) => call.requestPath.startsWith('/expenses')), false);
});

test('shows API errors for recurring schedules', async () => {
  const { nodes, form } = await setupRecurring(true);
  form.elements.name.value = 'Plan';
  form.elements.amount.value = '10';
  form.elements.category.value = 'Bills';
  form.elements.frequency.value = 'weekly';
  form.elements.start_date.value = '2026-10-26';
  form.elements.next_due_date.value = '2026-10-26';

  await form.listeners.submit({ preventDefault() {} });

  assert.equal(
    nodes.get('[data-recurring-error]').textContent,
    'Name must be between 1 and 100 characters',
  );
  assert.equal(nodes.get('[data-recurring-error]').classList.contains('d-none'), false);
});

test('recurring page is protected and included in navigation', () => {
  const page = fs.readFileSync(path.join(frontendRoot, 'recurring.html'), 'utf8');
  assert.match(page, /<body data-protected>/);
  assert.match(page, /js\/recurring\.js/);
  for (const name of ['dashboard.html', 'expenses.html', 'budgets.html']) {
    const html = fs.readFileSync(path.join(frontendRoot, name), 'utf8');
    assert.match(html, /href="recurring\.html"/, `${name} should link to recurring schedules`);
  }
});

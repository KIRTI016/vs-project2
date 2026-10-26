const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const books = require(path.join(frontendRoot, 'js', 'money-library-data.js'));
const librarySource = fs.readFileSync(path.join(frontendRoot, 'js', 'library.js'), 'utf8');
const readerSource = fs.readFileSync(path.join(frontendRoot, 'js', 'reader.js'), 'utf8');

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.children = [];
    this.classes = new Set();
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.style = {
      width: '',
      setProperty: (name, value) => { this.style[name] = value; },
    };
    this.hidden = false;
    this.value = '';
    this.href = '';
    this.parentElement = { setAttribute: (name, value) => { this.attributes[name] = value; } };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        if (force === undefined ? !this.classes.has(name) : force) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains: (name) => this.classes.has(name),
    };
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
    });
  }

  prepend(...nodes) {
    nodes.reverse().forEach((node) => {
      node.parentElement = this;
      this.children.unshift(node);
    });
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  querySelector(selector) {
    if (selector === 'span[aria-hidden="true"]') {
      return this.children.find((node) => node.attributes['aria-hidden'] === 'true') || null;
    }
    return null;
  }

  scrollIntoView() {}

  matches() {
    return false;
  }
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function treeText(node) {
  return [node.textContent, ...node.children.map(treeText)].join(' ');
}

function createStorage(initialValue = null, options = {}) {
  let value = initialValue;
  return {
    getItem(key) {
      if (options.failRead) throw new Error('Storage unavailable');
      return value === null ? null : value;
    },
    setItem(key, nextValue) {
      if (options.failWrite) throw new Error('Storage unavailable');
      value = nextValue;
    },
    value: () => value,
  };
}

function bootLibrary(storage = createStorage()) {
  const nodes = new Map();
  const listeners = [];
  const topics = ['All', 'Budgeting', 'Saving', 'Spending', 'Debt', 'Financial Goals', 'Subscriptions']
    .map((topic) => {
      const node = new FakeNode('button');
      node.dataset.topic = topic;
      return node;
    });
  const document = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') listeners.push(callback);
    },
    querySelector: (selector) => {
      if (!nodes.has(selector)) {
        const node = new FakeNode(selector === '#library-search' ? 'input' : 'div');
        if (selector.includes('empty') || selector === '[data-continue-section]') node.classList.add('d-none');
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    querySelectorAll: (selector) => selector === '[data-topic]' ? topics : [],
    createElement: (tagName) => new FakeNode(tagName),
  };
  const window = {
    MONEY_LIBRARY_BOOKS: books,
    MONEY_LIBRARY_RESOURCES: books.resources,
    localStorage: storage,
  };
  const context = vm.createContext({
    window,
    document,
    URLSearchParams,
    encodeURIComponent,
  });
  vm.runInContext(librarySource, context);
  for (const listener of listeners) listener();
  return { window, nodes, topics, storage };
}

function bootReader(storage = createStorage()) {
  const nodes = new Map();
  const listeners = [];
  const documentListeners = {};
  const document = {
    title: 'Reader',
    addEventListener(event, callback) {
      if (event === 'DOMContentLoaded') listeners.push(callback);
      else documentListeners[event] = callback;
    },
    querySelector(selector) {
      if (selector === '[data-library-grid]') return null;
      if (!nodes.has(selector)) {
        const node = new FakeNode();
        if (selector === '[data-reader-glossary]') node.classList.add('d-none');
        if (selector === '[data-toggle-bookmark]') {
          const icon = new FakeNode('span');
          icon.setAttribute('aria-hidden', 'true');
          node.append(icon);
        }
        nodes.set(selector, node);
      }
      return nodes.get(selector);
    },
    createElement: (tagName) => new FakeNode(tagName),
  };
  const window = {
    MONEY_LIBRARY_BOOKS: books,
    MONEY_LIBRARY_RESOURCES: books.resources,
    localStorage: storage,
    location: { search: '?book=art-of-managing-money&chapter=0', pathname: '/reader.html' },
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false }),
    scrollTo() {},
  };
  const context = vm.createContext({ window, document, URLSearchParams, String, Math });
  vm.runInContext(librarySource, context);
  listeners.shift()();
  vm.runInContext(readerSource, context);
  listeners.shift()();
  return { window, nodes, documentListeners, storage };
}

test('contains twelve substantive original chapters with required teaching elements', () => {
  const book = books[0];
  assert.equal(book.title, 'The Art of Managing Money');
  assert.equal(book.chapters.length, 12);
  for (const chapter of book.chapters) {
    const types = chapter.sections.map((section) => section.type);
    const wordCount = chapter.sections.flatMap((section) => [
      section.title,
      section.text,
      ...(section.items || []),
    ]).filter(Boolean).join(' ').trim().split(/\s+/).length;
    assert.ok(wordCount >= 400, `${chapter.title} has only ${wordCount} words`);
    assert.ok(types.includes('p'), `${chapter.title} needs substantive prose`);
    assert.ok(types.includes('h'), `${chapter.title} needs section headings`);
    assert.ok(types.includes('example'), `${chapter.title} needs a practical example`);
    assert.ok(types.includes('takeaways'), `${chapter.title} needs key takeaways`);
    assert.ok(types.includes('questions'), `${chapter.title} needs reflection questions`);
  }
  assert.ok(book.glossary.length >= 8);
  assert.match(book.disclaimer, /general financial education/);
});

test('search and topic filters find relevant chapters and show useful empty state', () => {
  const { nodes, topics } = bootLibrary();
  assert.equal(nodes.get('[data-library-grid]').children.length, 7);
  assert.match(nodes.get('[data-library-count]').textContent, /7 reads/);

  topics.find((node) => node.dataset.topic === 'Debt').listeners.click();
  assert.match(nodes.get('[data-library-grid]').children[0].children[1].children[0].textContent, /Debt/);
  const cardLinks = descendants(nodes.get('[data-library-grid]')).filter((node) => node.tagName === 'A');
  assert.ok(cardLinks.every((link) => link.href.includes('chapter=6')));

  topics.find((node) => node.dataset.topic === 'Saving').listeners.click();
  nodes.get('#library-search').value = 'emergency';
  nodes.get('#library-search').listeners.input();
  assert.equal(nodes.get('[data-library-grid]').children.length, 2);
  assert.match(nodes.get('[data-library-grid]').children[0].children[1].children[0].textContent, /Saving/);

  nodes.get('#library-search').value = 'no matching title';
  nodes.get('#library-search').listeners.input();
  assert.equal(nodes.get('[data-library-grid]').children.length, 0);
  assert.equal(nodes.get('[data-library-empty]').classList.contains('d-none'), false);
  nodes.get('[data-clear-library-filters]').listeners.click();
  assert.equal(nodes.get('[data-library-grid]').children.length, 7);
});

test('bookmarks filter and continue-reading card use validated reading state', () => {
  const seeded = {
    version: 1,
    lastRead: { bookId: books[0].id, chapterIndex: 6 },
    progress: { [books[0].id]: 6 },
    bookmarks: { [books[0].id]: [6] },
    fontSize: 20,
  };
  const storage = createStorage(JSON.stringify(seeded));
  const { nodes, window } = bootLibrary(storage);
  assert.equal(nodes.get('[data-continue-section]').classList.contains('d-none'), false);
  assert.match(nodes.get('[data-continue-chapter]').textContent, /Chapter 7/);
  assert.ok(nodes.get('[data-continue-link]').href.endsWith('chapter=6'));
  nodes.get('[data-bookmarks-filter]').listeners.click();
  assert.equal(nodes.get('[data-library-grid]').children.length, 2);
  nodes.get('[data-bookmarks-filter]').listeners.click();
  assert.equal(nodes.get('[data-library-grid]').children.length, 7);
  assert.equal(window.MoneyLibrary.readState(storage).fontSize, 20);
});

test('stored reading state is validated and malformed or unavailable storage is harmless', () => {
  const { window } = bootLibrary(createStorage());
  const library = window.MoneyLibrary;
  const invalid = library.validateState({
    version: 1,
    lastRead: { bookId: 'unknown', chapterIndex: 999 },
    progress: { [books[0].id]: 900, unknown: 2 },
    bookmarks: { [books[0].id]: [0, 12, -1, '1'] },
    fontSize: 99,
  });
  assert.equal(invalid.lastRead, null);
  assert.deepEqual({ ...invalid.progress }, {});
  assert.deepEqual(Array.from(invalid.bookmarks[books[0].id]), [0]);
  assert.equal(invalid.fontSize, 18);
  assert.equal(library.readState(createStorage('{bad json')).fontSize, 18);
  assert.equal(library.readState(createStorage(null, { failRead: true })).fontSize, 18);
  assert.equal(library.writeState(library.emptyState(), createStorage(null, { failWrite: true })), false);
});

test('reader renders semantic text safely and navigates all chapters in sequence', async () => {
  const storage = createStorage();
  const { nodes } = bootReader(storage);
  const chapterTitle = nodes.get('[data-reader-chapter-title]');
  const toc = nodes.get('[data-reader-toc]');
  const body = nodes.get('[data-reader-body]');
  assert.equal(chapterTitle.textContent, books[0].chapters[0].title);
  assert.ok(body.children.some((node) => node.tagName === 'P'));
  assert.ok(body.children.some((node) => node.tagName === 'H2'));
  assert.ok(body.children.some((node) => node.tagName === 'ASIDE'));
  assert.equal(nodes.get('[data-chapter-progress]').textContent, 'Chapter 1 of 12');
  assert.equal(nodes.get('[data-book-progress]').textContent, '8% through the book');

  const next = nodes.get('[data-next-chapter]');
  for (let index = 1; index < books[0].chapters.length; index += 1) {
    await next.listeners.click();
    assert.equal(chapterTitle.textContent, books[0].chapters[index].title);
    assert.equal(nodes.get('[data-chapter-progress]').textContent, `Chapter ${index + 1} of 12`);
  }
  assert.equal(next.disabled, true);
  assert.equal(nodes.get('[data-previous-chapter]').disabled, false);
  assert.equal(toc.children.length, 12);
  const stored = JSON.parse(storage.value());
  assert.deepEqual(stored.lastRead, { bookId: books[0].id, chapterIndex: 11 });
  assert.equal(stored.progress[books[0].id], 11);

  const hostileText = documentText(body);
  assert.equal(hostileText.includes('<script>'), false);
  nodes.get('[data-previous-chapter]').listeners.click();
  assert.equal(chapterTitle.textContent, books[0].chapters[10].title);
});

function documentText(node) {
  return treeText(node);
}

test('reader supports bookmarks, font controls, glossary, and chapter selection', () => {
  const storage = createStorage();
  const { nodes } = bootReader(storage);
  nodes.get('[data-toggle-bookmark]').listeners.click();
  assert.equal(nodes.get('[data-toggle-bookmark]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(storage.value()).bookmarks[books[0].id], [0]);

  nodes.get('[data-font-increase]').listeners.click();
  assert.equal(nodes.get('[data-font-size-label]').textContent, '19px');
  assert.equal(JSON.parse(storage.value()).fontSize, 19);
  nodes.get('[data-open-glossary]').listeners.click();
  assert.equal(nodes.get('[data-reader-glossary]').classList.contains('d-none'), false);
  assert.ok(nodes.get('[data-glossary-list]').children.length >= 8);

  const toc = nodes.get('[data-reader-toc]');
  const chapterEightButton = toc.children[7].children[0];
  toc.listeners.click({
    target: { closest: () => chapterEightButton },
  });
  assert.equal(nodes.get('[data-reader-chapter-title]').textContent, books[0].chapters[7].title);
});

test('protected library and reader pages use accessible navigation and configure scripts', () => {
  const libraryPage = fs.readFileSync(path.join(frontendRoot, 'library.html'), 'utf8');
  const readerPage = fs.readFileSync(path.join(frontendRoot, 'reader.html'), 'utf8');
  assert.match(libraryPage, /<body data-protected>/);
  assert.match(readerPage, /<body data-protected/);
  assert.match(libraryPage, /<h1>Money Library<\/h1>/);
  assert.match(libraryPage, /aria-label="Filter by topic"/);
  assert.match(readerPage, /aria-label="Book chapters"/);
  assert.match(readerPage, /aria-label="Book reading progress"/);
  assert.match(libraryPage, /js\/config\.js[\s\S]*js\/api\.js/);
  assert.match(readerPage, /js\/money-library-data\.js[\s\S]*js\/reader\.js/);
  for (const pageName of ['dashboard.html', 'expenses.html', 'budgets.html', 'recurring.html']) {
    const page = fs.readFileSync(path.join(frontendRoot, pageName), 'utf8');
    assert.match(page, /href="library\.html"/, `${pageName} should link to Money Library`);
  }
});

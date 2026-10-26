(function (root) {
  const STORAGE_KEY = 'ledgerly-money-library-v1';
  const books = root.MONEY_LIBRARY_BOOKS || [];
  const resources = root.MONEY_LIBRARY_RESOURCES || [];

  const emptyState = () => ({
    version: 1,
    lastRead: null,
    progress: {},
    bookmarks: {},
    fontSize: 18,
  });

  function validChapterIndex(bookId, index) {
    const book = books.find((candidate) => candidate.id === bookId);
    return Number.isInteger(index) && Boolean(book) && index >= 0 && index < book.chapters.length;
  }

  function validateState(value) {
    const clean = emptyState();
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return clean;
    if (Number.isInteger(value.fontSize) && value.fontSize >= 16 && value.fontSize <= 24) {
      clean.fontSize = value.fontSize;
    }
    if (value.progress && typeof value.progress === 'object' && !Array.isArray(value.progress)) {
      for (const [bookId, index] of Object.entries(value.progress)) {
        if (validChapterIndex(bookId, index)) clean.progress[bookId] = index;
      }
    }
    if (value.bookmarks && typeof value.bookmarks === 'object' && !Array.isArray(value.bookmarks)) {
      for (const [bookId, indices] of Object.entries(value.bookmarks)) {
        if (Array.isArray(indices)) {
          const valid = [...new Set(indices.filter((index) => validChapterIndex(bookId, index)))];
          if (valid.length) clean.bookmarks[bookId] = valid;
        }
      }
    }
    if (value.lastRead && typeof value.lastRead === 'object'
      && validChapterIndex(value.lastRead.bookId, value.lastRead.chapterIndex)) {
      clean.lastRead = {
        bookId: value.lastRead.bookId,
        chapterIndex: value.lastRead.chapterIndex,
      };
    }
    return clean;
  }

  function readState(storage) {
    try {
      const target = storage || root.localStorage;
      const stored = target.getItem(STORAGE_KEY);
      return stored ? validateState(JSON.parse(stored)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  function writeState(state, storage) {
    try {
      const target = storage || root.localStorage;
      target.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
      return true;
    } catch {
      return false;
    }
  }

  function isBookmarked(state, bookId, chapterIndex) {
    return Boolean(state.bookmarks[bookId]?.includes(chapterIndex));
  }

  function toggleBookmark(state, bookId, chapterIndex) {
    if (!validChapterIndex(bookId, chapterIndex)) return state;
    const next = validateState(state);
    const current = next.bookmarks[bookId] || [];
    next.bookmarks[bookId] = current.includes(chapterIndex)
      ? current.filter((index) => index !== chapterIndex)
      : [...current, chapterIndex].sort((left, right) => left - right);
    if (!next.bookmarks[bookId].length) delete next.bookmarks[bookId];
    return next;
  }

  function chaptersForTopic(book, topic) {
    const topicMap = {
      Budgeting: [1, 2],
      Saving: [4, 5],
      Spending: [0, 1, 3, 10],
      Debt: [6],
      'Financial Goals': [5, 11],
      Subscriptions: [7],
    };
    return topic === 'All' ? book.chapters.map((_, index) => index) : (topicMap[topic] || []);
  }

  function getReadingState(book) {
    const state = readState();
    const chapterIndex = state.progress[book.id];
    if (validChapterIndex(book.id, chapterIndex)) return { state, chapterIndex };
    return { state, chapterIndex: state.lastRead?.bookId === book.id ? state.lastRead.chapterIndex : null };
  }

  root.MoneyLibrary = {
    STORAGE_KEY,
    emptyState,
    validateState,
    readState,
    writeState,
    isBookmarked,
    toggleBookmark,
    chaptersForTopic,
    validChapterIndex,
    getReadingState,
  };

  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('[data-library-grid]');
    if (!grid) return;
    const search = document.querySelector('#library-search');
    const empty = document.querySelector('[data-library-empty]');
    const count = document.querySelector('[data-library-count]');
    const bookmarksButton = document.querySelector('[data-bookmarks-filter]');
    const continueSection = document.querySelector('[data-continue-section]');
    const continueLink = document.querySelector('[data-continue-link]');
    let selectedTopic = 'All';
    let bookmarksOnly = false;

    const state = readState();
    const book = books[0];
    if (book && state.lastRead && state.lastRead.bookId === book.id
      && validChapterIndex(book.id, state.lastRead.chapterIndex)) {
      const chapterIndex = state.lastRead.chapterIndex;
      const progress = Math.round(((chapterIndex + 1) / book.chapters.length) * 100);
      continueSection.classList.remove('d-none');
      document.querySelector('[data-continue-book]').textContent = book.title;
      document.querySelector('[data-continue-chapter]').textContent =
        `Chapter ${chapterIndex + 1}: ${book.chapters[chapterIndex].title}`;
      document.querySelector('[data-continue-progress]').textContent = `${progress}% through the book`;
      document.querySelector('[data-continue-progress-bar]').style.width = `${progress}%`;
      continueLink.href = `reader.html?book=${encodeURIComponent(book.id)}&chapter=${chapterIndex}`;
    }

    const renderCard = (candidate, sourceBook, chapterIndices) => {
      const chapterIndex = chapterIndices[0];
      const card = document.createElement('article');
      card.className = 'library-book-card';
      const coverLink = document.createElement('a');
      coverLink.className = 'library-card-cover-link';
      coverLink.href = `reader.html?book=${encodeURIComponent(sourceBook.id)}&chapter=${chapterIndex}`;
      coverLink.setAttribute('aria-label', `Read ${candidate.title}`);
      const cover = document.createElement('div');
      cover.className = `book-cover library-card-cover ${candidate.cover}`;
      cover.setAttribute('aria-hidden', 'true');
      const top = document.createElement('span');
      top.className = 'cover-topline';
      top.textContent = 'A LEDGERLY FIELD GUIDE';
      const illustration = document.createElement('span');
      illustration.className = 'cover-illustration';
      const title = document.createElement('span');
      title.className = 'cover-title';
      title.textContent = candidate.title;
      cover.append(top, illustration, title);
      coverLink.append(cover);
      const copy = document.createElement('div');
      copy.className = 'library-card-copy';
      const topic = document.createElement('span');
      topic.className = 'library-topic-label';
      topic.textContent = selectedTopic === 'All' ? candidate.topic : selectedTopic;
      const heading = document.createElement('h3');
      const titleLink = document.createElement('a');
      titleLink.href = coverLink.href;
      titleLink.textContent = candidate.title;
      heading.append(titleLink);
      const description = document.createElement('p');
      description.textContent = candidate.description;
      const metadata = document.createElement('div');
      metadata.className = 'library-book-metadata';
      const chapterCount = document.createElement('span');
      chapterCount.textContent = `${chapterIndices.length} ${chapterIndices.length === 1 ? 'chapter' : 'chapters'}`;
      const readingTime = document.createElement('span');
      const wordCount = chapterIndices.reduce((total, index) => total + sourceBook.chapters[index].sections
        .flatMap((section) => [section.text, section.title, ...(section.items || [])])
        .join(' ').split(/\s+/).length, 0);
      readingTime.textContent = `${Math.max(1, Math.ceil(wordCount / 220))} min read`;
      metadata.append(chapterCount, readingTime);
      copy.append(topic, heading, description, metadata);
      card.append(coverLink, copy);
      return card;
    };

    const render = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const matching = [];
      const catalog = [
        ...books.map((candidate) => ({
          ...candidate,
          sourceBook: candidate,
          kind: 'book',
        })),
        ...resources.map((candidate) => ({
          ...candidate,
          sourceBook: books.find((bookCandidate) => bookCandidate.id === candidate.bookId) || books[0],
          kind: 'resource',
        })),
      ];
      for (const candidate of catalog) {
        const sourceBook = candidate.sourceBook;
        if (!sourceBook) continue;
        let chapterIndices = candidate.kind === 'book'
          ? chaptersForTopic(sourceBook, selectedTopic)
          : selectedTopic === 'All' || selectedTopic === candidate.topic
            ? candidate.chapterIndices
            : [];
        if (bookmarksOnly) {
          const bookmarks = state.bookmarks[sourceBook.id] || [];
          chapterIndices = chapterIndices.filter((index) => bookmarks.includes(index));
        }
        const searchableContent = chapterIndices.map((index) => sourceBook.chapters[index].sections
          .flatMap((section) => [section.title, section.text, ...(section.items || [])])
          .join(' ')).join(' ');
        const text = `${candidate.title} ${candidate.subtitle} ${candidate.description} ${candidate.topic} ${searchableContent}`.toLocaleLowerCase();
        if (query && !text.includes(query)) continue;
        if (chapterIndices.length) matching.push({ candidate, sourceBook, chapterIndices });
      }
      grid.replaceChildren(...matching.map(({ candidate, sourceBook, chapterIndices }) =>
        renderCard(candidate, sourceBook, chapterIndices)));
      count.textContent = `${matching.length} ${matching.length === 1 ? 'read' : 'reads'}${bookmarksOnly ? ' with bookmarked chapters' : ''}`;
      empty.classList.toggle('d-none', matching.length > 0);
    };

    search.addEventListener('input', render);
    document.querySelectorAll('[data-topic]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedTopic = button.dataset.topic;
        document.querySelectorAll('[data-topic]').forEach((candidate) => {
          const selected = candidate === button;
          candidate.classList.toggle('is-selected', selected);
          candidate.setAttribute('aria-pressed', String(selected));
        });
        render();
      });
    });
    bookmarksButton.addEventListener('click', () => {
      bookmarksOnly = !bookmarksOnly;
      bookmarksButton.classList.toggle('is-selected', bookmarksOnly);
      bookmarksButton.setAttribute('aria-pressed', String(bookmarksOnly));
      render();
    });
    document.querySelector('[data-clear-library-filters]').addEventListener('click', () => {
      search.value = '';
      selectedTopic = 'All';
      bookmarksOnly = false;
      bookmarksButton.classList.remove('is-selected');
      bookmarksButton.setAttribute('aria-pressed', 'false');
      document.querySelectorAll('[data-topic]').forEach((button) => {
        const selected = button.dataset.topic === 'All';
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      render();
    });
    render();
  });
})(typeof window !== 'undefined' ? window : globalThis);

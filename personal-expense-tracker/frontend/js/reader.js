document.addEventListener('DOMContentLoaded', () => {
  const books = window.MONEY_LIBRARY_BOOKS || [];
  const book = books.find((candidate) => candidate.id === 'art-of-managing-money');
  const library = window.MoneyLibrary;
  if (!book || !library) return;

  const query = new URLSearchParams(window.location.search);
  const requestedBook = query.get('book');
  const requestedChapter = Number(query.get('chapter'));
  let state = library.readState();
  let chapterIndex = requestedBook === book.id && library.validChapterIndex(book.id, requestedChapter)
    ? requestedChapter
    : state.lastRead?.bookId === book.id && library.validChapterIndex(book.id, state.lastRead.chapterIndex)
      ? state.lastRead.chapterIndex
      : 0;
  const toc = document.querySelector('[data-reader-toc]');
  const body = document.querySelector('[data-reader-body]');
  const glossary = document.querySelector('[data-reader-glossary]');
  const previousButton = document.querySelector('[data-previous-chapter]');
  const nextButton = document.querySelector('[data-next-chapter]');
  const bookmarkButton = document.querySelector('[data-toggle-bookmark]');
  const tocList = document.querySelector('#reader-toc-list');
  const tocToggle = document.querySelector('[data-toc-toggle]');
  const minimumFontSize = 16;
  const maximumFontSize = 24;
  let fontSize = state.fontSize;

  const sectionHeading = (text, level = 2) => {
    const heading = document.createElement(`h${level}`);
    heading.textContent = text;
    return heading;
  };

  const renderSection = (section) => {
    if (section.type === 'p') {
      const paragraph = document.createElement('p');
      paragraph.textContent = section.text;
      return paragraph;
    }
    if (section.type === 'h') return sectionHeading(section.text, 2);
    if (section.type === 'example') {
      const example = document.createElement('aside');
      example.className = 'reader-example';
      example.setAttribute('aria-label', 'Practical example');
      example.append(sectionHeading(section.title, 3));
      const paragraph = document.createElement('p');
      paragraph.textContent = section.text;
      example.append(paragraph);
      return example;
    }
    if (section.type === 'list' || section.type === 'takeaways' || section.type === 'questions') {
      const sectionNode = document.createElement('section');
      sectionNode.className = `reader-${section.type}`;
      const title = section.type === 'takeaways'
        ? 'Key Takeaways'
        : section.type === 'questions'
          ? 'Questions to Reflect On'
          : '';
      if (title) sectionNode.append(sectionHeading(title, 2));
      const list = document.createElement('ul');
      section.items.forEach((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        list.append(item);
      });
      sectionNode.append(list);
      return sectionNode;
    }
    return null;
  };

  const saveReadingPosition = () => {
    state.lastRead = { bookId: book.id, chapterIndex };
    state.progress[book.id] = chapterIndex;
    library.writeState(state);
  };

  const renderToc = () => {
    toc.replaceChildren(...book.chapters.map((chapter, index) => {
      const item = document.createElement('li');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'reader-toc-link';
      link.dataset.chapterIndex = String(index);
      link.setAttribute('aria-current', index === chapterIndex ? 'step' : 'false');
      link.textContent = `${String(index + 1).padStart(2, '0')}  ${chapter.title}`;
      item.append(link);
      return item;
    }));
  };

  const renderGlossary = () => {
    const list = document.querySelector('[data-glossary-list]');
    list.replaceChildren(...book.glossary.map(([term, definition]) => {
      const item = document.createElement('div');
      const title = document.createElement('dt');
      title.textContent = term;
      const explanation = document.createElement('dd');
      explanation.textContent = definition;
      item.append(title, explanation);
      return item;
    }));
    document.querySelector('.reader-disclaimer').textContent = book.disclaimer;
  };

  const renderChapter = () => {
    const chapter = book.chapters[chapterIndex];
    document.title = `${chapter.title} | Money Library`;
    document.querySelector('[data-reader-book-title]').textContent = book.title;
    document.querySelector('[data-reader-chapter-number]').textContent =
      `CHAPTER ${String(chapterIndex + 1).padStart(2, '0')}`;
    document.querySelector('[data-reader-chapter-title]').textContent = chapter.title;
    document.querySelector('[data-chapter-progress]').textContent =
      `Chapter ${chapterIndex + 1} of ${book.chapters.length}`;
    const progress = Math.round(((chapterIndex + 1) / book.chapters.length) * 100);
    document.querySelector('[data-book-progress]').textContent = `${progress}% through the book`;
    const progressBar = document.querySelector('[data-reader-progress-bar]');
    progressBar.style.width = `${progress}%`;
    progressBar.parentElement.setAttribute('aria-valuenow', String(progress));
    body.style.setProperty('--reader-font-size', `${fontSize}px`);
    body.replaceChildren(...chapter.sections.map(renderSection).filter(Boolean));
    previousButton.disabled = chapterIndex === 0;
    nextButton.disabled = chapterIndex === book.chapters.length - 1;
    const bookmarked = library.isBookmarked(state, book.id, chapterIndex);
    bookmarkButton.setAttribute('aria-pressed', String(bookmarked));
    document.querySelector('[data-bookmark-label]').textContent =
      bookmarked ? 'Bookmarked · Remove bookmark' : 'Bookmark chapter';
    bookmarkButton.querySelector('span[aria-hidden="true"]').textContent = bookmarked ? '★' : '☆';
    renderToc();
    saveReadingPosition();
  };

  const navigateTo = (index) => {
    if (!library.validChapterIndex(book.id, index)) return;
    chapterIndex = index;
    query.set('book', book.id);
    query.set('chapter', String(chapterIndex));
    window.history.replaceState({}, document.title, `${window.location.pathname}?${query.toString()}`);
    glossary.classList.add('d-none');
    document.querySelector('.reader-main').classList.remove('is-showing-glossary');
    renderChapter();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.matchMedia('(max-width: 760px)').matches) {
      tocList.hidden = true;
      tocToggle.setAttribute('aria-expanded', 'false');
    }
  };

  toc.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chapter-index]');
    if (button) navigateTo(Number(button.dataset.chapterIndex));
  });
  previousButton.addEventListener('click', () => navigateTo(chapterIndex - 1));
  nextButton.addEventListener('click', () => navigateTo(chapterIndex + 1));
  bookmarkButton.addEventListener('click', () => {
    state = library.toggleBookmark(state, book.id, chapterIndex);
    library.writeState(state);
    renderChapter();
  });
  document.querySelector('[data-font-decrease]').addEventListener('click', () => {
    fontSize = Math.max(minimumFontSize, fontSize - 1);
    state.fontSize = fontSize;
    library.writeState(state);
    document.querySelector('[data-font-size-label]').textContent = `${fontSize}px`;
    body.style.setProperty('--reader-font-size', `${fontSize}px`);
  });
  document.querySelector('[data-font-increase]').addEventListener('click', () => {
    fontSize = Math.min(maximumFontSize, fontSize + 1);
    state.fontSize = fontSize;
    library.writeState(state);
    document.querySelector('[data-font-size-label]').textContent = `${fontSize}px`;
    body.style.setProperty('--reader-font-size', `${fontSize}px`);
  });
  tocToggle.addEventListener('click', () => {
    const expanded = tocToggle.getAttribute('aria-expanded') === 'true';
    tocToggle.setAttribute('aria-expanded', String(!expanded));
    tocList.hidden = expanded;
  });
  document.querySelector('[data-open-glossary]').addEventListener('click', () => {
    renderGlossary();
    glossary.classList.remove('d-none');
    document.querySelector('.reader-main').classList.add('is-showing-glossary');
    glossary.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelector('[data-close-glossary]').addEventListener('click', () => {
    glossary.classList.add('d-none');
    document.querySelector('.reader-main').classList.remove('is-showing-glossary');
    document.querySelector('[data-reader-chapter-title]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, textarea, select, button')) return;
    if (event.key === 'ArrowLeft' && chapterIndex > 0) navigateTo(chapterIndex - 1);
    if (event.key === 'ArrowRight' && chapterIndex < book.chapters.length - 1) navigateTo(chapterIndex + 1);
  });

  document.querySelector('[data-font-size-label]').textContent = `${fontSize}px`;
  if (window.matchMedia('(max-width: 760px)').matches) {
    tocList.hidden = true;
    tocToggle.setAttribute('aria-expanded', 'false');
  }
  renderGlossary();
  renderChapter();
});

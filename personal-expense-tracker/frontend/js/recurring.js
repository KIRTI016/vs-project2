document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-recurring-form]');
  const formError = document.querySelector('[data-recurring-error]');
  const listError = document.querySelector('[data-recurring-list-error]');
  const list = document.querySelector('[data-recurring-list]');
  const empty = document.querySelector('[data-empty-recurring]');
  const cancelEdit = document.querySelector('[data-cancel-recurring-edit]');
  const submitButton = document.querySelector('[data-recurring-submit]');
  let recurringItems = [];
  let editingId = null;

  const formatDate = (value) => new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));

  const appendText = (parent, tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  };

  const resetForm = () => {
    form.reset();
    form.elements.is_active.checked = true;
    form.elements.start_date.value = localDateString();
    form.elements.next_due_date.value = localDateString();
    editingId = null;
    document.querySelector('[data-recurring-form-title]').textContent = 'Add recurring payment';
    submitButton.textContent = 'Save schedule →';
    cancelEdit.classList.add('d-none');
  };

  const renderItem = (item) => {
    const card = document.createElement('article');
    card.className = `recurring-item${item.is_active ? '' : ' is-inactive'}`;
    const heading = document.createElement('div');
    heading.className = 'recurring-item-heading';
    const titleGroup = document.createElement('div');
    appendText(titleGroup, 'h4', '', item.name);
    appendText(
      titleGroup,
      'p',
      '',
      `${item.category} · ${item.frequency[0].toUpperCase()}${item.frequency.slice(1)} · ${item.is_active ? 'Active' : 'Paused'}`,
    );
    appendText(heading, 'strong', 'recurring-item-amount', formatMoney(item.amount));
    heading.prepend(titleGroup);
    card.append(heading);

    const meta = document.createElement('div');
    meta.className = 'recurring-item-meta';
    appendText(meta, 'span', '', `Next due ${formatDate(item.next_due_date)}`);
    appendText(meta, 'span', '', `Started ${formatDate(item.start_date)}`);
    card.append(meta);
    if (item.notes) appendText(card, 'p', 'recurring-item-notes', item.notes);

    const actions = document.createElement('div');
    actions.className = 'recurring-item-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-outline-dark';
    editButton.dataset.editRecurring = String(item.id);
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${item.name}`);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-outline-dark';
    deleteButton.dataset.deleteRecurring = String(item.id);
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${item.name}`);
    actions.append(editButton, deleteButton);
    card.append(actions);
    return card;
  };

  const loadRecurring = async () => {
    hideMessage(listError);
    const { recurring_expenses: items, summary } = await apiRequest('/recurring');
    recurringItems = items;
    list.replaceChildren(...items.map(renderItem));
    empty.classList.toggle('d-none', items.length > 0);
    document.querySelector('[data-recurring-count]').textContent =
      `${items.length} schedule${items.length === 1 ? '' : 's'}`;
    document.querySelector('[data-monthly-estimate]').textContent = formatMoney(summary.monthly_estimate);
    document.querySelector('[data-upcoming-total]').textContent = formatMoney(summary.upcoming_total);
    document.querySelector('[data-upcoming-count]').textContent =
      `${summary.upcoming_count} upcoming payment${summary.upcoming_count === 1 ? '' : 's'}`;
  };

  const beginEdit = (item) => {
    editingId = item.id;
    form.elements.name.value = item.name;
    form.elements.amount.value = item.amount;
    form.elements.category.value = item.category;
    form.elements.frequency.value = item.frequency;
    form.elements.start_date.value = item.start_date;
    form.elements.next_due_date.value = item.next_due_date;
    form.elements.notes.value = item.notes;
    form.elements.is_active.checked = item.is_active;
    document.querySelector('[data-recurring-form-title]').textContent = 'Edit recurring payment';
    submitButton.textContent = 'Update schedule →';
    cancelEdit.classList.remove('d-none');
    hideMessage(formError);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const today = localDateString();
  form.elements.start_date.value = today;
  form.elements.next_due_date.value = today;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(formError);
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    const body = {
      ...fields,
      amount: Number(fields.amount),
      is_active: form.elements.is_active.checked,
    };
    try {
      await apiRequest(editingId === null ? '/recurring' : `/recurring/${editingId}`, {
        method: editingId === null ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      resetForm();
      await loadRecurring();
    } catch (error) {
      showMessage(formError, error.message);
    }
  });

  cancelEdit.addEventListener('click', () => {
    resetForm();
    hideMessage(formError);
  });

  list.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-recurring]');
    if (editButton) {
      const item = recurringItems.find((candidate) => candidate.id === Number(editButton.dataset.editRecurring));
      if (item) beginEdit(item);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-recurring]');
    if (!deleteButton || !window.confirm('Delete this recurring payment schedule?')) return;
    hideMessage(listError);
    try {
      await apiRequest(`/recurring/${deleteButton.dataset.deleteRecurring}`, { method: 'DELETE' });
      if (editingId === Number(deleteButton.dataset.deleteRecurring)) resetForm();
      await loadRecurring();
    } catch (error) {
      showMessage(listError, error.message);
    }
  });

  loadRecurring().catch((error) => showMessage(listError, error.message));
});

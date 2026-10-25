document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('[data-expense-form]');
  const errorNode = document.querySelector('[data-form-error]');
  const successNode = document.querySelector('[data-form-success]');
  const listError = document.querySelector('[data-list-error]');
  const loading = document.querySelector('[data-expense-loading]');
  const rows = document.querySelector('[data-expense-rows]');
  const empty = document.querySelector('[data-empty-expenses]');
  const dateInput = document.querySelector('#expense-date');
  const submitButton = document.querySelector('[data-submit-expense]');
  const filters = ['#filter-category', '#filter-start', '#filter-end'].map((selector) => document.querySelector(selector));
  let expenses = [];
  let editingId = null;
  let isLoading = false;
  dateInput.value = localDateString();

  const render = () => {
    const [category, start, end] = filters.map((field) => field.value);
    const filtered = expenses.filter((expense) => (!category || expense.category === category)
      && (!start || expense.date >= start) && (!end || expense.date <= end));
    document.querySelector('[data-expense-count]').textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;
    document.querySelector('[data-filter-total]').textContent = formatMoney(filtered.reduce((total, expense) => total + expense.amount, 0));
    rows.replaceChildren(...filtered.map((expense) => {
      const row = document.createElement('tr');
      const descriptionCell = document.createElement('td');
      const description = document.createElement('span');
      description.className = 'expense-description';
      description.textContent = expense.description || expense.category;
      descriptionCell.append(description);

      const categoryCell = document.createElement('td');
      const categoryTag = document.createElement('span');
      categoryTag.className = 'category-tag';
      categoryTag.textContent = expense.category;
      categoryCell.append(categoryTag);

      const dateCell = document.createElement('td');
      dateCell.textContent = new Date(`${expense.date}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const paymentCell = document.createElement('td');
      paymentCell.textContent = expense.payment_method;
      const amountCell = document.createElement('td');
      amountCell.className = 'text-end expense-amount';
      amountCell.textContent = formatMoney(expense.amount);

      const actionsCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const editButton = document.createElement('button');
      editButton.className = 'table-action';
      editButton.type = 'button';
      editButton.dataset.edit = String(expense.id);
      editButton.setAttribute('aria-label', `Edit ${expense.description || expense.category}`);
      editButton.title = 'Edit';
      editButton.innerHTML = '&#9998;';
      const deleteButton = document.createElement('button');
      deleteButton.className = 'table-action action-delete';
      deleteButton.type = 'button';
      deleteButton.dataset.delete = String(expense.id);
      deleteButton.setAttribute('aria-label', `Delete ${expense.description || expense.category}`);
      deleteButton.title = 'Delete';
      deleteButton.innerHTML = '&#215;';
      actions.append(editButton, deleteButton);
      actionsCell.append(actions);
      row.append(descriptionCell, categoryCell, dateCell, paymentCell, amountCell, actionsCell);
      return row;
    }));

    loading.classList.toggle('d-none', !isLoading);
    const hasError = !listError.classList.contains('d-none');
    const showEmpty = !isLoading && !hasError && filtered.length === 0;
    empty.classList.toggle('d-none', !showEmpty);
    empty.textContent = expenses.length === 0 && !category && !start && !end
      ? 'No expenses yet. Add your first expense using the form.'
      : 'No expenses match these filters.';
  };

  const loadExpenses = async () => {
    hideMessage(listError);
    isLoading = true;
    render();
    try {
      const result = await apiRequest('/expenses');
      expenses = result.expenses;
    } finally {
      isLoading = false;
      render();
    }
  };

  try {
    await loadExpenses();
  } catch (error) {
    showMessage(listError, error.message);
    render();
  }

  filters.forEach((field) => field.addEventListener('change', render));
  document.querySelector('[data-clear-filters]').addEventListener('click', () => {
    filters.forEach((field) => { field.value = ''; });
    render();
  });

  form.addEventListener('input', () => hideMessage(successNode));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(errorNode);
    hideMessage(successNode);
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    body.amount = Number(body.amount);
    submitButton.disabled = true;
    try {
      await apiRequest(editingId ? `/expenses/${editingId}` : '/expenses', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
    } catch (error) {
      showMessage(errorNode, error.message);
      submitButton.disabled = false;
      return;
    }

    const wasEditing = editingId !== null;
    resetForm();
    showMessage(successNode, wasEditing ? 'Expense updated.' : 'Expense saved.');
    submitButton.disabled = false;
    try {
      await loadExpenses();
    } catch (error) {
      showMessage(listError, `Saved successfully, but the expense list could not refresh: ${error.message}`);
      render();
    }
  });

  rows.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editButton = target.closest('[data-edit]');
    const deleteButton = target.closest('[data-delete]');
    if (editButton) {
      const expense = expenses.find((item) => item.id === Number(editButton.dataset.edit));
      if (!expense) return;
      editingId = expense.id;
      Object.entries(expense).forEach(([key, value]) => {
        const field = form.elements.namedItem(key);
        if (field) field.value = value;
      });
      document.querySelector('[data-form-eyebrow]').textContent = 'EDIT TRANSACTION';
      document.querySelector('[data-form-title]').textContent = 'Update expense';
      submitButton.innerHTML = 'Save changes <span aria-hidden="true">&#8594;</span>';
      document.querySelector('[data-cancel-edit]').classList.remove('d-none');
      hideMessage(successNode);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (deleteButton && window.confirm('Delete this expense? This cannot be undone.')) {
      try {
        await apiRequest(`/expenses/${deleteButton.dataset.delete}`, { method: 'DELETE' });
        await loadExpenses();
      } catch (error) {
        showMessage(listError, error.message);
        render();
      }
    }
  });

  document.querySelector('[data-cancel-edit]').addEventListener('click', resetForm);

  function resetForm() {
    editingId = null;
    form.reset();
    dateInput.value = localDateString();
    document.querySelector('[data-form-eyebrow]').textContent = 'NEW TRANSACTION';
    document.querySelector('[data-form-title]').textContent = 'Add an expense';
    submitButton.innerHTML = 'Add expense <span aria-hidden="true">&#8594;</span>';
    submitButton.disabled = false;
    document.querySelector('[data-cancel-edit]').classList.add('d-none');
    hideMessage(errorNode);
  }
});

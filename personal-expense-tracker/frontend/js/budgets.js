document.addEventListener('DOMContentLoaded', () => {
  const monthInput = document.querySelector('#budget-month');
  const form = document.querySelector('[data-budget-form]');
  const errorNode = document.querySelector('[data-budget-error]');
  const list = document.querySelector('[data-budget-list]');
  const empty = document.querySelector('[data-empty-budgets]');
  const currentMonth = new Date().toISOString().slice(0, 7);
  monthInput.value = currentMonth;
  let budgets = [];

  const loadBudgets = async () => {
    hideMessage(errorNode);
    const { budgets: result } = await apiRequest(`/budgets?month=${encodeURIComponent(monthInput.value)}`);
    budgets = result;
    document.querySelector('[data-budget-count]').textContent = `${budgets.length} plan${budgets.length === 1 ? '' : 's'}`;
    list.innerHTML = budgets.map((budget) => {
      const percent = budget.amount ? Math.round(budget.spent / budget.amount * 100) : 0;
      const state = percent >= 100 ? 'progress-over' : percent >= 80 ? 'progress-warn' : '';
      return `<article class="budget-progress-item"><div class="budget-item-heading"><div><span class="budget-category-name">${escapeHtml(budget.category === 'Overall' ? 'Overall spending' : budget.category)}</span><small>${percent}% used</small></div><button class="table-action action-delete" type="button" data-delete-budget="${budget.id}" aria-label="Delete ${escapeHtml(budget.category)} budget" title="Delete budget">&#215;</button></div><div class="progress budget-progress" role="progressbar" aria-label="${escapeHtml(budget.category)} budget used" aria-valuenow="${Math.min(100, percent)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar ${state}" style="width:${Math.min(100, percent)}%"></div></div><div class="budget-item-totals"><span>${formatMoney(budget.spent)} spent</span><strong>${formatMoney(budget.amount)}</strong></div></article>`;
    }).join('');
    empty.classList.toggle('d-none', budgets.length > 0);
  };

  monthInput.addEventListener('change', loadBudgets);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(errorNode);
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    body.amount = Number(body.amount);
    body.month = monthInput.value;
    try {
      await apiRequest('/budgets', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      document.querySelector('#budget-category').value = 'Overall';
      await loadBudgets();
    } catch (error) {
      showMessage(errorNode, error.message);
    }
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-budget]');
    if (!button || !window.confirm('Delete this monthly budget?')) return;
    try { await apiRequest(`/budgets/${button.dataset.deleteBudget}`, { method: 'DELETE' }); await loadBudgets(); }
    catch (error) { showMessage(errorNode, error.message); }
  });

  loadBudgets().catch((error) => showMessage(errorNode, error.message));
});
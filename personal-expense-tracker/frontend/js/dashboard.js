document.addEventListener('DOMContentLoaded', async () => {
  const amountNodes = {
    balance: document.querySelector('[data-balance]'),
    income: document.querySelector('[data-income]'),
    expenses: document.querySelector('[data-expenses]'),
    remaining: document.querySelector('[data-budget-remaining]'),
  };
  const form = document.querySelector('[data-income-form]');
  const errorNode = document.querySelector('[data-income-error]');
  const dateInput = document.querySelector('#income-date');
  const incomeHistory = document.querySelector('[data-income-history]');
  let editingIncomeId = null;
  let incomeRecords = [];
  let categoryChart = null;
  dateInput.value = localDateString();

  const loadDashboard = async () => {
    const [data, incomeData] = await Promise.all([apiRequest('/dashboard'), apiRequest('/income')]);
    incomeRecords = incomeData.income;
    amountNodes.balance.textContent = formatMoney(data.balance);
    amountNodes.income.textContent = formatMoney(data.monthly_income);
    amountNodes.expenses.textContent = formatMoney(data.monthly_expenses);
    amountNodes.remaining.textContent = formatMoney(data.remaining_budget);
    document.querySelector('[data-current-month]').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${data.month}T12:00:00`)).toUpperCase();
    document.querySelector('[data-budget-label]').textContent = data.monthly_budget ? 'After your monthly spending' : 'Set a monthly budget to track progress';
    document.querySelector('[data-budget-total]').textContent = formatMoney(data.monthly_budget);
    document.querySelector('[data-budget-used]').textContent = formatMoney(data.monthly_expenses);
    const percentage = data.monthly_budget ? Math.min(100, Math.round((data.monthly_expenses / data.monthly_budget) * 100)) : 0;
    document.querySelector('[data-budget-percent]').textContent = `${percentage}%`;
    document.querySelector('[data-budget-ring]').style.setProperty('--ring-progress', `${percentage * 3.6}deg`);
    document.querySelector('[data-budget-note]').textContent = data.monthly_budget
      ? (data.monthly_expenses > data.monthly_budget ? 'You are over your monthly limit.' : `${formatMoney(Math.max(0, data.monthly_budget - data.monthly_expenses))} left to spend this month.`)
      : 'Set an overall monthly budget to see your progress here.';

    const categories = data.category_totals;
    const legend = document.querySelector('[data-category-legend]');
    legend.innerHTML = categories.length ? categories.map((item, index) => `<div class="legend-row"><span class="legend-swatch swatch-${index % 6}"></span><span>${escapeHtml(item.category)}</span><strong>${formatMoney(item.amount)}</strong></div>`).join('') : '<p class="empty-state">Add an expense to see your spending mix.</p>';
    document.querySelector('[data-chart-empty]').classList.toggle('d-none', categories.length > 0);
    if (categoryChart) categoryChart.destroy();
    categoryChart = null;
    if (categories.length && window.Chart) {
      categoryChart = new Chart(document.querySelector('#category-chart'), {
        type: 'doughnut',
        data: { labels: categories.map((item) => item.category), datasets: [{ data: categories.map((item) => item.amount), backgroundColor: ['#2e7161', '#f2b84b', '#e57c63', '#7298a1', '#afd0a8', '#a47c62'], borderWidth: 0, hoverOffset: 5 }] },
        options: { cutout: '76%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${formatMoney(context.raw)}` } } }, maintainAspectRatio: false },
      });
    }

    const recentList = document.querySelector('[data-recent-list]');
    recentList.innerHTML = data.recent_expenses.length ? data.recent_expenses.map((expense) => `<div class="activity-row"><span class="activity-icon">${escapeHtml(expense.category.slice(0, 1))}</span><span class="activity-main"><strong>${escapeHtml(expense.description || expense.category)}</strong><small>${escapeHtml(expense.category)} · ${new Date(`${expense.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span><strong class="activity-amount">-${formatMoney(expense.amount)}</strong></div>`).join('') : '<p class="empty-state">Your latest transactions will show up here.</p>';
    incomeHistory.innerHTML = incomeData.income.length ? `<p class="income-history-label">Recent income</p>${incomeData.income.slice(0, 5).map((item) => `<div class="income-row"><span class="activity-icon income-icon">+</span><span class="activity-main"><strong>${escapeHtml(item.source)}</strong><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span><strong class="activity-amount">+${formatMoney(item.amount)}</strong><button class="table-action" type="button" data-edit-income="${item.id}" aria-label="Edit ${escapeHtml(item.source)} income" title="Edit income">&#9998;</button><button class="table-action action-delete" type="button" data-delete-income="${item.id}" aria-label="Delete ${escapeHtml(item.source)} income" title="Delete income">&#215;</button></div>`).join('')}` : '';
  };

  try {
    await loadDashboard();
  } catch (error) {
    showMessage(errorNode, error.message);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(errorNode);
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    body.amount = Number(body.amount);
    try {
      await apiRequest(editingIncomeId ? `/income/${editingIncomeId}` : '/income', {
        method: editingIncomeId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      resetIncomeForm();
      await loadDashboard();
    } catch (error) {
      showMessage(errorNode, error.message);
    }
  });

  incomeHistory.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-income]');
    const deleteButton = event.target.closest('[data-delete-income]');
    if (editButton) {
      const item = incomeRecords.find((record) => record.id === Number(editButton.dataset.editIncome));
      if (!item) return;
      editingIncomeId = item.id;
      form.elements.namedItem('source').value = item.source;
      form.elements.namedItem('amount').value = item.amount;
      form.elements.namedItem('date').value = item.date;
      document.querySelector('[data-income-title]').textContent = 'Update income';
      document.querySelector('[data-income-submit]').innerHTML = 'Save changes <span aria-hidden="true">&#8594;</span>';
      document.querySelector('[data-cancel-income-edit]').classList.remove('d-none');
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (deleteButton && window.confirm('Delete this income record? This cannot be undone.')) {
      try {
        await apiRequest(`/income/${deleteButton.dataset.deleteIncome}`, { method: 'DELETE' });
        await loadDashboard();
      } catch (error) {
        showMessage(errorNode, error.message);
      }
    }
  });

  document.querySelector('[data-cancel-income-edit]').addEventListener('click', resetIncomeForm);

  function resetIncomeForm() {
    editingIncomeId = null;
    form.reset();
    dateInput.value = localDateString();
    document.querySelector('[data-income-title]').textContent = 'Record income';
    document.querySelector('[data-income-submit]').innerHTML = 'Add income <span aria-hidden="true">&#8594;</span>';
    document.querySelector('[data-cancel-income-edit]').classList.add('d-none');
  }
});
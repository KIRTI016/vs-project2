document.addEventListener('DOMContentLoaded', async () => {
  const periodNode = document.querySelector('[data-insights-period]');
  const totalNode = document.querySelector('[data-insights-total]');
  const comparisonNode = document.querySelector('[data-insights-comparison]');
  const errorNode = document.querySelector('[data-insights-error]');
  const emptyNode = document.querySelector('[data-insights-empty]');
  const tableWrap = document.querySelector('[data-insights-table-wrap]');
  const categoryRows = document.querySelector('[data-insights-categories]');

  const formatDate = (value) => new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
  const formatRange = (period) => `${formatDate(period.start)} – ${formatDate(period.end)}`;

  try {
    const data = await apiRequest('/insights');
    periodNode.textContent = `Current period: ${formatRange(data.current_month)}. Comparison period: ${formatRange(data.previous_month)}.`;
    totalNode.textContent = formatMoney(data.current_month.total);

    if (data.comparison_available) {
      comparisonNode.textContent = `This period: ${formatMoney(data.current_month.total)} across ${data.current_month.expense_count} expense${data.current_month.expense_count === 1 ? '' : 's'}. Previous period: ${formatMoney(data.previous_month.total)} across ${data.previous_month.expense_count} expense${data.previous_month.expense_count === 1 ? '' : 's'}.`;
    } else {
      comparisonNode.textContent = `No expenses were recorded in ${formatRange(data.previous_month)}, so a previous-period comparison is not available yet.`;
    }

    if (!data.categories.length) {
      emptyNode.textContent = `No expenses are recorded from ${formatRange(data.current_month)}. Add an expense to see your spending insights.`;
      emptyNode.classList.remove('d-none');
      return;
    }

    categoryRows.replaceChildren(...data.categories.map((item) => {
      const row = document.createElement('tr');
      const categoryCell = document.createElement('td');
      categoryCell.textContent = item.category;
      row.append(categoryCell);

      const currentCell = document.createElement('td');
      currentCell.className = 'text-end';
      currentCell.textContent = formatMoney(item.current_amount);
      row.append(currentCell);

      const previousCell = document.createElement('td');
      previousCell.className = 'text-end';
      previousCell.textContent = item.previous_amount === null
        ? 'Not available'
        : formatMoney(item.previous_amount);
      row.append(previousCell);

      const changeCell = document.createElement('td');
      changeCell.className = 'text-end';
      if (item.change_amount === null) {
        changeCell.textContent = 'Not available';
      } else if (item.change_amount === 0) {
        changeCell.textContent = 'No change';
      } else {
        const increased = item.change_amount > 0;
        const amount = formatMoney(Math.abs(item.change_amount));
        const percentage = item.change_percent === null ? '' : ` (${Math.abs(item.change_percent)}%)`;
        changeCell.textContent = `${increased ? 'Higher' : 'Lower'} by ${amount}${percentage}`;
        changeCell.classList.add(increased ? 'insight-change-up' : 'insight-change-down');
      }
      row.append(changeCell);
      return row;
    }));
    tableWrap.classList.remove('d-none');
  } catch (error) {
    showMessage(errorNode, error.message);
    periodNode.textContent = 'Spending insights could not be loaded.';
  }
});

function welcomeMonthLabel(monthKey) {
  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(monthDate);
}

function validateWelcomeSpending(data) {
  if (!data || !Array.isArray(data.months) || data.months.length !== 7
    || !data.current_month || typeof data.current_month.month !== 'string') {
    throw new Error('Invalid spending history response');
  }

  const seenMonths = new Set();
  for (const month of data.months) {
    if (!month || !/^\d{4}-\d{2}$/.test(month.month)
      || seenMonths.has(month.month)
      || !Number.isFinite(month.total) || month.total < 0
      || !Number.isInteger(month.expense_count) || month.expense_count < 0) {
      throw new Error('Invalid spending history response');
    }
    seenMonths.add(month.month);
  }

  const currentMonth = data.months.find((month) => month.month === data.current_month.month);
  if (!currentMonth
    || currentMonth.total !== data.current_month.total
    || currentMonth.expense_count !== data.current_month.expense_count) {
    throw new Error('Invalid spending history response');
  }
  return data;
}

function renderWelcomeSpendingChart(chart, months) {
  chart.replaceChildren();
  const maximum = Math.max(...months.map((month) => month.total));
  if (maximum === 0) {
    chart.setAttribute('aria-label', 'No spending has been recorded in the last seven months');
    return;
  }

  const summaries = [];
  months.forEach((month) => {
    const label = welcomeMonthLabel(month.month);
    const amount = formatMoney(month.total);
    const monthColumn = document.createElement('div');
    monthColumn.className = 'art-month';
    monthColumn.title = `${label}: ${amount}`;
    monthColumn.setAttribute('aria-hidden', 'true');

    const bar = document.createElement('span');
    bar.className = 'art-month-bar';
    bar.style.setProperty('--spending-scale', String(month.total / maximum));
    monthColumn.append(bar);

    const monthLabel = document.createElement('small');
    monthLabel.className = 'art-month-label';
    monthLabel.textContent = label;
    monthColumn.append(monthLabel);
    chart.append(monthColumn);
    summaries.push(`${label}: ${amount}`);
  });
  chart.setAttribute('aria-label', `Monthly expenses for the last seven months. ${summaries.join('; ')}`);
}

function showWelcomeSpendingUnavailable(total, caption, status, chart, message) {
  total.textContent = 'Unavailable';
  caption.textContent = 'spent this month';
  chart.replaceChildren();
  chart.setAttribute('aria-label', 'Monthly spending history is unavailable');
  status.textContent = message;
}

async function loadWelcomeSpending() {
  const total = document.querySelector('[data-spending-total]');
  const caption = document.querySelector('[data-spending-caption]');
  const status = document.querySelector('[data-spending-status]');
  const chart = document.querySelector('[data-spending-chart]');
  const actions = document.querySelector('[data-entry-actions]');

  try {
    const { user } = await apiRequest('/auth/me');
    if (!user) {
      total.textContent = '—';
      caption.textContent = 'personal snapshot';
      status.textContent = 'Sign in to see your personal spending snapshot.';
      chart.replaceChildren();
      chart.setAttribute('aria-label', 'Sign in to view monthly spending history');
      return;
    }

    const dashboardLink = document.createElement('a');
    dashboardLink.className = 'btn btn-primary btn-lg';
    dashboardLink.href = 'dashboard.html';
    dashboardLink.textContent = 'Open your dashboard';
    actions.replaceChildren(dashboardLink);

    const data = validateWelcomeSpending(await apiRequest('/dashboard/spending-history'));
    total.textContent = formatMoney(data.current_month.total);
    caption.textContent = 'spent this month';
    renderWelcomeSpendingChart(chart, data.months);

    if (data.months.every((month) => month.expense_count === 0)) {
      status.textContent = 'Your spending insights will appear here once you add expenses.';
    } else {
      status.textContent = 'Based on your expenses over the last seven months.';
    }
  } catch (error) {
    if (error.status === 401) {
      total.textContent = '—';
      caption.textContent = 'personal snapshot';
      status.textContent = 'Sign in to see your personal spending snapshot.';
      chart.replaceChildren();
      chart.setAttribute('aria-label', 'Sign in to view monthly spending history');
      return;
    }
    showWelcomeSpendingUnavailable(
      total,
      caption,
      status,
      chart,
      'Spending data is unavailable right now. Please try again later.',
    );
  }
}

document.addEventListener('DOMContentLoaded', loadWelcomeSpending);

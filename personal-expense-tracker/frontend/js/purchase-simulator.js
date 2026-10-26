document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-purchase-form]');
  const errorNode = document.querySelector('[data-purchase-error]');
  const resultNode = document.querySelector('[data-purchase-result]');
  const monthInput = document.querySelector('#budget-month');

  const addMetric = (container, label, value) => {
    const row = document.createElement('div');
    row.className = 'purchase-impact-row';
    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    const valueNode = document.createElement('strong');
    valueNode.textContent = value;
    row.append(labelNode, valueNode);
    container.append(row);
  };

  const renderImpact = (heading, impact) => {
    const card = document.createElement('article');
    card.className = 'purchase-impact-card';
    const title = document.createElement('h5');
    title.textContent = heading;
    card.append(title);
    addMetric(card, 'Budget limit', impact.budget === null ? 'No budget set' : formatMoney(impact.budget));
    addMetric(card, 'Already spent', formatMoney(impact.spent_before));
    addMetric(
      card,
      'Remaining before purchase',
      impact.remaining_before === null ? 'Set a budget to calculate' : formatMoney(impact.remaining_before),
    );
    addMetric(
      card,
      'Estimated remaining after',
      impact.remaining_after === null ? 'Set a budget to calculate' : formatMoney(impact.remaining_after),
    );

    const status = document.createElement('p');
    status.className = 'purchase-impact-status';
    if (impact.would_exceed === null) {
      status.textContent = 'Set a budget to check whether this purchase would exceed it.';
    } else if (impact.would_exceed) {
      status.classList.add('is-over');
      status.textContent = 'This purchase would exceed the budget.';
    } else {
      status.classList.add('is-within');
      status.textContent = 'This purchase would stay within the budget.';
    }
    card.append(status);
    return card;
  };

  const renderResult = (data) => {
    resultNode.replaceChildren();
    const title = document.createElement('h4');
    title.textContent = data.purchase_name
      ? `If you buy ${data.purchase_name}`
      : 'Estimated budget impact';
    resultNode.append(title);

    const grid = document.createElement('div');
    grid.className = 'purchase-impact-grid';
    grid.append(renderImpact(`${data.category} budget`, data.category_impact));
    if (data.overall_impact) {
      grid.append(renderImpact('Overall monthly budget', data.overall_impact));
    } else {
      const note = document.createElement('p');
      note.className = 'empty-state';
      note.textContent = 'No overall monthly budget is set for this month.';
      grid.append(note);
    }
    resultNode.append(grid);
    resultNode.classList.remove('d-none');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(errorNode);
    resultNode.classList.add('d-none');
    if (!form.reportValidity()) return;

    const fields = Object.fromEntries(new FormData(form).entries());
    const body = {
      name: fields.name,
      amount: Number(fields.amount),
      category: fields.category,
      month: monthInput.value,
    };
    try {
      const data = await apiRequest('/budgets/simulate', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      renderResult(data);
    } catch (error) {
      showMessage(errorNode, error.message);
    }
  });

  form.addEventListener('input', () => {
    hideMessage(errorNode);
    resultNode.classList.add('d-none');
  });
  form.addEventListener('change', () => {
    hideMessage(errorNode);
    resultNode.classList.add('d-none');
  });
  monthInput.addEventListener('change', () => resultNode.classList.add('d-none'));
});

(function () {
  let budgets = null;
  let pnlMap = null;

  async function ensureBudgets() {
    if (App.state.budgets) return (budgets = App.state.budgets);
    const response = await fetch('data/budgets.sample.json');
    if (!response.ok) throw new Error('Не удалось загрузить budgets.sample.json');
    budgets = await response.json();
    App.saveBudgets(budgets);
    return budgets;
  }

  async function ensurePnlMap() {
    if (App.state.pnlMap) return (pnlMap = App.state.pnlMap);
    const response = await fetch('data/pnl_map.sample.json');
    if (!response.ok) throw new Error('Не удалось загрузить pnl_map.sample.json');
    pnlMap = await response.json();
    App.savePnlMap(pnlMap);
    return pnlMap;
  }

  function resolveLine(op) {
    if (!pnlMap) return null;
    const needle = `${op.category || ''}:${op.subcategory || ''}`.toLowerCase();
    for (const [line, categories] of Object.entries(pnlMap)) {
      for (const entry of categories) {
        const match = entry.toLowerCase();
        if (match === (op.category || '').toLowerCase()) return line;
        if (match === (op.subcategory || '').toLowerCase()) return line;
        if (needle.includes(match)) return line;
      }
    }
    return null;
  }

  function actualFor(item) {
    if (item.pnl) {
      return App.state.ledger.filter(op => resolveLine(op) === item.pnl).reduce((acc, op) => acc + op.amount, 0);
    }
    return App.state.ledger.filter(op => {
      const matchesCategory = item.category ? op.category === item.category : true;
      const matchesSub = item.subcategory ? op.subcategory === item.subcategory : true;
      return matchesCategory && matchesSub;
    }).reduce((acc, op) => acc + op.amount, 0);
  }

  function renderTable() {
    const tbody = document.querySelector('#budgets-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (budgets.items || []).forEach((item, index) => {
      const factRaw = actualFor(item);
      const budgetValue = item.budget || 0;
      const fact = factRaw < 0 ? Math.abs(factRaw) : factRaw;
      const progress = budgetValue ? Math.round((fact / budgetValue) * 100) : 0;
      const tr = document.createElement('tr');
      tr.dataset.index = index;
      tr.innerHTML = `
        <td contenteditable="true" data-field="category">${item.category || ''}</td>
        <td contenteditable="true" data-field="subcategory">${item.subcategory || ''}</td>
        <td contenteditable="true" data-field="pnl">${item.pnl || ''}</td>
        <td contenteditable="true" data-field="budget">${budgetValue}</td>
        <td class="right">${App.formatCurrency(fact)}</td>
        <td>
          <div class="progress"><div class="progress-bar" style="width:${Math.min(Math.abs(progress), 100)}%"></div></div>
          <div class="muted">${progress}%</div>
        </td>
        <td><button class="btn-link" data-action="delete">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
    if (!budgets.items || !budgets.items.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7">Добавьте бюджетные категории, чтобы отслеживать план/факт.</td>';
      tbody.appendChild(tr);
    }
  }

  function saveBudgets() {
    App.saveBudgets(budgets);
    App.toast('Бюджеты сохранены', { type: 'success' });
    renderTable();
  }

  function bindActions() {
    const tbody = document.querySelector('#budgets-table tbody');
    if (!tbody) return;
    tbody.addEventListener('input', (event) => {
      const cell = event.target.closest('[data-field]');
      if (!cell) return;
      const index = parseInt(cell.parentElement.dataset.index, 10);
      const field = cell.dataset.field;
      const value = cell.textContent.trim();
      budgets.items[index][field] = field === 'budget' ? parseFloat(value.replace(',', '.')) || 0 : value;
    });
    tbody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="delete"]');
      if (!btn) return;
      const row = btn.closest('tr');
      const index = parseInt(row.dataset.index, 10);
      budgets.items.splice(index, 1);
      renderTable();
    });
  }

  function bindButtons() {
    const addBtn = document.getElementById('btn-budget-add');
    const saveBtn = document.getElementById('btn-budget-save');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        budgets.items = budgets.items || [];
        budgets.items.push({ category: '', subcategory: '', pnl: '', budget: 0 });
        renderTable();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', saveBudgets);
    }
  }

  function renderSummary() {
    const totalPlan = (budgets.items || []).reduce((acc, item) => acc + (item.budget || 0), 0);
    const totalFact = (budgets.items || []).reduce((acc, item) => {
      const actual = actualFor(item);
      return acc + (actual < 0 ? Math.abs(actual) : actual);
    }, 0);
    const summary = document.getElementById('budgets-summary');
    if (summary) {
      summary.textContent = `План: ${App.formatCurrency(totalPlan)} · Факт: ${App.formatCurrency(totalFact)} · Δ ${App.formatCurrency(totalFact - totalPlan)}`;
    }
  }

  App.ready(async () => {
    try {
      budgets = await ensureBudgets();
    } catch (err) {
      console.error(err);
      budgets = { currency: 'RUB', items: [] };
    }
    try {
      pnlMap = await ensurePnlMap();
    } catch (err) {
      console.warn('P&L map unavailable', err);
      pnlMap = {};
    }
    renderTable();
    renderSummary();
    bindActions();
    bindButtons();
    App.on('ledger:updated', () => {
      renderTable();
      renderSummary();
    });
  });
})();

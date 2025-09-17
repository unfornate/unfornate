(function () {
  let pnlMap = null;
  let budgets = null;

  function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function ensurePnlMap() {
    if (App.state.pnlMap) return (pnlMap = App.state.pnlMap);
    const response = await fetch('data/pnl_map.sample.json');
    if (!response.ok) throw new Error('Не удалось загрузить pnl_map.sample.json');
    const data = await response.json();
    pnlMap = data;
    App.savePnlMap(data);
    return data;
  }

  async function ensureBudgets() {
    if (App.state.budgets) return (budgets = App.state.budgets);
    const response = await fetch('data/budgets.sample.json');
    if (!response.ok) throw new Error('Не удалось загрузить budgets.sample.json');
    const data = await response.json();
    budgets = data;
    App.saveBudgets(data);
    return data;
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
    if (op.amount >= 0) return 'Other Income';
    return 'Other Expense';
  }

  function deriveLines(lines) {
    const base = Array.from(new Set(lines));
    if (!base.includes('Revenue')) base.push('Revenue');
    if (!base.includes('COGS')) base.push('COGS');
    if (!base.includes('Other Income')) base.push('Other Income');
    if (!base.includes('Other Expense')) base.push('Other Expense');
    const opex = base.filter(line => line.startsWith('OPEX:'));
    const derived = ['Gross Profit', 'OPEX', ...opex, 'EBITDA', 'Net'];
    return { base, derived };
  }

  function allocateOperations(operations) {
    return operations.map(op => ({ ...op, pnl_line: resolveLine(op) }));
  }

  function filterByPeriod(operations, from, to) {
    if (!from && !to) return operations;
    return operations.filter(op => {
      const month = monthKey(op.date || op.bookingDate);
      if (from && month < from) return false;
      if (to && month > to) return false;
      return true;
    });
  }

  function rollupByMonth(operations) {
    const buckets = {};
    operations.forEach(op => {
      const month = monthKey(op.date || op.bookingDate);
      buckets[month] = buckets[month] || [];
      buckets[month].push(op);
    });
    return Object.keys(buckets).sort().map(month => ({
      month,
      operations: buckets[month]
    }));
  }

  function sumByLine(operations, line) {
    return operations
      .filter(op => op.pnl_line === line)
      .reduce((acc, op) => acc + op.amount, 0);
  }

  function sumOpex(operations) {
    return operations
      .filter(op => op.pnl_line && op.pnl_line.startsWith('OPEX:'))
      .reduce((acc, op) => acc + op.amount, 0);
  }

  function buildRow(month, operations, lines) {
    const row = { month };
    lines.base.forEach(line => {
      row[line] = sumByLine(operations, line);
    });
    const gross = (row['Revenue'] || 0) + (row['COGS'] || 0);
    const opexTotal = sumOpex(operations);
    const otherIncome = row['Other Income'] || 0;
    const otherExpense = row['Other Expense'] || 0;
    row['Gross Profit'] = gross;
    row['OPEX'] = opexTotal;
    row['EBITDA'] = gross + opexTotal;
    row['Net'] = gross + opexTotal + otherIncome + otherExpense;
    lines.base.filter(line => line.startsWith('OPEX:')).forEach(line => {
      row[line] = sumByLine(operations, line);
    });
    return row;
  }

  function getBudget(line, month) {
    if (!budgets || !budgets.items) return null;
    const entry = budgets.items.find(item => item.pnl === line && (!budgets.period || budgets.period === month));
    return entry ? entry.budget : null;
  }

  function renderTable(rows, lines) {
    const table = document.getElementById('tbl-pnl');
    if (!table) return;
    const header = table.querySelector('thead tr');
    const body = table.querySelector('tbody');
    header.innerHTML = '<th data-sort="month">Период</th>';
    const opexLines = lines.base.filter(line => line.startsWith('OPEX:'));
    const extras = lines.base.filter(line => !['Revenue', 'COGS', 'Other Income', 'Other Expense'].includes(line) && !line.startsWith('OPEX:'));
    const order = ['Revenue', 'COGS', 'Gross Profit', 'OPEX', ...opexLines, ...extras, 'EBITDA', 'Other Income', 'Other Expense', 'Net'];
    order.forEach(line => {
      header.innerHTML += `<th data-sort="${line}">${line}</th><th class="plan">План</th><th class="delta">Δ</th>`;
    });
    body.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.month}</td>`;
      order.forEach(line => {
        const fact = row[line] || 0;
        const plan = getBudget(line, row.month);
        const delta = plan != null ? fact - plan : null;
        tr.innerHTML += `
          <td class="right">${App.formatCurrency(fact)}</td>
          <td class="right muted">${plan != null ? App.formatCurrency(plan) : '—'}</td>
          <td class="right ${delta != null ? (delta >= 0 ? 'positive' : 'negative') : ''}">${delta != null ? App.formatCurrency(delta) : '—'}</td>
        `;
      });
      body.appendChild(tr);
    });
  }

  function renderSummary(rows) {
    const summaryEl = document.getElementById('pnl-summary');
    if (!summaryEl) return;
    const totalNet = rows.reduce((acc, row) => acc + (row['Net'] || 0), 0);
    summaryEl.textContent = `Суммарная прибыль за период: ${App.formatCurrency(totalNet)}`;
  }

  function rerender() {
    const from = document.getElementById('pnl-from').value;
    const to = document.getElementById('pnl-to').value;
    const allocated = allocateOperations(filterByPeriod(App.state.ledger, from, to));
    const months = rollupByMonth(allocated);
    const lines = deriveLines(allocated.map(op => op.pnl_line).filter(Boolean));
    const rows = months.map(bucket => buildRow(bucket.month, bucket.operations, lines));
    renderTable(rows, lines);
    renderSummary(rows);
  }

  App.ready(async () => {
    try {
      pnlMap = await ensurePnlMap();
    } catch (err) {
      console.error(err);
      App.toast('Не удалось загрузить маппинг P&L', { type: 'error' });
    }
    try {
      budgets = await ensureBudgets();
    } catch (err) {
      console.warn('Budgets load error', err);
    }
    const toInput = document.getElementById('pnl-to');
    const fromInput = document.getElementById('pnl-from');
    if (toInput && !toInput.value) {
      const now = new Date();
      toInput.value = monthKey(now);
    }
    if (fromInput && !fromInput.value) {
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 5);
      fromInput.value = monthKey(fromDate);
    }
    rerender();
    App.on('ledger:updated', rerender);
    if (fromInput) fromInput.addEventListener('change', rerender);
    if (toInput) toInput.addEventListener('change', rerender);
  });
})();

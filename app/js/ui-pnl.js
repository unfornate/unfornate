(function () {
  let pnlMap = null;

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

  function resolveLine(op) {
    if (!pnlMap) return op.amount >= 0 ? 'Revenue' : 'Other Expense';
    const needleCategory = (op.category || '').toLowerCase();
    const needleSub = (op.subcategory || '').toLowerCase();
    for (const [line, categories] of Object.entries(pnlMap)) {
      for (const entry of categories) {
        const match = entry.toLowerCase();
        if (!match) continue;
        if (needleCategory === match || needleSub === match) return line;
        if (needleCategory.includes(match) || needleSub.includes(match)) return line;
      }
    }
    if (op.amount >= 0) return 'Other Income';
    return 'Other Expense';
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

  function deriveLines(lines) {
    const base = Array.from(new Set(lines));
    if (!base.includes('Revenue')) base.push('Revenue');
    if (!base.includes('COGS')) base.push('COGS');
    if (!base.includes('Other Income')) base.push('Other Income');
    if (!base.includes('Other Expense')) base.push('Other Expense');
    const opex = base.filter(line => line.startsWith('OPEX:'));
    const derived = ['Gross Profit', 'OPEX', ...opex, 'EBITDA', 'Other Income', 'Other Expense', 'Net'];
    return { base, derived };
  }

  function buildRow(month, operations, lines) {
    const row = { month };
    lines.base.forEach(line => {
      row[line] = sumByLine(operations, line);
    });
    const revenue = row['Revenue'] || 0;
    const cogs = row['COGS'] || 0;
    const gross = revenue + cogs;
    const opexTotal = sumOpex(operations);
    const otherIncome = row['Other Income'] || 0;
    const otherExpense = row['Other Expense'] || 0;
    row['Gross Profit'] = gross;
    row['OPEX'] = opexTotal;
    lines.base.filter(line => line.startsWith('OPEX:')).forEach(line => {
      row[line] = sumByLine(operations, line);
    });
    row['EBITDA'] = gross + opexTotal;
    row['Net'] = gross + opexTotal + otherIncome + otherExpense;
    return row;
  }

  function renderTable(rows, lines) {
    const table = document.getElementById('tbl-pnl');
    if (!table) return;
    const header = table.querySelector('thead tr');
    const body = table.querySelector('tbody');
    const opexLines = lines.base.filter(line => line.startsWith('OPEX:'));
    const extras = lines.base.filter(line => !['Revenue', 'COGS', 'Other Income', 'Other Expense'].includes(line) && !line.startsWith('OPEX:'));
    const order = ['Revenue', 'COGS', 'Gross Profit', 'OPEX', ...opexLines, ...extras, 'EBITDA', 'Other Income', 'Other Expense', 'Net'];
    header.innerHTML = '<th data-sort="month">Период</th>' + order.map(line => `<th>${line}</th>`).join('');
    body.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.month}</td>`;
      order.forEach(line => {
        tr.innerHTML += `<td class="right">${App.formatCurrency(row[line] || 0)}</td>`;
      });
      body.appendChild(tr);
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${order.length + 1}">Нет данных для выбранного периода.</td>`;
      body.appendChild(tr);
    }
  }

  function renderSummary(rows) {
    const summaryEl = document.getElementById('pnl-summary');
    if (!summaryEl) return;
    const totalNet = rows.reduce((acc, row) => acc + (row['Net'] || 0), 0);
    summaryEl.textContent = `Суммарная прибыль за период: ${App.formatCurrency(totalNet)}`;
  }

  function filterBusiness(ledger) {
    return ledger.filter(op => (op.scope || '').toLowerCase() === 'business');
  }

  function rerender() {
    const from = document.getElementById('pnl-from').value;
    const to = document.getElementById('pnl-to').value;
    const businessOps = filterBusiness(App.state.ledger);
    const allocated = allocateOperations(filterByPeriod(businessOps, from, to));
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

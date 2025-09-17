(function () {
  function weekKey(date) {
    const d = new Date(date);
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7; // monday-based
    target.setDate(target.getDate() - dayNr);
    const year = target.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const week = Math.round(((target - firstJan) / 86400000 + dayNr + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function dayKey(date) {
    return App.formatDate(date);
  }

  function filterByMonth(ops, monthValue) {
    if (!monthValue) return ops;
    return ops.filter(op => App.formatDate(op.date || op.bookingDate).slice(0, 7) === monthValue);
  }

  function aggregateTrend(ops, granularity) {
    const keyFn = granularity === 'D' ? dayKey : (granularity === 'W' ? weekKey : monthKey);
    const buckets = {};
    ops.forEach(op => {
      const key = keyFn(op.date || op.bookingDate);
      if (!buckets[key]) {
        buckets[key] = { revenue: 0, expense: 0 };
      }
      if (op.amount >= 0) {
        buckets[key].revenue += op.amount;
      } else {
        buckets[key].expense += Math.abs(op.amount);
      }
    });
    const sortedKeys = Object.keys(buckets).sort();
    return {
      labels: sortedKeys,
      revenue: sortedKeys.map(k => buckets[k].revenue),
      expense: sortedKeys.map(k => buckets[k].expense)
    };
  }

  function aggregateCategories(ops) {
    const buckets = {};
    ops.filter(op => op.amount < 0).forEach(op => {
      const key = op.category || op.subcategory || 'Без категории';
      buckets[key] = (buckets[key] || 0) + Math.abs(op.amount);
    });
    const entries = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      labels: entries.map(([name]) => name),
      values: entries.map(([, value]) => value)
    };
  }

  function aggregateTopExpenses(ops) {
    return ops
      .filter(op => op.amount < 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);
  }

  function aggregateCashflow(ops) {
    const buckets = {};
    ops.forEach(op => {
      const key = weekKey(op.date || op.bookingDate);
      if (!buckets[key]) buckets[key] = { inflow: 0, outflow: 0 };
      if (op.amount >= 0) buckets[key].inflow += op.amount;
      else buckets[key].outflow += Math.abs(op.amount);
    });
    const keys = Object.keys(buckets).sort();
    return {
      labels: keys,
      inflow: keys.map(k => buckets[k].inflow),
      outflow: keys.map(k => buckets[k].outflow)
    };
  }

  function calcKpi(ops) {
    const revenue = ops.filter(op => op.amount >= 0).reduce((acc, op) => acc + op.amount, 0);
    const expense = ops.filter(op => op.amount < 0).reduce((acc, op) => acc + op.amount, 0);
    const profit = revenue + expense;
    const balance = App.state.ledger.reduce((acc, op) => acc + op.amount, 0);
    const months = Pivot.rollup(App.state.ledger.filter(op => op.amount < 0), {
      groupBy: [op => monthKey(op.date || op.bookingDate)],
      metrics: { expense: Pivot.sum('amount') }
    });
    const avgOutflow = months.length
      ? months.reduce((acc, item) => acc + Math.abs(item.expense), 0) / months.length
      : Math.abs(expense);
    const runway = avgOutflow > 0 ? balance / avgOutflow : null;
    const pending = App.state.ledger
      .filter(op => new Date(op.bookingDate || op.date) > new Date())
      .reduce((acc, op) => acc + op.amount, 0);
    return { revenue, expense: Math.abs(expense), profit, runway, pending };
  }

  function renderKpi(kpi) {
    document.getElementById('kpi-revenue').textContent = App.formatCurrency(kpi.revenue);
    document.getElementById('kpi-expense').textContent = App.formatCurrency(kpi.expense);
    document.getElementById('kpi-profit').textContent = App.formatCurrency(kpi.profit);
    document.getElementById('kpi-runway').textContent = kpi.runway != null ? `${App.formatNumber(kpi.runway, 1)} мес.` : '∞';
    const pendingEl = document.getElementById('kpi-pending');
    if (pendingEl) {
      pendingEl.textContent = App.formatCurrency(kpi.pending);
    }
  }

  function renderTrend(trend) {
    ChartUtils.createChart('chart-trend', {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: [
          {
            label: 'Доход',
            data: trend.revenue,
            borderColor: '#16a34a',
            backgroundColor: 'rgba(22,163,74,0.2)',
            tension: 0.35,
            fill: true
          },
          {
            label: 'Расход',
            data: trend.expense,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.18)',
            tension: 0.35,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: value => App.formatNumber(value)
            }
          }
        }
      }
    });
  }

  function renderCategories(cats) {
    ChartUtils.createChart('chart-cats', {
      type: 'doughnut',
      data: {
        labels: cats.labels,
        datasets: [{
          data: cats.values,
          backgroundColor: ['#2563eb', '#7c3aed', '#ef4444', '#f97316', '#10b981', '#14b8a6', '#facc15', '#6366f1']
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function renderCashflow(cf) {
    ChartUtils.createChart('chart-cashflow', {
      type: 'bar',
      data: {
        labels: cf.labels,
        datasets: [
          {
            label: 'Притоки',
            backgroundColor: '#22c55e',
            data: cf.inflow
          },
          {
            label: 'Оттоки',
            backgroundColor: '#f97316',
            data: cf.outflow
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          y: {
            ticks: {
              callback: value => App.formatNumber(value)
            }
          }
        }
      }
    });
  }

  function renderTopExpenses(list) {
    const tbody = document.querySelector('#tbl-top tbody');
    tbody.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      const tdTitle = document.createElement('td');
      tdTitle.textContent = item.title;
      const tdAmount = document.createElement('td');
      tdAmount.textContent = App.formatCurrency(item.amount);
      tdAmount.className = 'right';
      tr.append(tdTitle, tdAmount);
      tbody.appendChild(tr);
    });
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'Нет данных';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function rerender() {
    const monthInput = document.getElementById('month');
    const granularity = document.getElementById('granularity').value;
    const filtered = filterByMonth(App.state.ledger, monthInput.value);
    const kpi = calcKpi(filtered);
    renderKpi(kpi);
    const trend = aggregateTrend(filtered, granularity);
    renderTrend(trend);
    renderCategories(aggregateCategories(filtered));
    renderCashflow(aggregateCashflow(filtered));
    renderTopExpenses(aggregateTopExpenses(filtered));
  }

  App.ready(async () => {
    const monthInput = document.getElementById('month');
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    try {
      await DictionaryStore.ensureDictionary();
    } catch (err) {
      console.warn('Dictionary load error', err);
      App.toast('Не удалось загрузить словарь. Используются сохранённые данные.', { type: 'error' });
    }
    rerender();
    App.on('ledger:updated', rerender);
    if (monthInput) monthInput.addEventListener('change', rerender);
    const granularity = document.getElementById('granularity');
    if (granularity) granularity.addEventListener('change', rerender);
  });
})();

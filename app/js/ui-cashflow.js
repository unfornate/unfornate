(function () {
  function dateKey(date) {
    return App.formatDate(date);
  }

  function aggregateDaily(ops) {
    const buckets = {};
    ops.forEach(op => {
      const day = dateKey(op.date || op.bookingDate);
      if (!buckets[day]) buckets[day] = { inflow: 0, outflow: 0 };
      if (op.amount >= 0) buckets[day].inflow += op.amount;
      else buckets[day].outflow += Math.abs(op.amount);
    });
    return Object.keys(buckets).sort().map(day => ({
      day,
      inflow: buckets[day].inflow,
      outflow: buckets[day].outflow,
      net: buckets[day].inflow - buckets[day].outflow
    }));
  }

  function buildWaterfall(daily) {
    let balance = 0;
    return daily.map(entry => {
      balance += entry.net;
      return { ...entry, balance };
    });
  }

  function detectRegularPayments(ops) {
    const map = new Map();
    ops.filter(op => op.amount < 0).forEach(op => {
      const key = op.title;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(new Date(op.date || op.bookingDate));
    });
    const regular = [];
    map.forEach((dates, title) => {
      if (dates.length < 3) return;
      dates.sort((a, b) => a - b);
      let consistent = true;
      let interval = null;
      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / 86400000;
        if (!interval) interval = diff;
        else if (Math.abs(diff - interval) > 3) {
          consistent = false;
          break;
        }
      }
      if (consistent && interval) {
        const sample = ops.find(op => op.title === title && op.amount < 0);
        regular.push({ title, interval: Math.round(interval), amount: sample ? Math.abs(sample.amount) : 0 });
      }
    });
    return regular;
  }

  function forecast(daily, horizonDays = 90) {
    const recent = daily.slice(-30);
    const avgNet = recent.length ? recent.reduce((acc, item) => acc + item.net, 0) / recent.length : 0;
    const currentBalance = daily.length ? buildWaterfall(daily).slice(-1)[0].balance : 0;
    return [30, 60, horizonDays].map(days => ({
      horizon: days,
      projected: currentBalance + avgNet * days
    }));
  }

  function renderChart(daily) {
    const labels = daily.map(item => item.day);
    const inflow = daily.map(item => item.inflow);
    const outflow = daily.map(item => item.outflow);
    const net = daily.map(item => item.net);
    ChartUtils.createChart('cashflow-chart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Притоки', data: inflow, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.15)', fill: true, tension: 0.3 },
          { label: 'Оттоки', data: outflow, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.18)', fill: true, tension: 0.3 },
          { label: 'Чистый поток', data: net, borderColor: '#2563eb', tension: 0.3 }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function renderTable(waterfall) {
    const tbody = document.querySelector('#cashflow-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    waterfall.slice(-60).forEach(entry => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${entry.day}</td>
        <td class="right">${App.formatCurrency(entry.inflow)}</td>
        <td class="right">${App.formatCurrency(-entry.outflow)}</td>
        <td class="right ${entry.net >= 0 ? 'positive' : 'negative'}">${App.formatCurrency(entry.net)}</td>
        <td class="right">${App.formatCurrency(entry.balance)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderRegular(regular) {
    const list = document.getElementById('regular-list');
    if (!list) return;
    list.innerHTML = '';
    if (!regular.length) {
      list.innerHTML = '<li>Регулярные платежи не обнаружены.</li>';
      return;
    }
    regular.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.title}: каждые ${item.interval} дней, ${App.formatCurrency(item.amount)}`;
      list.appendChild(li);
    });
  }

  function renderForecast(forecastData) {
    const tbody = document.querySelector('#forecast-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    forecastData.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.horizon} дней</td>
        <td class="right ${item.projected >= 0 ? 'positive' : 'negative'}">${App.formatCurrency(item.projected)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function rerender() {
    const operations = App.state.ledger.slice().sort((a, b) => new Date(a.date || a.bookingDate) - new Date(b.date || b.bookingDate));
    const daily = aggregateDaily(operations);
    const waterfall = buildWaterfall(daily);
    renderChart(daily);
    renderTable(waterfall);
    renderRegular(detectRegularPayments(operations));
    renderForecast(forecast(daily));
  }

  App.ready(() => {
    rerender();
    App.on('ledger:updated', rerender);
  });
})();

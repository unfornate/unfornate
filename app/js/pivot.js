(function () {
  function groupKey(parts) {
    return parts.map(p => (p ?? '__null__')).join('||');
  }

  function rollup(data, { groupBy = [], metrics = {} }) {
    const map = new Map();
    data.forEach(item => {
      const parts = groupBy.map(fn => fn(item));
      const key = groupKey(parts);
      if (!map.has(key)) {
        map.set(key, { parts, rows: [] });
      }
      map.get(key).rows.push(item);
    });

    const result = [];
    map.forEach(bucket => {
      const row = {};
      groupBy.forEach((fn, idx) => {
        row[`key${idx}`] = bucket.parts[idx];
      });
      Object.entries(metrics).forEach(([name, agg]) => {
        try {
          row[name] = agg(bucket.rows);
        } catch (err) {
          console.warn('Ошибка агрегации', err);
          row[name] = null;
        }
      });
      row.rows = bucket.rows;
      result.push(row);
    });

    return result;
  }

  function sum(field) {
    return rows => rows.reduce((acc, row) => acc + (parseFloat(row[field]) || 0), 0);
  }

  function avg(field) {
    return rows => {
      if (!rows.length) return 0;
      const total = rows.reduce((acc, row) => acc + (parseFloat(row[field]) || 0), 0);
      return total / rows.length;
    };
  }

  function count() {
    return rows => rows.length;
  }

  function max(field) {
    return rows => rows.reduce((acc, row) => Math.max(acc, parseFloat(row[field]) || 0), -Infinity);
  }

  function min(field) {
    return rows => rows.reduce((acc, row) => Math.min(acc, parseFloat(row[field]) || 0), Infinity);
  }

  function sortBy(rows, compare) {
    return rows.slice().sort(compare);
  }

  window.Pivot = {
    rollup,
    sum,
    avg,
    count,
    max,
    min,
    sortBy
  };
})();

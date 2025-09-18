(function () {
  const CSV_HEADERS = ['Дата', 'Описание', 'Категория', 'Подкатегория', 'Сегмент', 'Сумма', 'Источник', 'Комментарий'];

  function formatRow(op) {
    const date = App.formatDate(op.date);
    const title = (op.title || op.title_raw || '').replace(/"/g, '""');
    const category = (op.category || '').replace(/"/g, '""');
    const subcategory = (op.subcategory || '').replace(/"/g, '""');
    const scope = (op.scope || '').replace(/"/g, '""');
    const amount = (op.amount || 0).toString().replace('.', ',');
    const source = op.source_file || op.bank || op.source_pdf || '';
    const comment = (op.comment || '').replace(/"/g, '""');
    return [date, title, category, subcategory, scope, amount, source, comment]
      .map(value => `"${value}"`).join(';');
  }

  function toCsv(operations) {
    const rows = [CSV_HEADERS.join(';')];
    operations.forEach(op => rows.push(formatRow(op)));
    return rows.join('\n');
  }

  function downloadCsv(operations, filename) {
    const csv = toCsv(operations);
    App.downloadBlob(csv, filename, 'text/csv;charset=utf-8');
  }

  function toXlsx(operations, summary = []) {
    if (!window.XLSX) {
      throw new Error('SheetJS не загружен');
    }
    const wb = XLSX.utils.book_new();
    const opSheet = XLSX.utils.json_to_sheet(operations.map(op => ({
      'Дата': App.formatDate(op.date),
      'Описание': op.title || op.title_raw,
      'Категория': op.category || '',
      'Подкатегория': op.subcategory || '',
      'Сегмент': op.scope || '',
      'Сумма': op.amount,
      'Валюта': op.currency || 'RUB',
      'Банк': op.bank,
      'Источник': op.source_file || '',
      'Комментарий': op.comment || ''
    })));
    XLSX.utils.book_append_sheet(wb, opSheet, 'Операции');
    if (summary.length) {
      const summarySheet = XLSX.utils.json_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Своды');
    }
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  function downloadXlsx(operations, summary, filename) {
    const buffer = toXlsx(operations, summary);
    App.downloadBlob(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  window.Exporter = {
    toCsv,
    downloadCsv,
    toXlsx,
    downloadXlsx
  };
})();

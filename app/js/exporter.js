(function () {
  function makeField(header, getter) {
    return { header, csv: getter, excel: getter };
  }

  function formatDateForExport(date) {
    if (!date) return '';
    const formatted = App.formatDate(date);
    return formatted === '—' ? '' : formatted;
  }

  function parseAmount(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getAmountValue(op) {
    if (!op || op.amount === undefined || op.amount === null) return null;
    return parseAmount(op.amount);
  }

  function formatAmountForCsv(amount) {
    if (amount === null) return '';
    return amount.toFixed(2).replace('.', ',');
  }

  function formatAmountForExcel(amount) {
    if (amount === null) return null;
    return parseFloat(amount.toFixed(2));
  }

  function getSignValue(op, amount) {
    if (op && op.sign !== undefined && op.sign !== null) {
      const numericSign = Number(op.sign);
      if (!Number.isNaN(numericSign)) {
        if (numericSign > 0) return 1;
        if (numericSign < 0) return -1;
        return 0;
      }
    }
    if (amount === null) return '';
    if (amount > 0) return 1;
    if (amount < 0) return -1;
    return 0;
  }

  function sanitizeCsvValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && !Number.isFinite(value)) return '';
    const str = String(value);
    return str.replace(/"/g, '""');
  }

  function getSegment(op) {
    return op.segment || op.project || '';
  }

  const EXPORT_FIELDS = [
    makeField('Дата', op => formatDateForExport(op.date || op.bookingDate)),
    makeField('Дата проводки', op => formatDateForExport(op.bookingDate)),
    makeField('Описание', op => op.title || op.title_raw || ''),
    makeField('Описание (raw)', op => op.title_raw || ''),
    makeField('Категория', op => op.category || ''),
    makeField('Подкатегория', op => op.subcategory || ''),
    makeField('Сегмент', op => getSegment(op)),
    makeField('Контрагент', op => op.counterparty || ''),
    makeField('MCC', op => op.mcc || ''),
    {
      header: 'Сумма',
      csv: op => {
        const amount = getAmountValue(op);
        return amount === null ? '' : formatAmountForCsv(amount);
      },
      excel: op => {
        const amount = getAmountValue(op);
        return formatAmountForExcel(amount);
      }
    },
    {
      header: 'Знак',
      csv: op => getSignValue(op, getAmountValue(op)),
      excel: op => getSignValue(op, getAmountValue(op))
    },
    makeField('Валюта', op => op.currency || 'RUB'),
    makeField('Банк', op => op.bank || ''),
    makeField('Источник', op => op.source_file || op.source_pdf || op.source || ''),
    makeField('Внешний ID', op => op.externalId || op.external_id || ''),
    makeField('Комментарий', op => op.comment || '')
  ];

  const CSV_HEADERS = EXPORT_FIELDS.map(field => field.header);

  function formatRow(op) {
    return EXPORT_FIELDS
      .map(field => `"${sanitizeCsvValue(field.csv(op))}"`)
      .join(';');
  }

  function buildXlsxRow(op) {
    return EXPORT_FIELDS.reduce((row, field) => {
      const value = field.excel(op);
      row[field.header] = value === undefined || value === null ? '' : value;
      return row;
    }, {});
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
    const opRows = operations.map(op => buildXlsxRow(op));
    const opSheet = XLSX.utils.aoa_to_sheet([CSV_HEADERS]);
    if (opRows.length) {
      XLSX.utils.sheet_add_json(opSheet, opRows, { origin: 'A2', header: CSV_HEADERS, skipHeader: true });
    }
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

(function () {
  const FIELD_ALIASES = {
    date: ['дата', 'date', 'дата операции', 'дата проводки', 'operation date'],
    bookingDate: ['дата учета', 'дата зачисления', 'booking date'],
    amount: ['сумма', 'amount', 'сумма операции', 'сумма руб', 'итого', 'итог'],
    sign: ['знак', 'sign', 'direction', 'debet/credit', 'debit/credit'],
    type: ['тип', 'type', 'тип операции', 'вид операции', 'operation type'],
    category: ['категория', 'category'],
    subcategory: ['подкатегория', 'subcategory', 'sub category'],
    comment: ['комментарий', 'comment', 'note', 'примечание'],
    bank: ['банк', 'bank', 'источник', 'source', 'способ оплаты', 'payment method'],
    currency: ['валюта', 'currency'],
    title: ['описание', 'description', 'наименование', 'статья', 'title', 'operation description'],
    raw: ['исходное описание', 'raw', 'raw description', 'полное описание', 'source text', 'rawblock', 'raw_block'],
    scope: ['scope', 'segment', 'тип учета', 'тип учёта', 'назначение', 'account type'],
    counterparty: ['контрагент', 'counterparty', 'получатель', 'плательщик'],
    mcc: ['mcc'],
    externalId: ['id', 'external id', 'внешний id', 'номер', 'номер операции']
  };

  const SIGN_NEGATIVE = ['-', 'debit', 'debet', 'расход', 'списание', 'debit card', 'debit_transaction'];
  const SIGN_POSITIVE = ['+', 'credit', 'кредит', 'пополнение', 'зачисление', 'доход', 'income', 'поступление', 'возврат'];

  function normalizeKey(key) {
    return CsvReader.normalizeHeader(key);
  }

  function pick(row, names) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      const normalized = normalizeKey(name);
      if (normalized && row[normalized] != null && row[normalized] !== '') {
        return row[normalized];
      }
      const lower = (typeof name === 'string' ? name.trim().toLowerCase() : '');
      if (lower && row.__lookup && row.__lookup[lower] != null && row.__lookup[lower] !== '') {
        return row.__lookup[lower];
      }
    }
    return '';
  }

  function parseDate(value) {
    if (!value) return null;
    const raw = value.toString().trim();
    if (!raw) return null;
    const localized = raw.replace(/[а-яё]+/gi, '').trim();
    const matchDMY = localized.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/);
    if (matchDMY) {
      const day = matchDMY[1].padStart(2, '0');
      const month = matchDMY[2].padStart(2, '0');
      let year = matchDMY[3];
      if (year.length === 2) {
        year = parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }
    const matchYMD = localized.match(/^(\d{4})[\.\/-](\d{1,2})[\.\/-](\d{1,2})/);
    if (matchYMD) {
      const year = matchYMD[1];
      const month = matchYMD[2].padStart(2, '0');
      const day = matchYMD[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const isoCandidate = raw.length >= 10 ? raw.slice(0, 10) : raw;
    const date = new Date(isoCandidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  function cleanNumber(value) {
    if (value == null) return '';
    return value
      .toString()
      .replace(/\u00A0/g, ' ')
      .replace(/[^0-9,\.-]/g, '')
      .replace(/,/g, '.');
  }

  function parseAmount(value) {
    if (!value) return null;
    let text = value.toString().trim();
    if (!text) return null;
    let negative = false;
    if (/^\(.*\)$/.test(text)) {
      negative = true;
      text = text.slice(1, -1);
    }
    text = cleanNumber(text);
    if (!text) return null;
    const num = parseFloat(text);
    if (Number.isNaN(num)) return null;
    return negative ? -num : num;
  }

  function detectSign(row, amount, fileName) {
    if (amount < 0) return -1;
    if (amount > 0 && amount.toString().startsWith('-')) return -1;
    const signValue = pick(row, FIELD_ALIASES.sign);
    if (signValue) {
      const normalized = signValue.toString().trim().toLowerCase();
      if (SIGN_NEGATIVE.some(pattern => normalized.includes(pattern))) return -1;
      if (SIGN_POSITIVE.some(pattern => normalized.includes(pattern))) return 1;
      if (normalized.startsWith('-')) return -1;
      if (normalized.startsWith('+')) return 1;
    }
    const typeValue = pick(row, FIELD_ALIASES.type) || pick(row, FIELD_ALIASES.category);
    if (typeValue) {
      const normalized = typeValue.toString().trim().toLowerCase();
      if (SIGN_NEGATIVE.some(pattern => normalized.includes(pattern))) return -1;
      if (SIGN_POSITIVE.some(pattern => normalized.includes(pattern))) return 1;
    }
    if (fileName) {
      const lower = fileName.toLowerCase();
      if (lower.includes('расход') || lower.includes('expense') || lower.includes('outgoing')) return -1;
      if (lower.includes('пополн') || lower.includes('income') || lower.includes('incoming')) return 1;
    }
    return amount >= 0 ? 1 : -1;
  }

  function detectCurrency(row) {
    const value = pick(row, FIELD_ALIASES.currency);
    if (!value) return 'RUB';
    const normalized = value.toString().trim().toUpperCase();
    if (!normalized) return 'RUB';
    if (normalized.length === 3) return normalized;
    if (/руб/.test(normalized)) return 'RUB';
    return normalized;
  }

  function detectBank(row) {
    const value = pick(row, FIELD_ALIASES.bank);
    if (!value) return 'csv';
    const normalized = value.toString().trim();
    if (!normalized) return 'csv';
    const lower = normalized.toLowerCase();
    if (lower.includes('т') && lower.includes('банк')) return 'tbank';
    if (lower.includes('альф')) return 'alfa';
    return normalized;
  }

  function detectScope(row, defaultScope = null) {
    const value = pick(row, FIELD_ALIASES.scope);
    if (!value) return defaultScope;
    const normalized = value.toString().trim().toLowerCase();
    if (normalized.includes('бизн') || normalized === 'biz' || normalized === 'business') {
      return 'business';
    }
    if (normalized.includes('лич') || normalized.includes('personal')) {
      return 'personal';
    }
    return defaultScope || normalized || null;
  }

  function detectMcc(row) {
    const value = pick(row, FIELD_ALIASES.mcc);
    if (!value) return null;
    const match = value.toString().match(/\d{4}/);
    return match ? match[0] : null;
  }

  function detectCounterparty(row) {
    const value = pick(row, FIELD_ALIASES.counterparty);
    return value ? value.toString().trim() : null;
  }

  function detectTitle(row) {
    const raw = pick(row, FIELD_ALIASES.raw) || pick(row, FIELD_ALIASES.title);
    return raw ? raw.toString().trim() : '';
  }

  function detectExternalId(row) {
    const value = pick(row, FIELD_ALIASES.externalId);
    return value ? value.toString().trim() : null;
  }

  function buildOperation(row, index, { fileName, defaultScope } = {}) {
    const amountValue = pick(row, FIELD_ALIASES.amount);
    const parsedAmount = parseAmount(amountValue);
    if (parsedAmount == null || Number.isNaN(parsedAmount)) return null;
    const sign = detectSign(row, parsedAmount, fileName);
    const finalAmount = Math.abs(parsedAmount) * sign;

    const dateValue = pick(row, FIELD_ALIASES.date);
    const date = parseDate(dateValue) || parseDate(pick(row, FIELD_ALIASES.bookingDate));
    const bookingDate = parseDate(pick(row, FIELD_ALIASES.bookingDate)) || date;

    const title = detectTitle(row);
    const comment = pick(row, FIELD_ALIASES.comment);
    const category = pick(row, FIELD_ALIASES.category) || null;
    const subcategory = pick(row, FIELD_ALIASES.subcategory) || null;
    const bank = detectBank(row);
    const currency = detectCurrency(row);
    const scope = detectScope(row, defaultScope);
    const mcc = detectMcc(row);
    const counterparty = detectCounterparty(row);
    const externalId = detectExternalId(row);

    return {
      id: App.uid('csv'),
      date: date || bookingDate || null,
      bookingDate: bookingDate || date || null,
      bank,
      amount: finalAmount,
      currency,
      title_raw: title,
      title,
      category,
      subcategory,
      comment: comment || '',
      scope: scope || null,
      mcc,
      counterparty,
      external_id: externalId,
      source_file: fileName || 'csv',
      source_format: 'csv',
      row_index: index
    };
  }

  function parseText(text, options = {}) {
    const { records } = CsvReader.parse(text, options);
    const operations = [];
    records.forEach((record, index) => {
      const op = buildOperation(record, index, options);
      if (op) operations.push(op);
    });
    return operations;
  }

  async function importFile(file, options = {}) {
    const text = await App.readFileAsText(file);
    return parseText(text, { ...options, fileName: file.name });
  }

  window.CsvImporter = {
    parseText,
    importFile,
    buildOperation
  };
})();

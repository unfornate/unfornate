(function () {
  const DATE_RE = /(\d{2}\.\d{2}\.\d{4})/;
  const AMOUNT_RE = /([+-]?\d[\d\s]*,\d{2})\s*(₽|rub|rur)?/i;

  function parseAmount(value) {
    if (!value) return 0;
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    return parseFloat(normalized.replace(/[^0-9\.-]/g, ''));
  }

  function toIso(date) {
    const [d, m, y] = date.split('.');
    return `${y}-${m}-${d}`;
  }

  function parse(pages) {
    const operations = [];
    const raw = [];
    pages.forEach(lines => raw.push(...lines));

    let current = null;
    raw.forEach(line => {
      if (/дата проводки/i.test(line) && /код операции/i.test(line)) {
        return;
      }
      const dateMatch = line.match(DATE_RE);
      if (dateMatch && line.startsWith(dateMatch[0])) {
        if (current) {
          current.description = current.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
          operations.push(current);
        }
        const postingDate = dateMatch[0];
        let rest = line.replace(postingDate, '').trim();
        const codeMatch = rest.match(/^([A-Za-zА-Яа-я0-9]+)/);
        let code = null;
        if (codeMatch) {
          code = codeMatch[1];
          rest = rest.slice(code.length).trim();
        }
        const amountMatch = rest.match(AMOUNT_RE);
        let amount = 0;
        if (amountMatch) {
          amount = parseAmount(amountMatch[1]);
          rest = rest.replace(amountMatch[0], '').trim();
        }
        let mcc = null;
        const mccMatch = rest.match(/mcc\s*(\d{4})/i);
        if (mccMatch) {
          mcc = mccMatch[1];
        }
        current = {
          id: App.uid('alfa'),
          bank: 'alfa',
          bookingDate: toIso(postingDate),
          date: toIso(postingDate),
          code,
          amount,
          sign: amount >= 0 ? 1 : -1,
          title_raw: rest,
          descriptionParts: rest ? [rest] : [],
          currency: 'RUB',
          mcc,
          source: 'pdf'
        };
        return;
      }
      if (!current) return;
      if (/страница\s+\d+/i.test(line)) return;
      current.descriptionParts.push(line);
      if (!current.mcc) {
        const mccMatch = line.match(/mcc\s*(\d{4})/i);
        if (mccMatch) current.mcc = mccMatch[1];
      }
    });

    if (current) {
      current.description = current.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
      operations.push(current);
    }

    const normalized = operations
      .filter(op => op.amount !== 0)
      .map(op => {
        const description = (op.description || op.title_raw || '').replace(/\s+/g, ' ').trim();
        return {
          id: op.id,
          bank: 'alfa',
          date: op.date,
          bookingDate: op.bookingDate,
          amount: op.amount,
          sign: op.sign,
          currency: 'RUB',
          title_raw: description,
          title: description,
          category: null,
          subcategory: null,
          counterparty: null,
          mcc: op.mcc || null,
          project: null,
          tags: [],
          comment: '',
          code: op.code || null,
          source_pdf: 'alfa'
        };
      });

    return normalized;
  }

  window.ParserAlfa = { parse };
})();

(function () {
  const DATE_TIME_RE = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/;
  const AMOUNT_RE = /([+-]?\d[\d\s]*,\d{2})\s*(₽|rub|rur)?/i;
  const INVESTKOPILKA_RE = /инвесткопилка/i;

  function parseAmount(value) {
    if (!value) return 0;
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    return parseFloat(normalized.replace(/[^0-9\.-]/g, ''));
  }

  function toIso(date, time) {
    const [d, m, y] = date.split('.');
    const isoDate = `${y}-${m}-${d}`;
    return time ? `${isoDate}T${time}:00` : `${isoDate}`;
  }

  function containsInvestkopilka(value) {
    return value ? INVESTKOPILKA_RE.test(value) : false;
  }

  function parse(pages) {
    const operations = [];
    const raw = [];
    pages.forEach(lines => raw.push(...lines));

    let current = null;
    function finalizeCurrent() {
      if (!current) return;
      current.description = current.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
      const haystack = [current.description, current.title_raw].filter(Boolean).join(' ');
      if (containsInvestkopilka(haystack)) {
        current = null;
        return;
      }
      operations.push(current);
      current = null;
    }

    raw.forEach(line => {
      if (/дата и время операции/i.test(line)) {
        return;
      }
      const dateMatch = line.match(DATE_TIME_RE);
      if (dateMatch) {
        finalizeCurrent();
        const [, date, time] = dateMatch;
        const parts = line.replace(DATE_TIME_RE, '').trim();
        const bookingMatch = parts.match(/^(\d{2}\.\d{2}\.\d{4})\s+(.*)$/);
        let bookingDate = null;
        let rest = parts;
        if (bookingMatch) {
          bookingDate = bookingMatch[1];
          rest = bookingMatch[2].trim();
        }
        const amountMatch = rest.match(AMOUNT_RE);
        let amount = 0;
        if (amountMatch) {
          amount = parseAmount(amountMatch[1]);
          rest = rest.replace(amountMatch[0], '').trim();
        }
        current = {
          id: App.uid('tbank'),
          bank: 'tbank',
          bookingDate: bookingDate ? toIso(bookingDate) : null,
          date: toIso(date, time),
          amount: amount,
          currency: 'RUB',
          title_raw: rest,
          descriptionParts: rest ? [rest] : [],
          card: null,
          sign: amount >= 0 ? 1 : -1,
          source: 'pdf'
        };
        const cardMatch = rest.match(/(\d{4}\s\*{4}\s\d{4}|\d{4}\*{4}\d{4})/);
        if (cardMatch) {
          current.card = cardMatch[1];
        }
        return;
      }
      if (!current) return;
      if (/страница\s+\d+/i.test(line)) return;
      if (/остаток на счете/i.test(line)) return;
      current.descriptionParts.push(line);
      if (!current.card) {
        const cardMatch = line.match(/(\d{4}\s\*{4}\s\d{4}|\d{4}\*{4}\d{4})/);
        if (cardMatch) current.card = cardMatch[1];
      }
    });

    finalizeCurrent();

    const normalized = operations
      .filter(op => op.amount !== 0)
      .map(op => {
        const description = (op.description || op.title_raw || '').replace(/\s+/g, ' ').trim();
        return {
          id: op.id,
          bank: 'tbank',
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
          mcc: null,
          project: null,
          tags: [],
          comment: '',
          card: op.card || null,
          source_pdf: 'tbank'
        };
      });

    return normalized;
  }

  window.ParserTBank = { parse };
})();

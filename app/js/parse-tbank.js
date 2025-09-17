(function () {
  const DATE_TIME_INLINE_RE = /(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}:\d{2}))?/;
  const AMOUNT_RE = /([+-]?\d[\d\s]*,\d{2})\s*(₽|rub|rur)?/i;

  function stitchDateTimeLines(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const a = (lines[i] || '').trim();
      const b = (lines[i + 1] || '').trim();
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(a) && /^\d{2}:\d{2}$/.test(b)) {
        out.push(`${a} ${b}`);
        i++;
      } else {
        out.push(lines[i]);
      }
    }
    return out;
  }

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

  function parse(pages) {
    const operations = [];
    const raw = [];
    pages.forEach(lines => {
      raw.push(...stitchDateTimeLines(lines));
    });

    let i = 0;
    while (i < raw.length) {
      const line = raw[i];
      if (/дата и время операции/i.test(line)) {
        i++;
        continue;
      }
      const dateMatch = line.match(DATE_TIME_INLINE_RE);
      if (!dateMatch) {
        i++;
        continue;
      }
      const [, date, time] = dateMatch;
      let rest = line.replace(DATE_TIME_INLINE_RE, '').trim();
      let bookingDate = null;
      let consumed = 1;

      while (!rest && i + consumed < raw.length) {
        const lookahead = raw[i + consumed];
        if (/дата и время операции/i.test(lookahead)) {
          consumed++;
          continue;
        }
        if (/страница\s+\d+/i.test(lookahead) || /остаток на счете/i.test(lookahead)) {
          consumed++;
          continue;
        }
        const nextMatch = lookahead.match(DATE_TIME_INLINE_RE);
        if (nextMatch) {
          if (!bookingDate) {
            bookingDate = toIso(nextMatch[1]);
          }
          const remainder = lookahead.replace(DATE_TIME_INLINE_RE, '').trim();
          consumed++;
          if (remainder) {
            rest = remainder;
            break;
          }
          continue;
        }
        const trimmedNext = (lookahead || '').trim();
        consumed++;
        if (trimmedNext) {
          rest = trimmedNext;
          break;
        }
      }

      let working = rest;
      const bookingMatch = working.match(/^(\d{2}\.\d{2}\.\d{4})(?:\s+\d{2}:\d{2})?\s+(.*)$/);
      if (bookingMatch) {
        bookingDate = toIso(bookingMatch[1]);
        working = bookingMatch[2].trim();
      }

      const amountMatch = working.match(AMOUNT_RE);
      let amount = 0;
      if (amountMatch) {
        amount = parseAmount(amountMatch[1]);
        working = working.replace(amountMatch[0], '').trim();
      }

      const descriptionParts = working ? [working] : [];
      const current = {
        id: App.uid('tbank'),
        bank: 'tbank',
        bookingDate: bookingDate,
        date: toIso(date, time),
        amount,
        currency: 'RUB',
        title_raw: working,
        descriptionParts,
        card: null,
        sign: amount >= 0 ? 1 : -1,
        source: 'pdf'
      };

      if (working) {
        const cardMatch = working.match(/(\d{4}\s\*{4}\s\d{4}|\d{4}\*{4}\d{4}|\b\d{4}\b)/);
        if (cardMatch) {
          current.card = cardMatch[1];
        }
      }

      let idx = i + consumed;
      while (idx < raw.length) {
        const nextLine = raw[idx];
        if (/дата и время операции/i.test(nextLine)) {
          idx++;
          continue;
        }
        if (nextLine && nextLine.match(DATE_TIME_INLINE_RE)) {
          break;
        }
        if (/страница\s+\d+/i.test(nextLine) || /остаток на счете/i.test(nextLine)) {
          idx++;
          continue;
        }
        const trimmed = (nextLine || '').trim();
        if (trimmed) {
          current.descriptionParts.push(trimmed);
          if (current.amount === 0) {
            const m = trimmed.match(AMOUNT_RE);
            if (m) {
              current.amount = parseAmount(m[1]);
              current.sign = current.amount >= 0 ? 1 : -1;
            }
          }
          if (!current.card) {
            const cardMatch = trimmed.match(/(\d{4}\s\*{4}\s\d{4}|\d{4}\*{4}\d{4}|\b\d{4}\b)/);
            if (cardMatch) current.card = cardMatch[1];
          }
        }
        idx++;
      }

      current.description = current.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
      operations.push(current);
      i = idx;
    }

    const normalized = operations
      .filter(op => op.date)
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

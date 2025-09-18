(function () {
  function sanitizeLineEnding(text) {
    return text.replace(/\r\n?/g, '\n');
  }

  function detectDelimiter(headerLine, sampleLine = '') {
    const candidates = [',', ';', '\t', '|'];
    const scores = candidates.map(delim => ({
      delim,
      score: (headerLine.split(delim).length - 1) + (sampleLine ? sampleLine.split(delim).length - 1 : 0)
    }));
    const best = scores.reduce((acc, item) => (item.score > acc.score ? item : acc), { delim: ';', score: 0 });
    return best.score > 0 ? best.delim : ';';
  }

  function normalizeHeader(header) {
    if (header == null) return '';
    return header
      .replace(/^[\ufeff\uFEFF]/, '')
      .replace(/["'«»]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[₽€$£]|\b(rub|rur|uah|usd|eur)\b/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/[^a-zа-яё0-9 %]/gi, ' ')
      .trim()
      .toLowerCase();
  }

  function parseLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && char === delimiter) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current.trim());
    return result;
  }

  function parse(text, { delimiter } = {}) {
    if (!text) return { delimiter: delimiter || ';', headers: [], keys: [], records: [] };
    const normalized = sanitizeLineEnding(text).trim();
    if (!normalized) return { delimiter: delimiter || ';', headers: [], keys: [], records: [] };
    const lines = normalized.split('\n').filter(line => line.trim().length);
    if (!lines.length) return { delimiter: delimiter || ';', headers: [], keys: [], records: [] };

    const headerLine = lines.shift();
    const firstDataLine = lines.find(line => line.trim().length > 0) || '';
    const finalDelimiter = delimiter || detectDelimiter(headerLine, firstDataLine);
    const headers = parseLine(headerLine, finalDelimiter).map(h => h.trim());
    const keys = headers.map(normalizeHeader);

    const records = [];
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const values = parseLine(line, finalDelimiter);
      const lookup = {};
      const record = { __index: index, __original: { headers, values } };
      headers.forEach((header, i) => {
        const value = values[i] != null ? values[i].trim() : '';
        const normalizedHeader = keys[i];
        const lowerHeader = header.trim().toLowerCase();
        if (normalizedHeader) {
          if (record[normalizedHeader] == null) record[normalizedHeader] = value;
          lookup[normalizedHeader] = value;
        }
        if (lowerHeader) {
          lookup[lowerHeader] = value;
        }
      });
      record.__lookup = lookup;
      const hasValue = Object.values(lookup).some(v => v && v.length);
      if (hasValue) {
        records.push(record);
      }
    });

    return {
      delimiter: finalDelimiter,
      headers,
      keys,
      records
    };
  }

  window.CsvReader = {
    parse,
    detectDelimiter,
    normalizeHeader
  };
})();

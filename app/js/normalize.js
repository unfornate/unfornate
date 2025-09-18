(function () {
  const NOISE_PATTERNS = [
    /moscow\s*rus/gi,
    /moskva\s*rus/gi,
    /russian federation/gi,
    /ru\b/gi,
    /russia/gi,
    /\b(?:tinkoff|t-bank)\b/gi,
    /\b(?:card|карта)\s*\*?\d+/gi,
    /\d{4}\s*\*{4}\s*\d{4}/g,
    /\*{4}\d{4}/g
  ];

  function cleanup(text) {
    if (!text) return '';
    let normalized = text
      .replace(/\s+/g, ' ')
      .replace(/[\u00A0]/g, ' ')
      .trim();
    NOISE_PATTERNS.forEach(re => {
      normalized = normalized.replace(re, '').trim();
    });
    return normalized;
  }

  function canonical(text) {
    return cleanup(text).toLowerCase();
  }

  function prettify(text) {
    const clean = cleanup(text);
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function normalizeOperation(op) {
    const raw = op.title_raw || op.title || '';
    const canonicalTitle = canonical(raw);
    return {
      ...op,
      title_raw: raw,
      title_normalized: canonicalTitle,
      title: prettify(raw || canonicalTitle),
      counterparty: op.counterparty || prettify(canonicalTitle.split(/[\/\-]/)[0]) || null
    };
  }

  function normalizeOperations(operations) {
    return operations.map(normalizeOperation);
  }

  window.Normalizer = {
    cleanup,
    canonical,
    prettify,
    normalizeOperation,
    normalizeOperations
  };
})();

(function () {
  function normalize(text) {
    return (text || '').toLowerCase();
  }

  function scoreForTinkoff(text) {
    const needles = [
      'дата и время операции',
      'дата списания',
      'описание операции',
      'tinkoff',
      'т-банк',
      'инвесткопилка',
      'mos.transport'
    ];
    let score = 0;
    const lower = normalize(text);
    needles.forEach(word => {
      if (lower.includes(word)) score += 2;
    });
    if (/\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/.test(text)) score += 3;
    return score;
  }

  function scoreForAlfa(text) {
    const needles = [
      'дата проводки',
      'код операции',
      'альфа',
      'mcc',
      'операция по карте',
      'проводка'
    ];
    let score = 0;
    const lower = normalize(text);
    needles.forEach(word => {
      if (lower.includes(word)) score += 2;
    });
    if (/mcc\s*\d{4}/i.test(text)) score += 3;
    return score;
  }

  function detect(pages) {
    const preview = pages.slice(0, 3).join('\n').toLowerCase();
    const tScore = scoreForTinkoff(preview);
    const aScore = scoreForAlfa(preview);
    if (tScore === 0 && aScore === 0) {
      return { bank: null, confidence: 0, reason: 'Не найдены характерные элементы выписки.' };
    }
    if (tScore > aScore) {
      return { bank: 'tbank', confidence: tScore - aScore, reason: 'Обнаружены заголовки таблицы Т-Банка.' };
    }
    if (aScore > tScore) {
      return { bank: 'alfa', confidence: aScore - tScore, reason: 'Обнаружены поля Альфа-Банк.' };
    }
    return { bank: null, confidence: 0, reason: 'Выписка похожа одновременно на два формата.' };
  }

  window.BankDetect = { detect };
})();

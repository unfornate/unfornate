(function () {
  async function loadDefaultDictionary() {
    const response = await fetch('data/dictionary.json');
    if (!response.ok) throw new Error('Не удалось загрузить dictionary.json');
    const dict = await response.json();
    App.saveDictionary(dict, { skipHistory: true });
    return dict;
  }

  async function ensureDictionary() {
    if (App.state.dictionary) return App.state.dictionary;
    return loadDefaultDictionary();
  }

  function cloneRules(rules) {
    return rules.map(rule => ({ ...rule }));
  }

  function mergeDictionaries(current, incoming) {
    const map = new Map();
    cloneRules(current.rules).forEach(rule => {
      map.set(rule.id || App.uid('rule'), rule);
    });
    const added = [];
    const updated = [];
    incoming.rules.forEach(rule => {
      const id = rule.id || App.uid('rule');
      if (map.has(id)) {
        map.set(id, { ...map.get(id), ...rule });
        updated.push(id);
      } else {
        map.set(id, { ...rule, id });
        added.push(id);
      }
    });
    return {
      dictionary: {
        version: incoming.version || current.version,
        rules: Array.from(map.values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
        mcc_overrides: { ...current.mcc_overrides, ...incoming.mcc_overrides }
      },
      added,
      updated
    };
  }

  function importDictionary(json, { merge = false } = {}) {
    const incoming = typeof json === 'string' ? JSON.parse(json) : json;
    if (!incoming || !Array.isArray(incoming.rules)) {
      throw new Error('Неверный формат словаря');
    }
    if (!merge) {
      App.saveDictionary(incoming);
      return { mode: 'replace', added: incoming.rules.length, updated: 0 };
    }
    const current = App.state.dictionary || { version: incoming.version || 'import', rules: [], mcc_overrides: {} };
    const { dictionary, added, updated } = mergeDictionaries(current, incoming);
    App.saveDictionary(dictionary);
    return { mode: 'merge', added: added.length, updated: updated.length };
  }

  async function resetDictionary() {
    const dict = await loadDefaultDictionary();
    App.toast('Словарь сброшен к значениям по умолчанию', { type: 'success' });
    return dict;
  }

  function deleteRules(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const dict = App.state.dictionary;
    if (!dict) return;
    dict.rules = dict.rules.filter(rule => !ids.includes(rule.id));
    App.saveDictionary(dict);
  }

  function clearDictionary() {
    const empty = {
      version: `cleared_${new Date().toISOString()}`,
      rules: [],
      mcc_overrides: {}
    };
    App.saveDictionary(empty);
    return empty;
  }

  function exportDictionary(pretty = true) {
    const dict = App.state.dictionary;
    if (!dict) return '';
    return JSON.stringify({
      version: dict.version,
      rules: dict.rules,
      mcc_overrides: dict.mcc_overrides
    }, null, pretty ? 2 : 0);
  }

  window.DictionaryStore = {
    ensureDictionary,
    importDictionary,
    exportDictionary,
    resetDictionary,
    mergeDictionaries,
    deleteRules,
    clearDictionary
  };
})();

(function () {
  function compileRule(rule) {
    const type = rule.match?.type || 'exact';
    const value = rule.match?.value || rule.match?.pattern || '';
    let matcher = () => false;
    if (type === 'exact') {
      const target = value.toLowerCase();
      matcher = (text) => text === target;
    } else if (type === 'substring') {
      const target = value.toLowerCase();
      matcher = (text) => text.includes(target);
    } else if (type === 'regex') {
      const pattern = value;
      const regex = new RegExp(pattern, 'i');
      matcher = (text, raw) => regex.test(raw || text);
    }
    return {
      ...rule,
      matcher,
      priority: rule.priority ?? 0
    };
  }

  function getDictionary() {
    const dict = App.state.dictionary;
    if (!dict) return null;
    if (!dict.__compiled) {
      dict.__compiled = dict.rules
        .slice()
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map(compileRule);
    }
    return dict;
  }

  function classifyOperation(operation) {
    const dict = getDictionary();
    if (!dict) return { ...operation, matchedRule: null };

    const canonical = (operation.title_normalized || operation.title || '').toLowerCase();
    const raw = operation.title_raw || operation.title || '';

    let matchedRule = null;
    const mcc = operation.mcc;
    if (mcc && dict.mcc_overrides && dict.mcc_overrides[mcc]) {
      const override = dict.mcc_overrides[mcc];
      matchedRule = {
        id: `mcc_${mcc}`,
        normalize_to: override.normalize_to || operation.title,
        category: override.category || operation.category,
        subcategory: override.subcategory || operation.subcategory,
        scope: override.scope || operation.scope
      };
    }

    if (!matchedRule) {
      for (const rule of dict.__compiled) {
        if (rule.matcher(canonical, raw)) {
          matchedRule = rule;
          break;
        }
      }
    }

    if (!matchedRule) {
      return { ...operation, matchedRule: null };
    }

    const normalizedTitle = matchedRule.normalize_to ? Normalizer.prettify(matchedRule.normalize_to) : operation.title;
    return {
      ...operation,
      title: normalizedTitle || operation.title,
      category: matchedRule.category || operation.category,
      subcategory: matchedRule.subcategory || operation.subcategory,
      scope: matchedRule.scope || operation.scope || null,
      matchedRule: matchedRule.id || matchedRule.match?.value || matchedRule.match?.pattern || null
    };
  }

  function classifyOperations(operations) {
    return operations.map(classifyOperation);
  }

  window.Classifier = {
    classifyOperation,
    classifyOperations
  };
})();

(function () {
  const state = {
    items: []
  };

  function titleVariants(item) {
    return [item.title || '', item.title_raw || '', item.title_normalized || ''];
  }

  function getFragmentValue() {
    const fragmentInput = document.getElementById('unknown-fragment');
    const searchInput = document.getElementById('unknown-search');
    const fragment = fragmentInput ? fragmentInput.value.trim() : '';
    if (fragment) {
      return fragment;
    }
    return searchInput ? searchInput.value.trim() : '';
  }

  function computeFragmentMatches(fragment, type) {
    if (!fragment) {
      return { items: [], error: null };
    }
    if (type === 'regex') {
      try {
        const regex = new RegExp(fragment, 'i');
        const items = state.items.filter(item => titleVariants(item).some(title => regex.test(title)));
        return { items, error: null };
      } catch (error) {
        return { items: [], error };
      }
    }
    const fragmentLower = fragment.toLowerCase();
    const items = state.items.filter(item => {
      return titleVariants(item).some(title => {
        const normalized = title.toLowerCase();
        if (type === 'exact') {
          return normalized === fragmentLower;
        }
        return normalized.includes(fragmentLower);
      });
    });
    return { items, error: null };
  }

  function renderTable(filter = '') {
    const tbody = document.querySelector('#unknown-table tbody');
    const search = filter.toLowerCase();
    tbody.innerHTML = '';
    state.items.forEach(item => {
      if (search && !(item.title || '').toLowerCase().includes(search) && !(item.title_raw || '').toLowerCase().includes(search)) {
        return;
      }
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.innerHTML = `
        <td><input type="checkbox" data-select></td>
        <td>${App.formatDate(item.date || item.bookingDate)}</td>
        <td>${item.title || item.title_raw}</td>
        <td>${item.bank}</td>
        <td class="right">${App.formatCurrency(item.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!tbody.children.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5">Все операции классифицированы! 🎉</td>';
      tbody.appendChild(tr);
    }
    updatePreview();
  }

  function refreshState() {
    state.items = App.state.unknown.slice();
    renderTable(document.getElementById('unknown-search').value);
  }

  function selectedItems() {
    return Array.from(document.querySelectorAll('#unknown-table tbody input[data-select]:checked')).map(input => input.closest('tr').dataset.id);
  }

  function updatePreview() {
    const preview = document.getElementById('unknown-preview');
    if (!preview) {
      return;
    }
    const ids = selectedItems();
    if (ids.length) {
      preview.textContent = `Выбрано операций: ${ids.length}`;
      return;
    }
    const type = document.getElementById('unknown-type').value;
    const fragment = getFragmentValue();
    if (!fragment) {
      preview.textContent = 'Выберите операции или задайте фрагмент для правила';
      return;
    }
    const { items, error } = computeFragmentMatches(fragment, type);
    if (error) {
      preview.textContent = 'Некорректный regex-паттерн';
      return;
    }
    if (!items.length) {
      preview.textContent = 'Подходящих операций не найдено';
      return;
    }
    preview.textContent = `Будет классифицировано: ${items.length}`;
  }

  function createRuleFromSelection() {
    const ids = selectedItems();
    const title = document.getElementById('unknown-normalize').value.trim();
    const category = document.getElementById('unknown-category').value.trim();
    const subcategory = document.getElementById('unknown-subcategory').value.trim();
    const type = document.getElementById('unknown-type').value;
    const priority = parseInt(document.getElementById('unknown-priority').value, 10) || 1000;
    if (!title && type !== 'regex') {
      App.toast('Укажите нормализацию или выберите тип regex', { type: 'error' });
      return;
    }
    const fragment = getFragmentValue();
    let samples = [];
    let match;
    if (ids.length) {
      samples = state.items.filter(item => ids.includes(item.id));
      if (!samples.length) {
        App.toast('Не удалось найти выбранные операции', { type: 'error' });
        return;
      }
      if (type === 'regex') {
        if (!fragment) {
          App.toast('Укажите regex-паттерн для правила', { type: 'error' });
          return;
        }
        match = { type, pattern: fragment };
      } else {
        const basePattern = fragment || title || samples[0].title_normalized || samples[0].title || '';
        if (!basePattern) {
          App.toast('Не удалось определить фрагмент для правила', { type: 'error' });
          return;
        }
        match = { type, value: basePattern.toLowerCase() };
      }
    } else {
      if (!fragment) {
        App.toast('Укажите фрагмент или используйте поиск для создания правила', { type: 'error' });
        return;
      }
      const { items: matches, error } = computeFragmentMatches(fragment, type);
      if (error) {
        App.toast('Некорректный regex-паттерн', { type: 'error' });
        return;
      }
      if (!matches.length) {
        App.toast('Подходящих операций не найдено', { type: 'error' });
        return;
      }
      samples = matches;
      match = type === 'regex' ? { type, pattern: fragment } : { type, value: fragment.toLowerCase() };
    }
    const newRule = {
      id: App.uid('rule'),
      priority,
      match,
      normalize_to: title || samples[0].title || '',
      category,
      subcategory,
      examples: samples.map(item => item.title || item.title_raw).slice(0, 5)
    };
    dictionaryAddRule(newRule);
    const affectedIds = samples.map(item => item.id);
    const remaining = App.state.unknown.filter(item => !affectedIds.includes(item.id));
    App.saveUnknown(remaining);
    reclassifyLedger();
    App.toast('Правило создано и применено', { type: 'success' });
    updatePreview();
  }

  function dictionaryAddRule(rule) {
    const dict = App.state.dictionary;
    dict.rules.push(rule);
    App.saveDictionary(dict);
  }

  function reclassifyLedger() {
    const updated = App.state.ledger.map(op => {
      const normalized = Normalizer.normalizeOperation(op);
      return Classifier.classifyOperation(normalized);
    });
    App.saveLedger(updated);
    const unresolved = updated.filter(op => !op.category);
    App.saveUnknown(unresolved);
  }

  App.ready(async () => {
    await DictionaryStore.ensureDictionary();
    refreshState();
    App.on('unknown:updated', refreshState);
    App.on('ledger:updated', refreshState);
    document.getElementById('unknown-search').addEventListener('input', (event) => {
      renderTable(event.target.value);
    });
    document.getElementById('unknown-fragment').addEventListener('input', updatePreview);
    document.getElementById('unknown-type').addEventListener('change', updatePreview);
    document.querySelector('#unknown-table tbody').addEventListener('change', (event) => {
      if (event.target.matches('input[data-select]')) {
        updatePreview();
      }
    });
    document.getElementById('unknown-create').addEventListener('click', createRuleFromSelection);
    updatePreview();
  });
})();

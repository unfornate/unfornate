(function () {
  const state = {
    items: []
  };

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
  }

  function refreshState() {
    state.items = App.state.unknown.slice();
    renderTable(document.getElementById('unknown-search').value);
  }

  function selectedItems() {
    return Array.from(document.querySelectorAll('#unknown-table tbody input[data-select]:checked')).map(input => input.closest('tr').dataset.id);
  }

  function createRuleFromSelection() {
    const ids = selectedItems();
    if (!ids.length) {
      App.toast('Выберите операции для создания правила', { type: 'error' });
      return;
    }
    const title = document.getElementById('unknown-normalize').value.trim();
    const category = document.getElementById('unknown-category').value.trim();
    const subcategory = document.getElementById('unknown-subcategory').value.trim();
    const type = document.getElementById('unknown-type').value;
    const scope = document.getElementById('unknown-scope').value;
    const priority = parseInt(document.getElementById('unknown-priority').value, 10) || 1000;
    if (!title && type !== 'regex') {
      App.toast('Укажите нормализацию или выберите тип regex', { type: 'error' });
      return;
    }
    const samples = state.items.filter(item => ids.includes(item.id));
    const pattern = type === 'regex' ? document.getElementById('unknown-pattern').value.trim() : (title || samples[0].title_normalized || samples[0].title || '');
    const match = type === 'regex' ? { type, pattern } : { type, value: pattern.toLowerCase() };
    const newRule = {
      id: App.uid('rule'),
      priority,
      match,
      normalize_to: title || samples[0].title || '',
      category,
      subcategory,
      scope: scope ? scope.toLowerCase() : '',
      examples: samples.map(item => item.title || item.title_raw).slice(0, 5)
    };
    dictionaryAddRule(newRule);
    const remaining = App.state.unknown.filter(item => !ids.includes(item.id));
    App.saveUnknown(remaining);
    reclassifyLedger();
    App.toast('Правило создано и применено', { type: 'success' });
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
    document.getElementById('unknown-create').addEventListener('click', createRuleFromSelection);
  });
})();

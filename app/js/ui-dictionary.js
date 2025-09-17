(function () {
  let dictionary = null;
  const selected = new Set();

  function renderTable(filter = '') {
    const tbody = document.querySelector('#dictionary-table tbody');
    const search = filter.toLowerCase();
    tbody.innerHTML = '';
    dictionary.rules.forEach(rule => {
      if (search && !JSON.stringify(rule).toLowerCase().includes(search)) return;
      const tr = document.createElement('tr');
      tr.dataset.id = rule.id;
      if (selected.has(rule.id)) tr.classList.add('selected');
      tr.innerHTML = `
        <td><input type="checkbox" data-select ${selected.has(rule.id) ? 'checked' : ''}></td>
        <td contenteditable="true" data-field="priority">${rule.priority || 0}</td>
        <td>
          <select data-field="type">
            <option value="exact" ${rule.match.type === 'exact' ? 'selected' : ''}>exact</option>
            <option value="substring" ${rule.match.type === 'substring' ? 'selected' : ''}>substring</option>
            <option value="regex" ${rule.match.type === 'regex' ? 'selected' : ''}>regex</option>
          </select>
        </td>
        <td contenteditable="true" data-field="pattern">${rule.match.value || rule.match.pattern || ''}</td>
        <td contenteditable="true" data-field="normalize_to">${rule.normalize_to || ''}</td>
        <td contenteditable="true" data-field="category">${rule.category || ''}</td>
        <td contenteditable="true" data-field="subcategory">${rule.subcategory || ''}</td>
        <td contenteditable="true" data-field="examples">${(rule.examples || []).join(', ')}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!tbody.children.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="8">Совпадений не найдено.</td>';
      tbody.appendChild(tr);
    }
  }

  function persistChanges() {
    dictionary.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    App.saveDictionary(dictionary);
    App.toast('Словарь сохранён', { type: 'success' });
    renderTable(document.getElementById('dict-search').value);
  }

  function bindTableEvents() {
    const tbody = document.querySelector('#dictionary-table tbody');
    tbody.addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[data-select]');
      if (!checkbox) return;
      const row = checkbox.closest('tr');
      const id = row.dataset.id;
      if (checkbox.checked) selected.add(id);
      else selected.delete(id);
      row.classList.toggle('selected', checkbox.checked);
    });
    tbody.addEventListener('input', (event) => {
      const cell = event.target.closest('[data-field]');
      if (!cell) return;
      const row = cell.closest('tr');
      const id = row.dataset.id;
      const rule = dictionary.rules.find(r => r.id === id);
      const field = cell.dataset.field;
      const value = cell.textContent.trim();
      if (field === 'priority') {
        rule.priority = parseInt(value, 10) || 0;
      } else if (field === 'pattern') {
        if (rule.match.type === 'regex') {
          rule.match.pattern = value;
          delete rule.match.value;
        } else {
          rule.match.value = value;
        }
      } else if (field === 'examples') {
        rule.examples = value ? value.split(',').map(v => v.trim()).filter(Boolean) : [];
      } else {
        rule[field] = value;
      }
    });
    tbody.addEventListener('change', (event) => {
      const select = event.target.closest('select[data-field="type"]');
      if (!select) return;
      const row = select.closest('tr');
      const rule = dictionary.rules.find(r => r.id === row.dataset.id);
      const current = rule.match.value || rule.match.pattern || '';
      rule.match = { type: select.value };
      if (select.value === 'regex') {
        rule.match.pattern = current;
      } else {
        rule.match.value = current;
      }
      renderTable(document.getElementById('dict-search').value);
    });
  }

  function addRule() {
    const newRule = {
      id: App.uid('rule'),
      priority: 1000,
      match: { type: 'exact', value: '' },
      normalize_to: '',
      category: '',
      subcategory: '',
      examples: []
    };
    dictionary.rules.unshift(newRule);
    renderTable(document.getElementById('dict-search').value);
  }

  function exportDict() {
    const json = DictionaryStore.exportDictionary(true);
    App.downloadBlob(json, `dictionary_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }

  function importDict(merge) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await App.readFileAsText(file);
        const result = DictionaryStore.importDictionary(text, { merge });
        dictionary = App.state.dictionary;
        renderTable(document.getElementById('dict-search').value);
        App.toast(`Импорт завершён: добавлено ${result.added}, обновлено ${result.updated || 0}`, { type: 'success' });
      } catch (err) {
        console.error(err);
        App.toast('Ошибка импорта словаря', { type: 'error' });
      }
    });
    input.click();
  }

  async function resetDict() {
    await DictionaryStore.resetDictionary();
    dictionary = App.state.dictionary;
    renderTable();
  }

  function applyBulk() {
    if (!selected.size) {
      App.toast('Выберите правила для массового изменения', { type: 'error' });
      return;
    }
    const category = document.getElementById('bulk-category').value;
    const subcategory = document.getElementById('bulk-subcategory').value;
    dictionary.rules.forEach(rule => {
      if (!selected.has(rule.id)) return;
      if (category) rule.category = category;
      if (subcategory) rule.subcategory = subcategory;
    });
    renderTable(document.getElementById('dict-search').value);
    App.toast('Изменения применены. Не забудьте сохранить.', { type: 'info' });
  }

  function highlightDuplicates() {
    const map = new Map();
    dictionary.rules.forEach(rule => {
      const key = (rule.normalize_to || '').toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(rule.id);
    });
    const duplicates = Array.from(map.values()).filter(ids => ids.length > 1).flat();
    document.querySelectorAll('#dictionary-table tbody tr').forEach(tr => {
      tr.classList.toggle('duplicate', duplicates.includes(tr.dataset.id));
    });
    App.toast(duplicates.length ? `Найдено дубликатов: ${duplicates.length}` : 'Дубликаты не обнаружены');
  }

  function checkConflicts() {
    const seen = new Map();
    const conflicts = [];
    dictionary.rules.forEach(rule => {
      const key = `${rule.match.type}:${rule.match.value || rule.match.pattern}`;
      if (seen.has(key)) {
        conflicts.push(rule.id, seen.get(key));
      } else {
        seen.set(key, rule.id);
      }
    });
    document.querySelectorAll('#dictionary-table tbody tr').forEach(tr => {
      tr.classList.toggle('conflict', conflicts.includes(tr.dataset.id));
    });
    App.toast(conflicts.length ? `Конфликтующих правил: ${new Set(conflicts).size}` : 'Конфликты не найдены');
  }

  App.ready(async () => {
    await DictionaryStore.ensureDictionary();
    dictionary = App.state.dictionary;
    renderTable();
    bindTableEvents();

    document.getElementById('dict-search').addEventListener('input', (event) => {
      renderTable(event.target.value);
    });
    document.getElementById('btn-rule-add').addEventListener('click', addRule);
    document.getElementById('btn-rule-save').addEventListener('click', persistChanges);
    document.getElementById('btn-rule-export').addEventListener('click', exportDict);
    document.getElementById('btn-rule-import').addEventListener('click', () => importDict(true));
    document.getElementById('btn-rule-replace').addEventListener('click', () => importDict(false));
    document.getElementById('btn-rule-reset').addEventListener('click', resetDict);
    document.getElementById('btn-rule-duplicates').addEventListener('click', highlightDuplicates);
    document.getElementById('btn-rule-conflicts').addEventListener('click', checkConflicts);
    document.getElementById('btn-rule-bulk').addEventListener('click', applyBulk);
  });
})();

(function () {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function bindPreferences() {
    const currencySelect = document.getElementById('pref-currency');
    const themeSelect = document.getElementById('pref-theme');
    if (currencySelect) {
      currencySelect.value = App.state.preferences.currency || 'RUB';
      currencySelect.addEventListener('change', () => {
        App.savePreferences({ currency: currencySelect.value });
        App.toast('Валюта сохранена');
      });
    }
    if (themeSelect) {
      themeSelect.value = App.state.preferences.theme || 'light';
      applyTheme(themeSelect.value);
      themeSelect.addEventListener('change', () => {
        App.savePreferences({ theme: themeSelect.value });
        applyTheme(themeSelect.value);
      });
    }
  }

  function exportLedger() {
    const json = JSON.stringify(App.state.ledger, null, 2);
    App.downloadBlob(json, `ledger_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }

  function importLedger() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await App.readFileAsText(file);
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Ожидается массив операций');
        App.saveLedger(data);
        App.toast(`Импортировано операций: ${data.length}`, { type: 'success' });
      } catch (err) {
        console.error(err);
        App.toast('Ошибка импорта журнала', { type: 'error' });
      }
    });
    input.click();
  }

  function clearAll() {
    if (!confirm('Удалить все локальные данные?')) return;
    localStorage.clear();
    location.reload();
  }

  function importCsv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await App.readFileAsText(file);
        const rows = text.trim().split(/\r?\n/);
        const headers = rows.shift().split(';').map(h => h.replace(/"/g, '').trim().toLowerCase());
        const ops = rows.map(row => {
          const cols = row.split(';').map(c => c.replace(/^"|"$/g, '').trim());
          const data = {};
          headers.forEach((header, index) => {
            data[header] = cols[index];
          });
          const amount = parseFloat((data['сумма'] || data['amount'] || '0').replace(',', '.')) || 0;
          const date = data['дата'] || data['date'];
          return {
            id: App.uid('csv'),
            date,
            bookingDate: date,
            bank: data['источник'] || data['банк'] || 'csv',
            amount,
            sign: amount >= 0 ? 1 : -1,
            currency: data['валюта'] || App.state.preferences.currency || 'RUB',
            title_raw: data['описание'] || data['title'] || '',
            title: data['описание'] || data['title'] || '',
            category: data['категория'] || data['category'] || null,
            subcategory: data['подкатегория'] || data['subcategory'] || null,
            comment: data['комментарий'] || data['comment'] || '',
            source_pdf: 'csv'
          };
        });
        const normalized = Classifier.classifyOperations(Normalizer.normalizeOperations(ops));
        App.addOperations(normalized);
        App.toast(`Импортировано CSV-операций: ${normalized.length}`, { type: 'success' });
      } catch (err) {
        console.error(err);
        App.toast('Ошибка импорта CSV', { type: 'error' });
      }
    });
    input.click();
  }

  function exportDictionary() {
    const json = DictionaryStore.exportDictionary(true);
    App.downloadBlob(json, `dictionary_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }

  function importDictionary() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await App.readFileAsText(file);
        DictionaryStore.importDictionary(text, { merge: true });
        App.toast('Словарь импортирован', { type: 'success' });
      } catch (err) {
        App.toast('Ошибка импорта словаря', { type: 'error' });
      }
    });
    input.click();
  }

  App.ready(async () => {
    await DictionaryStore.ensureDictionary();
    bindPreferences();
    document.getElementById('btn-ledger-export').addEventListener('click', exportLedger);
    document.getElementById('btn-ledger-import').addEventListener('click', importLedger);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-import-csv').addEventListener('click', importCsv);
    document.getElementById('btn-dict-export').addEventListener('click', exportDictionary);
    document.getElementById('btn-dict-import').addEventListener('click', importDictionary);
  });
})();

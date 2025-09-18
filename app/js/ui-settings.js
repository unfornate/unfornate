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
    if (!confirm('Удалить все операции и отчёты? Словарь останется.')) return;
    App.saveLedger([]);
    App.saveUnknown([]);
    App.saveBudgets(null);
    App.savePnlMap(null);
    localStorage.removeItem(App.STORAGE_KEYS.ledger);
    localStorage.removeItem(App.STORAGE_KEYS.unknown);
    localStorage.removeItem(App.STORAGE_KEYS.budgets);
    localStorage.removeItem(App.STORAGE_KEYS.pnlMap);
    App.toast('Данные очищены. Перезагрузка…', { type: 'success' });
    setTimeout(() => location.reload(), 300);
  }

  function importCsv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.multiple = true;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      let imported = 0;
      for (const file of files) {
        try {
          const rawOps = await CsvImporter.importFile(file, {});
          if (!rawOps.length) continue;
          const normalized = Normalizer.normalizeOperations(rawOps).map(op => ({
            ...op,
            file_name: file.name,
            source_file: file.name,
            uploaded_at: new Date().toISOString(),
            bank: op.bank || 'csv'
          }));
          await DictionaryStore.ensureDictionary();
          const classified = Classifier.classifyOperations(normalized);
          const unknown = classified.filter(op => !op.category);
          if (unknown.length) App.pushUnknown(unknown);
          App.addOperations(classified);
          imported += classified.length;
        } catch (err) {
          console.error(err);
          App.toast(`Ошибка импорта ${file.name}: ${err.message || err}`, { type: 'error' });
        }
      }
      App.toast(imported ? `Импортировано CSV-операций: ${imported}` : 'В выбранных CSV не найдено операций', {
        type: imported ? 'success' : 'warning'
      });
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

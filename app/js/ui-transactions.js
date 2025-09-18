(function () {
  const state = {
    operations: [],
    filtered: [],
    sort: { field: 'date', dir: 'desc' }
  };

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function updateDetectionInfo(info) {
    const el = document.getElementById('bank-detection');
    if (!el) return;
    if (!info || !info.bank) {
      el.textContent = 'Банк не определён.';
      el.className = 'badge negative';
      return;
    }
    const names = { tbank: 'Т-Банк', alfa: 'Альфа-Банк' };
    el.textContent = `Определён банк: ${names[info.bank] || info.bank} (${info.reason})`;
    el.className = 'badge positive';
  }

  function setProgress({ stage, page, total, ratio }) {
    const bar = document.getElementById('upload-progress-bar');
    const text = document.getElementById('upload-progress-text');
    if (!bar || !text) return;
    if (ratio == null) {
      bar.style.width = '0%';
      text.textContent = '';
      return;
    }
    bar.style.width = `${Math.round(ratio * 100)}%`;
    if (stage === 'page') {
      text.textContent = `Страница ${page} из ${total}`;
    } else {
      text.textContent = 'Чтение файла…';
    }
  }

  function formatAmount(amount) {
    const value = App.formatCurrency(amount);
    return amount < 0 ? value : `+${value}`;
  }

  function applyFilters() {
    const bankFilter = document.getElementById('filter-bank').value;
    const categoryFilter = document.getElementById('filter-category').value;
    const textFilter = document.getElementById('filter-text').value.toLowerCase();
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;
    const typeFilter = document.querySelector('[name="filter-type"]:checked')?.value || 'all';

    const filtered = state.operations.filter(op => {
      if (bankFilter && op.bank !== bankFilter) return false;
      if (categoryFilter && op.category !== categoryFilter) return false;
      if (textFilter && !(op.title || '').toLowerCase().includes(textFilter) && !(op.title_raw || '').toLowerCase().includes(textFilter)) {
        return false;
      }
      const opDate = App.formatDate(op.date || op.bookingDate);
      if (startDate && opDate < startDate) return false;
      if (endDate && opDate > endDate) return false;
      if (typeFilter === 'expense' && op.amount >= 0) return false;
      if (typeFilter === 'income' && op.amount < 0) return false;
      return true;
    });

    state.filtered = sortRows(filtered);
    renderTable();
  }

  function sortRows(rows) {
    const { field, dir } = state.sort;
    const sorted = rows.slice().sort((a, b) => {
      let valA = a[field];
      let valB = b[field];
      if (field === 'date') {
        valA = new Date(a.date || a.bookingDate);
        valB = new Date(b.date || b.bookingDate);
      }
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  function updateSort(field) {
    if (state.sort.field === field) {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.field = field;
      state.sort.dir = field === 'date' ? 'desc' : 'asc';
    }
    state.filtered = sortRows(state.filtered);
    renderTable();
  }

  function renderFilters() {
    const bankSelect = document.getElementById('filter-bank');
    const categorySelect = document.getElementById('filter-category');
    if (!bankSelect || !categorySelect) return;
    const banks = unique(state.operations.map(op => op.bank));
    const categories = unique(state.operations.map(op => op.category));
    bankSelect.innerHTML = '<option value="">Все банки</option>' + banks.map(bank => `<option value="${bank}">${bank === 'tbank' ? 'Т-Банк' : bank === 'alfa' ? 'Альфа-Банк' : bank}</option>`).join('');
    categorySelect.innerHTML = '<option value="">Все категории</option>' + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  }

  function renderTable() {
    const tbody = document.querySelector('#tbl-operations tbody');
    const countEl = document.getElementById('ops-count');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.filtered.forEach(op => {
      const tr = document.createElement('tr');
      tr.dataset.id = op.id;
      if (!op.category) {
        tr.classList.add('unknown');
      }
      tr.innerHTML = `
        <td>${App.formatDate(op.date || op.bookingDate)}</td>
        <td>
          <div class="title">${op.title || op.title_raw}</div>
          <div class="muted">${op.bank === 'tbank' ? 'Т-Банк' : op.bank === 'alfa' ? 'Альфа-Банк' : op.bank}${op.mcc ? ` · MCC ${op.mcc}` : ''}</div>
        </td>
        <td class="editable" data-field="category">${op.category || '—'}</td>
        <td class="editable" data-field="subcategory">${op.subcategory || '—'}</td>
        <td class="right amount ${op.amount < 0 ? 'neg' : 'pos'}">${formatAmount(op.amount)}</td>
        <td class="editable" data-field="comment">${op.comment || ''}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!state.filtered.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'Пока нет операций. Загрузите выписки в формате PDF.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    if (countEl) {
      countEl.textContent = `${state.filtered.length} операций`;
    }
  }

  function attachTableEvents() {
    const table = document.getElementById('tbl-operations');
    if (!table) return;
    table.addEventListener('click', (event) => {
      const th = event.target.closest('th[data-sort]');
      if (th) {
        updateSort(th.dataset.sort);
        return;
      }
      const cell = event.target.closest('.editable');
      if (!cell) return;
      const row = cell.closest('tr');
      if (!row) return;
      const opId = row.dataset.id;
      const field = cell.dataset.field;
      const initial = cell.textContent === '—' ? '' : cell.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = initial;
      input.className = 'inline-editor';
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          input.blur();
        }
        if (ev.key === 'Escape') {
          cell.textContent = initial || '—';
        }
      });
      input.addEventListener('blur', () => {
        const value = input.value.trim();
        cell.removeChild(input);
        cell.textContent = value || '—';
        updateOperation(opId, { [field]: value || null });
      });
    });
  }

  function updateOperation(id, changes) {
    const ledger = App.state.ledger.map(op => {
      if (op.id !== id) return op;
      return { ...op, ...changes };
    });
    App.saveLedger(ledger);
    if (changes.category) {
      App.saveUnknown(App.state.unknown.filter(item => item.id !== id));
    }
    App.toast('Операция обновлена', { type: 'success', timeout: 2000 });
  }

  function refreshState() {
    state.operations = App.state.ledger.slice();
    state.filtered = sortRows(state.operations);
    renderFilters();
    renderTable();
  }

  function parseByBank(bank, pages) {
    if (bank === 'tbank') return ParserTBank.parse(pages);
    if (bank === 'alfa') return ParserAlfa.parse(pages);
    throw new Error('Неизвестный банк');
  }

  async function processFile(file, bankHint) {
    setProgress({ ratio: 0 });
    const result = await PdfReader.process(file, {
      bank: bankHint || null,
      onProgress: setProgress
    });
    updateDetectionInfo(result.detection);
    const bank = result.bank;
    if (!bank) {
      throw new Error('Банк не распознан. Выберите вручную.');
    }
    const parsed = parseByBank(bank, result.pageLines);
    if (!parsed.length) {
      throw new Error('Не удалось извлечь операции из PDF.');
    }
    const normalized = Normalizer.normalizeOperations(parsed).map(op => ({
      ...op,
      file_name: file.name,
      source_file: file.name,
      uploaded_at: new Date().toISOString(),
      bank,
      source_pdf: bank
    }));
    await DictionaryStore.ensureDictionary();
    const classified = Classifier.classifyOperations(normalized);
    const unknown = classified.filter(op => !op.category);
    if (unknown.length) {
      App.pushUnknown(unknown);
    }
    App.addOperations(classified);
    App.toast(`Импортировано операций: ${classified.length}`, { type: 'success' });
    setProgress({ ratio: null });
  }

  async function handleFiles(fileList) {
    const bankValue = document.getElementById('bank-select').value;
    for (const file of fileList) {
      try {
        await processFile(file, bankValue || null);
      } catch (err) {
        console.error(err);
        App.toast(err.message, { type: 'error', timeout: 6000 });
        setProgress({ ratio: null });
      }
    }
  }

  function initUpload() {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const openBtn = document.getElementById('btn-open-file');
    if (!fileInput || !dropZone) return;
    if (openBtn) {
      openBtn.addEventListener('click', (event) => {
        event.preventDefault();
        fileInput.click();
      });
    }
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        handleFiles(fileInput.files);
        fileInput.value = '';
      }
    });
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag');
      });
    });
    dropZone.addEventListener('drop', (event) => {
      const files = event.dataTransfer.files;
      if (files.length) {
        handleFiles(files);
      }
    });
  }

  function bindFilters() {
    ['filter-bank', 'filter-category', 'filter-text', 'filter-start', 'filter-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', applyFilters);
    });
    document.querySelectorAll('[name="filter-type"]').forEach(radio => {
      radio.addEventListener('change', applyFilters);
    });
  }

  function initExport() {
    const csvBtn = document.getElementById('btn-export-csv');
    const xlsxBtn = document.getElementById('btn-export-xlsx');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        const month = document.getElementById('filter-start').value?.slice(0, 7) || monthKey(new Date());
        const filename = `${month || 'all'}_operations.csv`;
        Exporter.downloadCsv(state.filtered, filename);
      });
    }
    if (xlsxBtn) {
      xlsxBtn.addEventListener('click', () => {
        const month = document.getElementById('filter-start').value?.slice(0, 7) || monthKey(new Date());
        const filename = `${month || 'all'}_operations.xlsx`;
        const summary = Pivot.rollup(state.filtered, {
          groupBy: [op => op.category || 'Без категории'],
          metrics: { amount: Pivot.sum('amount') }
        }).map(item => ({
          Категория: item.key0,
          Сумма: item.amount
        }));
        Exporter.downloadXlsx(state.filtered, summary, filename);
      });
    }
  }

  function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  App.ready(async () => {
    try {
      await DictionaryStore.ensureDictionary();
    } catch (err) {
      console.warn('Dictionary load error', err);
    }
    initUpload();
    attachTableEvents();
    bindFilters();
    initExport();
    refreshState();
    App.on('ledger:updated', () => {
      refreshState();
      applyFilters();
    });
    applyFilters();
  });
})();

(function () {
  const STORAGE_KEYS = {
    ledger: 'finance-ledger',
    unknown: 'finance-unknown',
    dictionary: 'finance-dictionary',
    dictionaryHistory: 'finance-dictionary-history',
    budgets: 'finance-budgets',
    pnlMap: 'finance-pnl-map',
    preferences: 'finance-preferences'
  };

  const COMPRESSED_STORAGE_KEYS = {
    ledger: 'finance-ledger-compressed',
    unknown: 'finance-unknown-compressed'
  };

  const state = {
    ledger: [],
    unknown: [],
    dictionary: null,
    budgets: null,
    pnlMap: null,
    preferences: {
      currency: 'RUB',
      theme: 'light',
      showBusiness: true,
      showPersonal: true
    }
  };

  const emitter = {
    events: {},
    on(event, handler) {
      this.events[event] = this.events[event] || [];
      this.events[event].push(handler);
      return () => {
        this.events[event] = (this.events[event] || []).filter(h => h !== handler);
      };
    },
    emit(event, payload) {
      (this.events[event] || []).forEach(h => h(payload));
    }
  };

  function safeParse(json, fallback) {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch (err) {
      console.warn('JSON parse error', err);
      return fallback;
    }
  }

  function persist(key, value) {
    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  function getCompressor() {
    return (typeof globalThis !== 'undefined' && globalThis.LZString) || null;
  }

  function compressString(value) {
    const compressor = getCompressor();
    if (compressor && typeof compressor.compressToUTF16 === 'function') {
      return compressor.compressToUTF16(value);
    }
    return value;
  }

  function decompressString(value) {
    if (!value) return null;
    const compressor = getCompressor();
    if (compressor && typeof compressor.decompressFromUTF16 === 'function') {
      const restored = compressor.decompressFromUTF16(value);
      if (restored !== null) return restored;
    }
    return value;
  }

  function persistCompressed(key, value) {
    if (value === undefined) {
      localStorage.removeItem(key);
      return;
    }
    const json = JSON.stringify(value);
    const compressed = compressString(json);
    localStorage.setItem(key, compressed);
  }

  function loadCompressed(key) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      const json = decompressString(stored);
      if (typeof json !== 'string') return null;
      return safeParse(json, null);
    } catch (err) {
      console.warn('Failed to read compressed storage', err);
      return null;
    }
  }

  function formatCurrency(value, currency = state.preferences.currency || 'RUB', digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  }

  function formatNumber(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  }

  function formatPercent(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${formatNumber(value * 100, digits)}%`;
  }

  function formatDate(date) {
    if (!date) return '—';
    const d = (date instanceof Date) ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }

  function uid(prefix = 'op') {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
  }

  function loadInitialState() {
    const compressedLedger = loadCompressed(COMPRESSED_STORAGE_KEYS.ledger);
    if (Array.isArray(compressedLedger)) {
      state.ledger = compressedLedger;
    } else {
      state.ledger = safeParse(localStorage.getItem(STORAGE_KEYS.ledger), []);
      try {
        persistCompressed(COMPRESSED_STORAGE_KEYS.ledger, state.ledger);
        localStorage.removeItem(STORAGE_KEYS.ledger);
      } catch (err) {
        if (!(err && err.name === 'QuotaExceededError')) {
          console.warn('Failed to migrate legacy ledger storage', err);
        }
      }
    }
    const compressedUnknown = loadCompressed(COMPRESSED_STORAGE_KEYS.unknown);
    if (Array.isArray(compressedUnknown)) {
      state.unknown = compressedUnknown;
    } else {
      state.unknown = safeParse(localStorage.getItem(STORAGE_KEYS.unknown), []);
      try {
        persistCompressed(COMPRESSED_STORAGE_KEYS.unknown, state.unknown);
        localStorage.removeItem(STORAGE_KEYS.unknown);
      } catch (err) {
        if (!(err && err.name === 'QuotaExceededError')) {
          console.warn('Failed to migrate legacy unknown storage', err);
        }
      }
    }
    const storedDict = safeParse(localStorage.getItem(STORAGE_KEYS.dictionary), null);
    if (storedDict) {
      state.dictionary = storedDict;
    }
    state.budgets = safeParse(localStorage.getItem(STORAGE_KEYS.budgets), null);
    state.pnlMap = safeParse(localStorage.getItem(STORAGE_KEYS.pnlMap), null);
    state.preferences = {
      ...state.preferences,
      ...safeParse(localStorage.getItem(STORAGE_KEYS.preferences), {})
    };
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = state.preferences.theme || 'light';
    }
  }

  function saveLedger(ledger, { silent } = {}) {
    state.ledger = Array.isArray(ledger) ? ledger : [];
    let error;
    try {
      persistCompressed(COMPRESSED_STORAGE_KEYS.ledger, state.ledger);
      localStorage.removeItem(STORAGE_KEYS.ledger);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        console.warn('Failed to persist ledger: quota exceeded', err);
      } else {
        error = err;
      }
    }
    if (!silent) emitter.emit('ledger:updated', state.ledger);
    if (error) throw error;
  }

  function addOperations(ops) {
    const map = new Map(state.ledger.map(op => [op.id, op]));
    ops.forEach(op => {
      map.set(op.id, op);
    });
    const merged = Array.from(map.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    saveLedger(merged);
  }

  function saveUnknown(list) {
    state.unknown = Array.isArray(list) ? list : [];
    let error;
    try {
      persistCompressed(COMPRESSED_STORAGE_KEYS.unknown, state.unknown);
      localStorage.removeItem(STORAGE_KEYS.unknown);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        console.warn('Failed to persist unknown operations: quota exceeded', err);
      } else {
        error = err;
      }
    }
    emitter.emit('unknown:updated', state.unknown);
    if (error) throw error;
  }

  function pushUnknown(items) {
    if (!Array.isArray(items) || !items.length) return;
    const ids = new Set(state.unknown.map(x => x.id));
    const next = [...state.unknown];
    items.forEach(item => {
      if (!ids.has(item.id)) {
        next.push(item);
        ids.add(item.id);
      }
    });
    saveUnknown(next);
  }

  function saveDictionary(dict, { skipHistory } = {}) {
    if (!dict) return;
    dict.updatedAt = new Date().toISOString();
    state.dictionary = dict;
    if (dict.__compiled) delete dict.__compiled;
    persist(STORAGE_KEYS.dictionary, dict);
    if (!skipHistory) {
      const history = safeParse(localStorage.getItem(STORAGE_KEYS.dictionaryHistory), []);
      history.push({
        version: dict.version,
        savedAt: dict.updatedAt,
        rules: dict.rules.length,
        mcc_overrides: Object.keys(dict.mcc_overrides || {}).length
      });
      persist(STORAGE_KEYS.dictionaryHistory, history);
    }
    emitter.emit('dictionary:updated', dict);
  }

  function reclassifyAll() {
    if (!state.ledger || !state.ledger.length) return;
    if (typeof Normalizer === 'undefined' || typeof Normalizer.normalizeOperation !== 'function') {
      console.warn('App.reclassifyAll: Normalizer is not available');
      return;
    }
    if (typeof Classifier === 'undefined' || typeof Classifier.classifyOperation !== 'function') {
      console.warn('App.reclassifyAll: Classifier is not available');
      return;
    }
    const updated = state.ledger.map(op => {
      const normalized = Normalizer.normalizeOperation(op);
      return Classifier.classifyOperation(normalized);
    });
    saveLedger(updated);
    const unresolved = updated.filter(op => !op.category);
    saveUnknown(unresolved);
  }

  function applyDictionaryToLedger() {
    reclassifyAll();
  }

  function saveBudgets(data) {
    state.budgets = data;
    persist(STORAGE_KEYS.budgets, data);
    emitter.emit('budgets:updated', data);
  }

  function savePnlMap(data) {
    state.pnlMap = data;
    persist(STORAGE_KEYS.pnlMap, data);
    emitter.emit('pnlmap:updated', data);
  }

  function savePreferences(data) {
    state.preferences = { ...state.preferences, ...data };
    persist(STORAGE_KEYS.preferences, state.preferences);
    emitter.emit('preferences:updated', state.preferences);
  }

  function toast(message, { type = 'info', timeout = 4000 } = {}) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, timeout);
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function downloadBlob(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 0);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((acc, v) => acc + v, 0) / values.length;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
    return sorted[idx];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  loadInitialState();

  window.App = {
    STORAGE_KEYS,
    COMPRESSED_STORAGE_KEYS,
    state,
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    ready,
    formatCurrency,
    formatNumber,
    formatPercent,
    formatDate,
    uid,
    toast,
    saveLedger,
    addOperations,
    saveUnknown,
    pushUnknown,
    saveDictionary,
    saveBudgets,
    savePnlMap,
    savePreferences,
    downloadBlob,
    readFileAsText,
    mean,
    median,
    percentile,
    clone,
    reclassifyAll,
    applyDictionaryToLedger
  };
})();

(function () {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';
  }

  function withTimeout(promise, ms, label = 'операция') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} превысила лимит ${ms / 1000}s`)), ms);
      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async function extractPages(file, { onProgress, timeout = 60000 } = {}) {
    if (!window.pdfjsLib) {
      throw new Error('pdf.js не загружен.');
    }
    const buffer = await App.readFileAsArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
    if (onProgress) {
      loadingTask.onProgress = ({ loaded, total }) => {
        const ratio = total ? loaded / total : 0;
        onProgress({ stage: 'loading', ratio });
      };
    }

    const pdf = await withTimeout(loadingTask.promise, timeout, 'Загрузка PDF');
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await withTimeout(pdf.getPage(i), timeout, `Страница ${i}`);
      const content = await withTimeout(page.getTextContent(), timeout, `Контент страницы ${i}`);
      const text = content.items.map(item => item.str).join('\n');
      pages.push(text);
      if (onProgress) {
        onProgress({ stage: 'page', page: i, total: pdf.numPages, ratio: i / pdf.numPages });
      }
    }
    return { pages, numPages: pdf.numPages };
  }

  async function extractLines(file, options = {}) {
    const { pages, numPages } = await extractPages(file, options);
    const pageLines = pages.map(text => text
      .split(/\r?\n/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean));
    return { pages, pageLines, numPages };
  }

  async function process(file, { bank, onProgress, timeout = 60000 } = {}) {
    const { pages, pageLines, numPages } = await extractLines(file, { onProgress, timeout });
    let detected = { bank: bank || null, confidence: 0, reason: 'Банк не определён.' };
    if (bank) {
      detected = { bank, confidence: Infinity, reason: 'Выбрано вручную' };
    } else if (window.BankDetect) {
      detected = window.BankDetect.detect(pages);
    }
    const finalBank = bank || detected.bank;
    return { pages, pageLines, numPages, detection: detected, bank: finalBank };
  }

  window.PdfReader = {
    extractPages,
    extractLines,
    process
  };
})();

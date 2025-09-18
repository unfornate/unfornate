# Manual Test Plan — Filtering Investkopilka Operations

This plan validates that both the in-browser parser and the Python fallback pipeline
ignore Investkopilka transactions so they never reach `App.addOperations` nor `App.pushUnknown`.

## Prerequisites
- Node.js available in the project root (bundled in CI containers).
- Python 3 available in the project root.
- Fixture: `tests/fixtures/tbank-investkopilka.json` (already part of the repository).

## Steps

### 1. Browser/JS path (`ParserTBank.parse`)
1. Launch a node REPL (or run the one-off command below) from the repository root:
   ```bash
   node <<'NODE'
   global.window = global;
   global.App = { uid: prefix => `${prefix}_test` };
   require('./app/js/parse-tbank.js');
   const pages = require('./tests/fixtures/tbank-investkopilka.json').pages
     .map(entry => entry.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
   const parsed = window.ParserTBank.parse(pages);
   console.log(parsed);
   NODE
   ```
2. **Expected result:** the output array contains only the everyday purchase entry.
   The Investkopilka transfer is absent, confirming it won't be passed to
   `App.addOperations`/`App.pushUnknown`.

### 2. Python fallback path (`extractor.py`)
1. Run the fallback extractor against the same fixture:
   ```bash
   python3 app/python/extractor.py tests/fixtures/tbank-investkopilka.json
   ```
2. **Expected result:** the printed JSON includes the purchase operation only,
   with the Investkopilka line removed. This mirrors the JS behaviour for
   clients using the Python pipeline.

If both checks pass, Investkopilka entries are consistently filtered in every
import path.

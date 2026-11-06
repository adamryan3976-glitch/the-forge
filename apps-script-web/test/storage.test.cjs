// Tests the spreadsheet storage (SheetDb_) and page serving against a pretend
// SpreadsheetApp / Drive / Cache, so row bookkeeping can't silently go wrong.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeSheet(name) {
  const rows = [];   // rows[0] = row 1
  const sh = {
    name,
    getLastRow: () => rows.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
        setFontWeight() { return this; }, setNumberFormat() { return this; },
        getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
        createTextFinder(text) {
          let whole = false, regex = false;
          const tf = {
            matchEntireCell(v) { whole = v; return tf; }, matchCase() { return tf; }, useRegularExpression(v) { regex = v; return tf; },
            findAll() {
              const out = [];
              for (let i = 0; i < nr; i++) {
                const v = String((rows[r - 1 + i] || [])[c - 1] ?? '');
                const ok = regex ? new RegExp(text).test(v) : whole ? v === text : v.includes(text);
                if (ok) out.push({ getRow: () => r + i });
              }
              return out;
            },
            findNext() { return tf.findAll()[0] || null; },
          };
          return tf;
        },
      };
    },
    setFrozenRows() {},
    appendRow(r) { rows.push(r.slice()); },
    deleteRow(r) { rows.splice(r - 1, 1); },
    _rows: rows,
  };
  return sh;
}

function load() {
  const sheets = {};
  const cache = new Map();
  const files = new Map();
  const props = new Map([['DATA_ID', 'ss1'], ['FOLDER_ID', 'f1']]);
  let fetched = '<!doctype html><html data-forge-app="1"><head><title>x</title></head><body>app</body></html>';
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = fakeSheet(n)),
  };
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k),
      getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
      putAll: (m) => Object.entries(m).forEach(([k, v]) => cache.set(k, v)),
    }) },
    DriveApp: {
      getFolderById: () => ({ createFile: (n, t) => { const id = 'file' + files.size; files.set(id, t); return { getId: () => id }; } }),
      getFileById: (id) => ({ getBlob: () => ({ getDataAsString: () => files.get(id) }), setContent: (t) => files.set(id, t) }),
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => fetched }) },
    Session: { getActiveUser: () => ({ getEmail: () => 's123456789@ddsbstudent.ca' }), getEffectiveUser: () => ({ getEmail: () => 'owner@ddsb.ca' }) },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => 'u' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, cache, files, setFetched: (t) => { fetched = t; } };
}

const reset = (ctx) => vm.runInContext('DB_CACHE_ = null', ctx);

test('SheetDb_ keeps rows straight through adds, updates and deletes', () => {
  const { ctx, sheets } = load();
  const db = ctx.SheetDb_;
  db.put('roster', 'c1/111111111', { name: 'A' });
  db.putMany('roster', [{ id: 'c1/222222222', data: { name: 'B' } }, { id: 'c1/333333333', data: { name: 'C' } }]);
  db.put('roster', 'c1/111111111', { name: 'A2', id: 'ignored' });
  reset(ctx);
  assert.equal(db.get('roster', 'c1/111111111').name, 'A2');
  assert.equal(db.all('roster').length, 3);
  db.del('roster', 'c1/222222222');
  reset(ctx);
  assert.equal(db.get('roster', 'c1/222222222'), null);
  assert.equal(db.get('roster', 'c1/333333333').name, 'C');   // row shift handled
  db.put('roster', 'c1/333333333', { name: 'C2' });
  reset(ctx);
  assert.equal(db.all('roster').map((r) => r.name).sort().join(','), 'A2,C2');
  assert.equal(sheets.roster._rows.length, 3);                // header + 2
  assert.equal(sheets.roster._rows[0][0], 'id');
  // Stored without the id inside the JSON.
  assert.ok(!sheets.roster._rows[1][1].includes('"id"'));
});

test('SheetDb_ finds one student’s records by prefix without mixing up similar numbers', () => {
  const { ctx } = load();
  const db = ctx.SheetDb_;
  db.put('attempts', '111111111/fall-2026__1', { a: 1 });
  db.put('attempts', '111111111/winter-2027__1', { a: 2 });
  db.put('attempts', '1111111112/fall-2026__1', { a: 3 });
  db.put('attempts', '911111111/fall-2026__1', { a: 4 });
  assert.equal(db.byPrefix('attempts', '111111111/').map((d) => d.a).sort().join(','), '1,2');
  assert.equal(db.get('attempts', '911111111/fall-2026__1').a, 4);
  assert.equal(db.get('attempts', 'nope'), null);
});

test('SheetDb_ refuses records that are too big for a cell', () => {
  const { ctx } = load();
  assert.throws(() => ctx.SheetDb_.put('attempts', 'x', { big: 'x'.repeat(60000) }), /too large/);
});

test('doGet serves the downloaded app with who-is-signed-in, and never for outsiders', () => {
  const { ctx } = load();
  const out = ctx.doGet();
  assert.match(out.html, /<head><script>window.__FORGE_BOOT__=\{"email":"s123456789@ddsbstudent.ca","displayName":"","role":"student","studentNumber":"123456789"\};<\/script><title>/);
  assert.ok(!out.html.includes('ownerEmail'));   // students aren't told the owner
});

test('a download that is not The Forge is ignored (the old copy stays)', () => {
  const { ctx, setFetched, cache } = load();
  assert.equal(vm.runInContext('fetchApp_()', ctx), true);
  setFetched('<html><head></head><body>Not found</body></html>');
  cache.clear();
  assert.equal(vm.runInContext('fetchApp_()', ctx), false);
  assert.match(ctx.doGet().html, /data-forge-app="1"/);
});

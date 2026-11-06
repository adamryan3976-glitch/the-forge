// Calls the Apps Script server (apps-script-web/Code.gs → api()).
// google.script.run only exists inside the Apps Script page.

function toError(err) {
  const raw = String((err && err.message) || err || 'Something went wrong.');
  const m = raw.match(/permission-denied:\s*(.*)$/s);
  const e = new Error(m ? m[1] : raw.replace(/^Exception:\s*/, ''));
  if (m) e.code = 'permission-denied';
  else if (/network|timed? ?out|NetworkError|failed to fetch|unavailable/i.test(raw)) e.code = 'unavailable';
  return e;
}

function once(name, args) {
  return new Promise((resolve, reject) => {
    const g = window.google && window.google.script && window.google.script.run;
    if (!g) { reject(Object.assign(new Error('The Forge must be opened from its Apps Script link.'), { code: 'unavailable' })); return; }
    g.withSuccessHandler(resolve).withFailureHandler((e) => reject(toError(e))).api(name, args || {});
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls the server, retrying a few times if the connection drops or Google is busy. */
export async function call(name, args, { tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await once(name, args); }
    catch (e) {
      last = e;
      if (e.code === 'permission-denied') throw e;
      await wait(800 * (i + 1) + Math.random() * 400);
    }
  }
  throw last;
}

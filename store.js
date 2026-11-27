/* All Firebase saving lives here, so app.js only deals in plain objects.

   Firestore layout (shared by Bella and Nick):
     meta/settings                     day templates (checklist = repeat to-dos, dayNotes, packingList), layout + prepLayout, bag contents, which bags carry *** items, skipped staff
     shopping/{id}                     { text, bought, auto, created }  (one list, not per cohort)
     cohorts/{key}                     { bagsInUse: [1,2,3], repeatsAdded, packingAdded, removedRepeats: {id: true} }
     cohorts/{key}/students/{sid}      { skill: on|behind|done, behind: [skills], note }
     cohorts/{key}/contacts/{id}       { sid, num, fix, fixed, date, created }
     cohorts/{key}/warnings/{id}       { sid, date, type, note, created }
     cohorts/{key}/days/{0-6}          { checks: {item: true}, bags: {bagNo: {itemId: ok|low|missing}} }
     cohorts/{key}/staff/{nameKey}     { name, days: {1: {roster, timesheet}}, paid }
     cohorts/{key}/packing/{id}        { text, packed, order, created, repeat }  (Prep page; repeat ones: id pack-{text})
     cohorts/{key}/todos/{id}          { text, done, day, kind, order, created, repeat }  (repeat ones: id rep-{day}-{text})
     emailTemplates, bookCodes, cohorts/{key}/emailLog, and the students' sent/late/payDates/bookCode: see emails.js

   Paths are written like 'cohorts/Fall 2026/students/frazier-jason'.
   In sample mode everything is kept in this browser (localStorage) instead. */
const Store = (() => {
  const configured = !/PASTE/.test(firebaseConfig.apiKey) && !/PASTE/.test(APPS_SCRIPT_URL);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isDocPath = p => p.split('/').length % 2 === 0;

  if (!configured) {
    // ---- Sample mode ----
    const KEY = 'academy-week-sample';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const save = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
    const listeners = new Set();
    const snapshot = (path, all) => {
      if (isDocPath(path)) return all[path] || null;
      const depth = path.split('/').length + 1;
      return Object.keys(all)
        .filter(k => k.startsWith(path + '/') && k.split('/').length === depth)
        .map(k => ({ id: k.split('/').pop(), ...all[k] }));
    };
    const emit = () => { const all = read(); listeners.forEach(l => l.cb(snapshot(l.path, all))); };
    return {
      configured: false,
      onUser(cb) { setTimeout(() => cb({ email: 'sample mode', sample: true }), 0); },
      async signIn() {}, async signOut() {},
      watch(path, cb) {
        const l = { path, cb }; listeners.add(l); cb(snapshot(path, read()));
        return () => listeners.delete(l);
      },
      async set(path, data, merge = true) {
        const all = read();
        all[path] = merge ? deepMerge(all[path] || {}, data) : data;
        save(all); emit();
      },
      async add(colPath, data) { const id = newId(); await this.set(colPath + '/' + id, data, false); return id; },
      async del(path) { const all = read(); delete all[path]; save(all); emit(); },
      async get(path) { const v = read()[path]; return v ? JSON.parse(JSON.stringify(v)) : null; },
      async claim(path, field) { const all = read(); if ((all[path] || {})[field]) return false; await this.set(path, { [field]: true }); return true; },
      async claimValue(path, field, value) { const all = read(); if ((all[path] || {})[field]) return false; await this.set(path, { [field]: value }); return true; },
      newId,
    };
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('No offline cache:', err.code));

  // Offline, a save lands on this device at once and syncs later. Don't wait for it.
  const write = p => {
    if (navigator.onLine) return p;
    p.catch(e => console.error('Offline save failed to sync', e));
    return Promise.resolve();
  };

  return {
    configured: true,
    onUser: cb => auth.onAuthStateChanged(cb),
    async signIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
    },
    signOut: () => auth.signOut(),
    idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(''),
    watch(path, cb) {
      const onErr = err => console.error(path, err);
      if (isDocPath(path)) return db.doc(path).onSnapshot(s => cb(s.exists ? s.data() : null), onErr);
      return db.collection(path).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    set: (path, data, merge = true) => write(db.doc(path).set(data, { merge })),
    async add(colPath, data) { const ref = db.collection(colPath).doc(); await write(ref.set(data)); return ref.id; },
    del: path => write(db.doc(path).delete()),
    // One document as it is now (this device's copy first; the server if it isn't here). undefined: couldn't tell.
    async get(path) {
      try { const s = await db.doc(path).get({ source: 'cache' }); return s.exists ? s.data() : null; }
      catch { try { const s = await db.doc(path).get(); return s.exists ? s.data() : null; } catch { return undefined; } }
    },
    // Sets doc.field = true and returns true, unless it was already true (checked on the server,
    // so two computers can't both do a one-time job). Fails when offline.
    claim: (path, field) => db.runTransaction(async tx => {
      const ref = db.doc(path), snap = await tx.get(ref);
      if (snap.exists && snap.data()[field]) return false;
      tx.set(ref, { [field]: true }, { merge: true });
      return true;
    }),
    // The same, but sets doc.field = value (a book code given to one student). False if it already has one.
    claimValue: (path, field, value) => db.runTransaction(async tx => {
      const ref = db.doc(path), snap = await tx.get(ref);
      if (snap.exists && snap.data()[field]) return false;
      tx.set(ref, { [field]: value }, { merge: true });
      return true;
    }),
    newId,
  };
})();

// Merge like Firestore's { merge: true } does: nested objects merge, everything else replaces.
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? deepMerge(a[k], v) : v;
  }
  return out;
}


/* ---------- Undo / redo: ⌘Z, and ⇧⌘Z (or ⌘Y) ----------
   Each thing you do (a click, Enter in a box, a pick in a menu, a drag, typing in one box) is one step. While a step is
   open (6 seconds from what you did), every save through Store.set / add / del notes how that document looked just
   before, so ⌘Z can put it back exactly and ⇧⌘Z can do it again. The last 50 steps, this window only.
   Left out: the app's own automatic saves (they use Store.quiet), and anything that also went to Google (the cohort
   sheet, Drive, Gmail, through Sheets): ⌘Z says it can't undo that one instead of undoing only half of it.
   A document that changed again since (Nick, say) is left alone and counted. In a text box ⌘Z is the box's own undo. */
const Undo = (() => {
  const MAX = 50, WINDOW = 6000;
  const raw = { set: Store.set, del: Store.del };
  let cur = null, undos = [], redos = [], applying = false, busy = false;
  const live = () => cur && Date.now() - cur.at < WINDOW ? cur : null;
  // A new step for a new action; typing (and leaving) the same box stays one step.
  function start(kind, el) {
    if (applying) return;
    if ((kind === 'input' || kind === 'blur') && cur && cur.el === el && live()) { cur.at = Date.now(); return; }
    cur = { at: Date.now(), kind, el, steps: [], sheet: '', pushed: false };
  }
  function push(g) { if (g.pushed) return; g.pushed = true; undos.push(g); if (undos.length > MAX) undos.shift(); redos = []; }
  function record(path, before, after) { const g = live(); if (!g || applying) return; push(g); g.steps.push({ path, before, after }); }
  const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => (o[key] = x[key], o), {}) : x);
  const same = (a, b) => stable(a ?? null) === stable(b ?? null);

  // Saves you make go through here (Store.quiet skips it).
  Store.quiet = { set: raw.set, del: raw.del, add: async (col, data) => { const id = Store.newId(); await raw.set(col + '/' + id, data, false); return id; } };
  Store.set = async (path, data, merge = true) => {
    if (!live() || applying) return raw.set(path, data, merge);
    const before = await Store.get(path);
    const p = raw.set(path, data, merge);
    record(path, before, before === undefined ? undefined : merge ? deepMerge(before || {}, data) : data);
    return p;
  };
  Store.del = async path => {
    if (!live() || applying) return raw.del(path);
    const before = await Store.get(path);
    const p = raw.del(path);
    if (before !== null) record(path, before, null);
    return p;
  };
  Store.add = async (col, data) => { const id = Store.newId(); await Store.set(col + '/' + id, data, false); return id; };

  // Something that also changes things in Google (Sheets' write calls): that step can't be undone here.
  function sheet(action) { const g = live(); if (!g || applying) return; g.sheet = action; push(g); }

  const NOUNS = { todos: 'to-do', shopping: 'shopping item', packing: 'packing item', adminTodos: 'Bulletin to-do', adminNotes: 'sticky note',
    adminDates: 'date', warnings: 'warning', contacts: 'patient contact note', scenarios: 'scenario', psychCands: 'candidate', privatePsych: 'private exam',
    emailTemplates: 'email template', bookCodes: 'book code', updates: 'update', days: 'day', staff: 'staffing', students: 'student info',
    inquiryReplies: 'reply template', meta: 'settings', cohorts: 'cohort setting', tbChapters: 'Test Bank question', tbSets: 'quiz list' };
  // Named after the item(s) it touched (a to-do, a sticky note…); the cohort's or settings' own bookkeeping doesn't count.
  function label(g) {
    const verb = st => st.before == null ? 'add' : st.after == null ? 'delete' : 'change';
    const col = st => { const p = st.path.split('/'); return p[p.length - 2]; };
    const main = g.steps.filter(st => NOUNS[col(st)] && !/^(cohorts|meta)$/.test(col(st)));
    const list = main.length ? main : g.steps, first = list[0], noun = NOUNS[col(first)];
    if (!noun) return 'your last change';
    const v = verb(first), doc = (v === 'add' ? first.after : first.before) || {}, txt = /^tb/.test(col(first)) ? '' : String(doc.text || doc.name || doc.title || '');
    const what = v === 'change' && doc.done !== undefined && first.after && first.before && !!first.after.done !== !!first.before.done ? (first.after.done ? 'tick' : 'untick') : v === 'change' ? 'change to' : v;
    if (list.length > 1) return list.every(x => verb(x) === v && col(x) === col(first)) ? `${v} ${list.length} ${noun}s` : 'your last change';
    return `${what} ${noun}${txt ? ' “' + (txt.length > 40 ? txt.slice(0, 40) + '…' : txt) + '”' : ''}`;
  }
  async function apply(g, dir) {
    let skipped = 0;
    applying = true;
    try {
      for (const st of dir === 'undo' ? [...g.steps].reverse() : g.steps) {
        const want = dir === 'undo' ? st.after : st.before, put = dir === 'undo' ? st.before : st.after;
        if (st.before === undefined || st.after === undefined) { skipped++; continue; }
        if (!same(await Store.get(st.path), want)) { skipped++; continue; }
        if (put == null) await raw.del(st.path); else await raw.set(st.path, put, false);
      }
    } finally { applying = false; }
    return skipped;
  }
  const say = m => { if (typeof toast === 'function') toast(m); };
  const left = n => n ? ` (${n} item${n === 1 ? '' : 's'} changed since, left as is)` : '';
  async function undo() {
    if (busy) return;
    const g = undos.pop();
    if (!g) return say('Nothing to undo.');
    if (g.sheet) return say('Can’t undo that one: it also changed things in Google (the cohort sheet, Drive or Gmail). Change it back there.');
    busy = true;
    try { const n = await apply(g, 'undo'); redos.push(g); say('Undid: ' + label(g) + left(n) + '.'); }
    catch (e) { say('Couldn’t undo: ' + e.message); }
    finally { busy = false; }
  }
  async function redo() {
    if (busy) return;
    const g = redos.pop();
    if (!g) return say('Nothing to redo.');
    busy = true;
    try { const n = await apply(g, 'redo'); undos.push(g); say('Redid: ' + label(g) + left(n) + '.'); }
    catch (e) { say('Couldn’t redo: ' + e.message); }
    finally { busy = false; }
  }

  // What starts a step. (Capture: before the app's own handlers save anything.)
  const textBox = t => t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    || (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(t.type || '')));
  document.addEventListener('click', e => start('click', e.target), true);
  document.addEventListener('change', e => start('change', e.target), true);
  document.addEventListener('drop', e => start('drop', e.target), true);
  document.addEventListener('dragend', e => start('drop', e.target), true);
  document.addEventListener('input', e => start('input', e.target), true);
  document.addEventListener('focusout', e => start('blur', e.target), true);
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase(), mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && (k === 'z' || k === 'y')) {
      if (textBox(e.target)) return; // (the box's own undo)
      e.preventDefault(); e.stopPropagation();
      if (k === 'z' && !e.shiftKey) undo(); else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) redo();
      return;
    }
    if (k === 'enter' || k === 'delete' || k === 'backspace' || k === 'escape') start('key', e.target);
  }, true);

  return { undo, redo, sheet };
})();

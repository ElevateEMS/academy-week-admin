/* Academy Week Admin: Bella's organizer for academy week.
   Pages: Day (planner boxes you can drag around), Week (Day 1-5 side by side; drag
   to-dos between days), Students (skills status, patient contacts + fix notes,
   attendance/warnings), Settings. Saving: store.js. Google Sheets: sheets.js. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('aw-' + k); localStorage.setItem('aw-' + k, v); } catch { return null; } };

const VIEWS = ['day', 'week', 'schedule', 'students', 'settings'];
const S = {
  user: null, cohorts: [], cohortKey: pref('cohort'), sheet: null, sheetErr: null, loading: false,
  settings: null, shopping: [],
  cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], packing: [],
  view: VIEWS.includes(pref('view')) ? pref('view') : 'day', day: null, open: null, bagOpen: false, bagTab: null, // bagOpen = day number while the bag pop-up is open (Prep is 0, so compare with false)
  menuOpen: false, schMenu: false, shareOpen: false, tplOpen: false, tplTab: 'every', schedule: {}, filter: 'all', search: '', drafts: {}, pcBusy: {}, dragging: null,
};
let unwatchCohort = [];
let unwatchGlobal = [];

/* ---------- Dates ---------- */
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayIso = () => isoOf(new Date());
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = s => { if (!s) return ''; const d = parseIso(s); return (d.getMonth() + 1) + '/' + d.getDate(); };
function dayDate(n) {
  if (!S.sheet || !S.sheet.academyStart) return null;
  const d = parseIso(S.sheet.academyStart); d.setDate(d.getDate() + n - 1); return isoOf(d);
}
function weekDays() {
  const fromSheet = S.sheet && S.sheet.days && S.sheet.days.length ? S.sheet.days : null;
  const list = fromSheet || [1, 2, 3, 4, 5].map(n => ({ n, label: '', sub: '' }));
  return list.map(d => {
    const iso = dayDate(d.n);
    const label = d.label || (iso ? parseIso(iso).toLocaleDateString('en-US', { weekday: 'short' }) : '');
    return { ...d, label, iso };
  });
}
// Besides Day 1-5 there's Prep (before the week, day 0) and Finalize (after it, day 6).
const PREP = 0, FINAL = 6, ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const dayName = n => n === PREP ? 'Prep' : n === FINAL ? 'Finalize' : 'Day ' + n;
const curDay = () => S.day ?? 1;
const schedDay = () => Math.min(5, Math.max(1, curDay())); // the Schedule page only has Day 1-5
// Before the week → Prep; after it → Finalize; during it (or no start date) → null.
function phaseDay() {
  const days = weekDays().filter(d => d.iso);
  if (!days.length) return null;
  const t = todayIso();
  if (t < days[0].iso) return PREP;
  if (t > days[days.length - 1].iso) return FINAL;
  return null;
}
function currentWeekDay() {
  const t = todayIso();
  const hit = weekDays().find(d => d.iso === t);
  return hit ? hit.n : null;
}

/* ---------- Settings (saved ones win over defaults.js) ---------- */
const BOXES = { priorities: 'Priorities', todo: 'To Do', shopping: 'Shopping List', notes: 'Notes', packing: 'Packing List' };
// Prep has its own boxes and its own saved layout; every other day shares one.
const BOARDS = {
  day: { key: 'layout', boxes: ['priorities', 'todo', 'shopping', 'notes'], def: [['priorities', 'shopping'], ['todo'], ['notes']] },
  prep: { key: 'prepLayout', boxes: ['shopping', 'notes', 'todo', 'packing'], def: [['shopping', 'notes'], ['todo'], ['packing']] },
};
const boardOf = n => BOARDS[n === PREP ? 'prep' : 'day'];
const LAYOUT_VERSION = 2; // bumped when the default changes, so an older saved layout doesn't stick
function cfg() {
  const s = S.settings || {};
  const board = boardOf(curDay()), saved = s[board.key];
  return {
    checklist: s.checklist || DEFAULTS.checklist,
    dayNotes: s.dayNotes || {},
    packing: s.packingList || DEFAULTS.packingList || [],
    weekH: s.weekH || null,
    bag: s.bag || DEFAULTS.bag,
    someBags: s.someBags || {},
    skipStaff: s.skipStaff || DEFAULTS.skipStaff,
    bagCount: DEFAULTS.bagCount,
    board,
    layout: validLayout(saved, board) || board.def,
    heights: (validLayout(saved, board) && saved.h) || {},
  };
}
// Firestore can't store nested arrays, so the layout is saved as
// { v, c0: [...], c1: [...], c2: [...], h: { box: heightInPx } }.
function validLayout(l, board) {
  if (!l || l.v !== LAYOUT_VERSION) return null;
  const cols = [l.c0 || [], l.c1 || [], l.c2 || []].map(c => c.filter(b => board.boxes.includes(b)));
  const seen = new Set(cols.flat());
  board.boxes.forEach(b => { if (!seen.has(b)) cols[0].push(b); }); // a box added later still shows up
  return cols;
}
function bagSections() {
  return cfg().bag.map(sec => ({
    name: sec.name,
    items: sec.items.map(raw => {
      const some = /\*\*\*\s*$/.test(raw);
      const name = raw.replace(/\s*\*\*\*\s*$/, '').trim();
      return { id: slug(sec.name + ' ' + name), name, some };
    }),
  }));
}
function bagCarries(item, bagNo) {
  if (!item.some) return true;
  const list = cfg().someBags[item.id];
  return !list || list.includes(bagNo);
}
const bagsInUse = () => (S.cohortDoc && S.cohortDoc.bagsInUse) || Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
const isBagItem = text => /bag check/i.test(text);

/* ---------- To-dos and priorities (one collection, kind = todo | priority) ---------- */
const MAX_PRIORITIES = 3;
const orderOf = t => t.order ?? t.created ?? 0;
const itemsFor = (n, kind) => S.todos.filter(t => (t.kind || 'todo') === kind && (t.day ?? 1) === n).sort((a, b) => orderOf(a) - orderOf(b));

// Repeat to-dos (Setup → Day Templates) are copied into a cohort as ordinary
// to-dos the first time it's opened, so they can be checked, dragged or deleted.
// Ids are fixed (rep-{day}-{text}) so the same one is never added twice.
const repeatId = (n, text) => 'rep-' + n + '-' + slug(text);
function templateFor(tpl, n) {
  const every = n >= 1 && n <= 5 ? (tpl.everyDay || []) : []; // "every day" means Day 1-5, not Prep/Finalize
  const all = [...every, ...((tpl.days || {})[n] || [])];
  return all.filter((t, i) => all.findIndex(x => slug(x) === slug(t)) === i);
}
// Template to-dos this cohort doesn't have yet (skipping ones you deleted on purpose).
function missingRepeats(tpl = cfg().checklist) {
  const have = new Set(S.todos.map(t => t.id));
  const removed = (S.cohortDoc && S.cohortDoc.removedRepeats) || {};
  const out = [];
  ALL_DAYS.forEach(n => templateFor(tpl, n).forEach((text, i) => {
    const id = repeatId(n, text);
    if (!have.has(id) && !removed[id]) out.push({ id, text, n, i });
  }));
  return out;
}
function addRepeats(list) {
  return Promise.all(list.map(({ id, text, n, i }) => {
    const checks = (S.days[n] && S.days[n].checks) || {}; // ticked back when it was the Daily Checklist
    return Store.set(P('todos/' + id), { text, done: !!checks[slug(text)], day: n, kind: 'todo', order: (i + 1) * 1000, created: Date.now(), repeat: true }, false);
  }));
}
// The packing list (Prep page) works the same way: copied once, ids pack-{text}.
function missingPacking(list = cfg().packing) {
  const have = new Set(S.packing.map(x => x.id));
  const removed = (S.cohortDoc && S.cohortDoc.removedRepeats) || {};
  return list.map((text, i) => ({ id: 'pack-' + slug(text), text, i })).filter(x => !have.has(x.id) && !removed[x.id])
    .filter((x, j, arr) => arr.findIndex(y => y.id === x.id) === j);
}
const addPacking = list => Promise.all(list.map(({ id, text, i }) =>
  Store.set(P('packing/' + id), { text, packed: false, order: (i + 1) * 1000, created: Date.now(), repeat: true }, false)));
let seeding = false;
async function seedRepeats() {
  const key = S.cohortKey, doc = S.cohortDoc || {}, path = 'cohorts/' + key;
  if (seeding || (doc.repeatsAdded && doc.packingAdded)) return;
  seeding = true;
  try {
    // claim() is false when Nick's computer got there first.
    if (!doc.repeatsAdded && await Store.claim(path, 'repeatsAdded') && key === S.cohortKey) await addRepeats(missingRepeats());
    if (!doc.packingAdded && await Store.claim(path, 'packingAdded') && key === S.cohortKey) await addPacking(missingPacking());
  } catch (e) { console.warn('Repeat to-dos not added yet:', e.message); }
  finally { seeding = false; }
}

// Unfinished to-dos from an earlier day move to today (only while the week is happening).
let rolling = false, rollAgain = false;
async function rollOver() {
  const t = currentWeekDay();
  if (!t) return;
  if (rolling) { rollAgain = true; return; } // to-dos changed mid-way (e.g. repeat ones just added): check again after
  // Prep to-dos stay on Prep.
  const late = S.todos.filter(x => (x.kind || 'todo') === 'todo' && !x.done && (x.day ?? 1) >= 1 && (x.day ?? 1) < t);
  if (!late.length) return;
  rolling = true;
  try {
    await Promise.all(late.map(x => Store.set(P('todos/' + x.id), { day: t, rolledFrom: x.rolledFrom || x.day || 1 })));
  } finally {
    rolling = false;
    if (rollAgain) { rollAgain = false; rollOver(); }
  }
}

/* ---------- Students ---------- */
function students() {
  if (!S.sheet) return [];
  return S.sheet.students
    .filter(s => !/^blocked$/i.test(s.status))
    .map(s => {
      const sid = slug(s.name);
      const doc = S.studentsDoc[sid] || {};
      return {
        ...s, sid,
        skill: doc.skill || 'on', behind: doc.behind || [], note: doc.note || '',
        fixes: S.contacts.filter(c => c.sid === sid && !c.fixed).length,
        warns: S.warnings.filter(w => w.sid === sid).length,
      };
    });
}
const studentBySid = sid => students().find(s => s.sid === sid);

/* ---------- Staff ---------- */
function isSkipped(name) {
  const n = name.trim().toLowerCase(), first = n.split(/\s+/)[0];
  return cfg().skipStaff.some(x => { x = x.trim().toLowerCase(); return x === n || x === first; });
}
function staffPeople() {
  if (!S.sheet || !S.sheet.staff) return [];
  return S.sheet.staff.filter(p => !isSkipped(p.name)).map(p => {
    const key = slug(p.name);
    return { ...p, key, lastDay: Math.max(...p.days), doc: S.staff[key] || {} };
  });
}
// Staff paperwork shown at the end of To Do: one "Staff roster" line and one
// "Timesheets (names)" line per day, plus "Pay ___" on each person's last day.
// On day n it also shows anything still missing from earlier days (tagged "unfinished").
function staffTasks(n, { carry = true } = {}) {
  const out = [];
  if (n === PREP || n === FINAL) return out;
  const people = staffPeople();
  const days = carry ? Array.from({ length: n }, (_, i) => i + 1) : [n];
  days.forEach(d => {
    const working = people.filter(p => p.days.includes(d));
    if (!working.length) return;
    const checks = (S.days[d] && S.days[d].checks) || {};
    const late = d < n ? d : null;
    if (!(late && checks['staff-roster'])) {
      out.push({ html: 'Staff roster signed', done: !!checks['staff-roster'], late,
        attrs: `data-act="check" data-d="${d}" data-k="staff-roster"` });
    }
    if (!(late && checks['timesheets'])) {
      out.push({ html: 'Timesheets', who: working.map(p => p.name).join(', '), done: !!checks['timesheets'], late,
        attrs: `data-act="check" data-d="${d}" data-k="timesheets"` });
    }
  });
  people.forEach(p => {
    if (p.lastDay === n || (carry && p.lastDay < n && !p.doc.paid)) {
      out.push({ html: '💵 Pay ' + esc(p.name), sub: p.lastDay === n ? 'last day' : '',
        done: !!p.doc.paid, late: p.lastDay < n ? p.lastDay : null,
        attrs: `data-act="paid" data-key="${p.key}" data-name="${esc(p.name)}"` });
    }
  });
  return out;
}

/* ---------- Boot ---------- */
Store.onUser(async user => {
  if (user && !user.sample && !STAFF_EMAILS.includes(String(user.email).toLowerCase())) {
    toast('That Google account doesn’t have access. Use your Elevate EMS account.');
    await Store.signOut();
    return;
  }
  S.user = user;
  unwatchGlobal.forEach(u => u()); unwatchGlobal = [];
  unwatchCohort.forEach(u => u()); unwatchCohort = [];
  if (!user) { render(); return; }
  unwatchGlobal.push(Store.watch('meta/settings', d => { S.settings = d; render(); }));
  unwatchGlobal.push(Store.watch('shopping', list => { S.shopping = list; render(); }));
  render();
  try {
    S.cohorts = await Sheets.listCohorts();
  } catch (e) { S.sheetErr = e.message; render(); return; }
  // Last one used; otherwise the active cohort that isn't the Test one.
  const pick = S.cohorts.find(c => c.key === S.cohortKey)
    || S.cohorts.find(c => /active/i.test(c.status) && !/^test/i.test(c.key))
    || S.cohorts.find(c => /active/i.test(c.status)) || S.cohorts[0];
  if (pick) selectCohort(pick.key); else render();
});

async function selectCohort(key) {
  S.cohortKey = key; pref('cohort', key);
  unwatchCohort.forEach(u => u()); unwatchCohort = [];
  Object.assign(S, { sheet: null, cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], packing: [], schedule: {}, open: null, day: null });
  const base = 'cohorts/' + key;
  const w = (path, fn) => unwatchCohort.push(Store.watch(path, v => { fn(v); render(); }));
  w(base, d => { S.cohortDoc = d; });
  w(base + '/students', list => { S.studentsDoc = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/contacts', list => { S.contacts = list; });
  w(base + '/warnings', list => { S.warnings = list; });
  w(base + '/days', list => { S.days = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/staff', list => { S.staff = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/todos', list => { S.todos = list; if (S.sheet) rollOver(); });
  w(base + '/packing', list => { S.packing = list; });
  w(base + '/schedule', list => { S.schedule = Object.fromEntries(list.map(d => [d.id, d])); });
  await loadSheet();
}

async function loadSheet() {
  S.loading = true; S.sheetErr = null; render();
  const key = S.cohortKey;
  try {
    const data = await Sheets.loadCohort(key);
    if (key !== S.cohortKey) return;
    S.sheet = data;
    if (S.day == null) {
      const saved = pref('day-' + key);
      S.day = currentWeekDay() ?? phaseDay() ?? (saved != null && !isNaN(saved) ? Number(saved) : 1);
    }
    rollOver();
    seedRepeats();
  } catch (e) {
    S.sheetErr = e.message;
  }
  S.loading = false; render();
}

const P = path => 'cohorts/' + S.cohortKey + '/' + path;

/* ---------- Render ---------- */
let raf = 0;
function render() {
  if (raf) return;
  raf = setTimeout(() => { // (not requestAnimationFrame: that pauses in background tabs)
    raf = 0;
    if (S.dragging) return; // redrawing mid-drag would drop what you're holding (dragend redraws)
    const a = document.activeElement;
    const id = a && a.id;
    const sel = id && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    const scrolls = [...document.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, el.scrollTop]);
    $('#app').innerHTML = S.user ? shell() : signInView();
    scrolls.forEach(([k, top]) => { const el = document.querySelector(`[data-keep-scroll="${k}"]`); if (el) el.scrollTop = top; });
    if (id) {
      const el = document.getElementById(id);
      if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {} }
    }
    fitBoard();
    document.querySelectorAll('textarea[data-grow]').forEach(grow);
    if (S.shareOpen) showShareQr();
  }, 0);
}

const ICONS = {
  day: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>',
  week: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 10v10M15 10v10"/></svg>',
  students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.8 14.2c2.2.2 4 1.7 4.6 4.8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  schedule: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/></svg>',
};

function signInView() {
  return `<div class="signin"><div class="signin-card">
    <img class="signin-logo" src="logo.png" alt="Elevate EMS">
    <h1>Academy Week Admin</h1>
    <p>Paperwork, students, shopping and equipment, all in one calm place.</p>
    <button class="btn primary wide" data-act="signin">Sign in with Google</button>
    <p class="muted small">Use your elevateemsacademy.com account.</p>
  </div></div>`;
}

function shell() {
  const icon = (v, label) => `<button class="icon-btn ${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}" title="${label}" aria-label="${label}">${ICONS[v]}</button>`;
  return `
  ${Store.configured ? '' : '<div class="sample-bar">Sample mode: pretend students and staff, saved in this browser only.</div>'}
  <header class="top">
    <button class="brand" data-act="view" data-v="day" title="Day">
      <img src="logo.png" alt="">
      <span><b>Academy Week Admin</b><small>${esc(S.cohortKey || '')}</small></span>
    </button>
    <div class="page-title">${pageTitle()}</div>
    <nav class="icons">
      ${icon('day', 'Day')}${icon('week', 'Week')}${icon('schedule', 'Schedule')}${icon('students', 'Students')}
      <div class="menu-wrap">
        <button class="icon-btn ${S.menuOpen || S.view === 'settings' ? 'on' : ''}" data-act="menu" title="Settings" aria-label="Settings">${ICONS.settings}</button>
        ${S.menuOpen ? menu() : ''}
      </div>
    </nav>
  </header>
  <main class="wrap">
    ${S.sheetErr ? `<div class="alert">Couldn’t read the Google Sheet: ${esc(S.sheetErr)} <button class="btn small" data-act="refresh">Try again</button></div>` : ''}
    ${{ day: dayView, week: weekView, schedule: scheduleView, students: studentsView, settings: settingsView }[S.view]()}
  </main>
  ${S.open ? drawer() : ''}
  ${S.shareOpen ? shareModal() : ''}
  ${S.bagOpen !== false ? bagModal() : ''}
  ${S.tplOpen ? templatesModal() : ''}`;
}

function pageTitle() {
  if (S.view === 'week') return `<h1>The Week</h1><p>Drag to-dos from one day to another · ${hideToggle('todo')}</p>`;
  if (S.view === 'students') return `<h1>Students</h1><p>${S.sheet ? students().length + ' students' : ''}</p>`;
  if (S.view === 'settings') return '<h1>Setup</h1><p>Shared by you and Nick</p>';
  if (S.view === 'schedule') {
    const d = weekDays().find(x => x.n === schedDay()) || {};
    return `<h1>Schedule</h1><p>Day ${schedDay()}${d.iso ? ' · ' + parseIso(d.iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}</p>`;
  }
  const n = curDay();
  if (n === PREP || n === FINAL) {
    const days = weekDays().filter(x => x.iso);
    const long = iso => parseIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const t = todayIso(), start = days.length && days[0].iso, end = days.length && days[days.length - 1].iso;
    const when = !days.length ? '' : n === PREP ? (t < start ? ' · starts ' : ' · started ') + long(start) : (t > end ? ' · ended ' : ' · ends ') + long(end);
    return `<h1>${dayName(n)}</h1><p>${n === PREP ? 'Before academy week' : 'After academy week'}${when}</p>`;
  }
  const d = weekDays().find(x => x.n === n) || {};
  const nice = d.iso ? parseIso(d.iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  return `<h1>Day ${n}${d.sub ? ` <span>· ${esc(d.sub)}</span>` : ''}</h1>${nice ? `<p>${nice}${n === currentWeekDay() ? ' · today' : ''}</p>` : ''}`;
}

function menu() {
  const opts = S.cohorts.map(c => `<option value="${esc(c.key)}" ${c.key === S.cohortKey ? 'selected' : ''}>${esc(c.key)}${c.status && !/active/i.test(c.status) ? ' (' + esc(c.status) + ')' : ''}</option>`).join('');
  return `<div class="menu" data-stop>
    <label class="menu-field">Cohort<select id="cohortSel" data-change="cohort">${opts || '<option>Loading…</option>'}</select></label>
    <button class="menu-item" data-act="refresh">${S.loading ? 'Loading…' : 'Refresh from the Google Sheet'}</button>
    <button class="menu-item" data-act="view" data-v="settings">Setup</button>
    <button class="menu-item" data-act="signout">Sign out <span class="muted small">${esc(S.user.email)}</span></button>
  </div>`;
}

const loadingView = () => `<p class="loading">${S.loading ? 'Opening the cohort sheet…' : ''}</p>`;

/* ---------- Shared pieces ---------- */
function circle(checked, attrs, extra = '') {
  return `<input type="checkbox" class="circle" ${attrs} ${checked ? 'checked' : ''} ${extra}>`;
}

function itemList(n, kind, { compact = false, more = false } = {}) {
  const items = itemsFor(n, kind);
  const empty = kind === 'priority' || more ? '' : '<li class="empty">Nothing yet.</li>';
  return `<ul class="checks drop-list ${items.length ? '' : 'is-empty'}" data-drop="items" data-day="${n}" data-kind="${kind}">
    ${items.map(t => {
      // "Bag check" also counts as done once every bag in use is checked.
      const bag = kind === 'todo' && isBagItem(t.text);
      const done = t.done || (bag && bagsAllDone(t.day ?? 1));
      let open = '';
      if (bag) {
        const inUse = bagsInUse(), ok = inUse.filter(b => bagDone(t.day ?? 1, b)).length;
        open = `<button class="btn tiny" data-act="openBag" data-d="${t.day ?? 1}">${compact ? ok + '/' + inUse.length : 'Open · ' + ok + '/' + inUse.length + ' bags'}</button>`;
      }
      return `<li class="${done ? 'done' : ''}" draggable="true" data-drag="item" data-id="${t.id}">
      <label>${circle(done, `data-act="todo" data-id="${t.id}"`)}<span><span class="txt">${esc(t.text)}</span>${t.rolledFrom ? ` <em class="tag-soft">unfinished · Day ${t.rolledFrom}</em>` : ''}</span></label>
      ${open}${compact ? '' : `<button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button>`}
    </li>`;
    }).join('') || empty}
  </ul>`;
}

function addRow(n, kind, placeholder) {
  const k = 'add-' + kind + '-' + n;
  return `<div class="add-row"><input id="${k}" data-draft="${k}" data-add="${kind}" data-day="${n}" placeholder="${placeholder}" value="${esc(S.drafts[k] || '')}"></div>`;
}

// The day's to-dos, then staff paperwork (from the Staffing tab) as plain lines at the end.
function todoList(n, { compact = false, carry = true } = {}) {
  const staff = staffTasks(n, { carry });
  return itemList(n, 'todo', { compact, more: staff.length > 0 }) + (staff.length ? `<ul class="checks staff">${staff.map(t => `<li class="${t.done ? 'done' : ''}">
    <label>${circle(t.done, t.attrs)}<span><span class="txt">${t.html}</span>${t.who ? ` <span class="who">(${esc(t.who)})</span>` : ''}${t.sub ? ` <span class="sub">${t.sub}</span>` : ''}${t.late ? ` <em class="tag-soft">unfinished · Day ${t.late}</em>` : ''}</span></label></li>`).join('')}</ul>` : '');
}

// "Hide checked" / "Show checked" (remembered on this computer).
const hidden = k => pref('hide-' + k) === '1';
const hideToggle = k => `<button class="link" data-act="hideDone" data-k="${k}">${hidden(k) ? 'Show checked' : 'Hide checked'}</button>`;

function notesArea(n, placeholder) {
  const id = 'notes-' + n;
  // Until the day's notes are typed in, they start from Setup → Day Templates.
  const saved = S.days[n] && S.days[n].notes;
  const val = S.drafts[id] ?? (saved !== undefined ? saved : (cfg().dayNotes[n] || ''));
  return `<textarea id="${id}" class="lined" data-draft="${id}" data-notes="${n}" rows="6" placeholder="${placeholder}">${esc(val)}</textarea>`;
}

/* ---------- Day page ---------- */
function dayView() {
  if (!S.sheet) return loadingView();
  const n = curDay();
  const today = currentWeekDay();
  const days = weekDays();
  const list = students();
  const behind = list.filter(s => s.skill === 'behind').length;
  const fixes = list.reduce((a, s) => a + s.fixes, 0);

  return `
  ${dayStrip()}
  ${!S.sheet.academyStart ? '<p class="muted small center">Tip: fill in “Academy Week Start” on the cohort’s Student Roster tab (cell AG8) and the app will open on the right day by itself.</p>' : ''}
  ${behind || fixes ? `<div class="pills">
    ${behind ? `<button class="pill" data-act="goStudents" data-f="behind">${behind} behind on skills</button>` : ''}
    ${fixes ? `<button class="pill" data-act="goStudents" data-f="fixes">${fixes} contact${fixes === 1 ? '' : 's'} waiting on fixes</button>` : ''}
  </div>` : ''}
  <div class="board">
    ${cfg().layout.map((col, i) => `<div class="board-col" data-drop="boxes" data-col="${i}">${col.map(b => box(b, n)).join('')}</div>`).join('')}
  </div>`;
}

// The Day page strip has Prep and Finalize at either end; the Schedule page's doesn't.
function dayStrip({ phases = true } = {}) {
  const n = phases ? curDay() : schedDay(), today = currentWeekDay();
  const days = weekDays();
  const first = days.find(x => x.iso), last = [...days].reverse().find(x => x.iso);
  const phase = (p, top, date) => `<button class="phase ${p === FINAL ? 'final' : ''} ${n === p ? 'on' : ''} ${phaseDay() === p ? 'today' : ''}" data-act="day" data-n="${p}">
      <small>${top}</small><b>${dayName(p)}</b><small>${date}</small></button>`;
  return `<div class="daystrip">
    ${phases ? phase(PREP, 'Before', first ? 'by ' + shortDate(first.iso) : '') : ''}
    ${days.map(x => `<button class="${x.n === n ? 'on' : ''} ${x.n === today ? 'today' : ''}" data-act="day" data-n="${x.n}">
      <small>${esc(x.label || 'Day')}</small><b>${x.n}</b><small>${x.iso ? shortDate(x.iso) : ''}</small></button>`).join('')}
    ${phases ? phase(FINAL, 'After', last ? 'after ' + shortDate(last.iso) : '') : ''}
  </div>`;
}

function box(b, n) {
  const shaded = b === 'priorities' || b === 'shopping' || b === 'notes' || b === 'packing';
  const hideKey = b === 'shopping' ? 'shop' : b === 'packing' ? 'pack' : (b === 'todo' || b === 'priorities') ? 'todo' : null;
  const head = (title, extra = '') => `<div class="box-head" draggable="true" data-drag="box" data-box="${b}" title="Drag to move this box">
    <span class="grip">${ICONS.grip}</span><h2>${title}</h2>${extra ? `<span class="head-actions">${extra}</span>` : ''}</div>`;
  let body = '';
  if (b === 'priorities') {
    const count = itemsFor(n, 'priority').length;
    const slots = Array.from({ length: MAX_PRIORITIES - count }, (_, i) => {
      const k = 'add-priority-' + n + '-' + i;
      return `<li class="slot"><span class="ghost"></span><input id="${k}" data-draft="${k}" data-add="priority" data-day="${n}" value="${esc(S.drafts[k] || '')}" placeholder="${i === 0 && !count ? 'Today’s top 3' : ''}"></li>`;
    }).join('');
    body = head('Priorities') + itemList(n, 'priority') + (slots ? `<ul class="checks slots">${slots}</ul>` : '');
  } else if (b === 'todo') {
    body = head('To Do', hideToggle('todo')) + addRow(n, 'todo', '+ to do') + todoList(n);
  } else if (b === 'shopping') {
    const open = S.shopping.filter(x => !x.bought).sort((a, c) => a.created - c.created);
    const bought = S.shopping.filter(x => x.bought).sort((a, c) => c.created - a.created);
    body = head('Shopping List', bought.length ? hideToggle('shop') + '<button class="link" data-act="clearBought">Clear bought</button>' : '')
      + `<div class="add-row"><input id="shopIn" data-draft="shop" data-add="shop" placeholder="Add something to buy" value="${esc(S.drafts.shop || '')}"></div>`
      + `<ul class="checks">${[...open, ...bought].map(x => `<li class="${x.bought ? 'done' : ''}">
          <label>${circle(x.bought, `data-act="bought" data-id="${x.id}"`)}<span><span class="txt">${esc(x.text)}</span>${x.auto ? ' <em class="tag-soft">bag check</em>' : ''}</span></label>
          <button class="x" data-act="delShop" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing to buy.</li>'}</ul>`;
  } else if (b === 'notes') {
    body = head('Notes') + notesArea(n, n === PREP || n === FINAL ? 'Notes' : 'Notes for today');
  } else if (b === 'packing') {
    // Unpacked first; packed ones drop to the bottom (or hide).
    const byOrder = (a, c) => orderOf(a) - orderOf(c);
    const list = [...S.packing.filter(x => !x.packed).sort(byOrder), ...S.packing.filter(x => x.packed).sort(byOrder)];
    body = head('Packing List', list.some(x => x.packed) ? hideToggle('pack') : '')
      + `<div class="add-row"><input id="packIn" data-draft="pack" data-add="pack" placeholder="+ add item" value="${esc(S.drafts.pack || '')}"></div>`
      + `<ul class="checks">${list.map(x => `<li class="${x.packed ? 'done' : ''}">
          <label>${circle(x.packed, `data-act="packed" data-id="${x.id}"`)}<span><span class="txt">${esc(x.text)}</span></span></label>
          <button class="x" data-act="delPack" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing on the list yet.</li>'}</ul>`;
  }
  const h = cfg().heights[b];
  return `<section class="box box-${b} ${shaded ? 'shaded' : ''} ${hideKey && hidden(hideKey) ? 'hide-done' : ''}" data-box-id="${b}" ${h ? `style="flex:0 0 auto;height:${h}px"` : ''}>
    ${body}<div class="resize" data-resize="${b}" title="Drag to make taller or shorter · double-click to reset"></div></section>`;
}

/* ---------- Week page ---------- */
function weekView() {
  if (!S.sheet) return loadingView();
  const today = currentWeekDay();
  return `
  <div class="week ${hidden('todo') ? 'hide-done' : ''}">
    ${weekDays().map(d => `<section class="week-col ${d.n === today ? 'today' : ''}" ${cfg().weekH ? `style="height:${cfg().weekH}px"` : ''}>
      <button class="week-head" data-act="day" data-n="${d.n}" data-open="1" title="Open Day ${d.n}">
        <small>${esc(d.label)}${d.iso ? ' ' + shortDate(d.iso) : ''}</small><b>Day ${d.n}</b>${d.sub ? `<small>${esc(d.sub)}</small>` : ''}
      </button>
      <div class="week-part"><p class="mini-head">To Do</p>${todoList(d.n, { compact: true, carry: false })}${addRow(d.n, 'todo', '+ to do')}</div>
      <div class="week-part shaded"><p class="mini-head">Notes</p>${notesArea(d.n, 'Notes')}</div>
      <div class="resize" data-resize="week" title="Drag to make all five days taller or shorter · double-click to reset"></div>
    </section>`).join('')}
  </div>`;
}

/* ---------- Schedule (Phase 2) ---------- */
// A day's schedule: what's saved for this cohort, else the saved template, else defaults.js.
function schedTemplate(n) {
  const t = S.settings && S.settings.scheduleTemplate && S.settings.scheduleTemplate[n];
  return t || DEFAULTS.schedule[n] || { blocks: [], stations: [], stationNote: '', notes: '' };
}
function schedFor(n) {
  const saved = S.schedule[n] || {};
  const t = schedTemplate(n);
  const pick = k => saved[k] !== undefined ? saved[k] : t[k];
  return { blocks: pick('blocks') || [], stations: pick('stations') || [], stationNote: pick('stationNote') || '', notes: pick('notes') || '' };
}
// Squads carry forward: a day without its own squads uses the closest earlier day's.
function squadsFor(n) {
  for (let d = n; d >= 1; d--) {
    const sq = S.schedule[d] && S.schedule[d].squads;
    if (sq) return { ...sq, from: d };
  }
  return { count: 0, s: {}, from: null };
}
function dayHeading(n) {
  const d = weekDays().find(x => x.n === n) || {};
  const name = d.iso ? parseIso(d.iso).toLocaleDateString('en-US', { weekday: 'long' }) : '';
  return { heading: `Day ${n}${name ? ' - ' + name : ''}`, date: d.iso ? shortDate(d.iso) : '' };
}
function printDay(n) {
  const d = schedFor(n);
  return { n, ...dayHeading(n), ...d, squads: squadsFor(n), // blank rows don't print
    blocks: d.blocks.filter(b => (b.time || '').trim() || (b.activity || '').trim()),
    stations: d.stations.filter(st => (st.topic || '').trim() || (st.content || '').trim()) };
}

async function saveSched(n, patch) {
  await Store.set(P('schedule/' + n), { ...schedFor(n), ...patch });
  publishSoon();
}

function scheduleView() {
  if (!S.sheet) return loadingView();
  const n = schedDay();
  const d = schedFor(n);
  const k = (...parts) => ['sch', n, ...parts].join('-');
  const dv = (key, v) => esc(S.drafts[key] ?? v);
  const sq = squadsFor(n);
  const token = S.cohortDoc && S.cohortDoc.shareToken;

  const blockRows = d.blocks.map((b, i) => `<div class="sched-row">
      <input id="${k('bt', i)}" data-draft="${k('bt', i)}" data-sch="blocks" data-i="${i}" data-f="time" value="${dv(k('bt', i), b.time)}" placeholder="Time">
      <input id="${k('ba', i)}" data-draft="${k('ba', i)}" data-sch="blocks" data-i="${i}" data-f="activity" value="${dv(k('ba', i), b.activity)}" placeholder="Activity">
      <span class="row-tools"><button class="x" data-act="schMove" data-list="blocks" data-i="${i}" data-dir="-1" title="Move up">↑</button><button class="x" data-act="schMove" data-list="blocks" data-i="${i}" data-dir="1" title="Move down">↓</button><button class="x" data-act="schDel" data-list="blocks" data-i="${i}" title="Remove">×</button></span>
    </div>`).join('');

  const stationRows = d.stations.map((st, i) => `<div class="sched-station">
      <div class="sched-station-top">
        <input id="${k('st', i)}" data-draft="${k('st', i)}" data-sch="stations" data-i="${i}" data-f="topic" value="${dv(k('st', i), st.topic)}" placeholder="Station topic">
        <span class="row-tools"><button class="x" data-act="schMove" data-list="stations" data-i="${i}" data-dir="-1" title="Move up">↑</button><button class="x" data-act="schMove" data-list="stations" data-i="${i}" data-dir="1" title="Move down">↓</button><button class="x" data-act="schDel" data-list="stations" data-i="${i}" title="Remove">×</button></span>
      </div>
      <textarea id="${k('sc', i)}" data-draft="${k('sc', i)}" data-sch="stations" data-i="${i}" data-f="content" data-grow rows="2" placeholder="Content & instructor notes">${dv(k('sc', i), st.content)}</textarea>
    </div>`).join('');

  // Squads: pick students from the roster into Team A / Team B.
  const names = students().map(s => s.name);
  const placed = new Set();
  for (let s = 1; s <= sq.count; s++) ['A', 'B'].forEach(t => ((sq.s[s] || {})[t] || []).forEach(x => placed.add(x)));
  const free = names.filter(x => !placed.has(x));
  const team = (s, t) => `<div class="team"><p>Team ${t}</p>
      ${((sq.s[s] || {})[t] || []).map(x => `<span class="name-chip">${esc(x)}<button class="x" data-act="squadDel" data-s="${s}" data-t="${t}" data-name="${esc(x)}" aria-label="Remove">×</button></span>`).join('')}
      ${free.length ? `<select data-change="squadAdd" data-s="${s}" data-t="${t}"><option value="">+ add student</option>${free.map(x => `<option>${esc(x)}</option>`).join('')}</select>` : ''}
    </div>`;

  return `
  <div class="sched-top">
    <span></span>
    ${dayStrip({ phases: false })}
    <div class="sched-more">
      <button class="icon-btn ${S.schMenu ? 'on' : ''}" data-act="schMenu" title="Print, instructor link, template" aria-label="More">⋯</button>
      ${S.schMenu ? `<div class="menu" data-stop>
        <button class="menu-item" data-act="printDay">Print Day ${n}</button>
        <button class="menu-item" data-act="printAll">Print all 5 days</button>
        <button class="menu-item" data-act="shareOpen">${token ? 'Instructor link & QR' : 'Make instructor link'}</button>
        <button class="menu-item" data-act="saveTemplate">Save this week as the template <span class="muted small">New cohorts start from this schedule</span></button>
      </div>` : ''}
    </div>
  </div>
  <div class="sched-grid">
    <div class="sched-col">
    <section class="box"><div class="box-head static"><h2>Class Schedule</h2><button class="add-plus" data-act="schAdd" data-list="blocks" title="Add a time" aria-label="Add a time">+</button></div>
      <div class="sched-rows">${blockRows || '<p class="empty">No times yet.</p>'}</div>
    </section>
    <section class="box"><div class="box-head static"><h2>Squads</h2>
        <label class="squad-count">Squads <select data-change="squadCount">${[0, 2, 3, 4, 5, 6].map(c => `<option value="${c}" ${sq.count === c ? 'selected' : ''}>${c || 'none'}</option>`).join('')}</select></label></div>
      ${sq.from && sq.from !== n ? `<p class="muted small">Same squads as Day ${sq.from}. Changing them here changes Day ${n} and the days after it.</p>` : sq.count ? '<p class="muted small">These carry forward to the following days until you change them.</p>' : ''}
      ${sq.count ? `<div class="squads">${Array.from({ length: sq.count }, (_, i) => i + 1).map(s => `<div class="squad"><h3>Squad ${s}</h3>${team(s, 'A')}${team(s, 'B')}</div>`).join('')}</div>
        <p class="muted small">${free.length ? free.length + ' student' + (free.length === 1 ? '' : 's') + ' not in a squad yet.' : 'Everyone is in a squad.'}</p>` : '<p class="empty">Pick how many squads to set them up.</p>'}
    </section>
    </div>
    <div class="sched-col">
    <section class="box"><div class="box-head static"><h2>Station Content</h2><button class="add-plus" data-act="schAdd" data-list="stations" title="Add a station" aria-label="Add a station">+</button></div>
      ${stationRows || '<p class="empty">No stations this day.</p>'}
      <label class="field sched-foot">Note under the stations
        <input id="${k('sn')}" data-draft="${k('sn')}" data-sch="stationNote" value="${dv(k('sn'), d.stationNote)}" placeholder="e.g. Stations with two topics: split into 30 minute segments."></label>
    </section>
    <section class="box"><div class="box-head static"><h2>Instructor Notes/Reminders</h2></div>
      <textarea id="${k('notes')}" class="sched-notes" data-draft="${k('notes')}" data-sch="notes" data-grow rows="8">${dv(k('notes'), indentDashes(d.notes))}</textarea>
    </section>
    </div>
  </div>`;
}

async function saveSquads(n, sq) {
  await Store.set(P('schedule/' + n), { squads: { count: sq.count, s: sq.s } });
  publishSoon();
}

/* ---------- Instructor link (read-only copy at view.html?t=...) ---------- */
const shareUrl = token => new URL('view.html?t=' + token, location.href).href;
let publishTimer;
function publishSoon() { clearTimeout(publishTimer); publishTimer = setTimeout(publish, 1200); }
async function publish() {
  const token = S.cohortDoc && S.cohortDoc.shareToken;
  if (!token || !S.sheet) return;
  const days = {};
  weekDays().forEach(d => { days[d.n] = { ...printDay(d.n), iso: d.iso || '' }; });
  await Store.set('shared/' + token, { cohort: S.cohortKey, updated: Date.now(), days }, false);
}
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');

let qrLoading;
function loadQr() {
  if (window.QRCode) return Promise.resolve();
  return qrLoading || (qrLoading = new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = ok; sc.onerror = () => { qrLoading = null; fail(new Error('Couldn’t load the QR code maker.')); };
    document.head.appendChild(sc);
  }));
}
function drawQr(el, text, size) {
  el.innerHTML = '';
  new QRCode(el, { text, width: size, height: size, colorDark: '#3d322c', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function shareModal() {
  const token = S.cohortDoc && S.cohortDoc.shareToken;
  return `<div class="overlay" data-act="shareClose"><div class="modal share" data-stop>
    <div class="modal-head"><h2>Instructor Link</h2><button class="x big" data-act="shareClose" aria-label="Close">×</button></div>
    <div class="pad">
      ${token ? `<div class="share-body">
        <div id="shareQr" class="share-qr"></div>
        <div>
          <p>Instructors scan this (or open the link) to see the live schedule. They can view and print it, but can’t change anything. It updates a moment after you edit.</p>
          <input class="share-url" readonly value="${esc(shareUrl(token))}" onclick="this.select()">
          <div class="share-btns">
            <button class="btn primary" data-act="shareCopy">Copy link</button>
            <a class="btn" href="${esc(shareUrl(token))}" target="_blank" rel="noopener">Open it</a>
          </div>
          <p class="muted small">Anyone with this link can see the schedule, including squad names. The QR code is also printed on each Day page.</p>
          <div class="share-btns">
            <button class="link" data-act="shareNew">Make a new link (the old one stops working)</button>
            <button class="link" data-act="shareOff">Turn the link off</button>
          </div>
        </div></div>`
      : `<p>Make a private, read-only link for instructors. You’ll get a QR code to share, and it’s printed on each Day page too.</p>
        <p class="muted small">Anyone with the link can see the schedule, including squad names. You can turn it off any time.</p>
        <button class="btn primary" data-act="shareMake">Make the link</button>`}
    </div>
  </div></div>`;
}

/* ---------- Printing ---------- */
async function printDays(list) {
  const token = S.cohortDoc && S.cohortDoc.shareToken;
  const root = document.getElementById('print-root');
  root.innerHTML = list.map(n => Sched.pages(printDay(n), { qr: !!token })).join('');
  if (token) {
    try { await loadQr(); root.querySelectorAll('.p-qr').forEach(el => drawQr(el, shareUrl(token), 84)); }
    catch { root.querySelectorAll('.p-qr').forEach(el => el.remove()); }
    await new Promise(r => setTimeout(r, 150)); // let the QR images finish drawing
  }
  window.print();
}

/* ---------- Bag check ---------- */
const bagState = (n, b) => ((S.days[n] && S.days[n].bags) || {})[b] || {};
function bagDone(n, b) {
  const st = bagState(n, b);
  return bagSections().every(sec => sec.items.every(it => !bagCarries(it, b) || st[it.id]));
}
function bagsAllDone(n) { const u = bagsInUse(); return u.length > 0 && u.every(b => bagDone(n, b)); }

function bagModal() {
  const n = S.bagOpen;
  const inUse = bagsInUse();
  const tab = inUse.includes(S.bagTab) ? S.bagTab : inUse[0];
  const st = tab ? bagState(n, tab) : {};
  const all = Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
  return `<div class="overlay" data-act="closeBag"><div class="modal" data-stop>
    <div class="modal-head">
      <h2>Bag Check · ${dayName(n)}</h2>
      <button class="x big" data-act="closeBag" aria-label="Close">×</button>
    </div>
    <div class="bags-in-use"><span>Bags in use for ${esc(S.cohortKey)}:</span>
      ${all.map(b => `<button class="chip ${inUse.includes(b) ? 'on' : ''}" data-act="toggleBagUse" data-b="${b}">Bag ${b}</button>`).join('')}</div>
    ${inUse.length ? `<div class="bag-tabs">${inUse.map(b => `<button class="bag-tab ${b === tab ? 'on' : ''}" data-act="bagTab" data-b="${b}">Bag ${b}${bagDone(n, b) ? ' ✓' : ''}</button>`).join('')}</div>
    <div class="modal-body" data-keep-scroll="bag">
      ${bagSections().map(sec => {
        const items = sec.items.filter(it => bagCarries(it, tab));
        if (!items.length) return '';
        return `<h3>${esc(sec.name)}</h3><div class="bag-items">${items.map(it => {
          const v = st[it.id];
          return `<div class="bag-item ${v || ''}"><span>${esc(it.name)}</span><div class="seg">
            ${['ok', 'low', 'missing'].map(s => `<button class="${v === s ? 'on ' + s : ''}" data-act="bagItem" data-b="${tab}" data-id="${it.id}" data-s="${s}">${s === 'ok' ? '✓ OK' : s === 'low' ? 'Low' : 'Missing'}</button>`).join('')}
          </div></div>`;
        }).join('')}</div>`;
      }).join('')}
    </div>
    <div class="modal-foot"><button class="btn" data-act="restOk" data-b="${tab}">Mark the rest of Bag ${tab} OK</button><span class="muted small">Low and Missing go on the shopping list.</span><button class="btn primary" data-act="closeBag">Done</button></div>`
    : '<p class="muted pad">Pick which bags you’re using above.</p>'}
  </div></div>`;
}

async function setBagItem(n, b, it, s) {
  const cur = bagState(n, b)[it.id];
  const next = cur === s ? null : s;
  await Store.set(P('days/' + n), { bags: { [b]: { [it.id]: next } } });
  const auto = 'bag' + b + '-' + it.id;
  const existing = S.shopping.find(x => x.auto === auto && !x.bought);
  if (next === 'low' || next === 'missing') {
    const text = `${it.name} (Bag ${b}, ${next})`;
    if (existing) { if (existing.text !== text) await Store.set('shopping/' + existing.id, { text }); }
    else await Store.add('shopping', { text, bought: false, auto, created: Date.now() });
  } else if (existing) {
    await Store.del('shopping/' + existing.id);
  }
}

/* ---------- Students ---------- */
function studentsView() {
  if (!S.sheet) return loadingView();
  const all = students();
  const counts = {
    all: all.length,
    behind: all.filter(s => s.skill === 'behind').length,
    fixes: all.filter(s => s.fixes).length,
    warnings: all.filter(s => s.warns).length,
  };
  const q = S.search.trim().toLowerCase();
  const shown = all.filter(s =>
    (S.filter === 'all' || (S.filter === 'behind' && s.skill === 'behind') || (S.filter === 'fixes' && s.fixes) || (S.filter === 'warnings' && s.warns))
    && (!q || s.name.toLowerCase().includes(q)));

  // Who's behind on what, grouped by skill (for planning the next day).
  const bySkill = {};
  all.filter(s => s.skill === 'behind').forEach(s => s.behind.forEach(k => (bySkill[k] = bySkill[k] || []).push(s)));
  const order = DEFAULTS.skills.flatMap(g => g.items);
  const skillRows = Object.keys(bySkill).sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const chip = (k, l) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l} <b>${counts[k]}</b></button>`;
  const skillLabel = { on: 'On track', behind: 'Behind', done: 'Done' };

  return `
  <div class="students-top">
    <div class="chips">${chip('all', 'All')}${chip('behind', 'Behind on skills')}${chip('fixes', 'Contacts to fix')}${chip('warnings', 'Attendance notes')}</div>
    <input id="searchIn" class="search" data-draft="search" placeholder="Find a student" value="${esc(S.search)}">
  </div>
  ${skillRows.length ? `<section class="box shaded behind-card"><div class="box-head static"><h2>Behind by Skill</h2><span class="muted small">for picking tomorrow’s scenarios</span></div>
    <div class="behind-list">${skillRows.map(k => `<div><b>${esc(k)}</b> <span class="n">${bySkill[k].length}</span><span class="who">${bySkill[k].map(s => `<button class="link" data-act="openStudent" data-sid="${s.sid}">${esc(firstName(s.name))}</button>`).join(', ')}</span></div>`).join('')}</div>
  </section>` : ''}
  <section class="box table-box">
    <table class="roster">
      <thead><tr><th>#</th><th>Student</th><th>Skills</th><th class="c">Patient contacts</th><th class="c">To fix</th><th class="c">Attendance</th></tr></thead>
      <tbody>${shown.map(s => `<tr data-act="openStudent" data-sid="${s.sid}">
        <td class="muted">${all.indexOf(s) + 1}</td>
        <td><b>${esc(s.name)}</b>${/paused/i.test(s.status) ? ' <span class="tag">Paused</span>' : ''}</td>
        <td><span class="status ${s.skill}">${skillLabel[s.skill]}</span>${s.skill === 'behind' && s.behind.length ? `<span class="muted small"> ${esc(s.behind.join(', '))}</span>` : ''}</td>
        <td class="c">${pcStepper(s)}</td>
        <td class="c">${s.fixes ? `<span class="badge warn">${s.fixes}</span>` : '<span class="muted">–</span>'}</td>
        <td class="c">${s.warns ? `<span class="badge">${s.warns}</span>` : '<span class="muted">–</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">No students match.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function firstName(name) {
  const nick = name.match(/\(([^)]+)\)/);
  if (nick) return nick[1];
  return name.includes(',') ? name.split(',')[1].trim().split(/\s+/)[0] : name.split(/\s+/)[0];
}

function pcStepper(s) {
  return `<span class="stepper ${S.pcBusy[s.sid] ? 'busy' : ''}" data-stop>
    <button data-act="pc" data-sid="${s.sid}" data-by="-1" aria-label="One less">−</button>
    <b>${s.contacts}</b>
    <button data-act="pc" data-sid="${s.sid}" data-by="1" aria-label="One more">+</button></span>`;
}

async function changePc(sid, by) {
  const s = S.sheet.students.find(x => slug(x.name) === sid);
  if (!s || S.pcBusy[sid] || (by < 0 && s.contacts <= 0)) return;
  const before = s.contacts;
  S.pcBusy[sid] = true; s.contacts = Math.max(0, before + by); render();
  try {
    s.contacts = await Sheets.changeContacts(S.cohortKey, { ...s, contacts: before }, by);
  } catch (e) {
    s.contacts = before; toast(e.message);
  }
  delete S.pcBusy[sid]; render();
}

function drawer() {
  const s = studentBySid(S.open);
  if (!s) return '';
  const contacts = S.contacts.filter(c => c.sid === s.sid).sort((a, b) => b.created - a.created);
  const warns = S.warnings.filter(w => w.sid === s.sid).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  const dk = k => k + '-' + s.sid;
  const note = S.drafts[dk('note')] ?? s.note;
  return `<div class="overlay side" data-act="closeStudent"><aside class="drawer" data-stop>
    <div class="drawer-head"><h2>${esc(s.name)}</h2><button class="x big" data-act="closeStudent" aria-label="Close">×</button></div>
    <div class="drawer-body" data-keep-scroll="drawer">

      <section>
        <h3>Skills</h3>
        <div class="seg wide">${[['on', 'On track'], ['behind', 'Behind'], ['done', 'Done']].map(([k, l]) =>
          `<button class="${s.skill === k ? 'on ' + k : ''}" data-act="skill" data-sid="${s.sid}" data-v="${k}">${l}</button>`).join('')}</div>
        ${s.skill === 'behind' ? `<p class="muted small">Tap what they’re behind on:</p>
          ${DEFAULTS.skills.map(g => `<div class="skill-group"><span>${esc(g.group)}</span><div>${g.items.map(k =>
            `<button class="chip small ${s.behind.includes(k) ? 'on warn' : ''}" data-act="behind" data-sid="${s.sid}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`).join('')}` : ''}
        <textarea id="${dk('note')}" data-draft="${dk('note')}" data-change="note" data-sid="${s.sid}" rows="2" placeholder="Skills note (optional)">${esc(note)}</textarea>
      </section>

      <section>
        <h3>Patient Contacts</h3>
        <div class="pc-big">${pcStepper(s)}<span class="muted small">in the Google Sheet (column P)</span></div>
        <div class="log-form">
          <div class="row2">
            <label>Contact #<input id="${dk('cnum')}" data-draft="${dk('cnum')}" type="number" min="1" value="${esc(S.drafts[dk('cnum')] ?? (s.contacts + 1))}"></label>
            <label class="grow check-inline"><input type="checkbox" class="circle" id="${dk('cadd')}" ${S.drafts[dk('cadd')] === false ? '' : 'checked'} data-act="cadd" data-sid="${s.sid}"> New simulated contact (adds 1 to their count)</label>
          </div>
          <textarea id="${dk('cfix')}" data-draft="${dk('cfix')}" rows="2" placeholder="What needs fixed? (e.g. missing vitals times, narrative too short)">${esc(S.drafts[dk('cfix')] || '')}</textarea>
          <button class="btn primary" data-act="logContact" data-sid="${s.sid}">Save contact</button>
        </div>
        <ul class="log">${contacts.map(c => `<li class="${c.fixed ? 'done' : ''}">
          <div><b>#${esc(c.num)}</b> <span class="muted small">${shortDate(c.date)}</span>
            ${c.fix ? `<p>${esc(c.fix)}</p>` : '<p class="muted">No fixes needed.</p>'}</div>
          ${c.fix ? `<label class="fixed">${circle(c.fixed, `data-act="fixed" data-id="${c.id}"`)} Fixed</label>` : ''}
          <button class="x" data-act="delContact" data-id="${c.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">No contact notes yet.</li>'}</ul>
      </section>

      <section>
        <h3>Attendance & Warnings</h3>
        <div class="log-form">
          <div class="row2">
            <label>Date<input id="${dk('wdate')}" data-draft="${dk('wdate')}" type="date" value="${esc(S.drafts[dk('wdate')] || todayIso())}"></label>
            <label>Type<select id="${dk('wtype')}" data-draft="${dk('wtype')}">${DEFAULTS.warningTypes.map(t => `<option ${S.drafts[dk('wtype')] === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          </div>
          <textarea id="${dk('wnote')}" data-draft="${dk('wnote')}" rows="2" placeholder="What happened?">${esc(S.drafts[dk('wnote')] || '')}</textarea>
          <button class="btn primary" data-act="addWarning" data-sid="${s.sid}">Add</button>
        </div>
        <ul class="log">${warns.map(w => `<li>
          <div><span class="tag ${/warning/i.test(w.type) ? 'red' : ''}">${esc(w.type)}</span> <span class="muted small">${shortDate(w.date)}</span>
            ${w.note ? `<p>${esc(w.note)}</p>` : ''}</div>
          <button class="x" data-act="delWarning" data-id="${w.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing recorded.</li>'}</ul>
      </section>
    </div>
  </aside></div>`;
}

/* ---------- Settings ---------- */
function settingsView() {
  const c = cfg();
  const bagText = c.bag.map(sec => '# ' + sec.name + '\n' + sec.items.join('\n')).join('\n\n');
  const someItems = bagSections().flatMap(sec => sec.items.filter(it => it.some));
  const all = Array.from({ length: c.bagCount }, (_, i) => i + 1);
  const dv = (k, v) => esc(S.drafts[k] ?? v);
  return `<div class="settings">
    <section class="box">
      <div class="box-head static"><h2>Day Templates</h2></div>
      <p class="muted small">The to-dos that repeat for every cohort (Prep, Day 1–5, Finalize), the Prep packing list, and the notes each day starts with.</p>
      <button class="btn primary" data-act="tplOpen">Edit day templates</button>
    </section>

    <section class="box">
      <div class="box-head static"><h2>Bag Contents</h2></div>
      <p class="muted small">Lines starting with # are pockets/pouches. Put *** after anything only some bags carry.</p>
      <textarea id="set-bag" class="mono" data-draft="set-bag" rows="22">${dv('set-bag', bagText)}</textarea>
      <button class="btn primary" data-act="saveBag">Save bag contents</button>
      ${someItems.length ? `<h3>Which bags carry the *** items</h3>
      <table class="grid-table"><thead><tr><th></th>${all.map(b => `<th>Bag ${b}</th>`).join('')}</tr></thead>
        <tbody>${someItems.map(it => `<tr><td>${esc(it.name)}</td>${all.map(b => `<td>${circle(bagCarries(it, b), `data-act="someBag" data-id="${it.id}" data-b="${b}"`)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    </section>

    <section class="box">
      <div class="box-head static"><h2>Staff Paperwork</h2></div>
      <label class="field">Names on the Staffing tab that don’t need paperwork or pay reminders (comma separated)
        <input id="set-skip" data-draft="set-skip" value="${dv('set-skip', c.skipStaff.join(', '))}"></label>
      <button class="btn primary" data-act="saveSkip">Save</button>
    </section>

    <section class="box">
      <div class="box-head static"><h2>Day Page Layout</h2></div>
      <p class="muted small">Drag any box by its title on the Day page to move it. This puts everything back where it started.</p>
      <button class="btn" data-act="resetLayout">Reset layout</button>
    </section>
  </div>`;
}

/* ---------- Day Templates pop-up ---------- */
const TPL_KEYS = ['tpl-every', 'tpl-pack', ...ALL_DAYS.flatMap(n => ['tpl-todo-' + n, 'tpl-notes-' + n])];
function templatesModal() {
  const c = cfg(), tab = S.tplTab;
  const dv = (k, v) => esc(S.drafts[k] ?? v);
  const tabBtn = (t, label) => `<button class="bag-tab ${tab === t ? 'on' : ''}" data-act="tplTab" data-t="${t}">${label}</button>`;
  const body = tab === 'every'
    ? `<p class="muted small">These go on Day 1–5’s To Do (not Prep or Finalize). One per line. Anything with “bag check” in it opens the bag pop-up.</p>
       <label class="field">Every day<textarea id="tpl-every" data-draft="tpl-every" rows="8">${dv('tpl-every', (c.checklist.everyDay || []).join('\n'))}</textarea></label>`
    : `<label class="field">${dayName(Number(tab))} to-dos <span class="small">(one per line${tab === '0' || tab === '6' ? '' : ', added after the every-day ones'})</span>
         <textarea id="tpl-todo-${tab}" data-draft="tpl-todo-${tab}" rows="7">${dv('tpl-todo-' + tab, ((c.checklist.days || {})[tab] || []).join('\n'))}</textarea></label>
       ${tab === '0' ? `<label class="field">Packing list <span class="small">(one per line)</span>
         <textarea id="tpl-pack" data-draft="tpl-pack" rows="8">${dv('tpl-pack', c.packing.join('\n'))}</textarea></label>` : ''}
       <label class="field">${dayName(Number(tab))} notes <span class="small">(what the Notes box starts with)</span>
         <textarea id="tpl-notes-${tab}" data-draft="tpl-notes-${tab}" rows="8">${dv('tpl-notes-' + tab, c.dayNotes[tab] || '')}</textarea></label>`;
  return `<div class="overlay" data-act="tplClose"><div class="modal tpl" data-stop>
    <div class="modal-head"><h2>Day Templates</h2><button class="x big" data-act="tplClose" aria-label="Close">×</button></div>
    <div class="bag-tabs">${tabBtn('every', 'Every day')}${ALL_DAYS.map(n => tabBtn(String(n), dayName(n))).join('')}</div>
    <div class="modal-body"><div class="tpl-body">${body}</div></div>
    <div class="modal-foot"><span class="muted small">Used for every cohort. Changing a day’s notes here doesn’t touch notes you’ve already typed.</span>
      <button class="btn primary" data-act="tplSave">Save</button></div>
  </div></div>`;
}

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
function parseBag(text) {
  const out = [];
  lines(text).forEach(l => {
    if (l.startsWith('#')) out.push({ name: l.replace(/^#+\s*/, ''), items: [] });
    else { if (!out.length) out.push({ name: 'Bag', items: [] }); out[out.length - 1].items.push(l); }
  });
  return out.filter(s => s.name);
}

// In the Instructor Notes box, "- " lines show pushed in a few spaces. The spaces are
// only for looks: they come off again when it saves.
const indentDashes = text => String(text || '').split('\n').map(l => l.replace(/^\s*(?=[-–•])/, '    ')).join('\n');
const unindentDashes = text => String(text || '').split('\n').map(l => l.replace(/^\s+(?=[-–•])/, '')).join('\n');

function schChange(t) {
  const n = schedDay(), d = schedFor(n), f = t.dataset.sch;
  const val = f === 'notes' ? unindentDashes(t.value) : t.value;
  const done = () => { delete S.drafts[t.dataset.draft]; };
  if (f === 'notes' || f === 'stationNote') return saveSched(n, { [f]: val }).then(done);
  const list = d[f].map(x => ({ ...x }));
  const i = Number(t.dataset.i);
  if (!list[i]) return;
  list[i][t.dataset.f] = val;
  return saveSched(n, { [f]: list }).then(done);
}

/* ---------- Notes (saved a moment after you stop typing) ---------- */
const noteTimers = {};
function saveNoteSoon(n, id) {
  clearTimeout(noteTimers[id]);
  noteTimers[id] = setTimeout(async () => {
    const text = S.drafts[id];
    if (text === undefined) return;
    await Store.set(P('days/' + n), { notes: text });
    if (document.activeElement && document.activeElement.id === id) return; // keep the draft while typing
    if (S.drafts[id] === text) delete S.drafts[id];
  }, 700);
}

/* ---------- Drag and drop ---------- */
document.addEventListener('dragstart', e => {
  const el = e.target.closest && e.target.closest('[data-drag]');
  if (!el) return;
  S.dragging = el.dataset.drag === 'box' ? { type: 'box', id: el.dataset.box } : { type: 'item', id: el.dataset.id };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', S.dragging.id); } catch {}
  const moving = el.dataset.drag === 'box' ? el.closest('.box') : el;
  setTimeout(() => moving.classList.add('moving'), 0);
});

document.addEventListener('dragover', e => {
  if (!S.dragging) return;
  const zone = e.target.closest(S.dragging.type === 'box' ? '[data-drop="boxes"]' : '[data-drop="items"]');
  document.querySelectorAll('.drop-here').forEach(x => x !== zone && x.classList.remove('drop-here'));
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('drop-here');
  const kids = [...zone.children].filter(c => S.dragging.type === 'box' ? c.matches('.box') : c.matches('[data-id]'));
  const after = kids.find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
  const moving = document.querySelector('.moving');
  if (moving) {
    if (after) { if (after !== moving) zone.insertBefore(moving, after); }
    else if (zone.lastElementChild !== moving) {
      const empty = zone.querySelector('.empty'); if (empty) empty.remove();
      zone.appendChild(moving);
    }
  }
});

document.addEventListener('drop', e => { if (S.dragging) e.preventDefault(); });

document.addEventListener('dragend', async () => {
  const drag = S.dragging;
  const moving = document.querySelector('.moving');
  document.querySelectorAll('.drop-here').forEach(x => x.classList.remove('drop-here'));
  if (!drag || !moving) { S.dragging = null; render(); return; }
  moving.classList.remove('moving');
  try {
    if (drag.type === 'box') {
      S.dragging = null;
      await saveLayout();
    } else {
      const list = moving.parentElement;
      const day = Number(list.dataset.day), kind = list.dataset.kind;
      const t = S.todos.find(x => x.id === drag.id);
      S.dragging = null;
      if (!t) return;
      if (kind === 'priority' && (t.kind || 'todo') !== 'priority' || (kind === 'priority' && (t.day ?? 1) !== day)) {
        if (itemsFor(day, 'priority').filter(x => x.id !== t.id).length >= MAX_PRIORITIES) { toast('Day ' + day + ' already has 3 priorities.'); return; }
      }
      const ids = [...list.querySelectorAll(':scope > [data-id]')].map(li => li.dataset.id);
      const i = ids.indexOf(t.id);
      const others = itemsFor(day, kind).filter(x => x.id !== t.id);
      const byId = Object.fromEntries(others.map(x => [x.id, x]));
      const prev = i > 0 ? byId[ids[i - 1]] : null, next = byId[ids[i + 1]];
      const order = prev && next ? (orderOf(prev) + orderOf(next)) / 2 : prev ? orderOf(prev) + 1000 : next ? orderOf(next) - 1000 : Date.now();
      const upd = { day, kind, order };
      if (day !== (t.day ?? 1)) upd.rolledFrom = null; // moved on purpose, so it's not "unfinished" anymore
      await Store.set(P('todos/' + t.id), upd);
    }
  } catch (err) { toast(err.message); }
  finally { S.dragging = null; render(); }
});

function saveLayout(heights = cfg().heights) {
  const board = cfg().board; // Prep's layout is saved apart from the other days'
  // Every box is listed (null = no set height) because a merge-save never removes old keys.
  const layout = { v: LAYOUT_VERSION, h: Object.fromEntries(board.boxes.map(b => [b, heights[b] || null])) };
  document.querySelectorAll('[data-drop="boxes"]').forEach(col => {
    layout['c' + col.dataset.col] = [...col.querySelectorAll(':scope > .box')].map(b => b.dataset.boxId);
  });
  return Store.set('meta/settings', { [board.key]: layout });
}

/* ---------- Box heights (drag the bottom edge; double-click it to reset) ---------- */
document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('[data-resize]');
  if (!handle) return;
  e.preventDefault();
  const week = handle.dataset.resize === 'week';
  const boxEl = handle.closest(week ? '.week-col' : '.box');
  const startY = e.clientY, startH = boxEl.offsetHeight;
  S.dragging = { type: 'resize' };
  document.body.classList.add('resizing');
  // On the Week page all five days stay the same height.
  const els = week ? [...document.querySelectorAll('.week-col')] : [boxEl];
  const move = ev => els.forEach(el => { el.style.flex = week ? '' : '0 0 auto'; el.style.height = Math.max(week ? 200 : 90, startH + ev.clientY - startY) + 'px'; });
  const up = async () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.body.classList.remove('resizing');
    S.dragging = null;
    if (boxEl.style.height && boxEl.offsetHeight !== startH) {
      if (week) await Store.set('meta/settings', { weekH: boxEl.offsetHeight });
      else await saveLayout({ ...cfg().heights, [handle.dataset.resize]: boxEl.offsetHeight });
    }
    render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
document.addEventListener('dblclick', async e => {
  const handle = e.target.closest('[data-resize]');
  if (!handle) return;
  if (handle.dataset.resize === 'week') { await Store.set('meta/settings', { weekH: null }); return; }
  const heights = { ...cfg().heights }; delete heights[handle.dataset.resize];
  await saveLayout(heights);
});

// The Day page boxes fill the window height on a laptop-size screen.
// Text boxes that grow to fit what's in them.
function grow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }

function fitBoard() {
  const board = document.querySelector('.board');
  if (!board) return;
  board.style.minHeight = innerWidth >= 1100 ? Math.max(520, innerHeight - board.getBoundingClientRect().top - window.scrollY - 24) + 'px' : '';
}
addEventListener('resize', fitBoard);

/* ---------- Events ---------- */
document.addEventListener('input', e => {
  const t = e.target, k = t.dataset.draft;
  if (!k) return;
  if (k === 'search') { S.search = t.value; render(); return; }
  if (t.dataset.sch === 'notes') { // indent a "- " line as soon as it's typed, keeping the cursor in place
    const fixed = indentDashes(t.value);
    if (fixed !== t.value) {
      const pos = indentDashes(t.value.slice(0, t.selectionStart)).length;
      t.value = fixed; t.setSelectionRange(pos, pos);
    }
  }
  S.drafts[k] = t.value;
  if (t.hasAttribute('data-grow')) grow(t);
  if (t.dataset.notes) saveNoteSoon(Number(t.dataset.notes), t.id);
});

document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.dataset && t.dataset.notes && S.drafts[t.id] !== undefined) {
    const id = t.id, n = Number(t.dataset.notes), text = S.drafts[id];
    clearTimeout(noteTimers[id]);
    Store.set(P('days/' + n), { notes: text }).then(() => { if (S.drafts[id] === text) delete S.drafts[id]; });
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.change === 'cohort') { S.menuOpen = false; selectCohort(t.value); return; }
  if (t.dataset.sch) { schChange(t); return; }
  if (t.dataset.change === 'squadCount') { act('squadCount', t); return; }
  if (t.dataset.change === 'squadAdd') { act('squadAdd', t); return; }
  // A priority line saves when you click or tab away, not only on Enter.
  if (t.dataset.add === 'priority' && t.closest('.slots')) { act('addItem', t); return; }
  if (t.dataset.change === 'note') {
    await Store.set(P('students/' + t.dataset.sid), { note: t.value.trim() });
    delete S.drafts[t.dataset.draft]; render();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (S.bagOpen !== false) S.bagOpen = false; else if (S.tplOpen) S.tplOpen = false; else if (S.shareOpen) S.shareOpen = false; else if (S.open) S.open = null; else if (S.menuOpen) S.menuOpen = false; else if (S.schMenu) S.schMenu = false; else return;
    render(); return;
  }
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.dataset.add) return;
  e.preventDefault();
  const t = e.target;
  if (t.dataset.add === 'shop') act('addShop');
  else if (t.dataset.add === 'pack') act('addPack');
  else act('addItem', t);
});

document.addEventListener('click', e => {
  if (S.menuOpen && !e.target.closest('.menu-wrap')) { S.menuOpen = false; render(); }
  if (S.schMenu && !e.target.closest('.sched-more')) { S.schMenu = false; render(); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.closest('.sched-more .menu')) { S.schMenu = false; render(); } // picking something closes the ⋯ menu
  // Only the backdrop itself closes a pop-up, and the +/− box doesn't open the student.
  if (el.classList.contains('overlay') && e.target !== el) return;
  if (el.tagName === 'TR' && e.target.closest('[data-stop]')) return;
  act(el.dataset.act, el, e);
});

async function act(a, el = {}, e) {
  const d = el.dataset || {};
  const n = schedDay(); // (only the Schedule actions below use n)
  try {
    switch (a) {
      case 'signin': await Store.signIn(); break;
      case 'signout': S.menuOpen = false; await Store.signOut(); break;
      case 'menu': S.menuOpen = !S.menuOpen; render(); break;
      case 'schMenu': S.schMenu = !S.schMenu; render(); break;
      case 'refresh': S.menuOpen = false; await loadSheet(); break;
      case 'view': S.view = d.v; pref('view', d.v); S.open = null; S.menuOpen = false; render(); window.scrollTo(0, 0); break;
      case 'day':
        S.day = Number(d.n); pref('day-' + S.cohortKey, d.n);
        if (d.open) { S.view = 'day'; pref('view', 'day'); window.scrollTo(0, 0); }
        render(); break;
      case 'goStudents': S.view = 'students'; S.filter = d.f; pref('view', 'students'); render(); break;
      case 'filter': S.filter = d.f; render(); break;
      case 'hideDone': pref('hide-' + d.k, hidden(d.k) ? '0' : '1'); render(); break;

      case 'check': {
        const day = Number(d.d);
        const cur = !!((S.days[day] && S.days[day].checks) || {})[d.k];
        await Store.set(P('days/' + day), { checks: { [d.k]: !cur } }); break;
      }
      case 'addItem': {
        const kind = d.add, day = Number(d.day), k = el.id || 'add-' + kind + '-' + day;
        const text = (S.drafts[k] || '').trim(); if (!text) return;
        if (kind === 'priority' && itemsFor(day, 'priority').length >= MAX_PRIORITIES) { toast('Three priorities max. Drag one to To Do to make room.'); return; }
        S.drafts[k] = ''; render();
        await Store.add(P('todos'), { text, done: false, day, kind, order: Date.now(), created: Date.now() }); break;
      }
      case 'todo': { const t = S.todos.find(x => x.id === d.id); await Store.set(P('todos/' + d.id), { done: !t.done }); break; }
      case 'delTodo': {
        const t = S.todos.find(x => x.id === d.id);
        // A deleted repeat to-do stays gone for this cohort, even after the template is saved again.
        if (t && t.repeat) await Store.set('cohorts/' + S.cohortKey, { removedRepeats: { [t.id]: true } });
        await Store.del(P('todos/' + d.id)); break;
      }

      case 'addShop': {
        const text = (S.drafts.shop || '').trim(); if (!text) return;
        S.drafts.shop = ''; render();
        await Store.add('shopping', { text, bought: false, auto: null, created: Date.now() }); break;
      }
      case 'bought': { const x = S.shopping.find(i => i.id === d.id); await Store.set('shopping/' + d.id, { bought: !x.bought }); break; }
      case 'delShop': await Store.del('shopping/' + d.id); break;

      case 'addPack': {
        const text = (S.drafts.pack || '').trim(); if (!text) return;
        S.drafts.pack = ''; render();
        await Store.add(P('packing'), { text, packed: false, order: Date.now(), created: Date.now() }); break;
      }
      case 'packed': { const x = S.packing.find(i => i.id === d.id); await Store.set(P('packing/' + d.id), { packed: !x.packed }); break; }
      case 'delPack': {
        const x = S.packing.find(i => i.id === d.id);
        if (x && x.repeat) await Store.set('cohorts/' + S.cohortKey, { removedRepeats: { [x.id]: true } });
        await Store.del(P('packing/' + d.id)); break;
      }
      case 'clearBought':
        if (!confirm('Remove everything checked off as bought?')) return;
        await Promise.all(S.shopping.filter(x => x.bought).map(x => Store.del('shopping/' + x.id))); break;

      case 'paid': {
        const cur = !!(S.staff[d.key] && S.staff[d.key].paid);
        await Store.set(P('staff/' + d.key), { name: d.name, paid: !cur }); break;
      }

      case 'openBag': S.bagOpen = d.d != null ? Number(d.d) : curDay(); render(); break;
      case 'closeBag': S.bagOpen = false; render(); break;
      case 'bagTab': S.bagTab = Number(d.b); render(); break;
      case 'toggleBagUse': {
        const b = Number(d.b); const cur = bagsInUse();
        const next = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort((x, y) => x - y);
        await Store.set('cohorts/' + S.cohortKey, { bagsInUse: next }); break;
      }
      case 'bagItem': {
        const it = bagSections().flatMap(s => s.items).find(i => i.id === d.id);
        await setBagItem(S.bagOpen, Number(d.b), it, d.s); break;
      }
      case 'restOk': {
        const day = S.bagOpen, b = Number(d.b); const st = bagState(day, b); const upd = {};
        bagSections().forEach(sec => sec.items.forEach(it => { if (bagCarries(it, b) && !st[it.id]) upd[it.id] = 'ok'; }));
        await Store.set(P('days/' + day), { bags: { [b]: upd } });
        const later = bagsInUse().find(x => x > b && !bagDone(day, x));
        if (later) S.bagTab = later;
        render(); break;
      }

      case 'openStudent': S.open = d.sid; render(); break;
      case 'closeStudent': S.open = null; render(); break;
      case 'pc': await changePc(d.sid, Number(d.by)); break;
      case 'skill': await Store.set(P('students/' + d.sid), { skill: d.v }); break;
      case 'behind': {
        const s = studentBySid(d.sid);
        const next = s.behind.includes(d.k) ? s.behind.filter(x => x !== d.k) : [...s.behind, d.k];
        await Store.set(P('students/' + d.sid), { behind: next }); break;
      }
      case 'cadd': S.drafts['cadd-' + d.sid] = el.checked; break;
      case 'logContact': {
        const s = studentBySid(d.sid); const k = x => x + '-' + d.sid;
        const add = S.drafts[k('cadd')] !== false;
        const num = String(S.drafts[k('cnum')] ?? (s.contacts + 1)).trim();
        const fix = (S.drafts[k('cfix')] || '').trim();
        await Store.add(P('contacts'), { sid: d.sid, num, fix, fixed: false, date: todayIso(), created: Date.now() });
        [k('cnum'), k('cfix'), k('cadd')].forEach(x => delete S.drafts[x]);
        render();
        if (add) await changePc(d.sid, 1);
        toast(fix ? 'Saved. It’s on their “to fix” list.' : 'Saved.');
        break;
      }
      case 'fixed': { const c = S.contacts.find(x => x.id === d.id); await Store.set(P('contacts/' + d.id), { fixed: !c.fixed }); break; }
      case 'delContact':
        if (!confirm('Delete this contact note? (Their count in the sheet stays the same. Use − if it should go down.)')) return;
        await Store.del(P('contacts/' + d.id)); break;
      case 'addWarning': {
        const k = x => x + '-' + d.sid;
        const note = (S.drafts[k('wnote')] || '').trim();
        const type = S.drafts[k('wtype')] || DEFAULTS.warningTypes[0];
        const date = S.drafts[k('wdate')] || todayIso();
        await Store.add(P('warnings'), { sid: d.sid, date, type, note, created: Date.now() });
        [k('wnote'), k('wtype'), k('wdate')].forEach(x => delete S.drafts[x]);
        render(); break;
      }
      case 'delWarning':
        if (!confirm('Delete this attendance note?')) return;
        await Store.del(P('warnings/' + d.id)); break;

      case 'tplOpen': S.tplOpen = true; S.tplTab = 'every'; render(); break;
      case 'tplTab': S.tplTab = d.t; render(); break;
      case 'tplClose':
        if (TPL_KEYS.some(k => S.drafts[k] !== undefined) && !confirm('Close without saving your changes?')) return;
        TPL_KEYS.forEach(k => delete S.drafts[k]);
        S.tplOpen = false; render(); break;
      case 'tplSave': {
        const c = cfg();
        const everyDay = lines(S.drafts['tpl-every'] ?? (c.checklist.everyDay || []).join('\n'));
        const days = {}, dayNotes = {};
        const packingList = lines(S.drafts['tpl-pack'] ?? c.packing.join('\n'));
        ALL_DAYS.forEach(x => {
          days[x] = lines(S.drafts['tpl-todo-' + x] ?? ((c.checklist.days || {})[x] || []).join('\n'));
          dayNotes[x] = String(S.drafts['tpl-notes-' + x] ?? (c.dayNotes[x] || '')).replace(/\s+$/, '');
        });
        await Store.set('meta/settings', { checklist: { everyDay, days }, dayNotes, packingList });
        TPL_KEYS.forEach(k => delete S.drafts[k]);
        S.tplOpen = false; render();
        // The open cohort already has its lists; offer to add any new items to it.
        const doc = S.cohortDoc || {};
        const extra = doc.repeatsAdded ? missingRepeats({ everyDay, days }) : [];
        const extraPack = doc.packingAdded ? missingPacking(packingList) : [];
        const parts = [extra.length && `${extra.length} new to-do${extra.length === 1 ? '' : 's'}`, extraPack.length && `${extraPack.length} new packing item${extraPack.length === 1 ? '' : 's'}`].filter(Boolean);
        if (parts.length && confirm(`Saved. Add the ${parts.join(' and ')} to ${S.cohortKey} too?`)) {
          await addRepeats(extra); await addPacking(extraPack); toast('Added to ' + S.cohortKey + '.');
        } else toast('Day templates saved.');
        break;
      }
      case 'saveBag': {
        if (S.drafts['set-bag'] === undefined) { toast('No changes to save.'); return; }
        const bag = parseBag(S.drafts['set-bag']);
        if (!bag.length) { toast('The bag list is empty.'); return; }
        await Store.set('meta/settings', { bag });
        delete S.drafts['set-bag']; toast('Bag contents saved.'); break;
      }
      case 'someBag': {
        const all = Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
        const cur = cfg().someBags[d.id] || all;
        const b = Number(d.b);
        const next = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort((x, y) => x - y);
        await Store.set('meta/settings', { someBags: { [d.id]: next } }); break;
      }
      case 'saveSkip': {
        const skipStaff = String(S.drafts['set-skip'] ?? cfg().skipStaff.join(', ')).split(',').map(x => x.trim()).filter(Boolean);
        await Store.set('meta/settings', { skipStaff });
        delete S.drafts['set-skip']; toast('Saved.'); break;
      }
      case 'schAdd': {
        const sd = schedFor(n), list = [...sd[d.list], d.list === 'blocks' ? { time: '', activity: '' } : { topic: '', content: '' }];
        await saveSched(n, { [d.list]: list }); break;
      }
      case 'schDel': {
        const sd = schedFor(n), i = Number(d.i), item = sd[d.list][i];
        const label = d.list === 'blocks' ? (item.activity || 'this time') : (item.topic || 'this station');
        if (!confirm('Remove “' + label + '” from Day ' + n + '?')) return;
        dropSchDrafts(n);
        await saveSched(n, { [d.list]: sd[d.list].filter((_, j) => j !== i) }); break;
      }
      case 'schMove': {
        const sd = schedFor(n), i = Number(d.i), j = i + Number(d.dir), list = [...sd[d.list]];
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        dropSchDrafts(n);
        await saveSched(n, { [d.list]: list }); break;
      }
      case 'squadCount': {
        const sq = squadsFor(n), count = Number(el.value), s = {};
        for (let i = 1; i <= count; i++) s[i] = { A: [...(((sq.s || {})[i] || {}).A || [])], B: [...(((sq.s || {})[i] || {}).B || [])] };
        for (let i = count + 1; i <= 6; i++) s[i] = { A: [], B: [] }; // saving merges, so clear removed squads on purpose
        if (count < sq.count && !confirm('Fewer squads? Students in the removed squads go back to “not in a squad.”')) { render(); return; }
        await saveSquads(n, { count, s }); break;
      }
      case 'squadAdd': {
        if (!el.value) return;
        const sq = squadsFor(n), s = JSON.parse(JSON.stringify(sq.s || {}));
        s[d.s] = s[d.s] || { A: [], B: [] }; s[d.s][d.t] = [...(s[d.s][d.t] || []), el.value];
        await saveSquads(n, { count: sq.count, s }); break;
      }
      case 'squadDel': {
        const sq = squadsFor(n), s = JSON.parse(JSON.stringify(sq.s || {}));
        s[d.s][d.t] = (s[d.s][d.t] || []).filter(x => x !== d.name);
        await saveSquads(n, { count: sq.count, s }); break;
      }
      case 'saveTemplate': {
        if (!confirm('Use this week’s schedule (times, stations and notes, not squads) as the starting point for future cohorts?')) return;
        const tpl = {};
        weekDays().forEach(x => { tpl[x.n] = schedFor(x.n); });
        await Store.set('meta/settings', { scheduleTemplate: tpl });
        toast('Saved. New cohorts will start from this schedule.'); break;
      }
      case 'printDay': await printDays([n]); break;
      case 'printAll': await printDays(weekDays().map(x => x.n)); break;
      case 'shareOpen': S.shareOpen = true; render(); setTimeout(showShareQr, 30); break;
      case 'shareClose': S.shareOpen = false; render(); break;
      case 'shareMake': {
        if (!Store.configured) { toast('The instructor link works once you’re signed in for real (not in sample mode).'); return; }
        await Store.set('cohorts/' + S.cohortKey, { shareToken: newToken() });
        await new Promise(r => setTimeout(r, 300)); await publish(); render(); setTimeout(showShareQr, 30); break;
      }
      case 'shareNew': case 'shareOff': {
        const old = S.cohortDoc && S.cohortDoc.shareToken;
        if (!confirm(a === 'shareOff' ? 'Turn the link off? Anyone using it (or the printed QR code) won’t be able to open it.' : 'Make a new link? The old link and any printed QR codes stop working.')) return;
        if (old) await Store.del('shared/' + old);
        await Store.set('cohorts/' + S.cohortKey, { shareToken: a === 'shareOff' ? null : newToken() });
        await new Promise(r => setTimeout(r, 300));
        if (a === 'shareNew') { await publish(); setTimeout(showShareQr, 30); }
        render(); break;
      }
      case 'shareCopy': {
        const url = shareUrl(S.cohortDoc.shareToken);
        try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { toast('Select the link and copy it.'); }
        break;
      }
      case 'resetLayout':
        await Store.set('meta/settings', { layout: null, prepLayout: null });
        S.view = 'day'; pref('view', 'day');
        toast('Layout reset.'); break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong.');
  }
}

function dropSchDrafts(n) { Object.keys(S.drafts).forEach(k => { if (k.startsWith('sch-' + n + '-')) delete S.drafts[k]; }); }
async function showShareQr() {
  const el = document.getElementById('shareQr');
  const token = S.cohortDoc && S.cohortDoc.shareToken;
  if (!el || !token) return;
  try { await loadQr(); drawQr(el, shareUrl(token), 180); } catch (e) { el.textContent = e.message; }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

render();

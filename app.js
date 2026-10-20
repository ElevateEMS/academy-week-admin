/* Academy Week Admin: Bella's organizer for academy week.
   Pages: Day (planner boxes you can drag around), Week (Day 1-5 side by side; drag
   to-dos between days), Students (skills status, patient contacts + fix notes,
   attendance/warnings), Settings. Saving: store.js. Google Sheets: sheets.js. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('aw-' + k); localStorage.setItem('aw-' + k, v); } catch { return null; } };

const VIEWS = ['day', 'week', 'students', 'settings'];
const S = {
  user: null, cohorts: [], cohortKey: pref('cohort'), sheet: null, sheetErr: null, loading: false,
  settings: null, shopping: [],
  cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [],
  view: VIEWS.includes(pref('view')) ? pref('view') : 'day', day: null, open: null, bagOpen: false, bagTab: null,
  menuOpen: false, filter: 'all', search: '', drafts: {}, pcBusy: {}, dragging: null,
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
function currentWeekDay() {
  const t = todayIso();
  const hit = weekDays().find(d => d.iso === t);
  return hit ? hit.n : null;
}

/* ---------- Settings (saved ones win over defaults.js) ---------- */
const BOXES = { priorities: 'Priorities', todo: 'To Do', shopping: 'Shopping List', notes: 'Notes' };
const DEFAULT_LAYOUT = [['priorities', 'shopping'], ['todo'], ['notes']];
const LAYOUT_VERSION = 2; // bumped when the default changes, so an older saved layout doesn't stick
function cfg() {
  const s = S.settings || {};
  return {
    checklist: s.checklist || DEFAULTS.checklist,
    bag: s.bag || DEFAULTS.bag,
    someBags: s.someBags || {},
    skipStaff: s.skipStaff || DEFAULTS.skipStaff,
    bagCount: DEFAULTS.bagCount,
    layout: validLayout(s.layout) || DEFAULT_LAYOUT,
    heights: (validLayout(s.layout) && s.layout.h) || {},
  };
}
// Firestore can't store nested arrays, so the layout is saved as
// { v, c0: [...], c1: [...], c2: [...], h: { box: heightInPx } }.
function validLayout(l) {
  if (!l || l.v !== LAYOUT_VERSION) return null;
  const cols = [l.c0 || [], l.c1 || [], l.c2 || []].map(c => c.filter(b => BOXES[b]));
  const seen = new Set(cols.flat());
  Object.keys(BOXES).forEach(b => { if (!seen.has(b)) cols[0].push(b); }); // a box added later still shows up
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
const checklistFor = n => [...(cfg().checklist.everyDay || []), ...((cfg().checklist.days || {})[n] || [])];
const isBagItem = text => /bag check/i.test(text);

/* ---------- To-dos and priorities (one collection, kind = todo | priority) ---------- */
const MAX_PRIORITIES = 3;
const orderOf = t => t.order ?? t.created ?? 0;
const itemsFor = (n, kind) => S.todos.filter(t => (t.kind || 'todo') === kind && (t.day || 1) === n).sort((a, b) => orderOf(a) - orderOf(b));

// Unfinished to-dos from an earlier day move to today (only while the week is happening).
let rolling = false;
async function rollOver() {
  const t = currentWeekDay();
  if (!t || rolling) return;
  const late = S.todos.filter(x => (x.kind || 'todo') === 'todo' && !x.done && (x.day || 1) < t);
  if (!late.length) return;
  rolling = true;
  try {
    await Promise.all(late.map(x => Store.set(P('todos/' + x.id), { day: t, rolledFrom: x.rolledFrom || x.day || 1 })));
  } finally { rolling = false; }
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
// Staff paperwork shown in the daily checklist: one "Staff roster" line and one
// "Timesheets (names)" line per day, plus "Pay ___" on each person's last day.
// On day n it also shows anything still missing from earlier days (tagged "unfinished").
function staffTasks(n, { carry = true } = {}) {
  const out = [];
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
  Object.assign(S, { sheet: null, cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], open: null, day: null });
  const base = 'cohorts/' + key;
  const w = (path, fn) => unwatchCohort.push(Store.watch(path, v => { fn(v); render(); }));
  w(base, d => { S.cohortDoc = d; });
  w(base + '/students', list => { S.studentsDoc = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/contacts', list => { S.contacts = list; });
  w(base + '/warnings', list => { S.warnings = list; });
  w(base + '/days', list => { S.days = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/staff', list => { S.staff = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/todos', list => { S.todos = list; if (S.sheet) rollOver(); });
  await loadSheet();
}

async function loadSheet() {
  S.loading = true; S.sheetErr = null; render();
  const key = S.cohortKey;
  try {
    const data = await Sheets.loadCohort(key);
    if (key !== S.cohortKey) return;
    S.sheet = data;
    if (!S.day) S.day = currentWeekDay() || Number(pref('day-' + key)) || 1;
    rollOver();
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
  }, 0);
}

const ICONS = {
  day: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>',
  week: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 10v10M15 10v10"/></svg>',
  students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.8 14.2c2.2.2 4 1.7 4.6 4.8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
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
      ${icon('day', 'Day')}${icon('week', 'Week')}${icon('students', 'Students')}
      <div class="menu-wrap">
        <button class="icon-btn ${S.menuOpen || S.view === 'settings' ? 'on' : ''}" data-act="menu" title="Settings" aria-label="Settings">${ICONS.settings}</button>
        ${S.menuOpen ? menu() : ''}
      </div>
    </nav>
  </header>
  <main class="wrap">
    ${S.sheetErr ? `<div class="alert">Couldn’t read the Google Sheet: ${esc(S.sheetErr)} <button class="btn small" data-act="refresh">Try again</button></div>` : ''}
    ${{ day: dayView, week: weekView, students: studentsView, settings: settingsView }[S.view]()}
  </main>
  ${S.open ? drawer() : ''}
  ${S.bagOpen ? bagModal() : ''}`;
}

function pageTitle() {
  if (S.view === 'week') return `<h1>The Week</h1><p>Drag to-dos from one day to another · ${hideToggle('todo')}</p>`;
  if (S.view === 'students') return `<h1>Students</h1><p>${S.sheet ? students().length + ' students' : ''}</p>`;
  if (S.view === 'settings') return '<h1>Settings</h1><p>Shared by you and Nick</p>';
  const n = S.day || 1;
  const d = weekDays().find(x => x.n === n) || {};
  const nice = d.iso ? parseIso(d.iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  return `<h1>Day ${n}${d.sub ? ` <span>· ${esc(d.sub)}</span>` : ''}</h1>${nice ? `<p>${nice}${n === currentWeekDay() ? ' · today' : ''}</p>` : ''}`;
}

function menu() {
  const opts = S.cohorts.map(c => `<option value="${esc(c.key)}" ${c.key === S.cohortKey ? 'selected' : ''}>${esc(c.key)}${c.status && !/active/i.test(c.status) ? ' (' + esc(c.status) + ')' : ''}</option>`).join('');
  return `<div class="menu" data-stop>
    <label class="menu-field">Cohort<select id="cohortSel" data-change="cohort">${opts || '<option>Loading…</option>'}</select></label>
    <button class="menu-item" data-act="refresh">${S.loading ? 'Loading…' : 'Refresh from the Google Sheet'}</button>
    <button class="menu-item" data-act="view" data-v="settings">Settings</button>
    <button class="menu-item" data-act="signout">Sign out <span class="muted small">${esc(S.user.email)}</span></button>
  </div>`;
}

const loadingView = () => `<p class="loading">${S.loading ? 'Opening the cohort sheet…' : ''}</p>`;

/* ---------- Shared pieces ---------- */
function circle(checked, attrs, extra = '') {
  return `<input type="checkbox" class="circle" ${attrs} ${checked ? 'checked' : ''} ${extra}>`;
}

function itemList(n, kind, { compact = false } = {}) {
  const items = itemsFor(n, kind);
  const empty = kind === 'priority' ? '' : '<li class="empty">Nothing yet.</li>';
  return `<ul class="checks drop-list" data-drop="items" data-day="${n}" data-kind="${kind}">
    ${items.map(t => `<li class="${t.done ? 'done' : ''}" draggable="true" data-drag="item" data-id="${t.id}">
      <label>${circle(t.done, `data-act="todo" data-id="${t.id}"`)}<span><span class="txt">${esc(t.text)}</span>${t.rolledFrom ? ` <em class="tag-soft">unfinished · Day ${t.rolledFrom}</em>` : ''}</span></label>
      ${compact ? '' : `<button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button>`}
    </li>`).join('') || empty}
  </ul>`;
}

function addRow(n, kind, placeholder) {
  const k = 'add-' + kind + '-' + n;
  return `<div class="add-row"><input id="${k}" data-draft="${k}" data-add="${kind}" data-day="${n}" placeholder="${placeholder}" value="${esc(S.drafts[k] || '')}"></div>`;
}

// The day's checklist (from Settings) plus staff paperwork, shown inside To Do.
function dailyChecklist(n, { compact = false, carry = true } = {}) {
  const checks = (S.days[n] && S.days[n].checks) || {};
  const rows = checklistFor(n).map(t => {
    const k = slug(t);
    if (isBagItem(t)) {
      const inUse = bagsInUse(); const ok = inUse.filter(b => bagDone(n, b)).length;
      const on = !!(checks[k] || (inUse.length && ok === inUse.length));
      return { on, html: `<label>${circle(on, `data-act="check" data-d="${n}" data-k="${k}"`)}<span><span class="txt">${esc(t)}</span></span></label>
        <button class="btn tiny" data-act="openBag" data-d="${n}">${compact ? ok + '/' + inUse.length : 'Open · ' + ok + '/' + inUse.length + ' bags'}</button>` };
    }
    return { on: !!checks[k], html: `<label>${circle(checks[k], `data-act="check" data-d="${n}" data-k="${k}"`)}<span><span class="txt">${esc(t)}</span></span></label>` };
  });
  staffTasks(n, { carry }).forEach(t => rows.push({ on: t.done, html: `<label>${circle(t.done, t.attrs)}<span><span class="txt">${t.html}</span>${t.who ? ` <span class="who">(${esc(t.who)})</span>` : ''}${t.sub ? ` <span class="sub">${t.sub}</span>` : ''}${t.late ? ` <em class="tag-soft">unfinished · Day ${t.late}</em>` : ''}</span></label>` }));
  const done = rows.filter(r => r.on).length;
  return `<p class="mini-head">Daily Checklist <span class="count">${done}/${rows.length}</span></p>
    <ul class="checks">${rows.map(r => `<li class="${r.on ? 'done' : ''}">${r.html}</li>`).join('')}</ul>`;
}

// "Hide checked" / "Show checked" (remembered on this computer).
const hidden = k => pref('hide-' + k) === '1';
const hideToggle = k => `<button class="link" data-act="hideDone" data-k="${k}">${hidden(k) ? 'Show checked' : 'Hide checked'}</button>`;

function notesArea(n, placeholder) {
  const id = 'notes-' + n;
  const val = S.drafts[id] ?? ((S.days[n] && S.days[n].notes) || '');
  return `<textarea id="${id}" class="lined" data-draft="${id}" data-notes="${n}" rows="6" placeholder="${placeholder}">${esc(val)}</textarea>`;
}

/* ---------- Day page ---------- */
function dayView() {
  if (!S.sheet) return loadingView();
  const n = S.day || 1;
  const today = currentWeekDay();
  const days = weekDays();
  const list = students();
  const behind = list.filter(s => s.skill === 'behind').length;
  const fixes = list.reduce((a, s) => a + s.fixes, 0);

  return `
  <div class="daystrip">
    ${days.map(x => `<button class="${x.n === n ? 'on' : ''} ${x.n === today ? 'today' : ''}" data-act="day" data-n="${x.n}">
      <small>${esc(x.label || 'Day')}</small><b>${x.n}</b><small>${x.iso ? shortDate(x.iso) : ''}</small></button>`).join('')}
  </div>
  ${!S.sheet.academyStart ? '<p class="muted small center">Tip: fill in “Academy Week Start” on the cohort’s Student Roster tab (cell AG8) and the app will open on the right day by itself.</p>' : ''}
  ${behind || fixes ? `<div class="pills">
    ${behind ? `<button class="pill" data-act="goStudents" data-f="behind">${behind} behind on skills</button>` : ''}
    ${fixes ? `<button class="pill" data-act="goStudents" data-f="fixes">${fixes} contact${fixes === 1 ? '' : 's'} waiting on fixes</button>` : ''}
  </div>` : ''}
  <div class="board">
    ${cfg().layout.map((col, i) => `<div class="board-col" data-drop="boxes" data-col="${i}">${col.map(b => box(b, n)).join('')}</div>`).join('')}
  </div>`;
}

function box(b, n) {
  const shaded = b === 'priorities' || b === 'shopping' || b === 'notes';
  const hideKey = b === 'shopping' ? 'shop' : (b === 'todo' || b === 'priorities') ? 'todo' : null;
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
    body = head('To Do', hideToggle('todo')) + addRow(n, 'todo', 'Add a to-do and press Enter') + itemList(n, 'todo') + dailyChecklist(n);
  } else if (b === 'shopping') {
    const open = S.shopping.filter(x => !x.bought).sort((a, c) => a.created - c.created);
    const bought = S.shopping.filter(x => x.bought).sort((a, c) => c.created - a.created);
    body = head('Shopping List', bought.length ? hideToggle('shop') + '<button class="link" data-act="clearBought">Clear bought</button>' : '')
      + `<div class="add-row"><input id="shopIn" data-draft="shop" data-add="shop" placeholder="Add something to buy" value="${esc(S.drafts.shop || '')}"></div>`
      + `<ul class="checks">${[...open, ...bought].map(x => `<li class="${x.bought ? 'done' : ''}">
          <label>${circle(x.bought, `data-act="bought" data-id="${x.id}"`)}<span><span class="txt">${esc(x.text)}</span>${x.auto ? ' <em class="tag-soft">bag check</em>' : ''}</span></label>
          <button class="x" data-act="delShop" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing to buy.</li>'}</ul>`;
  } else if (b === 'notes') {
    body = head('Notes') + notesArea(n, 'Notes for today');
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
    ${weekDays().map(d => `<section class="week-col ${d.n === today ? 'today' : ''}">
      <button class="week-head" data-act="day" data-n="${d.n}" data-open="1" title="Open Day ${d.n}">
        <small>${esc(d.label)}${d.iso ? ' ' + shortDate(d.iso) : ''}</small><b>Day ${d.n}</b>${d.sub ? `<small>${esc(d.sub)}</small>` : ''}
      </button>
      <div class="week-part"><p class="mini-head">To Do</p>${itemList(d.n, 'todo', { compact: true })}${addRow(d.n, 'todo', '+ to-do')}${dailyChecklist(d.n, { compact: true, carry: false })}</div>
      <div class="week-part shaded"><p class="mini-head">Notes</p>${notesArea(d.n, 'Notes')}</div>
    </section>`).join('')}
  </div>`;
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
      <h2>Bag Check · Day ${n}</h2>
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
      <div class="box-head static"><h2>Daily Checklist</h2></div>
      <p class="muted small">One item per line. Any item with “bag check” in it opens the bag pop-up.</p>
      <label class="field">Every day<textarea id="set-every" data-draft="set-every" rows="4">${dv('set-every', (c.checklist.everyDay || []).join('\n'))}</textarea></label>
      <div class="day-fields">${[1, 2, 3, 4, 5].map(n => `<label class="field">Day ${n} only<textarea id="set-day${n}" data-draft="set-day${n}" rows="5">${dv('set-day' + n, ((c.checklist.days || {})[n] || []).join('\n'))}</textarea></label>`).join('')}</div>
      <button class="btn primary" data-act="saveChecklist">Save checklist</button>
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

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
function parseBag(text) {
  const out = [];
  lines(text).forEach(l => {
    if (l.startsWith('#')) out.push({ name: l.replace(/^#+\s*/, ''), items: [] });
    else { if (!out.length) out.push({ name: 'Bag', items: [] }); out[out.length - 1].items.push(l); }
  });
  return out.filter(s => s.name);
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
      if (kind === 'priority' && (t.kind || 'todo') !== 'priority' || (kind === 'priority' && (t.day || 1) !== day)) {
        if (itemsFor(day, 'priority').filter(x => x.id !== t.id).length >= MAX_PRIORITIES) { toast('Day ' + day + ' already has 3 priorities.'); return; }
      }
      const ids = [...list.querySelectorAll(':scope > [data-id]')].map(li => li.dataset.id);
      const i = ids.indexOf(t.id);
      const others = itemsFor(day, kind).filter(x => x.id !== t.id);
      const byId = Object.fromEntries(others.map(x => [x.id, x]));
      const prev = i > 0 ? byId[ids[i - 1]] : null, next = byId[ids[i + 1]];
      const order = prev && next ? (orderOf(prev) + orderOf(next)) / 2 : prev ? orderOf(prev) + 1000 : next ? orderOf(next) - 1000 : Date.now();
      const upd = { day, kind, order };
      if (day !== (t.day || 1)) upd.rolledFrom = null; // moved on purpose, so it's not "unfinished" anymore
      await Store.set(P('todos/' + t.id), upd);
    }
  } catch (err) { toast(err.message); }
  finally { S.dragging = null; render(); }
});

function saveLayout(heights = cfg().heights) {
  // Every box is listed (null = no set height) because a merge-save never removes old keys.
  const layout = { v: LAYOUT_VERSION, h: Object.fromEntries(Object.keys(BOXES).map(b => [b, heights[b] || null])) };
  document.querySelectorAll('[data-drop="boxes"]').forEach(col => {
    layout['c' + col.dataset.col] = [...col.querySelectorAll(':scope > .box')].map(b => b.dataset.boxId);
  });
  return Store.set('meta/settings', { layout });
}

/* ---------- Box heights (drag the bottom edge; double-click it to reset) ---------- */
document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('[data-resize]');
  if (!handle) return;
  e.preventDefault();
  const boxEl = handle.closest('.box');
  const startY = e.clientY, startH = boxEl.offsetHeight;
  S.dragging = { type: 'resize' };
  document.body.classList.add('resizing');
  const move = ev => { boxEl.style.flex = '0 0 auto'; boxEl.style.height = Math.max(90, startH + ev.clientY - startY) + 'px'; };
  const up = async () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.body.classList.remove('resizing');
    S.dragging = null;
    if (boxEl.style.height && boxEl.offsetHeight !== startH) {
      await saveLayout({ ...cfg().heights, [handle.dataset.resize]: boxEl.offsetHeight });
    }
    render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
document.addEventListener('dblclick', async e => {
  const handle = e.target.closest('[data-resize]');
  if (!handle) return;
  const heights = { ...cfg().heights }; delete heights[handle.dataset.resize];
  await saveLayout(heights);
});

// The Day page boxes fill the window height on a laptop-size screen.
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
  S.drafts[k] = t.value;
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
  if (t.dataset.change === 'note') {
    await Store.set(P('students/' + t.dataset.sid), { note: t.value.trim() });
    delete S.drafts[t.dataset.draft]; render();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (S.bagOpen) S.bagOpen = false; else if (S.open) S.open = null; else if (S.menuOpen) S.menuOpen = false; else return;
    render(); return;
  }
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.dataset.add) return;
  e.preventDefault();
  const t = e.target;
  if (t.dataset.add === 'shop') act('addShop');
  else act('addItem', t);
});

document.addEventListener('click', e => {
  if (S.menuOpen && !e.target.closest('.menu-wrap')) { S.menuOpen = false; render(); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // Only the backdrop itself closes a pop-up, and the +/− box doesn't open the student.
  if (el.classList.contains('overlay') && e.target !== el) return;
  if (el.tagName === 'TR' && e.target.closest('[data-stop]')) return;
  act(el.dataset.act, el, e);
});

async function act(a, el = {}, e) {
  const d = el.dataset || {};
  const n = S.day || 1;
  try {
    switch (a) {
      case 'signin': await Store.signIn(); break;
      case 'signout': S.menuOpen = false; await Store.signOut(); break;
      case 'menu': S.menuOpen = !S.menuOpen; render(); break;
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
      case 'delTodo': await Store.del(P('todos/' + d.id)); break;

      case 'addShop': {
        const text = (S.drafts.shop || '').trim(); if (!text) return;
        S.drafts.shop = ''; render();
        await Store.add('shopping', { text, bought: false, auto: null, created: Date.now() }); break;
      }
      case 'bought': { const x = S.shopping.find(i => i.id === d.id); await Store.set('shopping/' + d.id, { bought: !x.bought }); break; }
      case 'delShop': await Store.del('shopping/' + d.id); break;
      case 'clearBought':
        if (!confirm('Remove everything checked off as bought?')) return;
        await Promise.all(S.shopping.filter(x => x.bought).map(x => Store.del('shopping/' + x.id))); break;

      case 'paid': {
        const cur = !!(S.staff[d.key] && S.staff[d.key].paid);
        await Store.set(P('staff/' + d.key), { name: d.name, paid: !cur }); break;
      }

      case 'openBag': S.bagOpen = Number(d.d) || n; render(); break;
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

      case 'saveChecklist': {
        const c = cfg().checklist;
        const everyDay = lines(S.drafts['set-every'] ?? (c.everyDay || []).join('\n'));
        const days = {};
        [1, 2, 3, 4, 5].forEach(x => { days[x] = lines(S.drafts['set-day' + x] ?? ((c.days || {})[x] || []).join('\n')); });
        await Store.set('meta/settings', { checklist: { everyDay, days } });
        ['set-every', 'set-day1', 'set-day2', 'set-day3', 'set-day4', 'set-day5'].forEach(x => delete S.drafts[x]);
        toast('Checklist saved.'); break;
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
      case 'resetLayout':
        await Store.set('meta/settings', { layout: null });
        S.view = 'day'; pref('view', 'day');
        toast('Layout reset.'); break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong.');
  }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

render();

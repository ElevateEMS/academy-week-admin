/* Academy Week Admin: Bella's admin organizer.
   Screens: Today (checklist + bag check, to-dos, staff paperwork/pay, shopping note),
   Students (skills status, patient contacts + fix notes, attendance/warnings), Settings.
   Saving: store.js. Google Sheets: sheets.js. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('aw-' + k); localStorage.setItem('aw-' + k, v); } catch { return null; } };

const S = {
  user: null, cohorts: [], cohortKey: pref('cohort'), sheet: null, sheetErr: null, loading: false,
  settings: null, shopping: [],
  cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [],
  view: pref('view') || 'today', day: null, open: null, bagOpen: false, bagTab: null,
  filter: 'all', search: '', drafts: {}, pcBusy: {},
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
function cfg() {
  const s = S.settings || {};
  return {
    checklist: s.checklist || DEFAULTS.checklist,
    bag: s.bag || DEFAULTS.bag,
    someBags: s.someBags || {},
    skipStaff: s.skipStaff || DEFAULTS.skipStaff,
    bagCount: DEFAULTS.bagCount,
  };
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
  const first = name.trim().split(/\s+/)[0].toLowerCase();
  return cfg().skipStaff.some(x => x.trim().toLowerCase() === name.trim().toLowerCase() || x.trim().toLowerCase() === first);
}
function staffPeople() {
  if (!S.sheet || !S.sheet.staff) return [];
  return S.sheet.staff.filter(p => !isSkipped(p.name)).map(p => {
    const key = slug(p.name);
    const doc = S.staff[key] || {};
    return { ...p, key, lastDay: Math.max(...p.days), doc };
  });
}
const paper = (p, n) => (p.doc.days && p.doc.days[n]) || {};

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
  const pick = S.cohorts.find(c => c.key === S.cohortKey) || S.cohorts.find(c => /active/i.test(c.status)) || S.cohorts[0];
  if (pick) selectCohort(pick.key); else render();
});

async function selectCohort(key) {
  S.cohortKey = key; pref('cohort', key);
  unwatchCohort.forEach(u => u()); unwatchCohort = [];
  Object.assign(S, { cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], open: null, day: null });
  const base = 'cohorts/' + key;
  const w = (path, fn) => unwatchCohort.push(Store.watch(path, v => { fn(v); render(); }));
  w(base, d => { S.cohortDoc = d; });
  w(base + '/students', list => { S.studentsDoc = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/contacts', list => { S.contacts = list; });
  w(base + '/warnings', list => { S.warnings = list; });
  w(base + '/days', list => { S.days = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/staff', list => { S.staff = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/todos', list => { S.todos = list; });
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
  });
}

function signInView() {
  return `<div class="signin"><div class="signin-card">
    <div class="brand big"><span class="brand-mark">AW</span><div><b>Academy Week Admin</b><small>Elevate EMS Academy</small></div></div>
    <p>Your admin organizer for academy week: paperwork, students, shopping and equipment.</p>
    <button class="btn primary wide" data-act="signin">Sign in with Google</button>
    <p class="muted small">Use your elevateemsacademy.com account.</p>
  </div></div>`;
}

function shell() {
  const tabs = [['today', 'Today'], ['students', 'Students'], ['settings', 'Settings']];
  const opts = S.cohorts.map(c => `<option value="${esc(c.key)}" ${c.key === S.cohortKey ? 'selected' : ''}>${esc(c.key)}${c.status && !/active/i.test(c.status) ? ' (' + esc(c.status) + ')' : ''}</option>`).join('');
  return `
  ${Store.configured ? '' : '<div class="sample-bar">Sample mode: pretend students and staff, saved in this browser only.</div>'}
  <header class="top">
    <div class="brand"><span class="brand-mark">AW</span><div><b>Academy Week Admin</b><small>Elevate EMS Academy</small></div></div>
    <nav class="tabs">${tabs.map(([k, l]) => `<button class="tab ${S.view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</nav>
    <div class="top-right">
      <label class="cohort-pick"><span>Cohort</span><select id="cohortSel" data-change="cohort">${opts || '<option>Loading…</option>'}</select></label>
      <button class="btn ghost" data-act="refresh" title="Reload names, contacts and staffing from the Google Sheet">${S.loading ? 'Loading…' : '↻ Refresh'}</button>
      <button class="btn ghost" data-act="signout" title="${esc(S.user.email)}">Sign out</button>
    </div>
  </header>
  <main class="wrap">
    ${S.sheetErr ? `<div class="alert">Couldn’t read the Google Sheet: ${esc(S.sheetErr)} <button class="btn small" data-act="refresh">Try again</button></div>` : ''}
    ${S.view === 'today' ? todayView() : S.view === 'students' ? studentsView() : settingsView()}
  </main>
  ${S.open ? drawer() : ''}
  ${S.bagOpen ? bagModal() : ''}`;
}

/* ---------- Today ---------- */
function todayView() {
  if (!S.sheet) return `<p class="loading">${S.loading ? 'Loading the cohort sheet…' : ''}</p>`;
  const n = S.day || 1;
  const today = currentWeekDay();
  const days = weekDays();
  const list = students();
  const behind = list.filter(s => s.skill === 'behind').length;
  const fixes = list.reduce((a, s) => a + s.fixes, 0);
  const toBuy = S.shopping.filter(x => !x.bought).length;
  const d = days.find(x => x.n === n) || {};

  return `
  <div class="daybar">
    ${days.map(x => `<button class="day ${x.n === n ? 'on' : ''}" data-act="day" data-n="${x.n}">
      <b>Day ${x.n}</b><span>${esc(x.label)}${x.iso ? ' ' + shortDate(x.iso) : ''}</span>${x.n === today ? '<i>today</i>' : ''}</button>`).join('')}
  </div>
  ${!S.sheet.academyStart ? '<p class="muted small note-line">Tip: fill in “Academy Week Start” on the cohort’s Student Roster tab (cell AG8) and the app will open on the right day automatically.</p>' : ''}
  <div class="pills">
    <button class="pill ${behind ? 'warn' : ''}" data-act="goStudents" data-f="behind"><b>${behind}</b> behind on skills</button>
    <button class="pill ${fixes ? 'warn' : ''}" data-act="goStudents" data-f="fixes"><b>${fixes}</b> contact${fixes === 1 ? '' : 's'} waiting on fixes</button>
    <button class="pill" data-act="goStudents" data-f="warnings"><b>${S.warnings.length}</b> attendance note${S.warnings.length === 1 ? '' : 's'}</button>
    <span class="pill plain"><b>${toBuy}</b> to buy</span>
  </div>
  <div class="today-grid">
    <div class="col">${checklistCard(n, d)}${todoCard()}</div>
    <div class="col">${staffCard(n)}</div>
    <div class="col">${shoppingNote()}</div>
  </div>`;
}

function checklistCard(n, d) {
  const items = checklistFor(n);
  const checks = (S.days[n] && S.days[n].checks) || {};
  const done = items.filter(t => isBagItem(t) ? (checks[slug(t)] || bagsAllDone(n)) : checks[slug(t)]).length;
  return `<section class="card">
    <div class="card-head"><h2>Day ${n} checklist${d.sub ? ` <small>${esc(d.sub)}</small>` : ''}</h2><span class="count ${done === items.length ? 'all' : ''}">${done}/${items.length}</span></div>
    <ul class="checks">${items.map(t => {
      const k = slug(t);
      if (isBagItem(t)) {
        const inUse = bagsInUse(); const ok = inUse.filter(b => bagDone(n, b)).length;
        const on = checks[k] || (inUse.length && ok === inUse.length);
        return `<li class="${on ? 'done' : ''}"><label><input type="checkbox" data-act="check" data-k="${k}" ${on ? 'checked' : ''}><span>${esc(t)}</span></label>
          <button class="btn small accent" data-act="openBag">Open bag check</button><em class="sub">${ok}/${inUse.length} bags</em></li>`;
      }
      return `<li class="${checks[k] ? 'done' : ''}"><label><input type="checkbox" data-act="check" data-k="${k}" ${checks[k] ? 'checked' : ''}><span>${esc(t)}</span></label></li>`;
    }).join('')}</ul>
  </section>`;
}

function todoCard() {
  const open = S.todos.filter(t => !t.done).sort((a, b) => a.created - b.created);
  const done = S.todos.filter(t => t.done).sort((a, b) => b.created - a.created);
  return `<section class="card">
    <div class="card-head"><h2>To-do</h2>${done.length ? `<button class="link" data-act="clearTodos">Clear done</button>` : ''}</div>
    <div class="add-row"><input id="todoIn" data-draft="todo" placeholder="Add a to-do and press Enter" value="${esc(S.drafts.todo || '')}"><button class="btn small" data-act="addTodo">Add</button></div>
    <ul class="checks">${[...open, ...done].map(t => `<li class="${t.done ? 'done' : ''}">
      <label><input type="checkbox" data-act="todo" data-id="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label>
      <button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>
  </section>`;
}

function staffCard(n) {
  if (S.sheet.staffingMissing) {
    return `<section class="card"><div class="card-head"><h2>Staff paperwork</h2></div>
      <p class="muted">No “Staffing” tab found in this cohort’s sheet, so there’s no one to track yet.</p></section>`;
  }
  const people = staffPeople();
  const working = people.filter(p => p.days.includes(n));
  const row = (p, d) => {
    const pp = paper(p, d);
    const last = p.lastDay === d;
    return `<div class="staff ${pp.roster && pp.timesheet && (!last || p.doc.paid) ? 'ok' : ''}">
      <div class="staff-name"><b>${esc(p.name)}</b><span class="role">${esc(p.role)}</span>${last ? '<span class="tag pay">Last day</span>' : ''}</div>
      <label><input type="checkbox" data-act="paper" data-key="${p.key}" data-name="${esc(p.name)}" data-d="${d}" data-f="roster" ${pp.roster ? 'checked' : ''}> Signed staff roster</label>
      <label><input type="checkbox" data-act="paper" data-key="${p.key}" data-name="${esc(p.name)}" data-d="${d}" data-f="timesheet" ${pp.timesheet ? 'checked' : ''}> Timesheet</label>
      ${last ? `<label class="paid"><input type="checkbox" data-act="paid" data-key="${p.key}" data-name="${esc(p.name)}" ${p.doc.paid ? 'checked' : ''}> 💵 Paid</label>` : ''}
    </div>`;
  };

  // Anything left undone from an earlier day.
  const late = [];
  people.forEach(p => p.days.filter(d => d < n).forEach(d => {
    const pp = paper(p, d);
    if (!pp.roster) late.push({ p, d, f: 'roster', label: 'staff roster' });
    if (!pp.timesheet) late.push({ p, d, f: 'timesheet', label: 'timesheet' });
  }));
  const unpaid = people.filter(p => p.lastDay < n && !p.doc.paid);

  const payList = [...people].sort((a, b) => a.lastDay - b.lastDay || a.name.localeCompare(b.name));
  const dayName = d => { const x = weekDays().find(w => w.n === d); return 'Day ' + d + (x && x.label ? ' (' + x.label + ')' : ''); };

  return `<section class="card">
    <div class="card-head"><h2>Staff today</h2><span class="muted small">from the Staffing tab</span></div>
    ${working.length ? working.map(p => row(p, n)).join('') : '<p class="muted">No one on the Staffing tab for this day.</p>'}
    ${late.length || unpaid.length ? `<div class="late">
      <h3>Still open from earlier days</h3>
      ${unpaid.map(p => `<label class="late-row"><input type="checkbox" data-act="paid" data-key="${p.key}" data-name="${esc(p.name)}"> 💵 Pay <b>${esc(p.name)}</b> <span class="muted">(last day was ${dayName(p.lastDay)})</span></label>`).join('')}
      ${late.map(x => `<label class="late-row"><input type="checkbox" data-act="paper" data-key="${x.p.key}" data-name="${esc(x.p.name)}" data-d="${x.d}" data-f="${x.f}"> <b>${esc(x.p.name)}</b> · Day ${x.d} ${x.label}</label>`).join('')}
    </div>` : ''}
    ${payList.length ? `<details class="paydays"><summary>Pay days this week</summary>
      <ul>${payList.map(p => `<li class="${p.doc.paid ? 'done' : ''}"><b>${esc(p.name)}</b> <span class="muted">${esc(p.role)} · works ${p.days.map(d => 'Day ' + d).join(', ')}</span><span>Pay ${dayName(p.lastDay)}${p.doc.paid ? ' ✓' : ''}</span></li>`).join('')}</ul>
    </details>` : ''}
  </section>`;
}

function shoppingNote() {
  const open = S.shopping.filter(x => !x.bought).sort((a, b) => a.created - b.created);
  const bought = S.shopping.filter(x => x.bought).sort((a, b) => b.created - a.created);
  return `<aside class="sticky-note">
    <div class="card-head"><h2>Shopping list</h2>${bought.length ? `<button class="link" data-act="clearBought">Clear bought</button>` : ''}</div>
    <div class="add-row"><input id="shopIn" data-draft="shop" placeholder="Add something to buy" value="${esc(S.drafts.shop || '')}"><button class="btn small" data-act="addShop">Add</button></div>
    <ul class="checks">${[...open, ...bought].map(x => `<li class="${x.bought ? 'done' : ''}">
      <label><input type="checkbox" data-act="bought" data-id="${x.id}" ${x.bought ? 'checked' : ''}><span>${esc(x.text)}${x.auto ? ' <em class="sub">bag check</em>' : ''}</span></label>
      <button class="x" data-act="delShop" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing to buy.</li>'}</ul>
    <p class="muted small">Low or missing bag items land here on their own.</p>
  </aside>`;
}

/* ---------- Bag check ---------- */
const bagState = (n, b) => ((S.days[n] && S.days[n].bags) || {})[b] || {};
function bagDone(n, b) {
  const st = bagState(n, b);
  return bagSections().every(sec => sec.items.every(it => !bagCarries(it, b) || st[it.id]));
}
function bagsAllDone(n) { const u = bagsInUse(); return u.length > 0 && u.every(b => bagDone(n, b)); }

function bagModal() {
  const n = S.day || 1;
  const inUse = bagsInUse();
  const tab = inUse.includes(S.bagTab) ? S.bagTab : inUse[0];
  const st = tab ? bagState(n, tab) : {};
  const all = Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
  return `<div class="overlay" data-act="closeBag"><div class="modal" data-stop>
    <div class="modal-head">
      <h2>Bag check · Day ${n}</h2>
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
  if (!S.sheet) return `<p class="loading">${S.loading ? 'Loading the cohort sheet…' : ''}</p>`;
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
  ${skillRows.length ? `<section class="card behind-card"><div class="card-head"><h2>Behind by skill</h2><span class="muted small">for picking tomorrow’s scenarios</span></div>
    <div class="behind-list">${skillRows.map(k => `<div><b>${esc(k)}</b> <span class="n">${bySkill[k].length}</span><span class="who">${bySkill[k].map(s => `<button class="link" data-act="openStudent" data-sid="${s.sid}">${esc(firstName(s.name))}</button>`).join(', ')}</span></div>`).join('')}</div>
  </section>` : ''}
  <section class="card table-card">
    <table class="roster">
      <thead><tr><th>#</th><th>Student</th><th>Skills</th><th class="c">Patient contacts</th><th class="c">To fix</th><th class="c">Attendance</th></tr></thead>
      <tbody>${shown.map((s, i) => `<tr data-act="openStudent" data-sid="${s.sid}">
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
        <h3>Patient contacts</h3>
        <div class="pc-big">${pcStepper(s)}<span class="muted small">in the Google Sheet (column P)</span></div>
        <div class="log-form">
          <div class="row2">
            <label>Contact #<input id="${dk('cnum')}" data-draft="${dk('cnum')}" type="number" min="1" value="${esc(S.drafts[dk('cnum')] ?? (s.contacts + 1))}"></label>
            <label class="grow check-inline"><input type="checkbox" id="${dk('cadd')}" ${S.drafts[dk('cadd')] === false ? '' : 'checked'} data-act="cadd" data-sid="${s.sid}"> New simulated contact (adds 1 to their count)</label>
          </div>
          <textarea id="${dk('cfix')}" data-draft="${dk('cfix')}" rows="2" placeholder="What needs fixed? (e.g. missing vitals times, narrative too short)">${esc(S.drafts[dk('cfix')] || '')}</textarea>
          <button class="btn primary" data-act="logContact" data-sid="${s.sid}">Save contact</button>
        </div>
        <ul class="log">${contacts.map(c => `<li class="${c.fixed ? 'done' : ''}">
          <div><b>#${esc(c.num)}</b> <span class="muted small">${shortDate(c.date)}</span>
            ${c.fix ? `<p>${esc(c.fix)}</p>` : '<p class="muted">No fixes needed.</p>'}</div>
          ${c.fix ? `<label class="fixed"><input type="checkbox" data-act="fixed" data-id="${c.id}" ${c.fixed ? 'checked' : ''}> Fixed</label>` : ''}
          <button class="x" data-act="delContact" data-id="${c.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">No contact notes yet.</li>'}</ul>
      </section>

      <section>
        <h3>Attendance & warnings</h3>
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
    <section class="card">
      <div class="card-head"><h2>Daily checklist</h2></div>
      <p class="muted small">One item per line. Any item with “bag check” in it opens the bag pop-up.</p>
      <label class="field">Every day<textarea id="set-every" data-draft="set-every" rows="4">${dv('set-every', (c.checklist.everyDay || []).join('\n'))}</textarea></label>
      <div class="day-fields">${[1, 2, 3, 4, 5].map(n => `<label class="field">Day ${n} only<textarea id="set-day${n}" data-draft="set-day${n}" rows="5">${dv('set-day' + n, ((c.checklist.days || {})[n] || []).join('\n'))}</textarea></label>`).join('')}</div>
      <button class="btn primary" data-act="saveChecklist">Save checklist</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>Bag contents</h2></div>
      <p class="muted small">Lines starting with # are pockets/pouches. Put *** after anything only some bags carry.</p>
      <textarea id="set-bag" class="mono" data-draft="set-bag" rows="22">${dv('set-bag', bagText)}</textarea>
      <button class="btn primary" data-act="saveBag">Save bag contents</button>
      ${someItems.length ? `<h3>Which bags carry the *** items</h3>
      <table class="grid-table"><thead><tr><th></th>${all.map(b => `<th>Bag ${b}</th>`).join('')}</tr></thead>
        <tbody>${someItems.map(it => `<tr><td>${esc(it.name)}</td>${all.map(b => `<td><input type="checkbox" data-act="someBag" data-id="${it.id}" data-b="${b}" ${bagCarries(it, b) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>Staff paperwork</h2></div>
      <label class="field">Names on the Staffing tab that don’t need paperwork or pay reminders (comma separated)
        <input id="set-skip" data-draft="set-skip" value="${dv('set-skip', c.skipStaff.join(', '))}"></label>
      <button class="btn primary" data-act="saveSkip">Save</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>Account</h2></div>
      <p>Signed in as <b>${esc(S.user.email)}</b>. Students and staffing come from each cohort’s Google Sheet; tap ↻ Refresh after changing the sheet.</p>
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

/* ---------- Events ---------- */
document.addEventListener('input', e => {
  const k = e.target.dataset.draft;
  if (!k) return;
  if (k === 'search') { S.search = e.target.value; render(); return; }
  S.drafts[k] = e.target.value;
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.change === 'cohort') { selectCohort(t.value); return; }
  if (t.dataset.change === 'note') {
    await Store.set(P('students/' + t.dataset.sid), { note: t.value.trim() });
    delete S.drafts[t.dataset.draft]; render();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (S.bagOpen) { S.bagOpen = false; render(); } else if (S.open) { S.open = null; render(); } }
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const k = e.target.dataset.draft;
  if (k === 'todo') act('addTodo');
  if (k === 'shop') act('addShop');
});

document.addEventListener('click', e => {
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
      case 'signout': await Store.signOut(); break;
      case 'refresh': await loadSheet(); break;
      case 'view': S.view = d.v; pref('view', d.v); S.open = null; render(); break;
      case 'day': S.day = Number(d.n); pref('day-' + S.cohortKey, d.n); render(); break;
      case 'goStudents': S.view = 'students'; S.filter = d.f; pref('view', 'students'); render(); break;
      case 'filter': S.filter = d.f; render(); break;

      case 'check': {
        const cur = !!((S.days[n] && S.days[n].checks) || {})[d.k];
        await Store.set(P('days/' + n), { checks: { [d.k]: !cur } }); break;
      }
      case 'addTodo': {
        const text = (S.drafts.todo || '').trim(); if (!text) return;
        S.drafts.todo = ''; render();
        await Store.add(P('todos'), { text, done: false, created: Date.now() }); break;
      }
      case 'todo': { const t = S.todos.find(x => x.id === d.id); await Store.set(P('todos/' + d.id), { done: !t.done }); break; }
      case 'delTodo': await Store.del(P('todos/' + d.id)); break;
      case 'clearTodos': await Promise.all(S.todos.filter(t => t.done).map(t => Store.del(P('todos/' + t.id)))); break;

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

      case 'paper': {
        const cur = !!((S.staff[d.key] && S.staff[d.key].days && S.staff[d.key].days[d.d]) || {})[d.f];
        await Store.set(P('staff/' + d.key), { name: d.name, days: { [d.d]: { [d.f]: !cur } } }); break;
      }
      case 'paid': {
        const cur = !!(S.staff[d.key] && S.staff[d.key].paid);
        await Store.set(P('staff/' + d.key), { name: d.name, paid: !cur }); break;
      }

      case 'openBag': S.bagOpen = true; render(); break;
      case 'closeBag': S.bagOpen = false; render(); break;
      case 'bagTab': S.bagTab = Number(d.b); render(); break;
      case 'toggleBagUse': {
        const b = Number(d.b); const cur = bagsInUse();
        const next = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort();
        await Store.set('cohorts/' + S.cohortKey, { bagsInUse: next }); break;
      }
      case 'bagItem': {
        const it = bagSections().flatMap(s => s.items).find(i => i.id === d.id);
        await setBagItem(n, Number(d.b), it, d.s); break;
      }
      case 'restOk': {
        const b = Number(d.b); const st = bagState(n, b); const upd = {};
        bagSections().forEach(sec => sec.items.forEach(it => { if (bagCarries(it, b) && !st[it.id]) upd[it.id] = 'ok'; }));
        await Store.set(P('days/' + n), { bags: { [b]: upd } });
        const later = bagsInUse().find(x => x > b && !bagDone(n, x));
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
        const next = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort();
        await Store.set('meta/settings', { someBags: { [d.id]: next } }); break;
      }
      case 'saveSkip': {
        const skipStaff = String(S.drafts['set-skip'] ?? cfg().skipStaff.join(', ')).split(',').map(x => x.trim()).filter(Boolean);
        await Store.set('meta/settings', { skipStaff });
        delete S.drafts['set-skip']; toast('Saved.'); break;
      }
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

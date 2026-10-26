/* Elevate EMS Admin (was Academy Week Admin): Bella's organizer for each cohort.
   Two sides, switched in the header:
   - Course: the whole cohort from setup on (cohort info from the sheet, Setup Checklist,
     Changes for future classes, Notes).
   - Academy Week: Day (planner boxes you can drag around), Week (Day 1-5 side by side; drag
     to-dos between days), Schedule, Students (skills status, patient contacts + fix notes,
     attendance/warnings).
   Admin (the logo or the Admin button): the business side, not tied to a cohort: admin.js.
   Plus Setup (templates and settings). Saving: store.js. Google Sheets: sheets.js.
   Scenarios (library, week plan, Additional Scenarios): scenario-ui.js + matcher.js.
   Emails (the Course page's Emails box, Gmail drafts, book codes): emails.js.
   Orientation rosters (to-dos, students' signatures, the roster PDF): roster.js + sigpad.js. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('aw-' + k); localStorage.setItem('aw-' + k, v); } catch { return null; } };

const VIEWS = ['admin', 'course', 'day', 'week', 'schedule', 'students', 'settings'];
const AW_VIEWS = ['day', 'week', 'schedule', 'students']; // the Academy Week side
const S = {
  user: null, cohorts: [], cohortKey: pref('cohort'), sheet: null, sheetErr: null, loading: false,
  settings: null, shopping: [], updates: [], prevTodos: [],
  cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], packing: [],
  view: VIEWS.includes(pref('view')) ? pref('view') : 'day', day: null, open: null, bagOpen: false, bagTab: null, // bagOpen = day number while the bag pop-up is open (Prep is 0, so compare with false)
  menuOpen: false, schMenu: false, datePick: null, binderOpen: null, shareOpen: false, tplOpen: false, tplTab: 'every',
  schTplOpen: false, schTplTab: 1, schTplDraft: null, schTplDirty: false, schedule: {}, filter: 'all', search: '', drafts: {}, pcBusy: {}, dragging: null,
  // Scenarios: scenDocs = your saved tags, scenLive = Docs in the Drive folders (null until listed)
  scenDocs: {}, scenDocsAt: 0, scenLive: null, scenLiveAt: 0, scenErr: null,
  emailTpls: {}, bookCodes: [], emailLog: [], // emails.js
  rosterDocs: {}, rosterSigs: {}, roster: null, todosLoaded: false, // roster.js
  admin: {}, adminTodos: [], adminDates: [], adminNotes: [], // admin.js
  libOpen: false, libTab: 'scen', libSel: null, libDraft: null, libFilter: 'all', addonDraft: null, reqDraft: null, planOpen: false, place: null, match: null,
};
let unwatchCohort = [];
let unwatchGlobal = [];

/* ---------- Dates ---------- */
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayIso = () => isoOf(new Date());
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isIsoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
// The cohort sheet's settings box (JBL code, dates, Meet link, review dates). Blank = not set yet.
const cohortInfo = () => (S.sheet && S.sheet.info) || {};
const longDate = s => parseIso(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
// "Oct 20" (for logs, where 10/20 could be misread as a count)
const monthDay = s => s ? parseIso(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
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
const BOXES = { priorities: 'Priorities', todo: 'To Do', shopping: 'Shopping List', notes: 'Notes', packing: 'Packing List', docs: 'Documentation Checklist', scenarios: 'Academy Week Scenarios',
  info: 'Course Details', setup: 'Setup Checklist', emails: 'Emails', ctodo: 'Course To-Do', finalsteps: 'Final Steps' };
// Prep and Finalize have their own boxes and saved layouts; Day 1-5 share one.
// Finalize: the Documentation Checklist across the left two-thirds, Final Steps over Notes on the right (no To Do).
const BOARDS = {
  day: { key: 'layout', boxes: ['priorities', 'todo', 'shopping', 'notes'], def: [['priorities', 'shopping'], ['todo'], ['notes']] },
  prep: { key: 'prepLayout', v: 4, boxes: ['shopping', 'notes', 'todo', 'packing', 'scenarios'], def: [['shopping', 'notes'], ['todo', 'scenarios'], ['packing']] },
  final: { key: 'finalLayout', v: 3, boxes: ['docs', 'finalsteps', 'notes'], def: [['docs'], ['finalsteps', 'notes']], wideLeft: true },
  // Course page: Course Details + Notes on the left, Emails down the middle, the Setup Checklist down the right.
  // (Changes for Future Classes lives on the Admin page.)
  course: { key: 'courseLayout', v: 6, boxes: ['info', 'setup', 'emails', 'notes', 'ctodo'], def: [['info', 'notes'], ['emails'], ['setup']] },
  // Once every Setup Checklist item is checked: Course To-Do fills the right, the checklist shrinks to a bar under it.
  courseDone: { key: 'courseDoneLayout', v: 3, boxes: ['info', 'setup', 'emails', 'notes', 'ctodo'], def: [['info', 'notes'], ['emails'], ['ctodo', 'setup']] },
};
const boardOf = n => BOARDS[n === PREP ? 'prep' : n === FINAL ? 'final' : 'day'];
const LAYOUT_VERSION = 2; // bumped when the default changes, so an older saved layout doesn't stick
const layoutV = board => board.v || LAYOUT_VERSION; // a board can bump its own (Prep v4 = scenarios fit + notes match)
function cfg() {
  const s = S.settings || {};
  const board = S.view === 'course' ? (setupComplete() ? BOARDS.courseDone : BOARDS.course) : boardOf(curDay()), saved = s[board.key];
  return {
    checklist: s.checklist || DEFAULTS.checklist,
    dayNotes: s.dayNotes || {},
    packing: s.packingList || DEFAULTS.packingList || [],
    setup: s.setupList || DEFAULTS.setupList,
    courseTodo: withDefaultDue('ctodo-', s.courseTodoList || DEFAULTS.courseTodoList),
    binder: s.binderList || DEFAULTS.binderList,
    docs: { ...DEFAULTS.docChecklist, ...(s.docChecklist || {}) },
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
  if (!l || l.v !== layoutV(board)) return null;
  const cols = [l.c0 || [], l.c1 || [], l.c2 || []].slice(0, board.def.length).map(c => c.filter(b => board.boxes.includes(b)));
  const seen = new Set(cols.flat());
  // A box added later still shows up, in the column it starts in.
  board.boxes.forEach(b => { if (!seen.has(b)) cols[Math.max(0, board.def.findIndex(c => c.includes(b)))].push(b); });
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
const isBinderItem = text => /binder cover/i.test(text);
const isBinderList = text => /prepare binders/i.test(text); // gets the list icon: what goes in each binder
const isShirtItem = text => /ship.*shirt/i.test(text); // Course To-Do: gets the Print packet button (packet.js)

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
  const all = [...every, ...((tpl.days || {})[n] || [])].map(tplText); // (without a "[due …]" ending)
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

// The Course page's Setup Checklist (Setup → Templates → Course Setup) is copied the same way.
// It's kept with the to-dos as kind 'setup' on day SETUP, so checking, dragging, editing and
// highlighting all work as on the Day page. A "# " line is a heading. "Do before next cohort"
// changes are kind 'next' on the same day.
const SETUP = -1;
const setupLine = raw => { const heading = /^#/.test(raw); const text = tplText(raw.replace(/^#+\s*/, '')); return { heading, text, id: (heading ? 'setuph-' : 'setup-') + slug(text) }; };
function missingSetup(list = cfg().setup) {
  const have = new Set(S.todos.map(x => x.id));
  const removed = (S.cohortDoc && S.cohortDoc.removedRepeats) || {};
  return list.map((raw, i) => ({ ...setupLine(raw), i })).filter(x => x.text && !have.has(x.id) && !removed[x.id])
    .filter((x, j, arr) => arr.findIndex(y => y.id === x.id) === j);
}
// A cohort that has already had orientation gets the list already checked off.
function addSetup(list, { done = false } = {}) {
  return Promise.all(list.map(({ id, text, heading, i }) =>
    Store.set(P('todos/' + id), { text, heading, done: !heading && done, day: SETUP, kind: 'setup', order: (i + 1) * 1000, created: Date.now(), repeat: true }, false)));
}
// The Course To-Do (shows once the Setup Checklist is done) starts from Setup → Templates → Course Setup too:
// kind 'ctodo' on day SETUP, ids ctodo-{text}.
function missingCtodo(list = cfg().courseTodo) {
  const have = new Set(S.todos.map(x => x.id));
  const removed = (S.cohortDoc && S.cohortDoc.removedRepeats) || {};
  return list.map((raw, i) => ({ id: 'ctodo-' + slug(tplText(raw)), text: tplText(raw), i })).filter(x => x.text && !have.has(x.id) && !removed[x.id])
    .filter((x, j, arr) => arr.findIndex(y => y.id === x.id) === j);
}
const addCtodo = list => Promise.all(list.map(({ id, text, i }) =>
  Store.set(P('todos/' + id), { text, done: false, day: SETUP, kind: 'ctodo', order: (i + 1) * 1000, created: Date.now(), repeat: true }, false)));
const pastOrientation = () => { const f = cohortInfo().firstDay; return isIsoDate(f) && f < todayIso(); };

let seeding = false;
async function seedRepeats() {
  const key = S.cohortKey, doc = S.cohortDoc || {}, path = 'cohorts/' + key;
  if (seeding || (doc.repeatsAdded && doc.packingAdded && doc.setupAdded && doc.ctodoAdded)) return;
  seeding = true;
  try {
    // claim() is false when Nick's computer got there first.
    if (!doc.repeatsAdded && await Store.claim(path, 'repeatsAdded') && key === S.cohortKey) await addRepeats(missingRepeats());
    if (!doc.packingAdded && await Store.claim(path, 'packingAdded') && key === S.cohortKey) await addPacking(missingPacking());
    if (!doc.setupAdded && await Store.claim(path, 'setupAdded') && key === S.cohortKey) await addSetup(missingSetup(), { done: pastOrientation() });
    if (!doc.ctodoAdded && await Store.claim(path, 'ctodoAdded') && key === S.cohortKey) await addCtodo(missingCtodo());
  } catch (e) { console.warn('Repeat to-dos not added yet:', e.message); }
  finally { seeding = false; }
}

// "Register course with VAOEMS" came after most cohorts' Setup Checklists were copied: it's added once to each
// (checked already when orientation has passed, so a running cohort's list doesn't open back up), and once to
// a saved Course Setup template. Its button types the course # into Course Details (AF4).
const VAOEMS_ITEM = 'Register course with VAOEMS (course #)';
let vaoemsTried = null, vaoemsTplTried = false;
async function seedVaoems() {
  const key = S.cohortKey, doc = S.cohortDoc, st = S.settings;
  if (st && st.setupList && !st.vaoemsAdded && !st.setupList.some(l => /vaoems/i.test(l)) && !vaoemsTplTried) {
    vaoemsTplTried = true;
    try {
      if (await Store.claim('meta/settings', 'vaoemsAdded')) {
        const list = [...st.setupList], at = list.findIndex(l => /odemsa/i.test(l) && !/^#/.test(l));
        list.splice(at >= 0 ? at + 1 : list.length, 0, VAOEMS_ITEM);
        await Store.set('meta/settings', { setupList: list });
      }
    } catch (e) { console.warn('VAOEMS template item not added:', e.message); }
  }
  if (!S.sheet || !doc || !S.todosLoaded || doc.vaoemsAdded || vaoemsTried === key) return;
  vaoemsTried = key;
  try {
    if (!(await Store.claim('cohorts/' + key, 'vaoemsAdded')) || key !== S.cohortKey || !doc.setupAdded) return; // a new cohort gets it from the template
    const id = setupLine(VAOEMS_ITEM).id;
    if (S.todos.some(t => t.kind === 'setup' && /vaoems/i.test(t.text || '')) || (doc.removedRepeats || {})[id]) return;
    const ref = itemsFor(SETUP, 'setup').find(t => !t.heading && /odemsa/i.test(t.text || ''));
    await Store.set(P('todos/' + id), { text: VAOEMS_ITEM, heading: false, done: pastOrientation(), day: SETUP, kind: 'setup',
      order: ref ? orderOf(ref) + 1 : 99000, created: Date.now(), repeat: true }, false);
  } catch (e) { console.warn('VAOEMS item not added:', e.message); }
}

/* ---------- Cohorts in order (for "the previous cohort") ---------- */
// "Spring 2027" → 2027.0, "Summer 2027" → 2027.33, "Fall 2027" → 2027.67. Test/QA/Custom ones aren't real classes.
const SEASONS = { winter: 0, spring: 0.1, summer: 0.4, fall: 0.7, autumn: 0.7 };
function cohortRank(key) {
  const m = String(key).match(/^(winter|spring|summer|fall|autumn)\s+(\d{4})$/i);
  return m ? Number(m[2]) + SEASONS[m[1].toLowerCase()] : null;
}
function prevCohort(key = S.cohortKey) {
  const me = cohortRank(key);
  if (me == null) return null;
  return S.cohorts.map(c => ({ ...c, r: cohortRank(c.key) })).filter(c => c.r != null && c.r < me).sort((a, b) => b.r - a.r)[0] || null;
}
// The previous cohort's "Do before next cohort" list shows on this cohort's Setup Checklist.
let unwatchPrev = null, prevFor = null, prevReady = true; // prevReady: that cohort's list has arrived
function watchPrev() {
  const prev = prevCohort();
  const key = prev ? prev.key : null;
  if (key === prevFor) return;
  if (unwatchPrev) unwatchPrev();
  unwatchPrev = null; prevFor = key; S.prevTodos = []; prevReady = !key;
  if (key) unwatchPrev = Store.watch('cohorts/' + key + '/todos', list => { S.prevTodos = list.filter(x => x.kind === 'next'); prevReady = true; render(); });
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
// "Not attending" (unchecked in the binder covers pop-up or a student's panel) is saved
// as cohorts/{key}.notAttending = { sid: true }, or { sid: 3 } when they dropped on Day 3.
// They stay on the roster but are left out of covers, squads and the counts.
function students() {
  if (!S.sheet) return [];
  const notAttending = (S.cohortDoc && S.cohortDoc.notAttending) || {};
  return S.sheet.students
    .filter(s => !/^blocked$/i.test(s.status))
    .map(s => {
      const sid = slug(s.name);
      const doc = S.studentsDoc[sid] || {};
      return {
        ...s, sid, out: !!notAttending[sid], droppedDay: typeof notAttending[sid] === 'number' ? notAttending[sid] : null,
        skill: doc.skill || 'on', behind: doc.behind || [], note: doc.note || '',
        fixes: S.contacts.filter(c => c.sid === sid && !c.fixed).length,
        warns: S.warnings.filter(w => w.sid === sid).length,
      };
    })
    // A-Z by last name, then first, even when late enrollments were added to the bottom of the sheet.
    .sort((a, b) => {
      const x = coverName(a.name), y = coverName(b.name), cmp = (p, q) => p.localeCompare(q, 'en', { sensitivity: 'base' });
      return cmp(x.last, y.last) || cmp(x.first, y.first);
    });
}
const studentBySid = sid => students().find(s => s.sid === sid);
const attending = () => students().filter(s => !s.out);
const outLabel = s => s.droppedDay ? 'Dropped · Day ' + s.droppedDay : 'Not attending';
// Take a student out of the squads from day `from` on. Earlier days (and their printouts) keep them;
// a day that was only carrying squads forward gets its own copy without the name.
async function removeFromSquads(name, from) {
  for (let d = from; d <= 5; d++) {
    const own = S.schedule[d] && S.schedule[d].squads;
    if (d !== from && !own) continue; // follows an earlier day, which is already fixed
    const sq = squadsFor(d);
    if (!sq.count) continue;
    const s = JSON.parse(JSON.stringify(sq.s || {}));
    let hit = false;
    Object.values(s).forEach(team => ['A', 'B'].forEach(t => {
      if ((team[t] || []).includes(name)) { team[t] = team[t].filter(x => x !== name); hit = true; }
    }));
    if (hit) await saveSquads(d, { count: sq.count, s });
  }
}

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
  S.authKnown = true; // until now, sign-in was still being checked (bootShell)
  if (user && !user.sample && !STAFF_EMAILS.includes(String(user.email).toLowerCase())) {
    toast('That Google account doesn’t have access. Use your Elevate EMS account.');
    await Store.signOut();
    return;
  }
  S.user = user;
  unwatchGlobal.forEach(u => u()); unwatchGlobal = [];
  unwatchCohort.forEach(u => u()); unwatchCohort = [];
  if (unwatchPrev) { unwatchPrev(); unwatchPrev = null; prevFor = null; prevReady = true; }
  watchAdminNext(null);
  S.cohortsLoaded = false;
  if (!user) { clearSheetCopies(); render(); return; }
  unwatchGlobal.push(Store.watch('meta/settings', d => { S.settings = d; render(); }));
  unwatchGlobal.push(Store.watch('shopping', list => { S.shopping = list; render(); }));
  unwatchGlobal.push(Store.watch('updates', list => { S.updates = list; render(); }));
  unwatchGlobal.push(Store.watch('scenarios', list => { S.scenDocs = Object.fromEntries(list.map(d => [d.id, d])); S.scenDocsAt = Date.now(); render(); }));
  unwatchGlobal.push(Store.watch('emailTemplates', list => { S.emailTpls = Object.fromEntries(list.map(d => [d.id, d])); render(); }));
  unwatchGlobal.push(Store.watch('bookCodes', list => { S.bookCodes = list; render(); }));
  unwatchGlobal.push(...adminWatch());
  render();
  // The last cohort used opens straight away (while the cohort list loads alongside it).
  const last = S.cohortKey;
  if (!S.cohorts.length) S.cohorts = keepCopy('cohorts') || []; // last list, until the fresh one arrives
  if (last && !window.CALLS_ONLY) selectCohort(last); // (the Inquiries page doesn't open a cohort)
  try {
    S.cohorts = await Sheets.listCohorts();
    keepCopy('cohorts', S.cohorts);
  } catch (e) { S.sheetErr = e.message; render(); return; }
  S.cohortsLoaded = true;
  watchPrev();
  loadScenarios(); // which scenario Docs are in the Drive folders (no need to wait)
  // Last one used; otherwise the active cohort that isn't the Test one.
  const pick = S.cohorts.find(c => c.key === S.cohortKey)
    || S.cohorts.find(c => /active/i.test(c.status) && !/^test/i.test(c.key))
    || S.cohorts.find(c => /active/i.test(c.status)) || S.cohorts[0];
  if (pick && pick.key !== last && !window.CALLS_ONLY) selectCohort(pick.key); else render();
});

// The last sheet data for each cohort is kept in this browser, so a refresh can show the
// page at once; the fresh copy from the Google Sheet replaces it a moment later.
function sheetCopyKey(key) { return 'aw-sheet-' + key; }
function sheetCopy(key, data) {
  try {
    if (data === undefined) { const t = localStorage.getItem(sheetCopyKey(key)); return t ? JSON.parse(t) : null; }
    localStorage.setItem(sheetCopyKey(key), JSON.stringify(data));
  } catch { return null; }
}
function clearSheetCopies() { // (signing out also clears the other saved copies below)
  try { Object.keys(localStorage).filter(k => k.startsWith('aw-sheet-') || k.startsWith('aw-copy-')).forEach(k => localStorage.removeItem(k)); } catch {}
}
// The same for the other things that come from the Google Sheets or CertKeeper and take a few seconds:
// the cohort list, Key Dates' cohort dates and recerts, Info Requests. keepCopy(name) reads; keepCopy(name, data) saves.
function keepCopy(name, data) {
  try {
    if (data === undefined) { const t = localStorage.getItem('aw-copy-' + name); return t ? JSON.parse(t) : null; }
    localStorage.setItem('aw-copy-' + name, JSON.stringify(data));
  } catch { return null; }
}
function pickDay(key) {
  if (S.day != null) return;
  const saved = pref('day-' + key);
  S.day = currentWeekDay() ?? phaseDay() ?? (saved != null && !isNaN(saved) ? Number(saved) : 1);
}
// Opening a cohort: the Course side until 6 weeks before academy week (or while its start
// date isn't in the sheet yet), then the Academy Week side. Students and Setup stay put.
const AW_LEAD_DAYS = 42;
function sideByDate() {
  const start = S.sheet && S.sheet.academyStart;
  if (!isIsoDate(start)) return 'course';
  const from = parseIso(start); from.setDate(from.getDate() - AW_LEAD_DAYS);
  return todayIso() >= isoOf(from) ? 'aw' : 'course';
}
let sidePickedFor = null;
function pickSide(key) {
  if (sidePickedFor === key) return;
  sidePickedFor = key;
  if (!['course', 'day', 'week', 'schedule'].includes(S.view)) return;
  const side = sideByDate();
  if (side === 'course') S.view = 'course';
  else if (S.view === 'course') S.view = 'day';
}

async function selectCohort(key, { keepView = false } = {}) {
  S.cohortKey = key; pref('cohort', key);
  unwatchCohort.forEach(u => u()); unwatchCohort = [];
  Object.assign(S, { sheet: null, cohortDoc: null, studentsDoc: {}, contacts: [], warnings: [], days: {}, staff: {}, todos: [], packing: [], schedule: {}, open: null, day: null,
    emailLog: [], emailDraft: null, emailPick: null, emailStuOpen: false, emailStu: null, rosterDocs: {}, rosterSigs: {}, roster: null, todosLoaded: false });
  sidePickedFor = keepView ? key : null; // keepView: stay on the page you're on (a cohort you just made opens on Course)
  watchPrev();
  const base = 'cohorts/' + key;
  const w = (path, fn) => unwatchCohort.push(Store.watch(path, v => { fn(v); render(); }));
  w(base, d => { S.cohortDoc = d; if (S.sheet) shareHousekeeping(); });
  w(base + '/students', list => { S.studentsDoc = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/contacts', list => { S.contacts = list; });
  w(base + '/warnings', list => { S.warnings = list; });
  w(base + '/days', list => { S.days = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/staff', list => { S.staff = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/todos', list => { S.todos = list; S.todosLoaded = true; if (S.sheet) rollOver(); });
  w(base + '/packing', list => { S.packing = list; });
  w(base + '/schedule', list => { S.schedule = Object.fromEntries(list.map(d => [d.id, d])); });
  w(base + '/emailLog', list => { S.emailLog = list; });
  w(base + '/rosters', list => { S.rosterDocs = Object.fromEntries(list.map(d => [d.id, d])); });
  await loadSheet();
}

async function loadSheet() {
  S.loading = true; S.sheetErr = null;
  const key = S.cohortKey;
  const copy = !S.sheet && sheetCopy(key);
  if (copy) { S.sheet = copy; pickDay(key); pickSide(key); }
  render();
  try {
    const data = await Sheets.loadCohort(key);
    if (key !== S.cohortKey) return;
    S.sheet = data;
    sheetCopy(key, data);
    pickDay(key);
    pickSide(key);
    rollOver();
    seedRepeats();
    emailInit();
    shareHousekeeping();
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
    // Text boxes (Notes, sticky notes) and the boxes around them keep how far they were scrolled.
    const tScrolls = [...document.querySelectorAll('textarea[id]')].filter(el => el.scrollTop).map(el => [el.id, el.scrollTop]);
    const bScrolls = [...document.querySelectorAll('.box[data-box-id], section.box')].filter(el => el.scrollTop)
      .map(el => [el.dataset.boxId || el.className, el.scrollTop]);
    S.rendering = true; // (so the edit box being redrawn doesn't count as clicking away)
    $('#app').innerHTML = S.user ? (window.CALLS_ONLY ? callsShell() : shell()) : S.authKnown ? signInView() : bootShell();
    S.rendering = false;
    scrolls.forEach(([k, top]) => { const el = document.querySelector(`[data-keep-scroll="${k}"]`); if (el) el.scrollTop = top; });
    if (id) {
      const el = document.getElementById(id);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {} }
    }
    // (after the cursor is put back: focusing a text box scrolls it to the top)
    tScrolls.forEach(([id, top]) => { const el = document.getElementById(id); if (el) el.scrollTop = top; });
    bScrolls.forEach(([k, top]) => { const el = [...document.querySelectorAll('.box[data-box-id], section.box')].find(b => (b.dataset.boxId || b.className) === k); if (el) el.scrollTop = top; });
    if (S.editFocus) { // just clicked an item's words: cursor at the end
      S.editFocus = false;
      const el = document.querySelector('[data-edit]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
    fitBoard();
    syncDue(); // template to-dos' due dates follow Course Details
    syncRosters(); seedVaoems(); // orientation roster to-dos (roster.js); the VAOEMS item on older cohorts' Setup Checklists
    document.querySelectorAll('textarea[data-notes]').forEach(t => { const b = document.querySelector(`[data-back="${t.id}"]`); if (b) b.scrollTop = t.scrollTop; });
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
  list: '<svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="17.5" r="1.1"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7M6.5 7l.9 12.2c.1.9.8 1.8 1.8 1.8h5.6c1 0 1.7-.9 1.8-1.8L17.5 7M10 11v6M14 11v6"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/></svg>',
};

function signInView() {
  return `<div class="signin"><div class="signin-card">
    <img class="signin-logo" src="logo.png" alt="Elevate EMS">
    <h1>Elevate EMS Admin</h1>
    <p>Cohort setup, academy week, students and paperwork, all in one calm place.</p>
    <button class="btn primary wide" data-act="signin">Sign in with Google</button>
    <p class="muted small">Use your elevateemsacademy.com account.</p>
  </div></div>`;
}

// While sign-in is being checked on a refresh: just the header, so the page fills in under it.
function bootShell() {
  const icon = v => `<span class="icon-btn">${ICONS[v]}</span>`;
  return `
  ${Store.configured ? '' : '<div class="sample-bar">Sample mode: pretend students and staff, saved in this browser only.</div>'}
  <header class="top">
    <div class="head-left"><span class="brand"><img src="logo.png" alt=""><b>Admin</b></span></div>
    <div class="page-title"></div>
    <nav class="icons">${icon('students')}<div class="menu-wrap">${icon('settings')}</div></nav>
  </header>
  <main class="wrap"></main>`;
}

// Course / Academy Week switch. Students and Setup belong to neither, so nothing is lit there.
function sideSwitch() {
  const side = S.view === 'course' ? 'course' : ['day', 'week', 'schedule'].includes(S.view) ? 'aw' : null;
  return `<div class="side-switch" role="group" aria-label="Course or Academy Week">
    <button class="${side === 'course' ? 'on' : ''}" data-act="side" data-s="course">Course</button>
    <button class="${side === 'aw' ? 'on' : ''}" data-act="side" data-s="aw">Academy Week</button></div>`;
}

function shell() {
  const icon = (v, label) => `<button class="icon-btn ${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}" title="${label}" aria-label="${label}">${ICONS[v]}</button>`;
  const aw = ['day', 'week', 'schedule'].includes(S.view);
  return `
  ${Store.configured ? '' : '<div class="sample-bar">Sample mode: pretend students and staff, saved in this browser only.</div>'}
  <header class="top">
    <div class="head-left">
      <button class="brand ${S.view === 'admin' ? 'on' : ''}" data-act="view" data-v="admin" title="Admin"><img src="logo.png" alt=""><b>Admin</b></button>
      <span class="head-div" aria-hidden="true"></span>
      ${sideSwitch()}
    </div>
    <div class="page-title">${pageTitle()}</div>
    <nav class="icons">
      ${S.view === 'admin' ? adminHeaderLinks() : (aw ? icon('day', 'Day') + icon('schedule', 'Schedule') : '') + icon('students', 'Students')}
      <div class="menu-wrap">
        <button class="icon-btn ${S.menuOpen || S.view === 'settings' ? 'on' : ''}" data-act="menu" title="Settings" aria-label="Settings">${ICONS.settings}</button>
        ${S.menuOpen ? menu() : ''}
      </div>
    </nav>
  </header>
  <main class="wrap">
    ${S.sheetErr ? `<div class="alert">Couldn’t read the Google Sheet: ${esc(S.sheetErr)} <button class="btn small" data-act="refresh">Try again</button></div>` : ''}
    ${{ admin: adminView, course: courseView, day: dayView, week: weekView, schedule: scheduleView, students: studentsView, settings: settingsView }[S.view]()}
  </main>
  ${S.open ? drawer() : ''}
  ${S.shareOpen ? shareModal() : ''}
  ${S.bagOpen !== false ? bagModal() : ''}
  ${S.tplOpen ? templatesModal() : ''}
  ${S.bagEd ? bagEdModal() : ''}
  ${S.skillsSheet ? skillsSheetModal() : ''}
  ${S.schTplOpen ? schTplModal() : ''}
  ${S.binderOpen ? binderModal() : ''}
  ${S.planOpen ? planModal() : ''}
  ${S.planDelAsk != null ? planDelModal() : ''}
  ${S.planClearAsk ? planClearModal() : ''}
  ${S.match ? matchModal() : ''}
  ${S.libOpen ? libModal() : ''}
  ${S.place ? placeModal() : ''}
  ${S.binderList ? binderListModal() : ''}
  ${S.infoEdit ? infoEditModal() : ''}
  ${S.newCohort ? newCohortModal() : ''}
  ${emailModals()}
  ${S.ship ? shipModal() : ''}
  ${S.dueEd ? dueModal() : ''}
  ${adminModals()}
  ${S.packet ? packetModal() : ''}
  ${S.roster ? rosterModal() : ''}
  ${S.resetAsk ? resetModal() : ''}`;
}

function pageTitle() {
  if (S.view === 'admin') return '<h1>Elevate EMS</h1><p>Admin</p>';
  if (S.view === 'course') {
    const f = cohortInfo().firstDay, n = S.sheet ? attending().length : 0; // (enrolled: dropped / not attending aren't counted)
    const when = isIsoDate(f) ? (f > todayIso() ? 'Orientation ' : 'Started ') + parseIso(f).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'Orientation date TBD';
    return `<h1>${esc(S.cohortKey || 'Course')}</h1><p>${S.sheet ? when + ' · ' + n + ' student' + (n === 1 ? '' : 's') + ' enrolled' : ''}</p>`;
  }
  if (S.view === 'week') return `<h1>The Week</h1><p>Drag to-dos from one day to another · ${hideToggle('todo')}</p>`;
  if (S.view === 'students') {
    const out = students().filter(s => s.out).length;
    return `<h1>Students</h1><p>${S.sheet ? attending().length + ' students' + (out ? ` · ${out} not attending` : '') : ''}</p>`;
  }
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

// The cohort menu lists Active and Upcoming cohorts; Former and Test/QA ones only after
// "Show former & test cohorts" at the bottom of its list (they're hidden, not removed: the app still uses them).
const isTestCohort = key => /^(test|qa)\b/i.test(key);
const isOldCohort = c => /former/i.test(c.status || '') || isTestCohort(c.key);
function menu() {
  const opt = c => `<option value="${esc(c.key)}" ${c.key === S.cohortKey ? 'selected' : ''}>${esc(c.key)}${c.status && !/active/i.test(c.status) ? ' (' + esc(c.status) + ')' : ''}</option>`;
  const main = S.cohorts.filter(c => !isOldCohort(c));
  const old = S.cohorts.filter(isOldCohort);
  const shownOld = S.showOld ? old : old.filter(c => c.key === S.cohortKey); // the one you're on always shows
  const opts = main.map(opt).join('') + (shownOld.length ? `<optgroup label="Former & test">${shownOld.map(opt).join('')}</optgroup>` : '');
  return `<div class="menu" data-stop>
    <div class="menu-field"><div class="menu-field-head">Cohort<button class="menu-add" data-act="newCohortOpen" title="New cohort" aria-label="New cohort">+</button></div>
      <select id="cohortSel" data-change="cohort" aria-label="Cohort"${old.length ? ` data-dd-foot="${S.showOld ? 'Hide' : 'Show'} former &amp; test cohorts" data-dd-foot-act="toggleOld"` : ''}>${opts || '<option>Loading…</option>'}</select></div>
    <button class="menu-item" data-act="refresh">${S.loading ? 'Loading…' : 'Refresh from the Google Sheet'}</button>
    <button class="menu-item" data-act="view" data-v="settings">Setup</button>
    <button class="menu-item" data-act="signout">Sign out <span class="muted small">${esc(S.user.email)}</span></button>
  </div>`;
}

const loadingView = () => `<p class="loading">${S.loading ? 'Opening the cohort sheet…' : ''}</p>`;

/* ---------- Highlighting (select words in a list item → Highlight) ---------- */
// Saved as the highlighted words themselves (item.hl = ['call Nick']), so a highlight stays put
// even if the item's text is edited, as long as those words are still in it.
// Where: to-dos/priorities (todo), packing (pack), shopping (shop), Documentation Checklist (doc, per cohort in docHl).
function hlRanges(text, phrases) {
  const out = [];
  (phrases || []).forEach(p => {
    if (!p) return;
    let i = text.indexOf(p);
    while (i >= 0 && out.some(([a, b]) => i < b && i + p.length > a && !(a === i && b === i + p.length))) i = text.indexOf(p, i + 1);
    if (i >= 0) out.push([i, i + p.length]);
  });
  out.sort((x, y) => x[0] - y[0]);
  const merged = [];
  out.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); });
  return merged;
}
// Clicking an item's words edits them (To Do / priorities, Packing, Shopping); the circle checks it off.
const EDITABLE = ['todo', 'pack', 'shop', 'upd', 'anext', 'prev']; // anext: Admin page's "before next cohort"; prev: those on the cohort they're for
const itemPath = (kind, id) => kind === 'todo' ? P('todos/' + id) : kind === 'pack' ? P('packing/' + id) : kind === 'upd' ? 'updates/' + id
  : kind === 'anext' ? 'cohorts/' + nextFor + '/todos/' + id : kind === 'prev' ? 'cohorts/' + prevFor + '/todos/' + id : 'shopping/' + id;
function hlTxt(kind, id, text, phrases) {
  if (S.editItem === kind + ':' + id) {
    const k = 'edit-' + kind + '-' + id;
    return `<input class="txt-edit" id="${k}" data-draft="${k}" data-edit="${kind}:${id}" value="${esc(S.drafts[k] ?? text)}" aria-label="Edit item">`;
  }
  let html = '', at = 0;
  hlRanges(text, phrases).forEach(([a, b]) => {
    html += esc(text.slice(at, a)) + `<mark class="hl" data-r="${a}-${b}">${esc(text.slice(a, b))}</mark>`; at = b;
  });
  return `<span class="txt" data-hl="${kind}:${id}">${html + esc(text.slice(at))}</span>`;
}
function hlItem(kind, id) {
  if (kind === 'doc') return { text: (docItems().find(x => x.id === id) || {}).text || '', hl: (((S.cohortDoc || {}).docHl) || {})[id] || [] };
  const list = kind === 'todo' ? S.todos : kind === 'pack' ? S.packing : kind === 'upd' ? S.updates
    : kind === 'anext' ? (S.adminNext || []) : kind === 'prev' ? S.prevTodos : S.shopping;
  const x = list.find(i => i.id === id) || {};
  return { text: x.text || '', hl: x.hl || [] };
}
function saveHl(kind, id, hl) {
  if (kind === 'doc') return Store.set('cohorts/' + S.cohortKey, { docHl: { [id]: hl } });
  return Store.set(itemPath(kind, id), { hl });
}

let hlPop = null, hlPending = null;
function hlShow(rect, label, pending) {
  if (!hlPop) {
    hlPop = document.createElement('button'); hlPop.className = 'hl-pop'; hlPop.type = 'button';
    hlPop.addEventListener('mousedown', e => e.preventDefault()); // keep the selection while clicking it
    hlPop.addEventListener('click', async e => {
      e.stopPropagation();
      const p = hlPending; hlHide(); window.getSelection().removeAllRanges();
      try {
        if (p.addNote) {
          const hl = notesHl(p.addNote.n);
          if (!hl.includes(p.addNote.phrase)) await Store.set(P('days/' + p.addNote.n), { hl: [...hl, p.addNote.phrase] });
        }
        if (p.removeNote) {
          const [a, b] = p.removeNote.range;
          await Store.set(P('days/' + p.removeNote.n), { hl: notesHl(p.removeNote.n).filter(ph => !hlRanges(p.removeNote.text, [ph]).some(([x, y]) => x < b && y > a)) });
        }
        if (p.add) for (const x of p.add) { const it = hlItem(x.kind, x.id); if (!it.hl.includes(x.phrase)) await saveHl(x.kind, x.id, [...it.hl, x.phrase]); }
        if (p.remove) {
          const it = hlItem(p.remove.kind, p.remove.id), [a, b] = p.remove.range;
          // Take off every saved phrase that's part of the highlight you clicked.
          const keep = it.hl.filter(ph => !hlRanges(it.text, [ph]).some(([x, y]) => x < b && y > a));
          await saveHl(p.remove.kind, p.remove.id, keep);
        }
      } catch (err) { toast(err.message); }
    });
    document.body.appendChild(hlPop);
  }
  hlPending = pending; hlPop.textContent = label;
  hlPop.style.left = (rect.left + rect.width / 2) + 'px'; hlPop.style.top = Math.max(8, rect.top - 8) + 'px';
  hlPop.classList.add('show');
}
function hlHide() { if (hlPop) hlPop.classList.remove('show'); hlPending = null; }

// The selected words in each list item the selection touches.
function hlSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const upTo = (el, node, off) => { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; };
  return [...document.querySelectorAll('.txt[data-hl]')].filter(el => range.intersectsNode(el)).map(el => {
    const text = el.textContent;
    let a = el.contains(range.startContainer) ? upTo(el, range.startContainer, range.startOffset) : 0;
    let b = el.contains(range.endContainer) ? upTo(el, range.endContainer, range.endOffset) : text.length;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    const [kind, ...rest] = el.dataset.hl.split(':');
    return { kind, id: rest.join(':'), phrase: text.slice(a, b) };
  }).filter(x => x.phrase);
}

let bagDragOff = null, hlDragOff = null, hlDown = null, hlNoClick = false;
document.addEventListener('mousedown', e => {
  if (hlPop && e.target === hlPop) return;
  hlHide();
  hlDown = { x: e.clientX, y: e.clientY }; hlNoClick = false;
  // A to-do can be dragged to move it; on its words, a drag selects them instead.
  const txt = e.target.closest && e.target.closest('.txt[data-hl], .txt-edit');
  const li = txt && txt.closest('[draggable="true"]');
  if (li) { li.draggable = false; hlDragOff = li; }
  // Bag editor: in a name box, a drag selects text; on an item row, it moves the item, not its pocket.
  const inBag = e.target.closest && e.target.closest('.bag-ed .pocket');
  if (inBag) {
    const field = e.target.closest('input, textarea'), li = e.target.closest('li[data-bi]');
    const off = [field || li ? inBag : null, field && li].filter(Boolean);
    off.forEach(x => { x.draggable = false; });
    if (off.length) bagDragOff = off;
  }
}, true);
document.addEventListener('mouseup', e => {
  if (hlDragOff) { hlDragOff.draggable = true; hlDragOff = null; }
  if (bagDragOff) { bagDragOff.forEach(x => { x.draggable = true; }); bagDragOff = null; }
  // The mouse moved while held down = selecting words, not clicking the item.
  hlNoClick = !!hlDown && Math.hypot(e.clientX - hlDown.x, e.clientY - hlDown.y) > 3 && !!(e.target.closest && e.target.closest('.checks'));
  hlDown = null;
  const notes = e.target.closest && e.target.closest('textarea[data-notes]');
  setTimeout(() => {
    if (notes) return notesPop(notes, e);
    const pieces = hlSelection();
    if (!pieces.length) return;
    hlShow(window.getSelection().getRangeAt(0).getBoundingClientRect(), 'Highlight', { add: pieces });
  }, 0);
});
// In Notes: words selected → Highlight; a click inside a highlight → Remove highlight.
function notesPop(t, e) {
  const n = noteDay(t.dataset.notes), a = t.selectionStart, b = t.selectionEnd, text = t.value;
  const at = { left: e.clientX, top: e.clientY - 6, width: 0 };
  if (b > a) {
    let x = a, y = b;
    while (x < y && /\s/.test(text[x])) x++;
    while (y > x && /\s/.test(text[y - 1])) y--;
    if (y > x) hlShow(at, 'Highlight', { addNote: { n, phrase: text.slice(x, y) } });
    return;
  }
  const hit = hlRanges(text, notesHl(n)).find(([x, y]) => a > x && a < y);
  if (hit) hlShow(at, 'Remove highlight', { removeNote: { n, range: hit, text } });
}
// Selecting words (or clicking a highlight) shouldn't tick the item off.
document.addEventListener('click', e => {
  if (hlNoClick) { hlNoClick = false; if (e.target.closest && e.target.closest('label')) { e.preventDefault(); e.stopPropagation(); return; } }
  const mark = e.target.closest && e.target.closest('mark.hl');
  if (mark) {
    e.preventDefault(); e.stopPropagation();
    const [kind, ...rest] = mark.closest('.txt').dataset.hl.split(':');
    hlShow(mark.getBoundingClientRect(), 'Remove highlight', { remove: { kind, id: rest.join(':'), range: mark.dataset.r.split('-').map(Number) } });
    return;
  }
  const txt = e.target.closest && e.target.closest('.txt[data-hl]');
  if (txt && EDITABLE.includes(txt.dataset.hl.split(':')[0])) {
    e.preventDefault(); e.stopPropagation();
    S.editItem = txt.dataset.hl; S.editFocus = true; render();
    return;
  }
  // On those items only the circle checks it off (not the rest of the row).
  if (e.target.closest && e.target.closest('.ro-label') && !e.target.matches('input')) { e.preventDefault(); return; }
  const lab = e.target.closest && e.target.closest('label');
  const own = lab && lab.querySelector('.txt[data-hl], .txt-edit');
  if (own && !e.target.matches('input') && EDITABLE.includes((own.dataset.hl || own.dataset.edit).split(':')[0])) { e.preventDefault(); e.stopPropagation(); }
}, true);
async function saveEdit(el) {
  const [kind, ...rest] = el.dataset.edit.split(':'), id = rest.join(':');
  const text = el.value.trim(), old = hlItem(kind, id).text;
  delete S.drafts[el.id]; S.editItem = null;
  if (text && text !== old) {
    await Store.set(itemPath(kind, id), { text });
  }
  render();
}
addEventListener('scroll', hlHide, true);
addEventListener('scroll', e => { const t = e.target; if (t && t.dataset && t.dataset.notes) { const b = document.querySelector(`[data-back="${t.id}"]`); if (b) b.scrollTop = t.scrollTop; } }, true);

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
      if (kind === 'todo' && isBinderItem(t.text)) open = `<button class="btn tiny" data-act="binderOpen" data-id="${t.id}">Print · ${attending().length}</button>`;
      if (kind === 'todo' && isBinderList(t.text)) open = `<button class="eye" data-act="binderList" title="What goes in each binder" aria-label="What goes in each binder">${ICONS.list}</button>`;
      // Ship student shirts: Print Packet and Shipping File as icons (names on hover), so it all fits on one row.
      if (kind === 'ctodo' && isShirtItem(t.text)) open = `<span class="ship-btns"><button class="eye" data-act="packetOpen" title="Print Packet" aria-label="Print Packet">${PRINTER}</button>`
        + `<button class="eye" data-act="shipOpen" title="Shipping File" aria-label="Shipping File">${FILE_DOWN}</button>`
        + `<a class="eye pirate-link" href="${PIRATE_SHIP_URL}" target="_blank" rel="noopener" data-chrome title="Pirate Ship ↗" aria-label="Pirate Ship (opens in Chrome)">${PIRATE}${ARROW_OUT}</a></span>`;
      if (kind === 'ctodo' && t.roster) open = rosterBtn(t);
      if (bag) {
        const inUse = bagsInUse(), ok = inUse.filter(b => bagDone(t.day ?? 1, b)).length;
        open = `<button class="btn tiny" data-act="openBag" data-d="${t.day ?? 1}">${compact ? ok + '/' + inUse.length : 'Open · ' + ok + '/' + inUse.length + ' bags'}</button>`;
      }
      return `<li class="${done ? 'done' : ''}" draggable="true" data-drag="item" data-id="${t.id}">
      <label>${circle(done, `data-act="todo" data-id="${t.id}"`)}<span>${t.roster ? rosterLabel(t) : hlTxt('todo', t.id, t.text, t.hl)}${t.rolledFrom ? ` <em class="tag-soft">unfinished · Day ${t.rolledFrom}</em>` : ''}</span></label>
      ${open}${kind === 'todo' || kind === 'ctodo' ? (compact && !dueOf(kind, t) ? '' : dueBits(kind, t, done)) : ''}${compact ? '' : `<button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button>`}
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
// Each list's eye remembers its own choice on this computer; until you click it, the
// list follows Setup → "Checked items" (shown unless you change it there).
const HIDE_KEYS = ['todo', 'shop', 'pack', 'docs', 'setup', 'next', 'upd', 'ctodo'];
const hidden = k => { const v = pref('hide-' + k); return v != null ? v === '1' : !!(S.settings && S.settings.hideCheckedDefault); };
const BOOK = '<svg viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5c-.8 0-1.5.7-1.5 1.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5.7 1.5 1.5z"/><path d="M4 20.5V5.5M20 20.5V5.5"/></svg>';
const RESET = '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.8h3.8"/></svg>';
const SHEET = '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 12.5l2 2 4-4.5"/></svg>';
const EYE = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
// Pirate Ship's skull and crossbones (in our thin-line style), and a small ↗ for "opens a website".
const PIRATE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4.6"/><path d="M5.5 13.8l13 6.4M18.5 13.8l-13 6.4"/><circle cx="4.6" cy="13.4" r="1.1"/><circle cx="19.4" cy="13.4" r="1.1"/><circle cx="4.6" cy="20.6" r="1.1"/><circle cx="19.4" cy="20.6" r="1.1"/></svg>';
const ARROW_OUT = '<svg class="arrow-out" viewBox="0 0 24 24"><path d="M8 16L16 8M9.5 8H16v6.5"/></svg>';
const FILE_DOWN = '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/></svg>';
const PRINTER = '<svg viewBox="0 0 24 24"><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>';
const hideToggle = k => { const h = hidden(k), label = h ? 'Show checked' : 'Hide checked';
  return `<button class="eye ${h ? 'off' : ''}" data-act="hideDone" data-k="${k}" title="${label}" aria-label="${label}">${h ? EYE_OFF : EYE}</button>`; };

function notesArea(n, placeholder) {
  const id = 'notes-' + n;
  // Until the day's notes are typed in, they start from Setup → Day Templates.
  const saved = S.days[n] && S.days[n].notes;
  const val = S.drafts[id] ?? (saved !== undefined ? saved : (cfg().dayNotes[n] || ''));
  // Highlights: a layer behind the (see-through) typing box draws them under the words.
  return `<div class="notes-wrap"><div class="notes-back" aria-hidden="true" data-back="${id}">${notesBack(val, notesHl(n))}</div>
    <textarea id="${id}" class="lined" data-draft="${id}" data-notes="${n}" rows="6" placeholder="${placeholder}">${esc(val)}</textarea></div>`;
}
// Notes highlights are saved like list items' (the highlighted words), on days/{n}.hl.
const notesHl = n => (S.days[n] && S.days[n].hl) || [];
function notesBack(text, phrases) {
  let html = '', at = 0;
  hlRanges(text, phrases).forEach(([a, b]) => { html += esc(text.slice(at, a)) + `<mark class="nhl">${esc(text.slice(a, b))}</mark>`; at = b; });
  return html + esc(text.slice(at)) + '\n '; // the extra line keeps it as tall as the typing box
}
function syncBack(t) {
  const back = document.querySelector(`[data-back="${t.id}"]`);
  if (!back) return;
  back.innerHTML = notesBack(t.value, notesHl(noteDay(t.dataset.notes)));
  back.scrollTop = t.scrollTop;
}

/* ---------- Course page ---------- */
function courseView() {
  if (!S.sheet) return loadingView();
  // Setup Checklist not done yet but an orientation roster is waiting: Course To-Do sits on top of the
  // checklist's column, as tall as its items, and the checklist scrolls in what's left (all on one screen).
  const waiting = !setupComplete() && hasRosterTodos();
  let layout = cfg().layout;
  if (waiting) {
    layout = layout.map(col => col.filter(b => b !== 'ctodo'));
    const col = layout.find(c => c.includes('setup')) || layout[layout.length - 1];
    col.splice(Math.max(0, col.indexOf('setup')), 0, 'ctodo');
  }
  return `<div class="board course-board ${setupComplete() ? 'setup-done' : ''} ${waiting ? 'roster-waiting' : ''}">
    ${layout.map((col, i) => `<div class="board-col" data-drop="boxes" data-col="${i}">${col.map(b => box(b, 'course')).join('')}</div>`).join('')}
  </div>`;
}
const nextCohort = (key = S.cohortKey) => {
  const me = cohortRank(key);
  if (me == null) return null;
  return S.cohorts.map(c => ({ ...c, r: cohortRank(c.key) })).filter(c => c.r != null && c.r > me).sort((a, b) => a.r - b.r)[0] || null;
};
// Course Details: the status pill on the left of the header; clicking it opens a menu to change it.
const STATUS_HELP = { Upcoming: 'Not started. Students can’t log in yet.', Active: 'Students can log in to the Student Hub.',
  Former: 'Only the Resources tab in the Student Hub; its folder moves to Former Cohorts.' };
function statusMenu() {
  const st = S.sheet.status || '';
  return `<span class="status-wrap"><button class="status-pill ${slug(st)}" data-act="statusMenu" title="Change the status" aria-haspopup="true" aria-expanded="${!!S.statusMenu}">${esc(st || 'Unknown')}</button>
    ${S.statusMenu ? `<div class="status-menu" role="menu">${Object.keys(STATUS_HELP).map(x => x === st
      ? `<div class="status-opt on"><b>${x} ✓</b><span>${STATUS_HELP[x]}</span></div>`
      : `<button class="status-opt" role="menuitem" data-act="setStatus" data-k="${esc(S.cohortKey)}" data-s="${x}"><b>${x}</b><span>${STATUS_HELP[x]}</span></button>`).join('')}
      ${isTestCohort(S.cohortKey) ? `<button class="status-opt reset-opt" role="menuitem" data-act="resetAsk"><b>Reset test cohort</b><span>Back to brand new: clears its app data, its sheet’s rows and Course Details, and trashes its folder’s files.</span></button>` : ''}</div>` : ''}</span>`;
}
// Reset test cohort (Test/QA cohorts only; the Admin Apps Script checks again, and checks the folder and sheet names).
function resetModal() {
  const key = S.cohortKey, typed = String(S.drafts.resetName || '').trim();
  if (S.resetBusy) return `<div class="overlay"><div class="modal confirm"><div class="modal-head"><h2>Resetting ${esc(key)}…</h2></div>
    <div class="modal-body"><p class="muted">Clearing the app, the sheet and the folder. This can take a minute; the app reloads when it’s done.</p></div></div></div>`;
  return `<div class="overlay" data-act="resetCancel"><div class="modal confirm" data-stop>
    <div class="modal-head"><h2>Reset Test Cohort</h2><button class="x big" data-act="resetCancel" aria-label="Close">×</button></div>
    <div class="modal-body"><p>Reset <b>${esc(key)}</b> back to brand new?</p>
      <ul class="reset-list">
        <li><b>App:</b> all of its to-dos, checklist ticks, notes, emails sent, rosters and signatures, Academy Week days, packing and schedule. Status goes back to Upcoming.</li>
        <li><b>Its sheet:</b> every student row and the Course Details are emptied.</li>
        <li><b>Its Drive folder:</b> docs and PDFs (syllabus, schedule, Admin folder) go to the Drive trash. Other sheets keep their headers, with their rows emptied.</li>
      </ul>
      <p class="muted small">Nothing outside ${esc(key)} is touched. Type <b>${esc(key)}</b> to reset it.</p>
      <input id="resetName" class="reset-name" autocomplete="off" placeholder="${esc(key)}" value="${esc(S.drafts.resetName || '')}"></div>
    <div class="modal-foot"><button class="btn" data-act="resetCancel">Cancel</button><button class="btn primary danger" data-act="resetGo" ${typed === key ? '' : 'disabled'}>Reset</button></div>
  </div></div>`;
}
const statusBtn = (key, status) => `<button class="btn tiny" data-act="setStatus" data-k="${esc(key)}" data-s="${status}">Make ${key === S.cohortKey ? '' : esc(key) + ' '}${status}</button>`;

// Course Details box: what's in the sheet's settings box, TBD where it's blank.
function infoBox() {
  const i = cohortInfo(), st = S.sheet.status || '';
  const tbd = '<span class="tbd">TBD</span>';
  const date = v => isIsoDate(v) ? esc(longDate(v)) : v ? esc(v) : tbd;
  const days = weekDays().filter(d => d.iso);
  const aw = days.length ? esc(longDate(days[0].iso)) + ' – ' + esc(parseIso(days[days.length - 1].iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) : date(i.academyStart);
  const meet = i.meet ? `<a href="${esc(/^https?:/i.test(i.meet) ? i.meet : 'https://' + i.meet)}" target="_blank" rel="noopener">${esc(i.meet.replace(/^https?:\/\//i, ''))}</a>` : tbd;
  const rev = (i.reviews || []).map(v => isIsoDate(v) ? shortDate(v) : v);
  const upcoming = (i.reviews || []).filter(v => isIsoDate(v) && v >= todayIso());
  // Enrolled includes paused students. Dropped = Blocked in the sheet + Not attending / Dropped · Day N in the app (not counted as enrolled).
  const list = attending(), paused = list.filter(x => /paused/i.test(x.status)).length;
  const dropped = students().filter(x => x.out).length + S.sheet.students.filter(x => /^blocked$/i.test(x.status)).length;
  const row = (label, val) => `<div class="info-row"><span>${label}</span><b>${val}</b></div>`;
  return `<div class="info-rows">
    ${row('Orientation', date(i.firstDay))}
    ${row('Full CPR course', date(i.cpr))}
    ${row('Academy Week', aw)}
    ${row('JBL course code', i.jbl ? esc(i.jbl) : tbd)}
    ${row('Google Meet', meet)}
    ${row('Review sessions', rev.length ? `<details><summary>${rev.length} date${rev.length === 1 ? '' : 's'}${upcoming.length ? ' · next ' + shortDate(upcoming[0]) : ''}</summary><span class="muted small">${esc(rev.join(', '))}</span></details>` : tbd)}
    ${row('VAOEMS Course No.', i.courseNos ? esc(courseNoText(i.courseNos)) : tbd)}
    ${row('Students', `<button class="cell-link info-go" data-act="view" data-v="students" title="Open the Students page">${list.length} enrolled${paused ? ` · ${paused} paused` : ''}${dropped ? ` · ${dropped} dropped` : ''}</button>`)}
  </div>
  <div class="info-links">
    ${S.sheet.folderUrl ? `<a class="btn small" href="${esc(S.sheet.folderUrl)}" target="_blank" rel="noopener" data-name="${esc(S.cohortKey)} Folder">Cohort folder ↗</a>` : ''}
    ${S.sheet.sheetUrl ? `<a class="btn small" href="${esc(S.sheet.sheetUrl)}" target="_blank" rel="noopener" data-name="${esc(S.cohortKey)} Sheet">Cohort sheet ↗</a>` : ''}
  </div>`;
}

// Setup items the app can check from the sheets: in the config sheet, settings box filled in,
// the previous cohort flipped to Former, this one flipped to Active, how many have enrolled.
function setupAuto(text) {
  const out = { done: null, note: '', btn: '' };
  const i = cohortInfo(), st = S.sheet.status || '';
  if (/config sheet/i.test(text) && /^\s*add\b/i.test(text) && !/student/i.test(text)) out.done = true;
  else if (/cohort sheet/i.test(text) && /(meet|jbl|dates)/i.test(text)) {
    const missing = [!isIsoDate(i.firstDay) && 'first day', !isIsoDate(i.academyStart) && 'Academy Week start', !i.meet && 'Meet link', !i.jbl && 'JBL code'].filter(Boolean);
    out.done = !missing.length;
    if (missing.length) out.note = ` <em class="tag-soft">missing: ${missing.join(', ')}</em>`;
  } else if (/former/i.test(text)) {
    const prev = prevCohort();
    if (prev) {
      out.done = /former/i.test(prev.status);
      if (!out.done) out.btn = statusBtn(prev.key, 'Former');
    }
  } else if (/active/i.test(text) && /(upcoming|flip|this)/i.test(text)) {
    out.done = /active/i.test(st);
    if (!out.done && st) out.btn = statusBtn(S.cohortKey, 'Active');
  } else if (/vaoems/i.test(text) && /register/i.test(text)) { // the course # goes in AF4 (Course Details)
    if (i.courseNo) { out.done = true; out.note = ` <em class="tag-soft">${esc(courseNoText(i.courseNos))}</em>`; }
    else out.btn = '<button class="btn tiny" data-act="courseNoOpen">Enter Course No.</button>';
  } else if (/as they enroll|student information/i.test(text)) {
    const n = attending().length;
    out.note = ` <em class="tag-soft">${n} enrolled</em>`;
  }
  return out;
}
// Every Setup Checklist item checked off. The previous cohort's changes don't hold it open:
// any still unchecked move to the Course To-Do.
function setupComplete() {
  // Until the cohort list, the previous cohort's changes and the checklist itself have loaded, it's what it
  // was last time on this device (remembered per cohort), so a refresh doesn't show the list and then fold it.
  const key = 'setupDone-' + S.cohortKey;
  const all = S.sheet ? itemsFor(SETUP, 'setup').filter(t => !t.heading) : [];
  if (!S.sheet || !S.cohortsLoaded || !prevReady || !all.length) return pref(key) === '1';
  const done = all.every(t => t.done || setupAuto(t.text).done === true);
  if (pref(key) !== (done ? '1' : '0')) pref(key, done ? '1' : '0');
  return done;
}
function setupList() {
  const items = itemsFor(SETUP, 'setup');
  return `<ul class="checks drop-list setup-list ${items.length ? '' : 'is-empty'}" data-drop="items" data-day="${SETUP}" data-kind="setup">
    ${items.map(t => {
      if (t.heading) return `<li class="sec-head" draggable="true" data-drag="item" data-id="${t.id}">${hlTxt('todo', t.id, t.text, t.hl)}<button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button></li>`;
      const auto = setupAuto(t.text), done = auto.done === true || t.done;
      const box = auto.done === true ? circle(true, 'disabled title="Checked automatically from the Google Sheet"') : circle(done, `data-act="todo" data-id="${t.id}"`);
      return `<li class="${done ? 'done' : ''}" draggable="true" data-drag="item" data-id="${t.id}">
        <label>${box}<span>${hlTxt('todo', t.id, t.text, t.hl)}${auto.note}</span></label>${auto.btn}${S.sheet.folderUrl ? setupDocBtn(t.text) : ''}${dueBits('setup', t, done)}
        <button class="x" data-act="delTodo" data-id="${t.id}" aria-label="Delete">×</button></li>`;
    }).join('') || '<li class="empty">Nothing yet.</li>'}
  </ul>`;
}
// The previous cohort's "Do before next cohort" list (checking one off here checks it off there too).
function prevChanges() {
  if (!prevFor || !S.prevTodos.length) return '';
  const list = [...S.prevTodos].sort((a, b) => orderOf(a) - orderOf(b));
  return `<p class="mini-head">From ${esc(prevFor)}’s changes</p>
    <ul class="checks">${list.map(x => `<li class="${x.done ? 'done' : ''}"><label>${circle(x.done, `data-act="prevTodo" data-id="${x.id}"`)}<span>${hlTxt('prev', x.id, x.text, x.hl)}</span></label>${dueBits('prev', x, x.done)}
      <button class="x" data-act="prevDel" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('')}</ul>`;
}

/* ---------- Day page ---------- */
function dayView() {
  if (!S.sheet) return loadingView();
  const n = curDay();
  const today = currentWeekDay();
  const days = weekDays();
  const list = attending();
  const behind = list.filter(s => s.skill === 'behind').length;
  const fixes = list.reduce((a, s) => a + s.fixes, 0);

  return `
  <div class="sched-top">
    <span></span>
    ${dayStrip()}
    <div class="sched-more"><button class="icon-btn" data-act="view" data-v="week" title="The Week" aria-label="The Week">${ICONS.week}</button></div>
  </div>
  ${!S.sheet.academyStart ? '<p class="muted small center">Tip: fill in “Academy Week Start” on the cohort’s Student Roster tab (cell AG8) and the app will open on the right day by itself.</p>' : ''}
  ${behind || fixes ? `<div class="pills">
    ${behind ? `<button class="pill" data-act="goStudents" data-f="behind">${behind} behind on skills</button>` : ''}
    ${fixes ? `<button class="pill" data-act="goStudents" data-f="fixes">${fixes} contact${fixes === 1 ? '' : 's'} waiting on fixes</button>` : ''}
  </div>` : ''}
  <div class="board ${cfg().board.wide ? 'wide' : ''} ${cfg().board.wideLeft ? 'wide-left final-board' : ''} ${n === PREP ? 'prep-board' : ''}">
    ${cfg().layout.map((col, i) => `<div class="board-col" data-drop="boxes" data-col="${i}">${col.map(b => box(b, n)).join('')}</div>`).join('')}
  </div>`;
}

const BAG = '<svg viewBox="0 0 24 24"><rect x="4" y="7.5" width="16" height="12.5" rx="2.5"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5M4 12.5h16"/></svg>';
const DONE_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/></svg>';
// The Day page strip has Prep and Finalize at either end; the Schedule page's doesn't.
function dayStrip({ phases = true } = {}) {
  const n = phases ? curDay() : schedDay(), today = currentWeekDay();
  const days = weekDays();
  const phase = (p, top) => `<button class="phase ${p === FINAL ? 'final' : ''} ${n === p ? 'on' : ''} ${phaseDay() === p ? 'today' : ''}" data-act="day" data-n="${p}">
      <small>${top}</small><b>${dayName(p)}</b><small class="phase-ico">${p === PREP ? BAG : DONE_ICON}</small></button>`; // small icon where the day tiles have a date
  return `<div class="daystrip">
    ${phases ? phase(PREP, 'Before') : ''}
    ${days.map(x => `<button class="${x.n === n ? 'on' : ''} ${x.n === today ? 'today' : ''}" data-act="day" data-n="${x.n}">
      <small>${esc(x.label || 'Day')}</small><b>${x.n}</b><small>${x.iso ? shortDate(x.iso) : ''}</small></button>`).join('')}
    ${phases ? phase(FINAL, 'After') : ''}
  </div>`;
}

function box(b, n) {
  const shaded = (b === 'priorities' || b === 'shopping' || b === 'notes' || b === 'packing' || b === 'scenarios' || b === 'info')
    && !(b === 'notes' && n === 'course'); // the Course page's right column (Notes, Setup, Course To-Do) is cream, like Emails
  const hideKey = b === 'shopping' ? 'shop' : b === 'packing' ? 'pack' : (b === 'docs' || b === 'finalsteps') ? 'docs' : (b === 'todo' || b === 'priorities') ? 'todo'
    : b === 'setup' ? 'setup' : b === 'ctodo' ? 'ctodo' : null;
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
          <label>${circle(x.bought, `data-act="bought" data-id="${x.id}"`)}<span>${hlTxt('shop', x.id, x.text, x.hl)}${x.auto ? ' <em class="tag-soft">bag check</em>' : ''}</span></label>
          <button class="x" data-act="delShop" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing to buy.</li>'}</ul>`;
  } else if (b === 'notes') {
    body = head('Notes') + notesArea(n, n === PREP || n === FINAL || n === 'course' ? 'Notes' : 'Notes for today');
  } else if (b === 'info') {
    body = head('Course Details', `<button class="eye" data-act="infoEditOpen" title="Edit course details" aria-label="Edit course details">${ICONS.pencil}</button>`)
      .replace('<h2>', statusMenu() + '<h2>') + infoBox();
  } else if (b === 'emails') {
    body = head('Emails', `<button class="eye" data-act="emStuOpen" title="Late enrollees, extensions and who’s paid" aria-label="Student emails">${ICONS.students}</button>
      <button class="add-plus small-plus" data-act="emPickOpen" title="Draft an email" aria-label="Draft an email">+</button>`) + emailsBox();
  } else if (b === 'setup') {
    const all = itemsFor(SETUP, 'setup').filter(t => !t.heading);
    const done = all.filter(t => t.done || setupAuto(t.text).done === true).length;
    if (!setupComplete()) S.setupShow = null; // so finishing it again shrinks it again
    else if (S.setupShow !== S.cohortKey) { // all done: just a bar under Notes
      body = head(`Setup Checklist <span class="count">✓ All ${all.length} done</span>`, '<button class="link" data-act="setupShow">Show list</button>');
      return `<section class="box box-setup setup-bar" data-box-id="setup">${body}</section>`;
    }
    body = head(`Setup Checklist <span class="count">${done}/${all.length}</span>`, (all.some(t => t.done) || done ? hideToggle('setup') : '')
      + (setupComplete() ? '<button class="link" data-act="setupShow">Hide list</button>' : ''))
      + setupList() + addRow(SETUP, 'setup', '+ add item') + (setupComplete() ? '' : prevChanges());
  } else if (b === 'ctodo') {
    if (!setupComplete() && !hasRosterTodos()) return ''; // shows once the Setup Checklist is done (or an orientation roster is waiting)
    const k = 'add-ctodo-' + SETUP;
    body = head('Course To-Do', (itemsFor(SETUP, 'ctodo').some(t => t.done) ? hideToggle('ctodo') : '')
      + '<button class="add-plus small-plus" data-act="chAdd" data-k="ctodo" title="Add a to-do" aria-label="Add a to-do">+</button>')
      + (S.changesAdd === 'ctodo' ? `<div class="add-row"><input id="${k}" data-draft="${k}" data-add="ctodo" data-day="${SETUP}" data-chadd="ctodo" placeholder="Type a to-do, then Enter" value="${esc(S.drafts[k] || '')}"></div>` : '')
      + itemList(SETUP, 'ctodo') + prevChanges();
  } else if (b === 'docs') {
    const all = docItems(), done = all.filter(x => x.on).length;
    const list = sec => `<ul class="checks">${docItems(sec).map(x => `<li class="${x.on ? 'done' : ''}">
      <label>${circle(x.on, `data-act="doc" data-id="${x.id}"`)}<span>${hlTxt('doc', x.id, x.text, x.hl)}</span></label></li>`).join('')}</ul>`;
    body = head(`Documentation Checklist <span class="count">${done}/${all.length}</span>`,
      (done ? hideToggle('docs') : '') + `<button class="eye" data-act="printDocs" title="Print the checklist" aria-label="Print the checklist">${PRINTER}</button>`)
      + `<p class="docs-sub">2 copies of each: External hard drive and Admin Google Drive<br><em>Note: physical copies received at Academy Week stay in Course Binder</em></p>
      <div class="docs-grid">
        <div><p class="mini-head">Records for the Class</p>${list('class')}</div>
        <div><p class="mini-head">Records for <em>each</em> Student</p>${list('student')}
          <p class="docs-skills">The following skills sheets: <span>(physical copies only)</span></p>${list('skills')}</div>
      </div>`;
  } else if (b === 'finalsteps') {
    const all = docItems('final'), done = all.filter(x => x.on).length;
    body = head(`Final Steps <span class="count">${done}/${all.length}</span>`, done ? hideToggle('docs') : '')
      + `<ul class="checks">${all.map(x => `<li class="${x.on ? 'done' : ''}">
        <label>${circle(x.on, `data-act="doc" data-id="${x.id}"`)}<span>${hlTxt('doc', x.id, x.text, x.hl)}</span></label></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>`;
  } else if (b === 'scenarios') {
    body = head('Academy Week Scenarios', `<button class="eye" data-act="libOpen" title="Scenario Library" aria-label="Scenario Library">${BOOK}</button>`) + scenBox();
  } else if (b === 'packing') {
    // Unpacked first; packed ones drop to the bottom (or hide).
    const byOrder = (a, c) => orderOf(a) - orderOf(c);
    const list = [...S.packing.filter(x => !x.packed).sort(byOrder), ...S.packing.filter(x => x.packed).sort(byOrder)];
    body = head('Packing List', list.some(x => x.packed) ? hideToggle('pack') : '')
      + `<div class="add-row"><input id="packIn" data-draft="pack" data-add="pack" placeholder="+ add item" value="${esc(S.drafts.pack || '')}"></div>`
      + `<ul class="checks">${list.map(x => `<li class="${x.packed ? 'done' : ''}">
          <label>${circle(x.packed, `data-act="packed" data-id="${x.id}"`)}<span>${hlTxt('pack', x.id, x.text, x.hl)}</span></label>
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
      ${stationScen(n, i, st)}
    </div>`).join('');

  // Squads: pick students from the roster into Team A / Team B.
  const names = attending().map(s => s.name);
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
        <button class="menu-item" data-act="libOpen">Scenario Library</button>
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
// The link stops working 7 days after Day 5 (Firebase refuses to open it after that).
// A link made later than that still gets 7 days from when it was made.
function shareExpires() {
  const days = weekDays().filter(d => d.iso);
  if (!days.length) return null;
  const end = parseIso(days[days.length - 1].iso); end.setDate(end.getDate() + 7); end.setHours(23, 59, 59, 0);
  const made = S.cohortDoc && S.cohortDoc.shareMade;
  if (made) { const m = new Date(made); m.setDate(m.getDate() + 7); m.setHours(23, 59, 59, 0); if (m > end) return m; }
  return end;
}
async function publish() {
  const token = S.cohortDoc && S.cohortDoc.shareToken;
  if (!token || !S.sheet) return;
  const days = {};
  // Stations carry links to their scenario Docs (shown on the instructor link, not on paper).
  const lib = libById();
  weekDays().forEach(d => {
    const day = printDay(d.n);
    day.stations = day.stations.map(st => ({ topic: st.topic, content: st.content,
      links: (st.scen || []).filter(id => lib[id]).map(id => ({ name: lib[id].name, url: lib[id].url })) }));
    days[d.n] = { ...day, iso: d.iso || '' };
  });
  await Store.set('shared/' + token, { cohort: S.cohortKey, updated: Date.now(), expires: shareExpires(), days }, false);
}
// On opening a cohort: an expired link's shared copy (with student names) is deleted;
// otherwise it's refreshed so it carries its expiry date.
let housekeptFor = null;
async function shareHousekeeping() {
  const key = S.cohortKey;
  if (housekeptFor === key || !S.cohortDoc || !S.cohortDoc.shareToken || !Store.configured) return;
  housekeptFor = key;
  const exp = shareExpires();
  try {
    if (exp && exp < new Date()) {
      await Store.del('shared/' + S.cohortDoc.shareToken);
      await Store.set('cohorts/' + key, { shareToken: null });
    } else publishSoon();
  } catch (e) { console.warn('Instructor link check:', e.message); }
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
            <a class="btn" href="${esc(shareUrl(token))}" target="_blank" rel="noopener" data-name="Instructor Schedule">Open it</a>
          </div>
          <p class="muted small">Anyone with this link can see the schedule, including squad names. The QR code is also printed on each Day page.${shareExpires() ? ` <b>It works until ${shareExpires().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b>, then shuts off by itself.` : ''}</p>
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

/* ---------- Date picker (our own, so it matches the app instead of Chrome's) ---------- */
// The picked date is kept in S.drafts[key] as YYYY-MM-DD (today until you pick one).
const CAL_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10.5h16"/></svg>';
// optional: starts empty (shows `empty`, or "Not set") and gets a Clear link, for dates that may not be known yet.
// Review session dates (key ending in rev-new) use a bigger calendar in the middle of the
// screen where you tap as many days as you like, then Done.
const multiForm = key => { const m = key.match(/^(ie-|nc-)rev-new$/); return m ? courseForm(m[1]) : null; };
// title: the calendar opens in the middle of the screen with that heading (used in pop-ups,
// where a calendar under the field would be cut off at the bottom).
// The calendar's month line; clicking "May 2026" switches to the 12 months with ‹ year › to jump far.
function dpHead(first) {
  const yearMode = S.datePick && S.datePick.years;
  return `<div class="dp-head"><button type="button" class="x" data-act="${yearMode ? 'dpYear' : 'dpMonth'}" data-dir="-1" aria-label="${yearMode ? 'Previous year' : 'Previous month'}">‹</button>
    <button type="button" class="dp-jump" data-act="dpYears" title="${yearMode ? 'Back to the days' : 'Pick a month and year'}">${yearMode ? first.getFullYear() : first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</button>
    <button type="button" class="x" data-act="${yearMode ? 'dpYear' : 'dpMonth'}" data-dir="1" aria-label="${yearMode ? 'Next year' : 'Next month'}">›</button></div>`;
}
function dpMonths(first) {
  const y = first.getFullYear(), now = new Date();
  return `<div class="dp-months">${Array.from({ length: 12 }, (_, m) => `<button type="button" class="${m === first.getMonth() ? 'on' : ''} ${y === now.getFullYear() && m === now.getMonth() ? 'today' : ''}" data-act="dpMonthPick" data-m="${m}">${new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' })}</button>`).join('')}</div>`;
}
function datePicker(key, { optional = false, empty = 'Not set', title = '' } = {}) {
  const multi = multiForm(key);
  const value = S.drafts[key] || (optional ? '' : todayIso());
  const d = value ? parseIso(value) : null;
  const label = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) : empty;
  const open = S.datePick && S.datePick.key === key;
  let cal = '';
  if (open) {
    const [y, m] = S.datePick.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const cells = Array.from({ length: first.getDay() }, () => '<span></span>');
    for (let i = 1; i <= days; i++) {
      const iso = isoOf(new Date(y, m - 1, i));
      const on = multi ? multi.reviews.includes(iso) : iso === value;
      cells.push(`<button type="button" class="${on ? 'on' : ''} ${iso === todayIso() ? 'today' : ''}" data-act="${multi ? 'dpToggle' : 'dpPick'}" data-k="${key}" data-iso="${iso}">${i}</button>`);
    }
    if (multi) {
      const n = multi.reviews.length;
      cal = `<div class="dp-pop dp-multi">
        <p class="dp-title">Review sessions <span>tap every date, then Done</span></p>
        ${dpHead(first)}
        ${S.datePick.years ? dpMonths(first) : `<div class="dp-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<i>${x}</i>`).join('')}${cells.join('')}</div>`}
        <div class="dp-multi-foot"><span class="muted small">${n} date${n === 1 ? '' : 's'} picked</span><button type="button" class="btn primary small" data-act="dpDone">Done</button></div>
      </div>`;
      return `<span class="dp"><button type="button" class="date-btn empty ${open ? 'on' : ''}" data-act="dpOpen" data-k="${key}">${CAL_ICON}<span>${n ? 'Add or remove dates' : empty}</span></button>${cal}</span>`;
    }
    cal = `<div class="dp-pop ${title ? 'dp-center' : ''}">${title ? `<p class="dp-title">${esc(title)}</p>` : ''}
      ${dpHead(first)}
      ${S.datePick.years ? dpMonths(first) : `<div class="dp-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<i>${x}</i>`).join('')}${cells.join('')}</div>`}
      <div class="dp-foot"><button type="button" class="link" data-act="dpPick" data-k="${key}" data-iso="${todayIso()}">Today</button>
        ${optional && value ? `<button type="button" class="link" data-act="dpClear" data-k="${key}">Clear</button>` : ''}</div>
    </div>`;
  }
  if (multi) {
    const n = multi.reviews.length;
    return `<span class="dp"><button type="button" class="date-btn empty" data-act="dpOpen" data-k="${key}">${CAL_ICON}<span>${n ? 'Add or remove dates' : empty}</span></button></span>`;
  }
  return `<span class="dp"><button type="button" class="date-btn ${open ? 'on' : ''} ${value ? '' : 'empty'}" data-act="dpOpen" data-k="${key}">${CAL_ICON}<span>${label}</span></button>${cal}</span>`;
}

/* ---------- Documentation Checklist (Finalize page) ---------- */
// Items come from Setup → Day Templates → Finalize; checks are per cohort in cohorts/{key}.docChecks.
const DOC_SECTIONS = ['class', 'student', 'skills', 'final'];
function docItems(sec) {
  const checks = (S.cohortDoc && S.cohortDoc.docChecks) || {};
  const hl = (S.cohortDoc && S.cohortDoc.docHl) || {};
  return (sec ? [sec] : DOC_SECTIONS).flatMap(k => (cfg().docs[k] || []).map(text => {
    const id = k + '-' + slug(text);
    return { id, text, on: !!checks[id], hl: hl[id] };
  }));
}
// One page like the PDF, with whatever is already checked printed as checked.
function docPageHtml() {
  const box = x => `<li><span class="d-box">${x.on ? '✓' : ''}</span><span>${esc(x.text)}</span></li>`;
  const list = sec => `<ul>${docItems(sec).map(box).join('')}</ul>`;
  return `<section class="d-page">
    <h1>${esc(S.cohortKey)} Documentation Checklist</h1>
    <p class="d-sub">2 copies of each - External hard drive and Admin Google Drive<br><em>Note: physical copies received at Academy Week stay in Course Binder</em></p>
    <table class="d-table"><tr>
      <td><h2>Records for the Class</h2>${list('class')}</td>
      <td><h2>Records for <em>each</em> Student</h2>${list('student')}
        <p class="d-skills">The following skills sheets:<br>(physical copies only)</p>${list('skills')}</td>
    </tr></table>
    <h2 class="d-final">Final Steps</h2>${list('final')}
  </section>`;
}
function printDocs() {
  document.getElementById('print-root').innerHTML = docPageHtml();
  window.print();
}

/* ---------- Binder covers (from a "binder cover" to-do) ---------- */
// One page per attending student: first name, last name bigger under it, laptop logo.
function coverName(name) {
  const nick = (name.match(/\(([^)]+)\)/) || [])[1];
  const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  let first, last;
  if (clean.includes(',')) { [last, first] = clean.split(',').map(x => x.trim()); }
  else { const w = clean.split(/\s+/); last = w.pop(); first = w.join(' '); }
  return { first: nick || first, last };
}
// Shrink a long name so it stays on one line (about 7.5 inches across).
const fitPt = (text, base) => Math.min(base, Math.floor(540 / (Math.max(1, text.length) * 0.6)));
function coverHtml(s) {
  const { first, last } = coverName(s.name);
  return `<section class="b-page">
    <p class="b-first" style="font-size:${fitPt(first, 36)}pt">${esc(first)}</p>
    <p class="b-last" style="font-size:${fitPt(last, 66)}pt">${esc(last)}</p>
    <img class="b-logo" src="logo-full.png" alt="Elevate EMS">
  </section>`;
}
function binderModal() {
  const list = students(), count = list.filter(s => !s.out).length;
  return `<div class="overlay" data-act="binderClose"><div class="modal binder" data-stop>
    <div class="modal-head"><h2>Binder Covers</h2><button class="x big" data-act="binderClose" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p class="muted small">Uncheck anyone who isn’t coming to academy week. They stay on the roster (the sheet isn’t changed), but they’re left off the covers, squads and counts.</p>
      <div class="binder-list">${list.map(s => `<label class="${s.out ? 'off' : ''}">${circle(!s.out, `data-act="attend" data-sid="${s.sid}"`)}<span>${esc(s.name)}</span></label>`).join('')}</div>
    </div>
    <div class="modal-foot"><span class="muted small">${count} cover${count === 1 ? '' : 's'}, one page each</span>
      <button class="btn primary" data-act="binderPrint" ${count ? '' : 'disabled'}>Print ${count} cover${count === 1 ? '' : 's'}</button></div>
  </div></div>`;
}
// What goes in each binder: a plain list, opened from the icon on a "Prepare binders" to-do.
function binderListModal() {
  return `<div class="overlay" data-act="binderListClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Binder Paperwork</h2><button class="x big" data-act="binderListClose" aria-label="Close">×</button></div>
    <div class="modal-body"><ul class="plain-list">${cfg().binder.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="modal-foot"><span class="muted small">Change this list in Setup → Templates → Prep.</span></div>
  </div></div>`;
}

// + New cohort (cohort menu): added to the config sheet, and the Student Hub makes its folder and sheets.
function newCohortModal() {
  const nc = S.newCohort;
  return `<div class="overlay" data-act="newCohortClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>New Cohort</h2>${nc.busy ? '' : '<button class="x big" data-act="newCohortClose" aria-label="Close">×</button>'}</div>
    <div class="modal-body pad-top" data-keep-scroll="newCohort">
      <label class="field">Type it the way you would in the config sheet
        <input id="newCohortIn" data-draft="newCohort" data-add="newcohort" placeholder="e.g. Spring 2026" value="${esc(S.drafts.newCohort || '')}" ${nc.busy ? 'disabled' : ''} autocomplete="off"></label>
      <p class="muted small">This adds it to the config sheet, and the Student Hub makes its folder, Ride Along Agreements, Clinical Tracking and Student Roster sheets, the same as typing it into the sheet yourself (which still works too). It starts as <b>Upcoming</b>, so students can’t log in until you make it Active.</p>
      <p class="mini-head">Course details <span class="count">optional · go into its sheet</span></p>
      ${courseFields('nc-', nc)}
      ${nc.err ? `<div class="alert">${esc(nc.err)}</div>` : ''}
    </div>
    <div class="modal-foot">${nc.busy ? '<span class="muted small">Making the folder and sheets… this can take up to a minute.</span>' : ''}
      <button class="btn primary" data-act="newCohortCreate" ${nc.busy ? 'disabled' : ''}>${nc.busy ? 'Creating…' : 'Create cohort'}</button></div>
  </div></div>`;
}

// Course details: the cohort sheet's settings box (AG5:AG34), typed here instead of in the sheet.
// prefix = 'ie-' (Course Details pencil) or 'nc-' (New Cohort); form.reviews = review dates (yyyy-MM-dd).
// courseNos: the VAOEMS course # (AF4), and " / " the late one (AG4) when the state assigns a second.
// Kept as plain numbers in the sheet; shown with a # in front of each: "#242999 / #8375636".
const plainCourseNos = v => String(v || '').split('/').map(x => x.replace(/#/g, '').trim()).filter(Boolean).join(' / ');
const courseNoText = v => plainCourseNos(v).split(' / ').filter(Boolean).map(x => '#' + x).join(' / ');
const COURSE_FIELDS = [['firstDay', 'Orientation', 'date'], ['cpr', 'Full CPR course', 'date'], ['academyStart', 'Academy Week start', 'date'],
  ['jbl', 'JBL course code', 'text'], ['meet', 'Google Meet link', 'text'], ['courseNos', 'VAOEMS Course No.', 'text']];
function courseFields(prefix, form) {
  const dis = form.busy ? 'disabled' : '';
  // (the course # box comes after Review sessions, the same order as the Course Details box)
  const field = ([k, label, type]) => `<div class="cf-row"><span>${label}</span>${type === 'date'
      ? datePicker(prefix + k, { optional: true, title: label })
      : `<input id="${prefix + k}" data-draft="${prefix + k}" value="${esc(S.drafts[prefix + k] || '')}" placeholder="${k === 'meet' ? 'meet.google.com/…' : k === 'courseNos' ? 'e.g. 242999 (late one: 242999 / 8375636)' : ''}" autocomplete="off" ${dis}>`}</div>`;
  return `<div class="course-fields">
    ${COURSE_FIELDS.filter(([k]) => k !== 'courseNos').map(field).join('')}
    <div class="cf-row cf-top"><span>Review sessions</span><div class="rev-dates">
      ${form.reviews.map(iso => `<span class="name-chip">${shortDate(iso)}<button class="x" data-act="revDel" data-f="${prefix}" data-iso="${iso}" aria-label="Remove">×</button></span>`).join('')}
      ${datePicker(prefix + 'rev-new', { optional: true, empty: '+ add a date' })}</div></div>
    ${COURSE_FIELDS.filter(([k]) => k === 'courseNos').map(field).join('')}
  </div>`;
}
const courseForm = prefix => prefix === 'ie-' ? S.infoEdit : S.newCohort;
// What's been typed, as the sheet wants it (blank = clear / TBD).
function courseValues(prefix) {
  const out = {};
  COURSE_FIELDS.forEach(([k]) => { out[k] = String(S.drafts[prefix + k] || '').trim(); });
  out.courseNos = plainCourseNos(out.courseNos); // (a typed # isn't saved: the sheet keeps the plain number)
  out.reviews = [...courseForm(prefix).reviews];
  return out;
}
const clearCourseDrafts = prefix => COURSE_FIELDS.forEach(([k]) => delete S.drafts[prefix + k]);

function infoEditModal() {
  const f = S.infoEdit;
  return `<div class="overlay" data-act="infoEditClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Edit Course Details</h2>${f.busy ? '' : '<button class="x big" data-act="infoEditClose" aria-label="Close">×</button>'}</div>
    <div class="modal-body pad-top" data-keep-scroll="infoEdit">
      <p class="muted small">Saving writes these into ${esc(S.cohortKey)}’s cohort sheet (the settings box on the Student Roster tab), the same as typing them there. Students see the new dates in the Student Hub right away. Leave one blank to show TBD.</p>
      ${courseFields('ie-', f)}
      ${f.err ? `<div class="alert">${esc(f.err)}</div>` : ''}
    </div>
    <div class="modal-foot">${f.busy ? '<span class="muted small">Saving to the sheet…</span>' : ''}
      <button class="btn primary" data-act="infoEditSave" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Saving…' : 'Save to the sheet'}</button></div>
  </div></div>`;
}
// The sheet answered with its settings box: show it here and keep the Day pages' dates in step.
function applyInfo(info) {
  if (!info || !S.sheet) return;
  S.sheet = { ...S.sheet, info, academyStart: isIsoDate(info.academyStart) ? info.academyStart : '' };
  sheetCopy(S.cohortKey, S.sheet);
}

async function printBinders() {
  const root = document.getElementById('print-root');
  root.innerHTML = attending().map(coverHtml).join('');
  const img = root.querySelector('img');
  if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 3000); }); // the logo has to be loaded before printing
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
  const everyone = students();
  const all = everyone.filter(s => !s.out); // counts and "behind" leave out students not attending
  const counts = {
    all: all.length,
    behind: all.filter(s => s.skill === 'behind').length,
    fixes: all.filter(s => s.fixes).length,
  };
  const q = S.search.trim().toLowerCase();
  const shown = [...all, ...everyone.filter(s => s.out)].filter(s =>
    (S.filter === 'all' || (S.filter === 'behind' && s.skill === 'behind') || (S.filter === 'fixes' && s.fixes))
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
    <div class="chips">${chip('all', 'All')}${chip('behind', 'Behind on skills')}${chip('fixes', 'Contacts to fix')}</div>
    <div class="students-tools"><button class="eye" data-act="skillsSheet" title="Skills Tracking sheet" aria-label="Skills Tracking sheet">${SHEET}</button>
      <input id="searchIn" class="search" data-draft="search" placeholder="Find a student" value="${esc(S.search)}"></div>
  </div>
  ${skillRows.length ? `<section class="box shaded behind-card"><div class="box-head static"><h2>Behind by Skill</h2><span class="head-actions"><span class="muted small">for picking tomorrow’s scenarios</span> <button class="btn tiny" data-act="matchOpen">+ Additional Scenarios</button></span></div>
    <div class="behind-list">${skillRows.map(k => `<div><b>${esc(k)}</b> <span class="n">${bySkill[k].length}</span><span class="who">${bySkill[k].map(s => `<button class="link" data-act="openStudent" data-sid="${s.sid}">${esc(firstName(s.name))}</button>`).join(', ')}</span></div>`).join('')}</div>
  </section>` : ''}
  <section class="box table-box">
    <table class="roster">
      <thead><tr><th>#</th><th>Student</th><th class="c">Patient contacts</th><th class="c">Skills</th><th class="c">Conduct</th></tr></thead>
      <tbody>${shown.map(s => `<tr class="${s.out ? 'out' : ''}" data-act="openStudent" data-sid="${s.sid}">
        <td class="muted">${s.out ? '' : all.indexOf(s) + 1}</td>
        <td><b>${esc(s.name)}</b>${/paused/i.test(s.status) ? ' <span class="tag">Paused</span>' : ''}${s.out ? ` <span class="tag">${outLabel(s)}</span>` : ''}</td>
        <td class="c"><span class="pc-cell"><span></span>${pcStepper(s, { row: true })}${s.fixes ? `<span class="to-fix" data-part="fix" title="Open their patient contacts">To fix: ${s.fixes}</span>` : '<span></span>'}</span></td>
        <td class="c" data-part="skills"><span class="status ${s.skill}">${skillLabel[s.skill]}</span>${s.skill === 'behind' && s.behind.length ? `<span class="muted small"> ${esc(s.behind.join(', '))}</span>` : ''}</td>
        <td class="c" data-part="attendance">${s.warns ? `<span class="badge">${s.warns}</span>` : '<span class="muted">–</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty">No students match.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function firstName(name) {
  const nick = name.match(/\(([^)]+)\)/);
  if (nick) return nick[1];
  return name.includes(',') ? name.split(',')[1].trim().split(/\s+/)[0] : name.split(/\s+/)[0];
}

// On the Students page the number itself opens just their Patient Contacts.
function pcStepper(s, { row = false } = {}) {
  return `<span class="stepper ${S.pcBusy[s.sid] ? 'busy' : ''}" data-stop>
    <button data-act="pc" data-sid="${s.sid}" data-by="-1" aria-label="One less">−</button>
    <b ${row ? `class="pc-num" data-act="openStudent" data-sid="${s.sid}" data-part="contacts" title="Patient contacts"` : ''}>${s.contacts}</b>
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
  const part = S.openPart, show = p => !part || part === p || (p === 'contacts' && part === 'fix');
  // From "To fix": notes still waiting on a fix go first.
  const contacts = S.contacts.filter(c => c.sid === s.sid)
    .sort((a, b) => (part === 'fix' ? (!!(a.fixed || !a.fix) - !!(b.fixed || !b.fix)) : 0) || b.created - a.created);
  const warns = S.warnings.filter(w => w.sid === s.sid).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  const dk = k => k + '-' + s.sid;
  const note = S.drafts[dk('note')] ?? s.note;
  const allC = !!S.drafts[dk('call')]; // "All contacts" picked: a note for every contact, no number
  return `<div class="overlay side" data-act="closeStudent"><aside class="drawer" data-stop>
    <div class="drawer-head"><h2>${esc(s.name)}</h2><button class="x big" data-act="closeStudent" aria-label="Close">×</button></div>
    <div class="drawer-body" data-keep-scroll="drawer">

      ${part ? '' : `<label class="attend-line">${circle(!s.out, `data-act="attend" data-sid="${s.sid}"`)} Attending academy week
        ${s.out ? `<span class="muted small">(${outLabel(s)}: left off binder covers, squads and counts)</span>` : ''}</label>`}

      ${show('contacts') ? `<section>
        <h3>Patient Contacts</h3>
        <div class="pc-big">${pcStepper(s)}<span class="muted small">in the Google Sheet (column P)</span></div>
        <div class="log-form">
          <div class="row2">
            <label>Contact #<input id="${dk('cnum')}" data-draft="${dk('cnum')}" type="number" min="1" placeholder="#" value="${esc(allC ? '' : S.drafts[dk('cnum')] ?? '')}" ${allC ? 'disabled' : ''}></label>
            <button class="chip small ${allC ? 'on' : ''}" data-act="callToggle" data-sid="${s.sid}" title="A note about all of their contacts, not one">All contacts</button>
            <label class="grow check-inline ${allC ? 'muted' : ''}"><input type="checkbox" class="circle" id="${dk('cadd')}" ${!allC && S.drafts[dk('cadd')] !== false ? 'checked' : ''} ${allC ? 'disabled' : ''} data-act="cadd" data-sid="${s.sid}"> New simulated contact (adds 1 to their count)</label>
          </div>
          <textarea id="${dk('cfix')}" data-draft="${dk('cfix')}" rows="2" placeholder="What needs fixed?">${esc(S.drafts[dk('cfix')] || '')}</textarea>
          <button class="btn primary" data-act="logContact" data-sid="${s.sid}">Save contact</button>
        </div>
        <ul class="log">${contacts.map(c => `<li class="${c.fixed ? 'done' : ''}">
          <div><b>${c.num === 'all' ? 'All contacts' : '#' + esc(c.num)}</b> <span class="muted small">${monthDay(c.date)}</span>
            ${c.fix ? `<p>${esc(c.fix)}</p>` : '<p class="muted">No fixes needed.</p>'}</div>
          ${c.fix ? `<label class="fixed">${circle(c.fixed, `data-act="fixed" data-id="${c.id}"`)} Fixed</label>` : ''}
          <button class="x" data-act="delContact" data-id="${c.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">No contact notes yet.</li>'}</ul>
      </section>` : ''}

      ${show('skills') ? `<section>
        <h3>Skills</h3>
        <div class="seg wide">${[['on', 'On track'], ['behind', 'Behind'], ['done', 'Done']].map(([k, l]) =>
          `<button class="${s.skill === k ? 'on ' + k : ''}" data-act="skill" data-sid="${s.sid}" data-v="${k}">${l}</button>`).join('')}</div>
        ${s.skill === 'behind' ? `<p class="muted small">Tap what they’re behind on:</p>
          ${DEFAULTS.skills.map(g => `<div class="skill-group"><span>${esc(g.group)}</span><div>${g.items.map(k =>
            `<button class="chip small ${s.behind.includes(k) ? 'on warn' : ''}" data-act="behind" data-sid="${s.sid}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`).join('')}` : ''}
        <textarea id="${dk('note')}" data-draft="${dk('note')}" data-change="note" data-sid="${s.sid}" rows="2" placeholder="Skills note (optional)">${esc(note)}</textarea>
      </section>` : ''}

      ${show('attendance') ? `<section>
        <h3>Conduct</h3>
        <div class="log-form">
          <div class="row2">
            <div class="lbl">Date${datePicker(dk('wdate'))}</div>
            <label>Type<select id="${dk('wtype')}" data-draft="${dk('wtype')}">${DEFAULTS.warningTypes.map(t => `<option ${S.drafts[dk('wtype')] === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          </div>
          <textarea id="${dk('wnote')}" data-draft="${dk('wnote')}" rows="2" placeholder="What happened?">${esc(S.drafts[dk('wnote')] || '')}</textarea>
          <button class="btn primary" data-act="addWarning" data-sid="${s.sid}">Add</button>
        </div>
        <ul class="log">${warns.map(w => `<li>
          <div><span class="tag ${/warning/i.test(w.type) ? 'red' : ''}">${esc(w.type)}</span> <span class="muted small">${monthDay(w.date)}</span>
            ${w.note ? `<p>${esc(w.note)}</p>` : ''}</div>
          <button class="x" data-act="delWarning" data-id="${w.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing recorded.</li>'}</ul>
      </section>` : ''}
      ${part ? '<button class="link show-all" data-act="openAll">Show everything</button>' : ''}
    </div>
  </aside></div>`;
}

/* ---------- Settings ---------- */
function settingsView() {
  const c = cfg();
  const dv = (k, v) => esc(S.drafts[k] ?? v);
  // A tile: title, one short line, and its button (or its own control).
  const tile = (title, line, foot) => `<section class="set-tile"><h3>${title}</h3><p>${line}</p><div class="set-foot">${foot}</div></section>`;
  const open = (act, label = 'Open') => `<button class="btn primary small" data-act="${act}">${label}</button>`;
  const group = (name, tiles) => `<h2 class="set-group">${name}</h2><div class="set-grid">${tiles.join('')}</div>`;
  return `<div class="settings">
    ${group('Emails', [
      tile('Email Templates', 'What each email says, when it’s due and who it goes to.', open('emtOpen', 'Edit')),
      tile('Book Codes', `Textbook access codes, each given out once. <b>${freeCodes().length}</b> unused.`, open('bookCodesOpen')),
      tile('Quick Links', 'The icon buttons along the top of the Admin page.', open('linksEdOpen', 'Edit')),
    ])}
    ${group('Course &amp; Academy Week', [
      tile('Templates', 'Setup Checklist, repeating to-dos, packing list and daily notes.', open('tplOpen', 'Edit')),
      tile('Schedule Template', 'The Day 1–5 schedule, stations and notes each cohort starts with.', open('schTplOpen', 'Edit')),
      tile('Scenario Library', 'Your scenario Docs, the skills each covers, and sign-offs needed.', open('libOpen')),
      tile('Bag Contents', 'What goes in each jump bag pocket, for the daily bag check.', open('bagEdOpen', 'Edit')),
    ])}
    ${group('Preferences', [
      tile('Admin Page', 'What fills the right side of the Admin page. The other one is kept, just hidden.',
        `<div class="seg">${[['notes', 'Sticky Notes'], ['todo', 'To Do']].map(([v, l]) =>
          `<button class="${adminSide() === v ? 'on' : ''}" data-act="adminSide" data-v="${v}">${l}</button>`).join('')}</div>`),
      tile('Checked Items', 'Whether lists start out showing what’s checked off.',
        `<div class="seg">${[[false, 'Show'], [true, 'Hide']].map(([v, l]) =>
          `<button class="${!!(S.settings && S.settings.hideCheckedDefault) === v ? 'on' : ''}" data-act="hideDefault" data-v="${v ? 1 : 0}">${l}</button>`).join('')}</div>`),
      tile('Page Layout', 'Put every box you’ve dragged back where it started.', `<button class="btn small" data-act="resetLayout">Reset layout</button>`),
    ])}
  </div>`;
}

/* ---------- Schedule template (Setup → Schedule Template) ---------- */
// Scenario lines added from the week plan or Additional Scenarios belong to that cohort,
// so they're left out of the template (and squads never go in it).
function stripScenarios(day) {
  const lib = libById();
  return {
    blocks: (day.blocks || []).map(b => ({ time: b.time || '', activity: b.activity || '' })),
    stations: (day.stations || []).map(st => {
      const names = (st.scen || []).map(id => lib[id] && lib[id].name).filter(Boolean);
      const content = String(st.content || '').split('\n').filter(l => !names.some(nm => l.startsWith(nm + ':'))).join('\n').replace(/\s+$/, '');
      return { topic: st.topic || '', content };
    }),
    stationNote: day.stationNote || '', notes: day.notes || '',
  };
}
function schTplModal() {
  const n = S.schTplTab, d = S.schTplDraft[n];
  const id = (...p) => ['stpl', n, ...p].join('-');
  const tools = (list, i) => `<span class="row-tools"><button class="x" data-act="stplMove" data-list="${list}" data-i="${i}" data-dir="-1" title="Move up">↑</button><button class="x" data-act="stplMove" data-list="${list}" data-i="${i}" data-dir="1" title="Move down">↓</button><button class="x" data-act="stplDel" data-list="${list}" data-i="${i}" title="Remove">×</button></span>`;
  return `<div class="overlay" data-act="schTplClose"><div class="modal schtpl" data-stop>
    <div class="modal-head"><h2>Schedule Template</h2><button class="x big" data-act="schTplClose" aria-label="Close">×</button></div>
    <div class="bag-tabs">${[1, 2, 3, 4, 5].map(x => `<button class="bag-tab ${x === n ? 'on' : ''}" data-act="schTplTab" data-n="${x}">Day ${x}</button>`).join('')}</div>
    <div class="modal-body" data-keep-scroll="schtpl"><div class="sched-grid tpl-body">
      <div class="sched-col">
        <section class="box"><div class="box-head static"><h2>Class Schedule</h2><button class="add-plus" data-act="stplAdd" data-list="blocks" title="Add a time" aria-label="Add a time">+</button></div>
          <div class="sched-rows">${d.blocks.map((b, i) => `<div class="sched-row">
            <input id="${id('bt', i)}" data-stpl="blocks" data-i="${i}" data-f="time" value="${esc(b.time)}" placeholder="Time">
            <input id="${id('ba', i)}" data-stpl="blocks" data-i="${i}" data-f="activity" value="${esc(b.activity)}" placeholder="Activity">
            ${tools('blocks', i)}</div>`).join('') || '<p class="empty">No times yet.</p>'}</div>
        </section>
        <section class="box"><div class="box-head static"><h2>Instructor Notes/Reminders</h2></div>
          <textarea id="${id('notes')}" class="sched-notes" data-stpl="notes" data-grow rows="8">${esc(d.notes)}</textarea>
        </section>
      </div>
      <div class="sched-col">
        <section class="box"><div class="box-head static"><h2>Station Content</h2><button class="add-plus" data-act="stplAdd" data-list="stations" title="Add a station" aria-label="Add a station">+</button></div>
          ${d.stations.map((st, i) => `<div class="sched-station">
            <div class="sched-station-top"><input id="${id('st', i)}" data-stpl="stations" data-i="${i}" data-f="topic" value="${esc(st.topic)}" placeholder="Station topic">${tools('stations', i)}</div>
            <textarea id="${id('sc', i)}" data-stpl="stations" data-i="${i}" data-f="content" data-grow rows="2" placeholder="Content & instructor notes">${esc(st.content)}</textarea>
          </div>`).join('') || '<p class="empty">No stations this day.</p>'}
          <label class="field sched-foot">Note under the stations
            <input id="${id('sn')}" data-stpl="stationNote" value="${esc(d.stationNote)}" placeholder="e.g. Stations with two topics: split into 30 minute segments."></label>
        </section>
      </div>
    </div></div>
    <div class="modal-foot"><span class="muted small">Used for every cohort. Days a cohort has already changed keep their changes.</span>
      ${S.sheet ? `<button class="btn" data-act="saveTemplate">Use ${esc(S.cohortKey)}’s week instead</button>` : ''}
      <button class="btn primary" data-act="schTplSave">Save</button></div>
  </div></div>`;
}

/* ---------- Day Templates pop-up ---------- */
const TPL_KEYS = ['tpl-setup', 'tpl-ctodo', 'tpl-binder', 'tpl-every', 'tpl-pack', 'tpl-doc-class', 'tpl-doc-student', 'tpl-doc-skills', 'tpl-doc-final', ...ALL_DAYS.flatMap(n => ['tpl-todo-' + n, 'tpl-notes-' + n])];
function templatesModal() {
  const c = cfg(), tab = S.tplTab;
  const dv = (k, v) => esc(S.drafts[k] ?? v);
  const tabBtn = (t, label) => `<button class="bag-tab ${tab === t ? 'on' : ''}" data-act="tplTab" data-t="${t}">${label}</button>`;
  const body = tab === 'setup'
    ? `<p class="muted small">The Setup Checklist on each new cohort’s Course page. One per line; start a line with <b>#</b> to make it a heading. End a line with <b>[due 2 weeks after orientation]</b> to give it a due date (days or weeks, before or after orientation, CPR or academy week). A few items check themselves off from the Google Sheet (in the config sheet, dates/Meet link/JBL code filled in, Former/Active).</p>
       <label class="field">Course setup<textarea id="tpl-setup" data-draft="tpl-setup" rows="16">${dv('tpl-setup', c.setup.join('\n'))}</textarea></label>
       <p class="muted small">The Course To-Do shows on the Course page once the Setup Checklist is done. One per line; a <b>[due …]</b> ending works here too. Anything with “ship” and “shirt” in it gets the Print packet and Shipping file buttons.</p>
       <label class="field">Course To-Do<textarea id="tpl-ctodo" data-draft="tpl-ctodo" rows="5">${dv('tpl-ctodo', c.courseTodo.join('\n'))}</textarea></label>`
    : tab === 'every'
    ? `<p class="muted small">These go on Day 1–5’s To Do (not Prep or Finalize). One per line; a <b>[due 3 days before academy week]</b>-style ending gives one a due date. Anything with “bag check” in it opens the bag pop-up.</p>
       <label class="field">Every day<textarea id="tpl-every" data-draft="tpl-every" rows="8">${dv('tpl-every', (c.checklist.everyDay || []).join('\n'))}</textarea></label>`
    : `${tab === '6' ? '' : `<label class="field">${dayName(Number(tab))} to-dos <span class="small">(one per line${tab === '0' ? '' : ', added after the every-day ones'})</span>
         <textarea id="tpl-todo-${tab}" data-draft="tpl-todo-${tab}" rows="7">${dv('tpl-todo-' + tab, ((c.checklist.days || {})[tab] || []).join('\n'))}</textarea></label>`}
       ${tab === '0' ? `<label class="field">Packing list <span class="small">(one per line)</span>
         <textarea id="tpl-pack" data-draft="tpl-pack" rows="8">${dv('tpl-pack', c.packing.join('\n'))}</textarea></label>
       <label class="field">Binder paperwork <span class="small">(one per line; the list icon on a “Prepare binders” to-do shows it)</span>
         <textarea id="tpl-binder" data-draft="tpl-binder" rows="8">${dv('tpl-binder', c.binder.join('\n'))}</textarea></label>` : ''}
       ${tab === '6' ? `<p class="tpl-group">Documentation Checklist <span class="muted small">(one per line)</span></p>
         <div class="day-fields">${[['class', 'Records for the Class'], ['student', 'Records for each Student'], ['skills', 'Skills sheets (physical copies only)'], ['final', 'Final Steps']].map(([k2, label]) =>
           `<label class="field">${label}<textarea id="tpl-doc-${k2}" data-draft="tpl-doc-${k2}" rows="7">${dv('tpl-doc-' + k2, (c.docs[k2] || []).join('\n'))}</textarea></label>`).join('')}</div>` : ''}
       <label class="field">${dayName(Number(tab))} notes <span class="small">(what the Notes box starts with)</span>
         <textarea id="tpl-notes-${tab}" data-draft="tpl-notes-${tab}" rows="8">${dv('tpl-notes-' + tab, c.dayNotes[tab] || '')}</textarea></label>`;
  return `<div class="overlay" data-act="tplClose"><div class="modal tpl" data-stop>
    <div class="modal-head"><h2>Templates</h2><button class="x big" data-act="tplClose" aria-label="Close">×</button></div>
    <div class="bag-tabs">${tabBtn('setup', 'Course Setup')}${tabBtn('every', 'Every day')}${ALL_DAYS.map(n => tabBtn(String(n), dayName(n))).join('')}</div>
    <div class="modal-body"><div class="tpl-body">${body}</div></div>
    <div class="modal-foot"><span class="muted small">Used for every new cohort. Changing a day’s notes here doesn’t touch notes you’ve already typed.</span>
      <button class="btn primary" data-act="tplSave">Save</button></div>
  </div></div>`;
}

/* ---------- Bag Contents editor (Setup) ----------
   Still saved as settings.bag = [{ name, items: ['BP cuff', 'i-Gel ***'] }] so the
   bag check works as before. Item ids come from pocket + name, so when one is
   renamed or moved its "which bags" choice is copied to the new id. */
const bagAll = () => Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
const bagRaw = raw => ({ name: raw.replace(/\s*\*\*\*\s*$/, '').trim(), some: /\*\*\*\s*$/.test(raw) });
const bagId = (pocket, raw) => slug(pocket + ' ' + bagRaw(raw).name);
const bagCopy = () => cfg().bag.map(sec => ({ name: sec.name, items: [...sec.items] }));
async function saveBagList(bag) {
  // Old id -> new id by position isn't possible after a move, so match by "pocket|raw" pairs passed in.
  const some = cfg().someBags, moved = {};
  (bag.__from || []).forEach(([oldId, newId]) => { if (oldId !== newId && some[oldId]) moved[newId] = some[oldId]; });
  Object.keys(S.drafts).forEach(k => { if (/^bag[NI]-/.test(k)) delete S.drafts[k]; });
  const clean = bag.map(sec => ({ name: sec.name, items: sec.items.filter(Boolean) }));
  await Store.set('meta/settings', { bag: clean, ...(Object.keys(moved).length ? { someBags: moved } : {}) });
}
// The printed Skills Tracking sheet students carry (skills-tracking.pdf), for reference.
function skillsSheetModal() {
  return `<div class="overlay" data-act="skillsSheetClose"><div class="modal pdf" data-stop>
    <div class="modal-head"><h2>Skills Tracking</h2><button class="x big" data-act="skillsSheetClose" aria-label="Close">×</button></div>
    <iframe src="skills-tracking.pdf#view=FitH&navpanes=0" title="Skills Tracking sheet"></iframe>
  </div></div>`;
}
function bagEdModal() {
  const bag = cfg().bag, all = bagAll();
  const card = (sec, p) => `<section class="pocket" data-p="${p}" draggable="true">
      <div class="pocket-head"><span class="pgrip" title="Drag to move this pocket">${ICONS.grip}</span>
        <textarea class="pocket-name" id="bagN-${p}" data-draft="bagN-${p}" data-bagname="${p}" data-grow rows="1" aria-label="Pocket name">${esc(S.drafts['bagN-' + p] ?? sec.name)}</textarea>
        <button class="x" data-act="bagPocketDel" data-p="${p}" title="Delete this pocket" aria-label="Delete pocket">×</button></div>
      <ul class="pocket-items" data-drop="bagitems">${sec.items.map((raw, j) => {
        const it = bagRaw(raw), id = bagId(sec.name, raw);
        return `<li data-bi="${p}-${j}" draggable="true"><div class="bi-row"><span class="bgrip">${ICONS.grip}</span>
          <textarea class="bi-name" id="bagI-${p}-${j}" data-draft="bagI-${p}-${j}" data-bagitem="${p}-${j}" data-grow rows="1" aria-label="Item">${esc(S.drafts['bagI-' + p + '-' + j] ?? it.name)}</textarea>
          <button class="some-tog ${it.some ? 'on' : ''}" data-act="bagSome" data-bi="${p}-${j}" title="Only some bags carry this">${it.some ? 'Some bags' : 'All bags'}</button>
          <button class="x" data-act="bagItemDel" data-bi="${p}-${j}" title="Remove" aria-label="Remove">×</button></div>
          ${it.some ? `<div class="bi-bags">${all.map(b => `<label>${circle(bagCarries({ id, some: true }, b), `data-act="someBag" data-id="${id}" data-b="${b}"`)}<span>${b}</span></label>`).join('')}</div>` : ''}</li>`;
      }).join('')}</ul>
      <div class="add-row"><input id="bagAdd-${p}" data-draft="bagAdd-${p}" data-add="bagitem" data-p="${p}" placeholder="+ add item" value="${esc(S.drafts['bagAdd-' + p] || '')}"></div>
    </section>`;
  return `<div class="overlay" data-act="bagEdClose"><div class="modal bag-ed" data-stop>
    <div class="modal-head"><h2>Bag Contents</h2><button class="x big" data-act="bagEdClose" aria-label="Close">×</button></div>
    <div class="modal-body" data-keep-scroll="bagEd"><p class="muted small">Changes save as you go. Drag items between pockets, or drag a pocket by its dots. “Some bags” lets you tap which of bags 1–${all.length} carry it.</p>
      <div class="pocket-grid" data-drop="pockets">${bag.map(card).join('')}
        <section class="pocket add-pocket"><input id="bagPocketIn" data-draft="bagPocketIn" data-add="bagpocket" placeholder="+ Add a pocket" value="${esc(S.drafts.bagPocketIn || '')}"></section></div></div>
  </div></div>`;
}
async function bagAddItem(p) {
  const k = 'bagAdd-' + p, text = String(S.drafts[k] || '').trim();
  if (!text) return;
  delete S.drafts[k];
  const bag = bagCopy(); bag[p].items.push(text.replace(/\s*\*\*\*\s*$/, ''));
  await saveBagList(bag);
  setTimeout(() => { const el = document.getElementById(k); if (el) el.focus(); }, 0);
}
async function bagAddPocket() {
  const name = String(S.drafts.bagPocketIn || '').trim();
  if (!name) return;
  delete S.drafts.bagPocketIn;
  await saveBagList([...bagCopy(), { name, items: [] }]);
}
async function bagRename(t) {
  delete S.drafts[t.id];
  const bag = bagCopy(), from = [];
  if (t.dataset.bagname != null) {
    const p = Number(t.dataset.bagname), name = t.value.trim(), old = bag[p].name;
    if (!name) { t.value = old; return; }
    if (name === old) return;
    bag[p].items.forEach(raw => from.push([bagId(old, raw), bagId(name, raw)]));
    bag[p].name = name;
  } else {
    const [p, j] = t.dataset.bagitem.split('-').map(Number), raw = bag[p].items[j], it = bagRaw(raw), name = t.value.trim();
    if (name === it.name) return;
    if (!name) bag[p].items.splice(j, 1);
    else { bag[p].items[j] = name + (it.some ? ' ***' : ''); from.push([bagId(bag[p].name, raw), bagId(bag[p].name, name)]); }
  }
  bag.__from = from;
  await saveBagList(bag);
}
// Drag-and-drop finished: read the new order off the page.
async function bagDragDone() {
  const old = cfg().bag, from = [];
  const bag = [...document.querySelectorAll('.pocket-grid > .pocket[data-p]')].map(card => {
    const sec = old[Number(card.dataset.p)];
    return { name: sec.name, items: [...card.querySelectorAll('li[data-bi]')].map(li => {
      const [p, j] = li.dataset.bi.split('-').map(Number), raw = old[p].items[j];
      from.push([bagId(old[p].name, raw), bagId(sec.name, raw)]);
      return raw;
    }) };
  });
  bag.__from = from;
  await saveBagList(bag);
}

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

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
// Day pages' notes are days/0-6; the Course page's are days/course.
const noteDay = v => isNaN(v) ? v : Number(v);
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

/* ---------- Dash lists in Notes and sticky notes ----------
   Enter after a "- " line starts the next one with "- " (Enter on an empty "- " ends the list);
   Tab / Shift+Tab on a "- " line moves it in or out two spaces. The text stays plain. */
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.tagName !== 'TEXTAREA' || !(t.dataset.notes || t.dataset.anote) || e.isComposing) return;
  if (!(e.key === 'Enter' && !e.shiftKey) && e.key !== 'Tab') return;
  const v = t.value, at = t.selectionStart;
  if (at !== t.selectionEnd && e.key === 'Enter') return;
  const start = v.lastIndexOf('\n', at - 1) + 1, endNl = v.indexOf('\n', at), end = endNl < 0 ? v.length : endNl;
  const line = v.slice(start, end), m = line.match(/^(\s*)- /);
  if (!m) return;
  e.preventDefault();
  let next, caret;
  if (e.key === 'Tab') {
    const pad = e.shiftKey ? Math.min(2, m[1].length) : 2;
    if (e.shiftKey && !pad) return;
    next = e.shiftKey ? v.slice(0, start) + line.slice(pad) + v.slice(end) : v.slice(0, start) + '  ' + line + v.slice(end);
    caret = Math.max(start, at + (e.shiftKey ? -pad : pad));
  } else if (!line.slice(m[0].length).trim() && at >= start + m[0].length) {
    next = v.slice(0, start) + v.slice(end); caret = start; // an empty "- " line: end the list
  } else {
    const add = '\n' + m[1] + '- ';
    next = v.slice(0, at) + add + v.slice(at); caret = at + add.length;
  }
  t.value = next; t.setSelectionRange(caret, caret);
  t.dispatchEvent(new Event('input', { bubbles: true })); // saves it, like typing does
});

/* ---------- Drag and drop ---------- */
document.addEventListener('dragstart', e => {
  const bagEl = e.target.closest && e.target.closest('.bag-ed li[data-bi], .bag-ed .pocket[data-p]');
  if (bagEl) {
    S.dragging = { type: bagEl.matches('li') ? 'bagitem' : 'pocket' };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', 'bag'); } catch {}
    setTimeout(() => bagEl.classList.add('moving'), 0);
    return;
  }
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
  if (S.dragging.type === 'pocket') {
    const grid = e.target.closest('.pocket-grid'); if (!grid) return;
    e.preventDefault();
    const moving = grid.querySelector('.moving'), over = e.target.closest('.pocket[data-p]');
    if (!moving || !over || over === moving) return;
    const r = over.getBoundingClientRect();
    grid.insertBefore(moving, e.clientX < r.left + r.width / 2 ? over : over.nextSibling);
    return;
  }
  if (S.dragging.type === 'bagitem') {
    const zone = e.target.closest('[data-drop="bagitems"]');
    document.querySelectorAll('.drop-here').forEach(x => x !== zone && x.classList.remove('drop-here'));
    if (!zone) return;
    e.preventDefault(); zone.classList.add('drop-here');
    const moving = document.querySelector('.bag-ed .moving'); if (!moving) return;
    const after = [...zone.children].find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (after) { if (after !== moving) zone.insertBefore(moving, after); } else if (zone.lastElementChild !== moving) zone.appendChild(moving);
    return;
  }
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
  if (drag.type === 'bagitem' || drag.type === 'pocket') {
    S.dragging = null;
    try { await bagDragDone(); } catch (err) { toast(err.message); } finally { render(); }
    return;
  }
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
  const layout = { v: layoutV(board), h: Object.fromEntries(board.boxes.map(b => [b, heights[b] || null])) };
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
  // Prep: the scenarios box is only as tall as the plan, and Notes matches it (unless either was drag-sized).
  const scen = board.querySelector('.box-scenarios'), notes = board.querySelector('.box-notes'), h = cfg().heights;
  if (scen && notes && !h.notes && !h.scenarios && innerWidth >= 1100) {
    notes.style.flex = '0 0 auto'; notes.style.height = scen.offsetHeight + 'px';
  }
}
addEventListener('resize', fitBoard);

/* ---------- Events ---------- */
document.addEventListener('input', e => {
  const t = e.target, k = t.dataset.draft;
  if (t.id === 'resetName') { // Reset test cohort: the button unlocks once the name is typed exactly
    S.drafts.resetName = t.value;
    const b = document.querySelector('[data-act="resetGo"]'); if (b) b.disabled = t.value.trim() !== S.cohortKey;
    return;
  }
  // Schedule template pop-up: typing changes the draft until Save.
  if (t.dataset.stpl && S.schTplDraft) {
    const d = S.schTplDraft[S.schTplTab], f = t.dataset.stpl;
    if (f === 'notes' || f === 'stationNote') d[f] = t.value; else d[f][Number(t.dataset.i)][t.dataset.f] = t.value;
    S.schTplDirty = true;
    if (t.hasAttribute('data-grow')) grow(t);
    return;
  }
  // Scenario Library: add-on names and requirement numbers wait for Save.
  if (t.dataset.addon != null && S.addonDraft) { S.addonDraft[Number(t.dataset.addon)].text = t.value; return; }
  if (t.dataset.req != null && S.reqDraft) { S.reqDraft[t.dataset.req] = Math.max(0, Number(t.value) || 0); return; }
  if (emailInput(t)) return; // the email draft pop-up and the template editor
  if (adminInput(t)) return; // Admin page sticky notes
  if (!k) return;
  if (k === 'search') { S.search = t.value; render(); return; }
  if (k === 'libSearch') { S.drafts.libSearch = t.value; render(); return; }
  if (t.dataset.sch === 'notes') { // indent a "- " line as soon as it's typed, keeping the cursor in place
    const fixed = indentDashes(t.value);
    if (fixed !== t.value) {
      const pos = indentDashes(t.value.slice(0, t.selectionStart)).length;
      t.value = fixed; t.setSelectionRange(pos, pos);
    }
  }
  S.drafts[k] = t.value;
  if (t.hasAttribute('data-grow')) grow(t);
  if (t.dataset.notes) { syncBack(t); hlHide(); saveNoteSoon(noteDay(t.dataset.notes), t.id); }
});

document.addEventListener('focusout', e => {
  const t = e.target;
  // Changes box: an add line you leave empty closes again.
  if (t.dataset && t.dataset.chadd && !S.rendering && !t.value.trim()) {
    setTimeout(() => { if (S.changesAdd === t.dataset.chadd && !String(S.drafts[t.dataset.draft] || '').trim()) { S.changesAdd = null; render(); } }, 150);
    return;
  }
  if (t.dataset && t.dataset.edit && !S.rendering && S.editItem === t.dataset.edit) { saveEdit(t).catch(err => toast(err.message)); return; }
  if (t.dataset && t.dataset.notes && S.drafts[t.id] !== undefined) {
    const id = t.id, n = noteDay(t.dataset.notes), text = S.drafts[id];
    clearTimeout(noteTimers[id]);
    Store.set(P('days/' + n), { notes: text }).then(() => { if (S.drafts[id] === text) delete S.drafts[id]; });
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.change === 'cohort') { S.menuOpen = false; selectCohort(t.value); return; }
  if (/^(plan|libEvery|addonNeed|addonMinus)/.test(t.dataset.change || '')) { try { await scenChange(t); } catch (err) { toast(err.message); } return; }
  if (t.dataset.sch) { schChange(t); return; }
  if (t.dataset.bagname != null || t.dataset.bagitem != null) { try { await bagRename(t); } catch (err) { toast(err.message); } return; }
  if (t.dataset.add === 'bagitem') { bagAddItem(Number(t.dataset.p)).catch(err => toast(err.message)); return; }
  if (t.dataset.add === 'bagpocket') { bagAddPocket().catch(err => toast(err.message)); return; }
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
  if (e.target.dataset && e.target.dataset.edit) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
    if (e.key === 'Escape') { delete S.drafts[e.target.id]; S.editItem = null; render(); return; }
  }
  if (e.key === 'Escape' && e.target.dataset && e.target.dataset.chadd) { delete S.drafts[e.target.dataset.draft]; S.changesAdd = null; render(); return; }
  if (e.key === 'Escape') {
    if (S.resetAsk) { if (!S.resetBusy) { S.resetAsk = false; delete S.drafts.resetName; render(); } return; }
    if (S.adminPanel) S.adminPanel = null; // (the link panel sits on top of whatever opened it)
    else if (S.datePick) S.datePick = null;
    else if (S.dueEd) { S.dueEd = null; delete S.drafts['due-date']; }
    else if (emailEscape()) { /* closed an email pop-up */ }
    else if (adminEscape()) { /* closed an Admin page pop-up */ }
    else if (S.packet) { if (S.packet.busy) return; packetClose(); }
    else if (S.roster) { if (S.roster.busy) return; if (S.roster.redo || S.roster.redoInst || S.roster.saveAsk) { S.roster.redo = null; S.roster.redoInst = null; S.roster.saveAsk = false; } else { if (S.roster.url) URL.revokeObjectURL(S.roster.url); S.roster = null; } }
    else if (S.ship) S.ship = null;
    else if (S.newCohort) { if (S.newCohort.busy) return; S.newCohort = null; } else if (S.infoEdit) { if (S.infoEdit.busy) return; S.infoEdit = null; clearCourseDrafts('ie-'); } else if (S.binderList) S.binderList = false;
    else if (S.skillsSheet) S.skillsSheet = false; else if (S.planClearAsk) S.planClearAsk = false; else if (S.planDelAsk != null) S.planDelAsk = null; else if (S.place) S.place = null; else if (S.match) S.match = null; else if (S.planOpen) S.planOpen = false;
    else if (S.libOpen) { act('libClose'); return; } else if (S.schTplOpen) { act('schTplClose'); return; } else if (S.bagEd) S.bagEd = false; else if (S.bagOpen !== false) S.bagOpen = false; else if (S.binderOpen) S.binderOpen = null; else if (S.tplOpen) S.tplOpen = false; else if (S.shareOpen) S.shareOpen = false; else if (S.open) S.open = null; else if (S.menuOpen) S.menuOpen = false; else if (S.schMenu) S.schMenu = false; else return;
    render(); return;
  }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.bag-ed input:not([data-add]), .bag-ed textarea')) { e.preventDefault(); e.target.blur(); return; } // renaming a pocket/item
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.dataset.add) return;
  e.preventDefault();
  const t = e.target;
  if (t.dataset.add === 'bagitem') { bagAddItem(Number(t.dataset.p)).catch(err => toast(err.message)); return; }
  if (t.dataset.add === 'bagpocket') { bagAddPocket().catch(err => toast(err.message)); return; }
  if (adminEnter(t)) return;
  if (t.dataset.add === 'shop') act('addShop');
  else if (t.dataset.add === 'pack') act('addPack');
  else if (t.dataset.add === 'upd') act('addUpd');
  else if (t.dataset.add === 'newcohort') act('newCohortCreate');
  else act('addItem', t);
});

document.addEventListener('click', e => {
  if (S.menuOpen && !e.target.closest('.menu-wrap')) { S.menuOpen = false; render(); }
  if (S.schMenu && !e.target.closest('.sched-more')) { S.schMenu = false; render(); }
  if (S.statusMenu && !e.target.closest('.status-wrap')) { S.statusMenu = false; render(); }
  if (S.datePick && !e.target.closest('.dp')) { S.datePick = null; render(); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.closest('.sched-more .menu')) { S.schMenu = false; render(); } // picking something closes the ⋯ menu
  // Only the backdrop itself closes a pop-up, and the +/− box doesn't open the student.
  if (el.classList.contains('overlay') && e.target !== el) return;
  if (el.tagName === 'TR') { const stop = e.target.closest('[data-stop]'); if (stop && el.contains(stop)) return; } // (a pop-up around the table doesn't count)
  act(el.dataset.act, el, e);
});

async function act(a, el = {}, e) {
  const d = el.dataset || {};
  const n = schedDay(); // (only the Schedule actions below use n)
  try {
    switch (a) {
      case 'signin': await Store.signIn(); break;
      case 'signout': S.menuOpen = false; await Store.signOut(); break;
      case 'menu': S.menuOpen = !S.menuOpen; S.showOld = false; render(); break;
      case 'toggleOld': S.showOld = !S.showOld; render(); break;
      case 'schMenu': S.schMenu = !S.schMenu; render(); break;
      case 'refresh': S.menuOpen = false; await loadSheet(); break;
      case 'view':
        S.view = d.v; pref('view', d.v); S.open = null; S.menuOpen = false;
        if (['day', 'week', 'schedule'].includes(d.v)) pref('awView', d.v);
        render(); window.scrollTo(0, 0); break;
      case 'side': { // Course / Academy Week switch (Academy Week opens on the page you used last)
        const v = d.s === 'course' ? 'course' : (['day', 'week', 'schedule'].includes(pref('awView')) ? pref('awView') : 'day');
        S.view = v; pref('view', v); S.open = null; S.menuOpen = false; render(); window.scrollTo(0, 0); break;
      }
      case 'day':
        S.day = Number(d.n); pref('day-' + S.cohortKey, d.n);
        if (d.open) { S.view = 'day'; pref('view', 'day'); pref('awView', 'day'); window.scrollTo(0, 0); }
        render(); break;
      case 'statusMenu': S.statusMenu = !S.statusMenu; render(); break;
      case 'resetAsk': if (!isTestCohort(S.cohortKey)) return; S.statusMenu = false; S.resetAsk = true; S.drafts.resetName = ''; render(); break;
      case 'resetCancel': if (S.resetBusy) return; S.resetAsk = false; delete S.drafts.resetName; render(); break;
      case 'resetGo': {
        const key = S.cohortKey, typed = String(S.drafts.resetName || '').trim();
        if (!isTestCohort(key) || typed !== key || S.resetBusy) return;
        S.resetBusy = true; render();
        unwatchCohort.forEach(u => u()); unwatchCohort = []; // (so nothing re-seeds while it's being cleared)
        try {
          const res = await Sheets.resetTestCohort(key, typed);
          // This device's own memory of the cohort (which day, setup done, the sheet's last copy) goes too.
          try { Object.keys(localStorage).filter(k => k.startsWith('aw-') && k.endsWith('-' + key)).forEach(k => localStorage.removeItem(k)); } catch {}
          toast(`${key} reset (${res.trashed || 0} file${res.trashed === 1 ? '' : 's'} to the Drive trash). Reloading…`);
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          S.resetBusy = false; S.resetAsk = false; delete S.drafts.resetName;
          toast(err.message + (/unknown request/i.test(err.message) ? ' (the Admin Apps Script needs its new version deployed)' : ''));
          selectCohort(key, { keepView: true });
        }
        break;
      }
      case 'setStatus': {
        const key = d.k, status = d.s;
        S.statusMenu = false;
        const why = status === 'Active' ? 'Students on its roster will be able to log in to the Student Hub.'
          : status === 'Former' ? 'Its students will only see the Resources tab in the Student Hub, and its folder moves to Former Cohorts.' : '';
        if (!confirm(`Make ${key} ${status} in the config sheet?\n\n${why}`)) return;
        const res = await Sheets.setStatus(key, status);
        S.kdAt = 0; // Key Dates picks up the change
        S.cohorts = S.cohorts.map(c => c.key === key ? { ...c, status } : c);
        if (key === S.cohortKey && S.sheet) { S.sheet = { ...S.sheet, status }; sheetCopy(key, S.sheet); }
        toast(`${key} is now ${status}.${res && res.folderNote ? ' ' + res.folderNote : ''}`); render(); break;
      }
      case 'prevTodo': {
        const x = S.prevTodos.find(i => i.id === d.id);
        if (x && prevFor) await Store.set('cohorts/' + prevFor + '/todos/' + d.id, { done: !x.done });
        break;
      }
      case 'prevDel': if (prevFor) await Store.del('cohorts/' + prevFor + '/todos/' + d.id); break; // (off the Admin page's Changes too)
      case 'addUpd': {
        const text = (S.drafts.upd || '').trim(); if (!text) return;
        S.drafts.upd = ''; render();
        await Store.add('updates', { text, done: false, created: Date.now(), from: S.cohortKey || '' }); break;
      }
      case 'updDone': { const x = S.updates.find(i => i.id === d.id); await Store.set('updates/' + d.id, { done: !x.done }); break; }
      case 'delUpd': await Store.del('updates/' + d.id); break;
      case 'chAdd': {
        S.changesAdd = S.changesAdd === d.k ? null : d.k; render();
        const id = d.k === 'upd' ? 'updIn' : 'add-' + d.k + '-' + SETUP;
        if (S.changesAdd) setTimeout(() => { const el = document.getElementById(id); if (el) el.focus(); }, 0);
        break;
      }
      case 'binderList': S.binderList = true; render(); break;
      case 'binderListClose': S.binderList = false; render(); break;
      case 'newCohortOpen':
        S.menuOpen = false; S.newCohort = { busy: false, err: '', reviews: [] }; clearCourseDrafts('nc-'); render();
        setTimeout(() => { const el = document.getElementById('newCohortIn'); if (el) el.focus(); }, 0); break;
      case 'newCohortClose': if (S.newCohort && S.newCohort.busy) return; S.newCohort = null; render(); break;
      case 'newCohortCreate': {
        const key = String(S.drafts.newCohort || '').replace(/\s+/g, ' ').trim();
        if (!key || !S.newCohort || S.newCohort.busy) { if (!key) toast('Type the cohort’s name first.'); return; }
        if (S.cohorts.some(c => c.key.toLowerCase() === key.toLowerCase())) { S.newCohort.err = key + ' is already in the config sheet.'; render(); return; }
        // Only the course details you filled in are sent (the rest stay blank = TBD).
        const vals = courseValues('nc-'), info = {};
        COURSE_FIELDS.forEach(([k]) => { if (vals[k]) info[k] = vals[k]; });
        if (vals.reviews.length) info.reviews = vals.reviews;
        S.newCohort.busy = true; S.newCohort.err = ''; render();
        let res;
        try {
          res = await Sheets.createCohort(key, info);
        } catch (err) { S.newCohort.busy = false; S.newCohort.err = err.message; render(); return; }
        // The details didn't come back saved with the new cohort: try once more on their own.
        let infoErr = '';
        if (Object.keys(info).length && !(res && res.info)) {
          try { await Sheets.saveSettings(key, info); } catch (err) { infoErr = (res && res.settingsError) || err.message; }
          S.kdAt = 0;
        }
        delete S.drafts.newCohort; clearCourseDrafts('nc-'); S.newCohort = null;
        try { S.cohorts = await Sheets.listCohorts(); } catch {}
        S.view = 'course'; pref('view', 'course');
        if (!infoErr) toast(`${key} is set up. Its folder and sheets are in your Drive.`);
        await selectCohort(key, { keepView: true });
        if (infoErr) alert(`${key} is set up, but its course details didn’t save to the sheet:\n\n${infoErr}\n\nAdd them with the pencil on Course Details.`);
        else if (S.cohortKey === key && S.sheet) makeCohortDocs({ quiet: true }); // its syllabus (dates filled in), schedule and Admin folder
        break;
      }
      case 'makeDocs': await makeCohortDocs(); break;
      case 'goStudents': S.view = 'students'; S.filter = d.f; pref('view', 'students'); render(); break;
      case 'filter': S.filter = d.f; render(); break;
      case 'hideDone': pref('hide-' + d.k, hidden(d.k) ? '0' : '1'); render(); break;
      case 'setupShow': S.setupShow = S.setupShow === S.cohortKey ? null : S.cohortKey; render(); break; // a finished checklist, opened for a look
      case 'hideDefault': // a new default applies to every list again, so forget each eye's own choice
        HIDE_KEYS.forEach(k => { try { localStorage.removeItem('aw-hide-' + k); } catch {} });
        await Store.set('meta/settings', { hideCheckedDefault: d.v === '1' }); break;

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

      case 'doc': {
        const on = !!((S.cohortDoc && S.cohortDoc.docChecks) || {})[d.id];
        await Store.set('cohorts/' + S.cohortKey, { docChecks: { [d.id]: !on } }); break;
      }
      case 'printDocs': printDocs(); break;
      case 'binderOpen': S.binderOpen = d.id; render(); break;
      case 'binderClose': S.binderOpen = null; render(); break;
      case 'attend': {
        const s = studentBySid(d.sid);
        if (s.out) { await Store.set('cohorts/' + S.cohortKey, { notAttending: { [d.sid]: false } }); break; }
        // During the week it's a drop on today's day; before it, they just aren't coming.
        const today = currentWeekDay();
        await Store.set('cohorts/' + S.cohortKey, { notAttending: { [d.sid]: today || true } });
        await removeFromSquads(s.name, today || 1);
        if (today) toast(`${firstName(s.name)} dropped on Day ${today}. Taken out of squads from today on.`);
        break;
      }
      case 'binderPrint': {
        const id = S.binderOpen;
        S.binderOpen = null; render();
        await printBinders();
        if (id && S.todos.some(t => t.id === id)) await Store.set(P('todos/' + id), { done: true });
        break;
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

      case 'openStudent': {
        // Clicking Skills / the contact number / To fix / Attendance opens just that part.
        const cell = e && e.target.closest && e.target.closest('[data-part]');
        S.open = d.sid; S.openPart = d.part || (cell && cell.dataset.part) || null; render(); break;
      }
      case 'openAll': S.openPart = null; render(); break;
      case 'closeStudent': S.open = null; S.openPart = null; render(); break;
      case 'pc': await changePc(d.sid, Number(d.by)); break;
      case 'skill': await Store.set(P('students/' + d.sid), { skill: d.v }); break;
      case 'behind': {
        const s = studentBySid(d.sid);
        const next = s.behind.includes(d.k) ? s.behind.filter(x => x !== d.k) : [...s.behind, d.k];
        await Store.set(P('students/' + d.sid), { behind: next }); break;
      }
      case 'cadd': S.drafts['cadd-' + d.sid] = el.checked; break;
      case 'dpOpen': {
        const open = S.datePick && S.datePick.key === d.k;
        // Review dates open on the month after the last one picked, else the orientation month.
        const multi = multiForm(d.k), prefix = d.k.slice(0, 3);
        const start = multi ? (multi.reviews[multi.reviews.length - 1] || S.drafts[prefix + 'firstDay'] || todayIso()) : (S.drafts[d.k] || todayIso());
        S.datePick = open ? null : { key: d.k, month: start.slice(0, 7) };
        render(); break;
      }
      case 'dpToggle': {
        const f = multiForm(d.k); if (!f) return;
        f.reviews = f.reviews.includes(d.iso) ? f.reviews.filter(x => x !== d.iso) : [...f.reviews, d.iso].sort();
        render(); break;
      }
      case 'dpDone': S.datePick = null; render(); break;
      case 'dpYears': S.datePick.years = !S.datePick.years; render(); break;
      case 'dpYear': { const [y, m] = S.datePick.month.split('-').map(Number); S.datePick.month = (y + Number(d.dir)) + '-' + String(m).padStart(2, '0'); render(); break; }
      case 'dpMonthPick': { const y = S.datePick.month.split('-')[0]; S.datePick.month = y + '-' + String(Number(d.m) + 1).padStart(2, '0'); S.datePick.years = false; render(); break; }
      case 'dpMonth': {
        const [y, m] = S.datePick.month.split('-').map(Number), nd = new Date(y, m - 1 + Number(d.dir), 1);
        S.datePick.month = isoOf(nd).slice(0, 7); render(); break;
      }
      case 'dpPick': {
        S.datePick = null;
        const m = d.k.match(/^(ie-|nc-)rev-new$/); // a review session date: added to the list
        if (m) { const f = courseForm(m[1]); if (f && !f.reviews.includes(d.iso)) f.reviews = [...f.reviews, d.iso].sort(); }
        else S.drafts[d.k] = d.iso;
        render(); break;
      }
      case 'dpClear': delete S.drafts[d.k]; S.datePick = null; render(); break;
      case 'revDel': { const f = courseForm(d.f); if (f) f.reviews = f.reviews.filter(x => x !== d.iso); render(); break; }
      case 'infoEditOpen': {
        const i = cohortInfo(), orig = {};
        COURSE_FIELDS.forEach(([k, , type]) => { const v = String(i[k] || ''); orig[k] = type === 'date' ? (isIsoDate(v) ? v : '') : v; S.drafts['ie-' + k] = orig[k]; });
        orig.reviews = (i.reviews || []).filter(isIsoDate);
        S.infoEdit = { busy: false, err: '', reviews: [...orig.reviews], orig };
        render(); break;
      }
      case 'courseNoOpen': // Setup Checklist → "Enter Course No.": Course Details with the course # box ready to type in
        await act('infoEditOpen');
        setTimeout(() => { const el = document.getElementById('ie-courseNos'); if (el) el.focus(); }, 30); break;
      case 'infoEditClose': if (S.infoEdit && S.infoEdit.busy) return; S.infoEdit = null; clearCourseDrafts('ie-'); render(); break;
      case 'infoEditSave': {
        const f = S.infoEdit; if (!f || f.busy) return;
        const now = courseValues('ie-'), changed = {};
        COURSE_FIELDS.forEach(([k]) => { if (now[k] !== f.orig[k]) changed[k] = now[k]; });
        if (JSON.stringify(now.reviews) !== JSON.stringify(f.orig.reviews)) changed.reviews = now.reviews;
        if (!Object.keys(changed).length) { S.infoEdit = null; clearCourseDrafts('ie-'); render(); return; }
        f.busy = true; f.err = ''; render();
        try {
          applyInfo(await Sheets.saveSettings(S.cohortKey, changed));
          S.kdAt = 0; // Key Dates picks up the change
        } catch (err) { f.busy = false; f.err = err.message; render(); return; }
        S.infoEdit = null; clearCourseDrafts('ie-');
        toast('Saved to ' + S.cohortKey + '’s sheet.'); render(); break;
      }
      case 'callToggle': { const k = 'call-' + d.sid; S.drafts[k] = !S.drafts[k]; render(); break; }
      case 'logContact': {
        const s = studentBySid(d.sid); const k = x => x + '-' + d.sid;
        const all = !!S.drafts[k('call')];
        const add = !all && S.drafts[k('cadd')] !== false;
        const num = all ? 'all' : String(S.drafts[k('cnum')] ?? '').trim();
        const fix = (S.drafts[k('cfix')] || '').trim();
        if (!num) { toast('Add the contact #, or pick All contacts.'); return; }
        if (all && !fix) { toast('Write what needs fixed on all their contacts.'); return; }
        await Store.add(P('contacts'), { sid: d.sid, num, fix, fixed: false, date: todayIso(), created: Date.now() });
        [k('cnum'), k('cfix'), k('cadd'), k('call')].forEach(x => delete S.drafts[x]);
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
        if (!confirm('Delete this conduct note?')) return;
        await Store.del(P('warnings/' + d.id)); break;

      case 'tplOpen': S.tplOpen = true; S.tplTab = d.t || 'setup'; render(); break;
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
        const setupList = lines(S.drafts['tpl-setup'] ?? c.setup.join('\n'));
        const courseTodoList = lines(S.drafts['tpl-ctodo'] ?? c.courseTodo.join('\n'));
        const binderList = lines(S.drafts['tpl-binder'] ?? c.binder.join('\n'));
        const docChecklist = Object.fromEntries(DOC_SECTIONS.map(k2 => [k2, lines(S.drafts['tpl-doc-' + k2] ?? (c.docs[k2] || []).join('\n'))]));
        ALL_DAYS.forEach(x => {
          days[x] = lines(S.drafts['tpl-todo-' + x] ?? ((c.checklist.days || {})[x] || []).join('\n'));
          dayNotes[x] = String(S.drafts['tpl-notes-' + x] ?? (c.dayNotes[x] || '')).replace(/\s+$/, '');
        });
        await Store.set('meta/settings', { checklist: { everyDay, days }, dayNotes, packingList, docChecklist, setupList, binderList, courseTodoList });
        TPL_KEYS.forEach(k => delete S.drafts[k]);
        S.tplOpen = false; render();
        // The open cohort already has its lists; offer to add any new items to it.
        const doc = S.cohortDoc || {};
        const extra = doc.repeatsAdded ? missingRepeats({ everyDay, days }) : [];
        const extraPack = doc.packingAdded ? missingPacking(packingList) : [];
        const extraSetup = doc.setupAdded ? missingSetup(setupList).filter(x => !x.heading) : [];
        const extraCtodo = doc.ctodoAdded ? missingCtodo(courseTodoList) : [];
        const parts = [extra.length && `${extra.length} new to-do${extra.length === 1 ? '' : 's'}`, extraPack.length && `${extraPack.length} new packing item${extraPack.length === 1 ? '' : 's'}`,
          extraSetup.length && `${extraSetup.length} new setup item${extraSetup.length === 1 ? '' : 's'}`,
          extraCtodo.length && `${extraCtodo.length} new Course To-Do item${extraCtodo.length === 1 ? '' : 's'}`].filter(Boolean);
        if (parts.length && confirm(`Saved. Add the ${parts.join(' and ')} to ${S.cohortKey} too?`)) {
          await addRepeats(extra); await addPacking(extraPack); await addSetup(extraSetup.map(x => ({ ...x, i: x.i + 1000 }))); await addCtodo(extraCtodo.map(x => ({ ...x, i: x.i + 1000 })));
          toast('Added to ' + S.cohortKey + '.');
        } else toast('Templates saved.');
        break;
      }
      case 'skillsSheet': S.skillsSheet = true; render(); break;
      case 'skillsSheetClose': S.skillsSheet = false; render(); break;
      case 'bagEdOpen': S.bagEd = true; render(); break;
      case 'bagEdClose': S.bagEd = false; render(); break;
      case 'bagSome': {
        const bag = bagCopy(), [p, j] = d.bi.split('-').map(Number), it = bagRaw(bag[p].items[j]);
        bag[p].items[j] = it.name + (it.some ? '' : ' ***');
        await saveBagList(bag); break;
      }
      case 'bagItemDel': {
        const bag = bagCopy(), [p, j] = d.bi.split('-').map(Number);
        bag[p].items.splice(j, 1); await saveBagList(bag); break;
      }
      case 'bagPocketDel': {
        const bag = bagCopy(), p = Number(d.p);
        if (bag[p].items.length && !confirm(`Delete “${bag[p].name}” and its ${bag[p].items.length} item${bag[p].items.length === 1 ? '' : 's'}?`)) return;
        if (bag.length === 1) { toast('The bag needs at least one pocket.'); return; }
        bag.splice(p, 1); await saveBagList(bag); break;
      }
      case 'someBag': {
        const all = Array.from({ length: cfg().bagCount }, (_, i) => i + 1);
        const cur = cfg().someBags[d.id] || all;
        const b = Number(d.b);
        const next = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort((x, y) => x - y);
        await Store.set('meta/settings', { someBags: { [d.id]: next } }); break;
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
        if (!confirm(`Use ${S.cohortKey}’s schedule (times, stations and notes; not squads or scenarios) as the template for every cohort?`)) return;
        const tpl = {};
        [1, 2, 3, 4, 5].forEach(x => { tpl[x] = stripScenarios(schedFor(x)); });
        await Store.set('meta/settings', { scheduleTemplate: tpl });
        if (S.schTplOpen) { S.schTplDraft = JSON.parse(JSON.stringify(tpl)); S.schTplDirty = false; render(); } // the editor shows what was just saved
        toast('Saved as the schedule template.'); break;
      }
      case 'schTplOpen':
        S.schTplDraft = Object.fromEntries([1, 2, 3, 4, 5].map(x => [x, stripScenarios(JSON.parse(JSON.stringify(schedTemplate(x))))]));
        S.schTplOpen = true; S.schTplTab = 1; S.schTplDirty = false; render(); break;
      case 'schTplTab': S.schTplTab = Number(d.n); render(); break;
      case 'schTplClose':
        if (S.schTplDirty && !confirm('Close without saving your changes?')) return;
        S.schTplOpen = false; S.schTplDraft = null; render(); break;
      case 'stplAdd': {
        const day = S.schTplDraft[S.schTplTab];
        day[d.list].push(d.list === 'blocks' ? { time: '', activity: '' } : { topic: '', content: '' });
        S.schTplDirty = true; render(); break;
      }
      case 'stplDel': {
        const list = S.schTplDraft[S.schTplTab][d.list], i = Number(d.i), item = list[i];
        const label = d.list === 'blocks' ? (item.activity || 'this time') : (item.topic || 'this station');
        if (!confirm('Remove “' + label + '” from the Day ' + S.schTplTab + ' template?')) return;
        list.splice(i, 1); S.schTplDirty = true; render(); break;
      }
      case 'stplMove': {
        const list = S.schTplDraft[S.schTplTab][d.list], i = Number(d.i), j = i + Number(d.dir);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; S.schTplDirty = true; render(); break;
      }
      case 'schTplSave':
        await Store.set('meta/settings', { scheduleTemplate: S.schTplDraft });
        S.schTplOpen = false; S.schTplDraft = null; S.schTplDirty = false;
        toast('Schedule template saved.'); render(); break;
      case 'printDay': await printDays([n]); break;
      case 'printAll': await printDays(weekDays().map(x => x.n)); break;
      case 'shareOpen': S.shareOpen = true; render(); setTimeout(showShareQr, 30); break;
      case 'shareClose': S.shareOpen = false; render(); break;
      case 'shareMake': {
        if (!Store.configured) { toast('The instructor link works once you’re signed in for real (not in sample mode).'); return; }
        await Store.set('cohorts/' + S.cohortKey, { shareToken: newToken(), shareMade: Date.now() });
        await new Promise(r => setTimeout(r, 300)); await publish(); render(); setTimeout(showShareQr, 30); break;
      }
      case 'shareNew': case 'shareOff': {
        const old = S.cohortDoc && S.cohortDoc.shareToken;
        if (!confirm(a === 'shareOff' ? 'Turn the link off? Anyone using it (or the printed QR code) won’t be able to open it.' : 'Make a new link? The old link and any printed QR codes stop working.')) return;
        if (old) await Store.del('shared/' + old);
        await Store.set('cohorts/' + S.cohortKey, a === 'shareOff' ? { shareToken: null } : { shareToken: newToken(), shareMade: Date.now() });
        await new Promise(r => setTimeout(r, 300));
        if (a === 'shareNew') { await publish(); setTimeout(showShareQr, 30); }
        render(); break;
      }
      case 'shareCopy': {
        const url = shareUrl(S.cohortDoc.shareToken);
        try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { toast('Select the link and copy it.'); }
        break;
      }
      default:
        if (!(await scenAct(a, el, e)) && !(await emailAct(a, el, e)) && !(await adminAct(a, el)) && !(await packetAct(a, el)) && !(await shipAct(a, el)) && !(await dueAct(a, el)) && !(await rosterAct(a, el))) console.warn('Unknown action', a);
        break;
      case 'resetLayout':
        await Store.set('meta/settings', { layout: null, prepLayout: null, finalLayout: null, courseLayout: null, courseDoneLayout: null });
        S.view = sideByDate() === 'course' ? 'course' : 'day'; pref('view', S.view);
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

/* ---------- Due dates (to-dos: Academy Week days, Course To-Do, Setup Checklist, Admin To Do) ----------
   An item's due date is saved on it as `due` (yyyy-MM-dd); the Morning Email reads that, and lists what's
   overdue, due today and due in 2 days.
   A template line can give its item a due date relative to the course by ending with, e.g.,
   "[due 2 weeks after orientation]" (days or weeks; before or after orientation, CPR or academy week).
   Those items keep `dueAuto: true` and follow the cohort's Course Details (syncDue keeps `due` up to date);
   picking or clearing a date yourself sets `dueAuto: false`, and "Use the template's date" goes back. */

const DUE_RE = /\s*\[due\s+(\d+)\s+(day|week)s?\s+(before|after)\s+(orientation|cpr|academy week)\]\s*$/i;
const tplText = raw => String(raw).replace(DUE_RE, '').trim();
function tplRule(raw) {
  const m = String(raw).match(DUE_RE);
  return m ? { n: Number(m[1]), unit: m[2].toLowerCase(), dir: m[3].toLowerCase(), from: m[4].toLowerCase() } : null;
}
// Built-in due dates for template lines saved before this existed (shown in Templates, so saving keeps them).
const DEFAULT_DUE = { 'ctodo-ship-student-shirts': '[due 2 weeks after orientation]' };
const withDefaultDue = (prefix, lines) => lines.map(l => !DUE_RE.test(l) && DEFAULT_DUE[prefix + slug(tplText(l))] ? l + ' ' + DEFAULT_DUE[prefix + slug(tplText(l))] : l);

const ruleLabel = r => `${r.n} ${r.unit}${r.n === 1 ? '' : 's'} ${r.dir} ${r.from === 'cpr' ? 'the CPR course' : r.from === 'academy week' ? 'Academy Week' : 'orientation'}`;
function ruleDate(r) {
  const i = cohortInfo();
  const base = r.from === 'orientation' ? i.firstDay : r.from === 'cpr' ? i.cpr : (S.sheet && S.sheet.academyStart) || i.academyStart;
  if (!isIsoDate(base)) return '';
  const d = parseIso(base);
  d.setDate(d.getDate() + r.n * (r.unit === 'week' ? 7 : 1) * (r.dir === 'after' ? 1 : -1));
  return isoOf(d);
}
// Every template item's rule, by the id it gets in a cohort.
let rulesMemo = { s: undefined, map: {} };
function dueRules() {
  if (rulesMemo.s === S.settings) return rulesMemo.map;
  const c = cfg(), map = {};
  const put = (id, raw) => { const r = tplRule(raw); if (r) map[id] = r; };
  c.setup.forEach(raw => { const x = setupLine(raw); if (!x.heading) put(x.id, raw); });
  c.courseTodo.forEach(raw => put('ctodo-' + slug(tplText(raw)), raw));
  ALL_DAYS.forEach(n => {
    const every = n >= 1 && n <= 5 ? (c.checklist.everyDay || []) : [];
    [...every, ...((c.checklist.days || {})[n] || [])].forEach(raw => put(repeatId(n, tplText(raw)), raw));
  });
  rulesMemo = { s: S.settings, map };
  return map;
}
// The date an item is due ('' = none). kind: 'admin' for the Admin To Do, anything else = a cohort to-do.
// kinds: a cohort's own to-dos ('todo', 'ctodo', 'setup'…), 'admin' (Admin To Do), and a cohort's
// "Do before next cohort" changes: 'prev' (the previous cohort's, on the Course page) / 'anext' (on the Admin page).
const plainDue = kind => kind === 'admin' || kind === 'prev' || kind === 'anext' || kind === 'upd'; // (no template dates; upd = Future updates)
function dueOf(kind, t) {
  if (plainDue(kind) || t.dueAuto === false) return t.due || '';
  const r = dueRules()[t.id];
  return r ? ruleDate(r) || t.due || '' : t.due || '';
}
const duePath = (kind, id) => kind === 'admin' ? 'adminTodos/' + id : kind === 'upd' ? 'updates/' + id : kind === 'prev' ? 'cohorts/' + prevFor + '/todos/' + id
  : kind === 'anext' ? 'cohorts/' + nextFor + '/todos/' + id : P('todos/' + id);

// Keep the saved `due` of template items in step with Course Details (so the Morning Email has it).
const dueSyncing = new Set();
function syncDue() {
  if (!S.sheet || !S.cohortKey || !S.todos.length) return;
  const rules = dueRules();
  S.todos.forEach(t => {
    const r = rules[t.id];
    if (!r || t.dueAuto === false || dueSyncing.has(t.id)) return;
    const d = ruleDate(r);
    if (!d || t.due === d) return;
    dueSyncing.add(t.id);
    Store.set(P('todos/' + t.id), { due: d, dueAuto: true }).catch(() => {}).finally(() => dueSyncing.delete(t.id));
  });
}

// On an item: a "due Sep 1" chip (rose when it's 2 days out or late), or a calendar button on hover.
function dueBits(kind, t, done) {
  const due = dueOf(kind, t), attrs = `data-act="dueOpen" data-kind="${kind}" data-id="${esc(t.id)}"`;
  if (!due) return `<button class="x due-add" ${attrs} title="Set a due date" aria-label="Set a due date">${CAL_ICON}</button>`;
  const days = Math.round((parseIso(due) - parseIso(todayIso())) / 864e5);
  const label = days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : 'due ' + dueDay(due);
  return `<button class="due-chip ${!done && days <= 2 ? 'soon' : ''} ${!done && days < 0 ? 'late' : ''}" ${attrs} title="Change the due date"><span class="due-txt">${label}</span></button>`;
}
const dueDay = iso => { const d = parseIso(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };

function dueItem(kind, id) { return (kind === 'admin' ? S.adminTodos : kind === 'upd' ? S.updates : kind === 'prev' ? S.prevTodos : kind === 'anext' ? S.adminNext || [] : S.todos).find(x => x.id === id); }
function dueModal() {
  const e = S.dueEd, t = dueItem(e.kind, e.id);
  if (!t) return '';
  const rule = plainDue(e.kind) ? null : dueRules()[t.id];
  return `<div class="overlay" data-act="dueClose"><div class="modal small-modal due-modal" data-stop>
    <div class="modal-head"><h2>Due Date</h2><button class="x big" data-act="dueClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <p class="due-what">${esc(t.text)}</p>
      <div class="field">Due<span class="ai-date">${datePicker('due-date', { optional: true, empty: 'No due date', title: 'Due date' })}</span></div>
      ${rule ? `<p class="muted small">The template says ${esc(ruleLabel(rule))}${ruleDate(rule) ? ` (${dueDay(ruleDate(rule))})` : ''}.
        ${t.dueAuto === false ? '<button class="link" data-act="dueAuto">Use the template’s date</button>' : 'Picking a date here changes it for this cohort only.'}</p>` : ''}
      <p class="muted small">It’s in your Morning Email 2 days before, on the day, and every day after until it’s checked off.</p>
    </div>
    <div class="modal-foot">${dueOf(e.kind, t) ? '<button class="link" data-act="dueClear">No due date</button>' : ''}
      <button class="btn primary" data-act="dueSave">Save</button></div>
  </div></div>`;
}
async function dueAct(a, el = {}) {
  const d = el.dataset || {}, e = S.dueEd;
  switch (a) {
    case 'dueOpen': {
      const t = dueItem(d.kind, d.id); if (!t) return true;
      S.dueEd = { kind: d.kind, id: d.id }; S.drafts['due-date'] = dueOf(d.kind, t); render(); return true;
    }
    case 'dueClose': S.dueEd = null; delete S.drafts['due-date']; render(); return true;
    case 'dueSave': case 'dueClear': {
      const due = a === 'dueClear' ? '' : S.drafts['due-date'] || '';
      S.dueEd = null; delete S.drafts['due-date']; render();
      await Store.set(duePath(e.kind, e.id), { due, dueAuto: false }); return true;
    }
    case 'dueAuto': {
      const t = dueItem(e.kind, e.id), r = dueRules()[e.id];
      S.dueEd = null; delete S.drafts['due-date']; render();
      await Store.set(duePath(e.kind, e.id), { due: r ? ruleDate(r) : (t && t.due) || '', dueAuto: true }); return true;
    }
  }
  return false;
}

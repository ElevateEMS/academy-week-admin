/* Staff page (header → Staff) and the Pay window (the "💵 Pay ___" line on someone's last day).
   Everything here comes from the separate "Elevate EMS Staff" Apps Script (STAFF_SCRIPT_URL in config.js), which reads and
   writes $ Finances (Payroll + Staff Directory tabs) and saves timesheet PDFs to Drive → Payroll Docs. Nothing about pay is
   kept in Firebase. Staff fill in their own times at staff.elevateemsacademy.com (a separate site).
     S.staffCo[cohort]  that cohort's people: days (role, times, hours, total, paid), flat-rate jobs, totals, missing days
     S.staffAll         the Staff Directory with this year's totals, what's owed, names on Staffing tabs not in the directory
     S.pay              the Pay window: { cohort, name, ed: { date: { role, start, end } }, flat, check, busy, err }
     S.staffEd          the add/edit person window */

const STAFF_PORTAL_URL = 'https://staff.elevateemsacademy.com';
const PAY_ROLES = ['EC & Equivalent', 'Non-Certified Instructor', 'Assistant', 'Patient']; // the pay scale's names (rates: Payroll tab)
const staffReady = () => typeof STAFF_SCRIPT_URL === 'string' && !/PASTE/.test(STAFF_SCRIPT_URL) && Store.configured;

const StaffApi = {
  async call(action, params = {}) {
    if (!staffReady()) throw new Error('The Staff Apps Script isn’t connected yet.');
    if (navigator.onLine === false) throw new Error('You’re offline.');
    const token = await Store.idToken();
    const res = await fetch(STAFF_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action, token, ...params }) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'The Staff script didn’t answer.');
    return out;
  },
};
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const to12 = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); };
// Times are military: typed "0745" (or "745") = 07:45, shown as 0745.
const hmT = t => { const d = String(t || '').replace(/\D/g, ''); if (d.length < 3 || d.length > 4) return ''; const h = +d.slice(0, -2), m = +d.slice(-2); return h <= 23 && m <= 59 ? String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') : ''; };
const milT = t => String(t || '').replace(':', '');
const qHours = (a, b) => { if (!a || !b) return 0; const m = t => { const [h, x] = t.split(':').map(Number); return h * 60 + x; }; const d = m(b) - m(a); return d > 0 ? Math.round(d / 15) / 4 : 0; };
const shortDay = iso => parseIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/* ---------- Loading ---------- */
// Like Inquiries: the last copy (kept on this computer, keepCopy) shows right away, and the fresh one replaces it
// when it comes in (staffFresh says which ones are fresh this visit).
const staffLoading = {}, staffFresh = {};
async function loadStaffCohort(cohort, fresh = false) {
  if (!staffReady() || !cohort || staffLoading['co:' + cohort]) return;
  S.staffCo = S.staffCo || {};
  if (!S.staffCo[cohort]) { const copy = keepCopy('staffco-' + cohort); if (copy) { S.staffCo[cohort] = copy; render(); } }
  staffLoading['co:' + cohort] = true; render();
  try { S.staffCo[cohort] = await StaffApi.call('adminCohort', { cohort, fresh }); S.staffCoErr = null; staffFresh['co:' + cohort] = true; keepCopy('staffco-' + cohort, S.staffCo[cohort]); }
  catch (e) { S.staffCoErr = e.message; console.warn('Staff pay not loaded:', e.message); }
  staffLoading['co:' + cohort] = false; render();
}
async function loadStaffAll(fresh = false) {
  if (!staffReady() || staffLoading.all) return;
  if (!S.staffAll) S.staffAll = keepCopy('staffall');
  staffLoading.all = true; S.staffAllErr = null; render();
  try { S.staffAll = await StaffApi.call('adminStaff', { fresh }); staffFresh.all = true; keepCopy('staffall', S.staffAll); }
  catch (e) { S.staffAllErr = e.message; }
  staffLoading.all = false; render();
}
// The cohort's pay info for one Staffing name (as typed on the Staffing tab).
function staffPayFor(staffName) {
  const co = S.staffCo && S.staffCo[S.cohortKey];
  return co ? co.people.find(p => p.staffName === staffName || p.name === staffName) || null : null;
}
const staffCohortData = () => (S.staffCo && S.staffCo[S.cohortKey]) || null;

/* ---------- Staff page ---------- */
function staffView() {
  if (!staffReady()) return `<section class="box"><p class="empty">The Staff page needs the Staff Apps Script connected (STAFF_SCRIPT_URL in config.js).</p></section>`;
  if (!staffFresh.all && !staffLoading.all && !S.staffAllErr) setTimeout(() => loadStaffAll(), 0);
  const a = S.staffAll || keepCopy('staffall');
  if (a && !S.staffAll) S.staffAll = a;
  if (!a) return S.staffAllErr ? `<div class="alert">Couldn’t load staff: ${esc(S.staffAllErr)} <button class="btn small" data-act="staffRefresh">Try again</button></div>` : '<p class="loading">Loading staff…</p>';
  if (staffTab() === 'stf') return staffingPage();
  const owed = [];
  a.people.forEach(p => p.unpaid.forEach(u => owed.push({ name: p.name, ...u })));
  const weekOf = c => ((a.weeks || []).some(w => w.cohort === c));
  return `<div class="board staff-board">
    <div class="board-col staff-main">${staffListBox(a)}</div>
    <div class="board-col">
      <section class="box"><div class="box-head admin-head"><h2>To Pay</h2></div>
        ${owed.length ? `<ul class="pay-owed">${owed.map(o => `<li><span><b>${esc(o.name)}</b><span class="muted small">${o.cohort ? esc(o.cohort) + ' Academy Week' : 'Other (on the Payroll tab)'}</span></span>
          <b>${money(o.amount)}</b>${o.cohort ? `<button class="btn tiny" data-act="payOpen" data-name="${esc(o.name)}" data-cohort="${esc(o.cohort)}">Pay</button>` : '<span></span>'}</li>`).join('')}</ul>`
          : '<p class="empty">Nobody’s waiting on a check.</p>'}
      </section>
      ${a.unmatched.length ? `<section class="box"><div class="box-head admin-head"><h2>Not in the Staff Directory</h2></div>
        <p class="muted small">On a Staffing tab, but not on the Staff Directory tab (so they can’t sign in or be paid here yet).</p>
        <ul class="pay-owed">${a.unmatched.map(u => `<li><span><b>${esc(u.name)}</b><span class="muted small">${esc(u.cohort)}</span></span><span></span>
          <button class="btn tiny" data-act="staffEdOpen" data-new="${esc(u.name)}">Add</button></li>`).join('')}</ul></section>` : ''}
      <section class="box staff-portal-box"><div class="box-head admin-head"><h2>Staff Portal<small>schedule and timesheets</small></h2></div>
        <p class="center staff-link"><a href="${STAFF_PORTAL_URL}" target="_blank" rel="noopener" data-chrome>${STAFF_PORTAL_URL.replace('https://', '')}</a>
          <button class="eye" data-act="staffCopyLink" title="Copy link" aria-label="Copy link"><svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg></button></p>
        <div class="staff-qr" id="staffQr"></div>
      </section>
      <section class="box staff-portal-box"><div class="box-head admin-head"><h2>Staffing by Cohort<small>paid and not paid yet</small></h2></div>
        ${(a.cohorts || []).length ? `<ul class="pay-owed st-cohorts">${a.cohorts.map(c => `<li><span><b>${weekOf(c.cohort) ? `<button class="link-btn" data-act="stfGo" data-cohort="${esc(c.cohort)}" title="Availability & Staffing for this week">${esc(c.cohort)}</button>` : esc(c.cohort)}</b><span class="muted small">Academy Week${c.waiting ? ` · ${c.waiting} not paid yet (${money(c.unpaid)})` : ' · all paid'}</span></span>
          <b>${money(c.total)}</b><span></span></li>`).join('')}</ul>`
          : '<p class="empty">Nothing on the Payroll tab for a cohort yet.</p>'}
      </section>
    </div>
  </div>`;
}
// Staff page title: "Staff", or on Scheduling "Scheduling" with the week under it (▾ = the other upcoming weeks).
function staffTitle() {
  if (staffTab() !== 'stf') return '<h1>Staff</h1>';
  const weeks = (S.staffAll && S.staffAll.weeks) || [], key = stfKey(), w = weeks.find(x => x.cohort === key);
  const when = x => monthDay(x.start) + '–' + monthDay(x.end);
  if (!key) return '<h1>Scheduling</h1>';
  return `<h1>Scheduling</h1><div class="stf-week-pick"><button class="stf-week-btn" data-act="stfWeekMenu" aria-expanded="${!!S.stfWeekMenu}">${esc(key)} Academy Week${w ? ' · ' + when(w) : ''}${weeks.length > 1 ? ' ▾' : ''}</button>
    ${S.stfWeekMenu && weeks.length > 1 ? `<div class="stf-week-menu">${weeks.map(x => `<button class="${x.cohort === key ? 'on' : ''}" data-act="stfWeek" data-cohort="${esc(x.cohort)}">${esc(x.cohort)} Academy Week <span class="muted small">${when(x)}</span></button>`).join('')}</div>` : ''}</div>`;
}
// The week menu closes when you click anywhere else.
document.addEventListener('click', e => { if (S.stfWeekMenu && !e.target.closest('.stf-week-pick')) { S.stfWeekMenu = false; render(); } }, true);
// Staff page: Staff & Pay | Scheduling (in the header, like Course | Academy Week).
const staffTab = () => S.staffTab || pref('staffTab') || 'pay';
function staffTabs() {
  return `<div class="side-switch staff-switch" role="group" aria-label="Staff page">${[['pay', 'Staff & Pay'], ['stf', 'Scheduling']]
    .map(([k, l]) => `<button class="${staffTab() === k ? 'on' : ''}" data-act="stfTab" data-t="${k}">${l}</button>`).join('')}</div>`;
}
function staffListBox(a) {
  const away = a.people.filter(p => p.inactive);
  const bar = p => {
    const pct = Math.min(100, (p.year / a.limit) * 100), soon = Math.min(100, ((p.year + p.coming) / a.limit) * 100);
    const cls = p.year >= a.limit ? 'over' : p.year >= a.alerts[0] ? 'near' : '';
    return `<div class="yr ${cls}" title="${money(p.year)} so far${p.coming ? ' + about ' + money(p.coming) + ' still scheduled' : ''} (limit ${money(a.limit)})">
      <div class="yr-bar"><span class="yr-soon" style="width:${soon}%"></span><span class="yr-now" style="width:${pct}%"></span></div>
      <span class="yr-num">${money(p.year)}${p.coming ? ` <span class="muted">+${money(p.coming)}</span>` : ''}</span></div>`;
  };
  return `<section class="box staff-list-box"><div class="box-head admin-head"><h2>Staff</h2><span class="head-actions">
      <button class="eye inq-reload ${staffLoading.all ? 'spin' : ''}" data-act="staffRefresh" title="${staffLoading.all ? 'Checking for changes…' : 'Read the sheets again'}" aria-label="Refresh">${RESET}</button>
      <button class="add-plus small-plus" data-act="staffEdOpen" title="Add someone" aria-label="Add someone">+</button></span></div>
    <div class="staff-table">
      <div class="st-row st-head"><span>Name</span><span>Phone</span><span>Email</span><span>Portal</span><span>W-9</span><span title="Paid and not paid yet, from the Payroll tab. The faded part is days still on the schedule (about 8 hrs each). Limit ${money(a.limit)}.">${a.year} total</span></div>
      ${a.people.filter(p => !p.inactive).map(staffRow).join('')}
      ${away.length ? `<button class="st-away-head" data-act="staffAway"><span class="inq-caret">${S.staffShowAway ? '▾' : '▸'}</span> Inactive (away for now) <span class="count">${away.length}</span></button>
        ${S.staffShowAway ? away.map(staffRow).join('') : ''}` : ''}
    </div></section>`;
  function staffRow(p) { return `<div class="st-row ${p.inactive ? 'away' : ''}">
        <span><button class="link-btn" data-act="staffEdOpen" data-name="${esc(p.name)}">${esc(p.name)}</button>${p.role || p.roleText ? `<span class="muted small st-role">${esc(p.role || p.roleText)}</span>` : '<span class="small st-role tbd">No role picked</span>'}</span>
        <span>${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : '<span class="tbd">None</span>'}</span>
        <span class="st-email">${p.email ? esc(p.email) : '<span class="tbd">None</span>'}</span>
        <span>${p.account ? '<span class="tag sage-tag">Set up</span>' : '<span class="muted small">Not yet</span>'}</span>
        <span>${p.w9 && p.w9.on ? `<span class="tag sage-tag" title="On file since ${esc(p.w9.date)} (Payroll Docs → ${esc(p.name)})">✓</span>` : '<span class="muted small">Needed</span>'}</span>
        ${bar(p)}
      </div>`; }
}
function showStaffQr() {
  const el = document.getElementById('staffQr');
  if (!el || el.dataset.done) return;
  el.dataset.done = '1';
  loadQr().then(() => drawQr(el, STAFF_PORTAL_URL, 150)).catch(e => { el.textContent = e.message; });
}

/* ---------- Add / edit a person ---------- */
function staffEdModal() {
  const e = S.staffEd, v = k => esc(S.drafts['se-' + k] ?? '');
  const f = (k, label, type = 'text', ph = '') => `<label class="field">${label}<input id="se-${k}" type="${type}" data-draft="se-${k}" value="${v(k)}" placeholder="${ph}" autocomplete="off"></label>`;
  return `<div class="overlay" data-act="staffEdClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>${e.orig ? esc(e.orig) : 'Add someone'}</h2><button class="x big" data-act="staffEdClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      ${f('name', 'Name (as they should be paid)')}
      <label class="field">Maximum eligible role<select id="se-role" data-draft="se-role">
        <option value="">Pick one</option>${[...PAY_ROLES, ...(S.drafts['se-role'] && !PAY_ROLES.includes(S.drafts['se-role']) ? [S.drafts['se-role']] : [])]
          .map(r => `<option ${r === S.drafts['se-role'] ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <p class="muted small se-hint">What they're paid on an Instructor day. Change it when someone gets certified; their unpaid Instructor days move to the new rate.</p>
      ${f('phone', 'Phone', 'tel')}
      ${f('email', 'Email', 'email')}
      <div class="se-em"><span class="muted small">Emergency contact</span>
        <div class="se-em-row">${f('emName', 'Name')}${f('emPhone', 'Phone', 'tel')}${f('emRel', 'Relationship')}</div></div>
      ${f('notes', 'Notes')}
      <label class="check-line se-away"><input type="checkbox" data-act="staffEdInactive" ${e.inactive ? 'checked' : ''}> <span><b>Inactive</b> · away for now (school, out of town). Not listed for scheduling; their pay and info stay. Saved in the Staff Directory’s Status column.</span></label>
      ${e.orig ? `<p class="muted small">${e.account ? 'They’ve set up their Staff Portal account.' : 'They haven’t set up their Staff Portal account yet.'}
        ${e.account ? ` <button class="link" data-act="staffResetPw">Reset their password</button>` : ''}</p>` : ''}
      ${e.err ? `<div class="alert">${esc(e.err)}</div>` : ''}
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="staffEdSave" ${e.busy ? 'disabled' : ''}>${e.busy ? 'Saving…' : 'Save'}</button></div>
  </div></div>`;
}

/* ---------- Pay window ---------- */
function payModal() {
  const P = S.pay, co = S.staffCo && S.staffCo[P.cohort];
  const p = co && co.people.find(x => x.name === P.name || x.staffName === P.name);
  const head = `<div class="modal-head"><h2>Pay ${esc(p ? p.name : P.name)}</h2><button class="x big" data-act="payClose" aria-label="Close">×</button></div>`;
  if (!co || !p) return `<div class="overlay" data-act="payClose"><div class="modal pay-modal" data-stop>${head}
    <div class="modal-body pad-top">${S.staffCoErr && !co ? `<div class="alert">${esc(S.staffCoErr)}</div>`
      : co ? `<p class="empty">${esc(P.name)} isn’t on ${esc(P.cohort)}’s Staffing tab and has nothing on the Payroll tab for it.</p>` : '<p class="loading">Loading…</p>'}</div></div></div>`;
  const rates = co.rates || {};
  const dayRow = d => {
    const ed = P.ed[d.date] || {}, role = ed.role ?? d.role, start = ed.start ?? milT(d.start), end = ed.end ?? milT(d.end);
    const hrs = qHours(hmT(start), hmT(end)), rate = rates[role] ?? d.rate, dirty = P.ed[d.date] && (role !== d.role || start !== milT(d.start) || end !== milT(d.end));
    const lock = d.paid || !d.editable;
    const sigTag = !d.row ? '<span class="tag-soft notimes">no times yet</span>'
      : d.needsSig ? `<span class="tag-soft warn" title="${d.fix ? 'Changed by ' + esc(d.fix.by) + (d.fix.from ? ' from ' + esc(d.fix.from) : '') : ''}">${d.fix ? 'correction · ' : ''}needs signature</span>`
      : d.signed ? `<span class="tag-soft sage-soft">signed${d.signedHow === 'inperson' ? ' in person' : ''} ✓</span>` : '';
    return `<div class="pay-row ${d.paid ? 'paid' : ''} ${!d.row ? 'empty-day' : ''}">
      <span class="pr-date">${shortDay(d.date)}${d.exam ? ' <span class="muted small">exam</span>' : ''}${sigTag}${d.over && !d.paid ? `<span class="tag-soft warn" title="Their maximum eligible role is ${esc(p.maxRole)}">above ${esc(p.maxRole)}</span>` : ''}</span>
      ${lock ? `<span>${esc(d.role)}</span><span>${d.start ? milT(d.start) + '–' + milT(d.end) : '—'}</span>`
        : `<select data-payf="role" data-date="${d.date}" aria-label="Role">${PAY_ROLES.map(r => `<option ${r === role ? 'selected' : ''}>${r}</option>`).join('')}</select>
           <span class="pr-times"><input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc((d.sched || '0800–1700').split('–')[0])}" id="pay-s-${d.date}" data-payf="start" data-date="${d.date}" value="${esc(start)}" aria-label="Start">
           <input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc((d.sched || '0800–1700').split('–')[1] || '')}" id="pay-e-${d.date}" data-payf="end" data-date="${d.date}" value="${esc(end)}" aria-label="End"></span>`}
      <span class="pr-num">${hrs || d.hours ? (lock ? d.hours : hrs) + ' hrs' : ''}</span>
      <span class="pr-num">${lock ? money(d.total) : hrs ? money(hrs * rate) : ''}<span class="muted small"> ${money(rate)}/hr</span></span>
      <span class="pr-act">${dirty ? `<button class="btn tiny" data-act="paySaveDay" data-date="${d.date}" ${P.busy ? 'disabled' : ''}>Save</button>`
        : d.row && d.needsSig ? `<button class="btn tiny" data-act="paySign" data-date="${d.date}" ${P.busy ? 'disabled' : ''} title="They sign on this computer">Sign here</button>`
        : d.paid ? `<span class="tag sage-tag">Paid${d.check ? ' #' + esc(d.check) : ''}</span>`
        : !d.editable ? '<span class="muted small">typed on the sheet</span>'
        : d.row ? `<button class="x" data-act="payClearDay" data-date="${d.date}" title="Clear this day's times" aria-label="Clear">×</button>` : ''}</span>
    </div>`;
  };
  const flatRow = f => `<div class="pay-row flat ${f.paid ? 'paid' : ''}"><span class="pr-date">${shortDay(f.date)}</span><span class="pr-desc">${f.reimb ? 'Reimbursement' : 'Extra pay'}: ${esc(f.desc)}${f.reimb ? ' <span class="muted small" title="Paying them back for something they bought: not income, so it doesn’t count toward their yearly limit">(not income)</span>' : ''}</span><span></span>
    <span class="pr-num">${money(f.total)}</span><span class="pr-act">${f.paid ? `<span class="tag sage-tag">Paid${f.check ? ' #' + esc(f.check) : ''}</span>`
      : `<button class="x" data-act="payFlatDel" data-row="${f.row}" title="Delete" aria-label="Delete">×</button>`}</span></div>`;
  const days = co.days.filter(d => d.date);
  const fl = P.flat;
  const flatForm = fl ? `<div class="pay-flat-form">
      <select data-payflat="kind" aria-label="Kind"><option value="extra" ${fl.kind !== 'reimb' ? 'selected' : ''}>Extra pay</option><option value="reimb" ${fl.kind === 'reimb' ? 'selected' : ''}>Reimbursement</option></select>
      <select data-payflat="date" aria-label="Date">${days.map(d => `<option value="${d.date}" ${d.date === fl.date ? 'selected' : ''}>${shortDay(d.date)}</option>`).join('')}</select>
      <input id="pay-fdesc" data-payflat="desc" value="${esc(fl.desc)}" placeholder="${fl.kind === 'reimb' ? 'What they bought (ex. food)' : 'What for (ex. gas)'}">
      <input id="pay-famt" data-payflat="amount" value="${esc(fl.amount)}" placeholder="$" inputmode="decimal">
      <button class="btn tiny" data-act="payFlatAdd" ${P.busy ? 'disabled' : ''}>Add</button><button class="link" data-act="payFlatCancel">Cancel</button></div>`
    : `<button class="link" data-act="payFlatOpen">+ Add extra</button>`;
  return `<div class="overlay" data-act="payClose"><div class="modal pay-modal" data-stop>${head}
    <div class="modal-body pad-top">
      <p class="muted small">${esc(P.cohort)} Academy Week${p.maxRole ? ' · ' + esc(p.maxRole) : p.matched ? ' · no maximum eligible role picked yet' : ''}${p.phone ? ' · ' + esc(p.phone) : ''}${p.email ? ' · ' + esc(p.email) : ''}${p.matched ? (p.account ? '' : ' · hasn’t set up the Staff Portal yet') : ''}</p>
      ${!p.matched ? `<div class="alert">${esc(p.name)} isn’t on the Staff Directory tab, so they can’t sign in to put in times. <button class="btn small" data-act="staffEdOpen" data-new="${esc(p.name)}">Add them</button></div>` : ''}
      <div class="pay-table">${p.days.map(dayRow).join('')}${p.flats.map(flatRow).join('')}</div>
      <div class="pay-under">${p.paid ? '' : flatForm}<span class="pay-total">Total <b>${money(p.total)}</b>${p.unpaid && p.unpaid !== p.total ? ` · <span class="muted">${money(p.unpaid)} not paid yet</span>` : ''}</span></div>
      ${p.missing.length && !p.paid ? `<p class="muted small">No times yet for ${p.missing.map(shortDay).join(', ')}. They can fill them in on the Staff Portal, or you can type them here (military time, like 0800), and then they sign.</p>` : ''}
      ${(p.unsigned || []).length ? `<p class="pay-sign-note"><span>${p.unsigned.length} day${p.unsigned.length === 1 ? '' : 's'} need${p.unsigned.length === 1 ? 's' : ''} ${esc(p.name.split(' ')[0])}’s signature (${p.unsigned.map(shortDay).join(', ')}). They can sign on their phone, or here.</span>
        ${p.unsigned.length > 1 ? `<button class="btn small" data-act="paySignAll" ${P.busy ? 'disabled' : ''}>Sign all ${p.unsigned.length} here</button>` : ''}</p>` : ''}
      ${P.err ? `<div class="alert">${esc(P.err)}</div>` : ''}
      ${P.pdfUrl ? `<p class="small">Timesheet saved to Payroll Docs → ${esc(p.name)}. <a href="${esc(P.pdfUrl)}" target="_blank" rel="noopener" data-chrome>Open it ↗</a></p>` : ''}
    </div>
    <div class="modal-foot pay-foot">
      ${p.unpaid > 0 ? `<button class="btn primary" data-act="payCheckOpen" ${P.busy || staffLoading['co:' + P.cohort] ? 'disabled' : ''}>${P.busy ? 'Saving…' : staffLoading['co:' + P.cohort] ? 'Checking for the latest…' : 'Pay · ' + money(p.unpaid)}</button>`
      : p.paid ? `<span class="muted">Paid${p.checks.length ? ' · Check #' + p.checks.map(esc).join(', #') : ''}</span>
        <button class="btn small" data-act="payPdf" ${P.busy ? 'disabled' : ''}>Timesheet PDF</button>
        <button class="link" data-act="payUndo" ${P.busy ? 'disabled' : ''}>Undo paid</button>` : '<span class="muted">Nothing to pay yet.</span>'}
    </div>
  </div></div>`;
}

function staffModals() { return (S.pay ? payModal() + (S.pay.check ? checkModal() : '') : '') + (S.staffEd ? staffEdModal() : '') + staffingModals(); }

/* ---------- Writing the check (Pay → this → Check given · Paid) ---------- */
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numWords(n) {
  if (n === 0) return 'zero';
  const under1000 = x => { const h = Math.floor(x / 100), r = x % 100;
    const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '');
    return [h ? ONES[h] + ' hundred' : '', rest].filter(Boolean).join(' '); };
  const parts = [[1e6, 'million'], [1e3, 'thousand'], [1, '']].map(([v, name]) => { const x = Math.floor(n / v) % 1000; return x ? under1000(x) + (name ? ' ' + name : '') : ''; });
  return parts.filter(Boolean).join(' ');
}
// "$345.00" → "Three hundred forty-five and 00/100"
function checkWords(amount) {
  const cents = Math.round(amount * 100), d = Math.floor(cents / 100), c = cents % 100;
  const w = numWords(d);
  return w.charAt(0).toUpperCase() + w.slice(1) + ' and ' + String(c).padStart(2, '0') + '/100';
}
function nextCheckNo() { const last = String(keepCopy('lastCheck') || ''); return /^\d+$/.test(last) ? String(Number(last) + 1) : ''; }
function checkModal() {
  const P = S.pay, p = payPerson(), un = p.unsigned || [];
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  return `<div class="overlay check-overlay" data-act="payCheckClose"><div class="modal small-modal check-modal" data-stop>
    <div class="modal-head"><h2>Write the check</h2><button class="x big" data-act="payCheckClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <div class="check-face">
        <div class="cf-top"><span>Date <b>${today}</b></span><label>No. <input id="pay-check" data-draft="pay-check" value="${esc(S.drafts['pay-check'] ?? '')}" inputmode="numeric" autocomplete="off" placeholder="1001"></label></div>
        <div class="cf-row"><span class="cf-label">Pay to the order of</span><b class="cf-line">${esc(p.name)}</b><b class="cf-amt">${money(p.unpaid)}</b></div>
        <div class="cf-row"><b class="cf-line cf-words">${esc(checkWords(p.unpaid))}</b><span class="cf-label">dollars</span></div>
        <div class="cf-row"><span class="cf-label">Memo</span><span class="cf-line">${esc(P.cohort)} Academy Week</span></div>
      </div>
      ${un.length ? `<p class="pay-sign-note"><span>${un.length} day${un.length === 1 ? ' isn’t' : 's aren’t'} signed yet (${un.map(shortDay).join(', ')}). You can still pay; the timesheet will show ${un.length === 1 ? 'it' : 'them'} as not signed.</span></p>` : ''}
      ${P.err ? `<div class="alert">${esc(P.err)}</div>` : ''}
    </div>
    <div class="modal-foot pay-foot"><button class="link" data-act="payCheckClose">Cancel</button>
      <button class="btn primary" data-act="payMark" ${P.busy ? 'disabled' : ''}>${P.busy ? 'Saving…' : 'Check given · Paid'}</button></div>
  </div></div>`;
}

// Typing in the Pay window (times, role, the flat-rate line).
function staffInput(t) {
  if (t.dataset.payf && S.pay) {
    const d = t.dataset.date, co = S.staffCo[S.pay.cohort], p = co && co.people.find(x => x.name === S.pay.name || x.staffName === S.pay.name);
    const day = p && p.days.find(x => x.date === d);
    const ed = S.pay.ed[d] = S.pay.ed[d] || { role: day.role, start: milT(day.start), end: milT(day.end) };
    if (t.dataset.payf === 'role') ed.role = t.value;
    else { const digits = t.value.replace(/\D/g, '').slice(0, 4); if (t.value !== digits) t.value = digits; ed[t.dataset.payf] = digits; }
    render(); return true;
  }
  if (t.dataset.payflat && S.pay && S.pay.flat) { S.pay.flat[t.dataset.payflat] = t.value; if (t.dataset.payflat === 'kind') render(); return true; }
  return false;
}
function staffEscape() {
  if (staffingEscape()) return true;
  if (S.staffEd) { if (S.staffEd.busy) return true; S.staffEd = null; return true; }
  if (S.pay && S.pay.check) { if (S.pay.busy) return true; S.pay.check = false; return true; }
  if (S.pay) { if (S.pay.busy) return true; S.pay = null; return true; }
  return false;
}

async function payDo(fn) {
  const P = S.pay; P.busy = true; P.err = ''; render();
  try { const out = await fn(); if (out && out.people) { S.staffCo[P.cohort] = out; keepCopy('staffco-' + P.cohort, out); } staffFresh.all = false; }
  catch (e) { P.err = e.message; }
  P.busy = false; render();
}

async function staffAct(a, el = {}) {
  if (a.startsWith('stf')) return staffingAct(a, el);
  const d = el.dataset || {};
  switch (a) {
    case 'staffRefresh': S.staffAllErr = null; loadStaffAll(true); return true;
    case 'w9Info': toast('They fill out their W-9 on the Staff Portal (the person icon → W-9). This checks itself off when it’s in.'); return true;
    case 'staffCopyLink': try { await navigator.clipboard.writeText(STAFF_PORTAL_URL); toast('Link copied.'); } catch { toast(STAFF_PORTAL_URL); } return true;
    case 'payOpen': {
      if (!staffReady()) { toast('The Staff Apps Script isn’t connected yet.'); return true; }
      const cohort = d.cohort || S.cohortKey;
      S.pay = { cohort, name: d.name, ed: {}, flat: null, busy: false, err: '', pdfUrl: '', check: false }; S.drafts['pay-check'] = '';
      render();
      await loadStaffCohort(cohort, true); // (always the latest here: this is where money gets marked paid)
      return true;
    }
    case 'payClose': if (S.pay && !S.pay.busy) { S.pay = null; render(); } return true;
    case 'paySaveDay': {
      const P = S.pay, ed = P.ed[d.date], name = payPerson().name;
      await payDo(async () => { const out = await StaffApi.call('adminSaveDay', { cohort: P.cohort, name, date: d.date, role: ed.role, start: ed.start, end: ed.end }); delete P.ed[d.date]; return out; });
      return true;
    }
    case 'payClearDay': {
      if (!confirm('Clear this day’s times?')) return true;
      const P = S.pay, name = payPerson().name;
      await payDo(async () => { const out = await StaffApi.call('adminSaveDay', { cohort: P.cohort, name, date: d.date, clear: true }); delete P.ed[d.date]; return out; });
      return true;
    }
    case 'payFlatOpen': { const co = S.staffCo[S.pay.cohort], p = payPerson(); S.pay.flat = { kind: 'extra', date: (p.days[p.days.length - 1] || co.days[0] || {}).date || '', desc: '', amount: '' }; render(); setTimeout(() => { const x = document.getElementById('pay-fdesc'); if (x) x.focus(); }, 0); return true; }
    case 'payFlatCancel': S.pay.flat = null; render(); return true;
    case 'payFlatAdd': {
      const P = S.pay, f = P.flat;
      await payDo(async () => { const out = await StaffApi.call('adminFlat', { cohort: P.cohort, name: payPerson().name, date: f.date, desc: f.desc, amount: f.amount, kind: f.kind }); P.flat = null; return out; });
      return true;
    }
    case 'payFlatDel': {
      if (!confirm('Delete this line?')) return true;
      const P = S.pay;
      await payDo(() => StaffApi.call('adminFlat', { cohort: P.cohort, name: payPerson().name, row: Number(d.row), del: true }));
      return true;
    }
    case 'paySign': case 'paySignAll': {
      const P = S.pay, p = payPerson(), dates = a === 'paySignAll' ? [...(p.unsigned || [])] : [d.date];
      const days = p.days.filter(x => dates.includes(x.date));
      const what = days.map(x => `${shortDay(x.date)} ${milT(x.start)}–${milT(x.end)}`).join(' · ');
      const png = await sigPadOpen(`${p.name} signs ${dates.length > 1 ? dates.length + ' days' : shortDay(dates[0])}`, `${p.name.split(' ')[0]} signs with the trackpad or mouse. ${what}`);
      if (!png) return true;
      await payDo(async () => { const out = await StaffApi.call('adminSign', { cohort: P.cohort, name: p.name, dates, png }); toast('Signed.'); return out; });
      return true;
    }
    case 'payCheckOpen': {
      if (staffLoading['co:' + S.pay.cohort]) { toast('Checking for the latest first… one moment.'); return true; }
      const P = S.pay;
      const dirty = payPerson().days.some(x => { const e = P.ed[x.date]; return e && (e.role !== x.role || e.start !== milT(x.start) || e.end !== milT(x.end)); });
      if (dirty && !confirm('A day has changes that aren’t saved. Pay without them?')) return true;
      if (!S.drafts['pay-check']) S.drafts['pay-check'] = nextCheckNo();
      P.check = true; P.err = ''; render();
      setTimeout(() => { const x = document.getElementById('pay-check'); if (x) { x.focus(); x.select(); } }, 0);
      return true;
    }
    case 'payCheckClose': if (S.pay && !S.pay.busy) { S.pay.check = false; render(); } return true;
    case 'payMark': {
      const P = S.pay, check = String(S.drafts['pay-check'] || '').trim().replace(/^#/, '');
      if (!check) { toast('Type the check number.'); return true; }
      await payDo(async () => {
        const out = await StaffApi.call('adminMarkPaid', { cohort: P.cohort, name: payPerson().name, check });
        P.ed = {}; P.check = false; P.pdfUrl = out.pdfUrl || ''; keepCopy('lastCheck', check);
        if (out.pdfErr) P.err = 'Paid, but the timesheet PDF wasn’t saved: ' + out.pdfErr;
        toast('Paid · ' + money(out.paidTotal) + ' · Check #' + check);
        return out;
      });
      return true;
    }
    case 'payUndo': {
      if (!confirm('Mark this as not paid? (The timesheet PDF goes to the trash.)')) return true;
      const P = S.pay;
      await payDo(async () => { const out = await StaffApi.call('adminUnpay', { cohort: P.cohort, name: payPerson().name }); P.pdfUrl = ''; return out; });
      return true;
    }
    case 'payPdf': {
      const P = S.pay;
      if (P.pdfUrl) { window.open(P.pdfUrl, '_blank', 'noopener'); return true; }
      P.busy = true; render();
      try { const out = await StaffApi.call('adminTimesheetPdf', { cohort: P.cohort, name: payPerson().name }); P.pdfUrl = out.url; window.open(out.url, '_blank', 'noopener'); }
      catch (e) { P.err = e.message; }
      P.busy = false; render(); return true;
    }
    case 'staffEdOpen': {
      const p = d.name && S.staffAll ? S.staffAll.people.find(x => x.name === d.name) : null;
      const base = p || { name: d.new || '', role: '', phone: '', email: '', notes: '', emergency: {} };
      Object.entries({ name: base.name, role: base.role || base.roleText, phone: base.phone, email: base.email, notes: base.notes,
        emName: (base.emergency || {}).name, emPhone: (base.emergency || {}).phone, emRel: (base.emergency || {}).relation })
        .forEach(([k, v]) => { S.drafts['se-' + k] = v || ''; });
      S.staffEd = { orig: p ? p.name : '', account: p ? p.account : false, inactive: !!(p && p.inactive), busy: false, err: '' };
      render(); setTimeout(() => { const x = document.getElementById('se-' + (p ? 'phone' : 'name')); if (x) x.focus(); }, 0);
      return true;
    }
    case 'staffEdInactive': S.staffEd.inactive = !S.staffEd.inactive; render(); return true;
    case 'staffAway': S.staffShowAway = !S.staffShowAway; render(); return true;
    case 'staffEdClose': if (S.staffEd && !S.staffEd.busy) { S.staffEd = null; render(); } return true;
    case 'staffEdSave': {
      const e = S.staffEd, g = k => String(S.drafts['se-' + k] || '').trim();
      if (!g('name')) { e.err = 'Type their name.'; render(); return true; }
      if (e.orig && g('name') !== e.orig && !confirm(`Change the name from ${e.orig} to ${g('name')}? Their rows on the Payroll tab change too.`)) return true;
      e.busy = true; e.err = ''; render();
      try {
        S.staffAll = await StaffApi.call('adminSavePerson', { orig: e.orig, name: g('name'), role: g('role'), phone: g('phone'), email: g('email'), notes: g('notes'),
          emergency: { name: g('emName'), phone: g('emPhone'), relation: g('emRel') }, inactive: !!e.inactive });
        S.staffEd = null; toast('Saved to the Staff Directory.');
        if (S.cohortKey) loadStaffCohort(S.cohortKey, true);
        Object.keys(stfFresh).forEach(k => { stfFresh[k] = false; }); // (Scheduling reads Inactive again)
      } catch (err) { e.err = err.message; e.busy = false; }
      render(); return true;
    }
    case 'staffResetPw': {
      const e = S.staffEd;
      if (!confirm(`Reset ${e.orig}'s password? They'll set up their account again (with their name and phone number).`)) return true;
      e.busy = true; render();
      try { S.staffAll = await StaffApi.call('adminResetPassword', { name: e.orig }); e.account = false; toast('Done. They can set up their account again.'); }
      catch (err) { e.err = err.message; }
      e.busy = false; render(); return true;
    }
  }
  return false;
}
function payPerson() {
  const co = S.staffCo[S.pay.cohort];
  return co.people.find(x => x.name === S.pay.name || x.staffName === S.pay.name);
}

/* ---------- "Finalize staffing" (Course To-Do, 6 weeks before Academy Week) ----------
   Added once to the Course To-Do template, and once to each cohort that already has its Course To-Do
   (checked when its Academy Week has already started). Its button opens Staff → Availability & Staffing for the cohort. */
const STAFFING_ITEM = 'Finalize staffing', STAFFING_TPL = STAFFING_ITEM + ' [due 6 weeks before academy week]';
const isStaffingItem = text => /^finalize staffing/i.test(String(text || '').trim());
let staffingTplTried = false, staffingTried = null;
async function seedStaffingTodo() {
  const st = S.settings;
  if (st && !st.staffingTodo && !staffingTplTried) {
    staffingTplTried = true;
    try {
      if (await Store.claim('meta/settings', 'staffingTodo')) {
        const list = [...(st.courseTodoList || DEFAULTS.courseTodoList)];
        if (!list.some(l => isStaffingItem(tplText(l)))) { list.push(STAFFING_TPL); await Store.set('meta/settings', { courseTodoList: list }); }
      }
    } catch (e) { console.warn('Staffing to-do template not added:', e.message); }
  }
  const key = S.cohortKey, doc = S.cohortDoc;
  if (!doc || !S.todosLoaded || !doc.ctodoAdded || doc.staffingTodo || staffingTried === key) return; // (a new cohort gets it from the template)
  staffingTried = key;
  try {
    if (!(await Store.claim('cohorts/' + key, 'staffingTodo')) || key !== S.cohortKey) return;
    const id = 'ctodo-' + slug(STAFFING_ITEM);
    if (S.todos.some(t => t.id === id || (t.kind === 'ctodo' && isStaffingItem(t.text))) || (doc.removedRepeats || {})[id]) return;
    const start = S.sheet && S.sheet.academyStart, began = isIsoDate(start) && start <= todayIso();
    await Store.set(P('todos/' + id), { text: STAFFING_ITEM, done: began, day: SETUP, kind: 'ctodo', order: 99000, created: Date.now(), repeat: true }, false);
  } catch (e) { console.warn('Staffing to-do not added:', e.message); }
}
function staffingLink() {
  return `<button class="btn tiny" data-act="stfGo" data-cohort="${esc(S.cohortKey)}" title="Staff → Availability & Staffing for this cohort">Staffing</button>`;
}

/* ---------- Staff page → Availability & Staffing ----------
   One upcoming Academy Week at a time (the buttons up top). From the Staff script (adminStaffing): the week's days,
   every slot on that cohort's Staffing tab (by its label, like "Instructor 3"), everyone on Staff Directory with their
   availability (what they picked on the Staff Portal, or what you entered: one click per box), and the plan:
     plan.students   your student count (empty = enrolled), plan.stations { date: n },
     plan.draft      { "Instructor 3|2": "Jason Kearney" } picks that aren't on the Staffing tab yet. Staff only see the
                     Staffing tab, so you can move people around here; "Put on the Staffing tab" writes them all.
   Station math: skills days = the fewest stations with 5 or fewer students each (6 each shown as a hint if you're
   short); the last day (psychomotor exam) = 3 stations → 3 instructors + 3 assistants + 3 patients. 1 instructor per
   station; Nick counts like anyone in an Instructor slot (on unless you take him off that day), Bella if you add her. */
const AV_LABEL = { yes: 'Available', maybe: 'Maybe', no: 'Unavailable' };
const AV_NEXT = { '': 'yes', yes: 'maybe', maybe: 'no', no: '' };
const OWNERS = ['Nick Brown', 'Bella Brown'];
const stfLoading = {}, stfFresh = {};
const stfKey = () => {
  const weeks = (S.staffAll && S.staffAll.weeks) || [];
  if (S.stfKey && (weeks.some(w => w.cohort === S.stfKey) || (S.stf && S.stf[S.stfKey] && !isTestCohort(S.stfKey)))) return S.stfKey; // (never a test cohort)
  const saved = pref('stfKey');
  return (weeks[0] && weeks[0].cohort) || (saved && !isTestCohort(saved) ? saved : '');
};
async function loadStaffing(cohort, fresh = false) {
  if (!staffReady() || !cohort || stfLoading[cohort]) return;
  S.stf = S.stf || {};
  if (!S.stf[cohort]) { const copy = keepCopy('stf-' + cohort); if (copy) S.stf[cohort] = copy; }
  stfLoading[cohort] = true; S.stfErr = null; render();
  try { S.stf[cohort] = await StaffApi.call('adminStaffing', { cohort, fresh }); stfFresh[cohort] = true; keepCopy('stf-' + cohort, S.stf[cohort]); }
  catch (e) { S.stfErr = e.message; }
  stfLoading[cohort] = false; render();
}
const stfCo = () => (S.stf && S.stf[stfKey()]) || null;
const enrolledCount = co => (stfKey() === S.cohortKey && S.sheet ? attending().length : (co && co.enrolled) || 0);
const studentCount = co => enrolledCount(co); // (always the roster: you staff from it a few weeks out)
function dayPlan(co, day) {
  const n = studentCount(co), over = ((co.plan && co.plan.stations) || {})[day.date];
  if (day.exam) { const st = over != null ? Number(over) : 3; return { stations: st, auto: over == null, need: { Instructor: st, Assistant: st, Patient: st } }; }
  const st = over != null ? Number(over) : Math.max(1, Math.ceil(n / 5)), six = Math.max(1, Math.ceil(n / 6));
  return { stations: st, auto: over == null, per: st ? Math.ceil(n / st) : 0, six: six < st ? six : null, need: { Instructor: st, Assistant: 0, Patient: 0 } };
}
const slotKind = role => role === 'EC' ? 'Instructor' : role;
const PM_MINUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8"/></svg>', PM_PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8M8 4v8"/></svg>';
// Other slots (admin help, photographer…: a flat amount, never a station): everyone in one that day, plus one empty slot.
function otherSlots(co, i) {
  const rows = co.sections.filter(s => s.role === 'Other').flatMap(s => s.rows);
  if (!rows.length) return [];
  const info = r => ((co.plan && co.plan.other) || {})[r.label + '|' + i] || {};
  const out = rows.map(r => ({ ...r, value: cellOf(co, r, i), draft: isDraft(co, r, i) })).filter(x => filled(x.value)).map(x => ({ ...x, info: info(x) }));
  const spare = rows.find(r => !filled(cellOf(co, r, i)));
  if (spare) out.push({ ...spare, value: 'OPEN', spare: true, info: {} });
  else { const last = rows[rows.length - 1].label, m = last.match(/^(.*?)(\d+)\s*$/), label = m ? m[1] + (Number(m[2]) + 1) : 'Other ' + (rows.length + 1), dv = draftOf(co)[label + '|' + i];
    out.push({ label, cells: [], value: dv !== undefined ? dv : 'OPEN', draft: dv !== undefined, added: true, spare: !filled(dv), info: info({ label }) }); }
  return out;
}
const filled = v => v && v !== 'OPEN' && v !== '—';
const draftOf = co => (co.plan && co.plan.draft) || {};
// What's in a slot with the draft on top, and whether that's a draft pick.
const cellOf = (co, r, i) => { const d = draftOf(co)[r.label + '|' + i]; return d !== undefined ? d : r.cells[i]; };
const isDraft = (co, r, i) => draftOf(co)[r.label + '|' + i] !== undefined;
const sameStaff = (a, b) => { const n = x => String(x || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); return !!a && !!b && n(a) === n(b); };
const availOf = (co, name, date) => { const p = co.people.find(x => sameStaff(x.name, name)); return p ? (p.avail || {})[date] || null : null; };
const shortMd = iso => parseIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

function staffingPage() {
  const key = stfKey();
  if (!key) return '<section class="box"><p class="empty">No Academy Weeks coming up (a cohort needs an Academy Week Start date on its roster).</p></section>';
  if (!stfFresh[key] && !stfLoading[key] && !S.stfErr) setTimeout(() => loadStaffing(key), 0);
  S.stf = S.stf || {};
  const co = S.stf[key] || keepCopy('stf-' + key);
  if (co && !S.stf[key]) S.stf[key] = co;
  if (!co) return S.stfErr ? `<div class="alert">Couldn’t load staffing: ${esc(S.stfErr)} <button class="btn small" data-act="stfRefresh">Try again</button></div>` : '<p class="loading">Loading staffing…</p>';
  if (co.missing) return `<section class="box"><p class="empty">${esc(key)}’s sheet doesn’t have a Staffing tab (with a “Role / Slot” row) yet.${co.staffingUrl ? ` <a href="${esc(co.staffingUrl)}" target="_blank" rel="noopener">Open the sheet ↗</a>` : ''}</p></section>`;
  co.plan = co.plan || { stations: {}, draft: {} };
  const days = co.days.filter(d => d.date);
  const ch = Object.keys(sheetChanges(co)).length;
  return stfAvailBox(co, days) + `<div class="stf-sched-head ${ch ? 'has' : ''}"><h2>Schedule</h2>
      ${ch ? `<span>${ch} update${ch === 1 ? '' : 's'} to send to the Staffing tab <span class="muted small">(staff don’t see ${ch === 1 ? 'it' : 'them'} yet)</span></span>
        <span class="stf-sched-actions"><button class="btn primary small" data-act="stfApply" ${S.stfBusy ? 'disabled' : ''}>${S.stfBusy ? 'Saving…' : 'Send to Staffing tab'}</button>
        <button class="link" data-act="stfClearDraft" ${S.stfBusy ? 'disabled' : ''}>Clear</button></span>`
      : '<span class="muted small">Picks are a draft until you send them to the Staffing tab.</span>'}</div>
    <div class="stf-week" style="--n:${days.length}">${days.map((d, i) => stfDay(co, d, i, dayPlan(co, d))).join('')}</div>`;
}
// The slots a day shows for one kind (Instructor / Assistant / Patient): as many as it needs (the station count), in
// Staffing tab order, plus new ones ("Instructor 6") when the tab doesn't have enough rows, plus any row past that
// count that still has someone in it (marked extra, so nobody disappears).
function daySlots(co, i, kind, need) {
  const rows = co.sections.filter(s => slotKind(s.role) === kind).flatMap(s => s.rows);
  if (!rows.length) return [];
  const out = rows.slice(0, need).map(r => ({ ...r, value: cellOf(co, r, i), draft: isDraft(co, r, i) }));
  const last = rows[rows.length - 1].label, m = last.match(/^(.*?)(\d+)\s*$/), base = m ? m[1] : kind + ' ', n0 = m ? Number(m[2]) : rows.length;
  for (let k = rows.length; k < need; k++) {
    const label = base + (n0 + k - rows.length + 1), dv = draftOf(co)[label + '|' + i];
    out.push({ label, cells: [], value: dv !== undefined ? dv : 'OPEN', draft: dv !== undefined, added: true });
  }
  rows.slice(need).forEach(r => { const v = cellOf(co, r, i); if (filled(v)) out.push({ ...r, value: v, draft: isDraft(co, r, i), extra: true }); });
  return out;
}
// What goes on the Staffing tab: every slot of every day as the plan has it (needed slots OPEN until filled, the rest "—"),
// only where that's different from the tab now.
function sheetChanges(co) {
  const out = {}, days = co.days.filter(d => d.date);
  days.forEach((d, i) => {
    const plan = dayPlan(co, d);
    ['Instructor', 'Assistant', 'Patient'].forEach(kind => {
      const rows = co.sections.filter(s => slotKind(s.role) === kind).flatMap(s => s.rows), need = plan.need[kind] || 0;
      if (!rows.length) return;
      rows.forEach((r, k) => {
        const dv = draftOf(co)[r.label + '|' + i], cur = r.cells[i] || '';
        const want = dv !== undefined ? dv : k < need ? (filled(cur) ? cur : 'OPEN') : (filled(cur) ? cur : '—');
        if (want !== cur) out[r.label + '|' + i] = want;
      });
      daySlots(co, i, kind, need).filter(x => x.added).forEach(x => { out[x.label + '|' + i] = x.value; });
    });
    co.sections.filter(s => s.role === 'Other').flatMap(s => s.rows).forEach(r => { // (Other: a name, or "—")
      const dv = draftOf(co)[r.label + '|' + i], cur = r.cells[i] || '', want = dv !== undefined ? (filled(dv) ? dv : '—') : (filled(cur) ? cur : '—');
      if (want !== cur) out[r.label + '|' + i] = want;
    });
    otherSlots(co, i).filter(x => x.added && filled(x.value)).forEach(x => { out[x.label + '|' + i] = x.value; });
  });
  return out;
}
function stfDay(co, d, i, plan) {
  const onDay = name => co.sections.some(s => s.rows.some(r => sameStaff(cellOf(co, r, i), name))) || Object.entries(draftOf(co)).some(([k, v]) => k.endsWith('|' + i) && sameStaff(v, name));
  let open = 0;
  const secs = ['Instructor', 'Assistant', 'Patient'].map(kind => {
    const need = plan.need[kind] || 0, slots = daySlots(co, i, kind, need);
    if (!slots.length) return need ? `<p class="muted small">No ${kind} rows on the Staffing tab.</p>` : '';
    const have = slots.filter(x => !x.extra && filled(x.value)).length;
    open += Math.max(0, need - have);
    if (!need && !slots.some(x => x.extra)) return '';
    return `<div class="stf-sec"><div class="stf-sec-head"><b>${kind}s</b><span class="${have >= need ? 'stf-ok' : 'stf-short'}">${have}/${need}${have < need ? ' · ' + (need - have) + ' open' : ' ✓'}</span></div>
      ${slots.map(x => { const v = x.value, a = filled(v) && !OWNERS.some(o => sameStaff(o, v)) ? availOf(co, v, d.date) : null;
        return `<button class="stf-slot ${filled(v) ? 'has' : 'open'} ${x.draft || x.added ? 'draft' : ''} ${x.extra ? 'extra' : ''} ${a && a.s === 'no' ? 'bad' : a && a.s === 'maybe' ? 'meh' : ''}" data-act="stfPick" data-label="${esc(x.label)}" data-day="${i}" data-date="${d.date}" ${x.added ? 'data-added="1"' : ''}
          title="${x.extra ? 'Not needed for ' + need + ' station' + (need === 1 ? '' : 's') + '. Click to change.' : x.added ? 'A new row: added to the Staffing tab when you put the draft on it' : x.draft ? 'Draft: on the Staffing tab it’s ' + esc(x.cells[i] || 'OPEN') : ''}">
          <span class="muted small">${esc(x.label)}</span><span>${filled(v) ? esc(v) : '<b class="stf-open-tag">OPEN</b>'}</span>
          ${x.extra ? '<em class="tag-soft">extra</em>' : a && a.s === 'no' ? '<em class="tag-soft bad">unavailable</em>' : a && a.s === 'maybe' ? '<em class="tag-soft meh">maybe</em>' : ''}</button>`; }).join('')}</div>`;
  }).join('');
  return `<section class="box stf-day ${open ? '' : 'covered'}">
    <div class="stf-day-head"><b>Day ${d.n} - ${esc(shortMd(d.date))}</b>${d.exam ? '<span class="muted small">Psychomotor exam</span>' : ''}</div>
    <div class="stf-stations"><button class="pm" data-act="stfStations" data-date="${d.date}" data-day="${i}" data-n="${plan.stations - 1}" ${plan.stations <= 1 ? 'disabled' : ''} aria-label="Fewer stations">${PM_MINUS}</button>
      <span><b>${plan.stations}</b> station${plan.stations === 1 ? '' : 's'}</span>
      <button class="pm" data-act="stfStations" data-date="${d.date}" data-day="${i}" data-n="${plan.stations + 1}" aria-label="More stations">${PM_PLUS}</button>
      ${plan.auto ? '' : `<button class="link small" data-act="stfStations" data-date="${d.date}" data-day="${i}" data-n="" title="Back to the count from the number of students">reset</button>`}</div>
    <p class="muted small stf-math">${d.exam ? 'An instructor, an assistant and a patient at each testing station.' : `${plan.per} or fewer students each${plan.six ? `<br>Or ${plan.six} station${plan.six === 1 ? '' : 's'} meets 6:1 ratio.` : ''}`}</p>
    <div class="stf-owners">${OWNERS.map(o => { const on = onDay(o), first = o.split(' ')[0];
      return `<button class="chip ${on ? 'on' : ''}" data-act="stfOwner" data-name="${o}" data-day="${i}" title="${on ? 'Take ' + first + ' off this day' : 'Put ' + first + ' in an open Instructor slot'}">${on ? first + ' ✓' : '+ ' + first}</button>`; }).join('')}</div>
    ${secs}
    ${(() => { const os = otherSlots(co, i); return os.length ? `<div class="stf-sec stf-other"><div class="stf-sec-head"><b>Other</b><span class="muted small">flat amount</span></div>
      ${os.map(x => `<button class="stf-slot ${x.spare ? 'spare' : 'has'} ${x.draft || (x.added && !x.spare) ? 'draft' : ''}" data-act="stfPick" data-label="${esc(x.label)}" data-day="${i}" data-date="${d.date}" data-other="1" ${x.added ? 'data-added="1"' : ''}>
        ${x.spare ? '<span class="muted small">+ Other · Ex. Admin help</span>' : `<span class="muted small">${esc(x.info.what || 'Other')}</span><span>${esc(x.value)}${x.info.amount ? ` <span class="muted small">· ${money(x.info.amount)}</span>` : ''}</span>`}</button>`).join('')}</div>` : ''; })()}
  </section>`;
}
const ROLE_ORDER = ['EC & Equivalent', 'Non-Certified Instructor', 'Assistant', 'Patient'];
const ROLE_GROUP = ['EC & Equivalent', 'Non-Certified Instructors', 'Assistants', 'Patients', 'No role picked'];
const roleRank = r => { const i = ROLE_ORDER.indexOf(r); return i < 0 ? 4 : i; };
// Availability: each click goes no answer → ✓ → ? → ✕ → no answer; ✎ (bottom right) for a note; * = has a note.
// The eye hides people with no ✓ or ? that week (a row you've just changed stays until you leave or switch weeks).
const stfTouched = new Set();
function stfAvailBox(co, days) {
  const hide = pref('stfHideNo') === '1';
  const cell = (p, d) => { const a = (p.avail || {})[d.date] || {};
    return `<span class="av-wrap"><button class="av-cell ${a.s ? 'is-' + a.s : ''}" data-act="stfAvCycle" data-name="${esc(p.name)}" data-date="${d.date}" title="${esc((a.s ? AV_LABEL[a.s] : 'No answer yet') + (a.note ? ': ' + a.note : '') + (a.by ? ' (entered by ' + a.by + ')' : a.s ? ' (from the Staff Portal)' : ''))}">
      ${a.s === 'yes' ? '✓' : a.s === 'maybe' ? '?' : a.s === 'no' ? '✕' : '·'}${a.note ? '<i class="av-star">*</i>' : ''}</button>
      <button class="av-pen" data-act="stfAvEd" data-name="${esc(p.name)}" data-date="${d.date}" title="Note" aria-label="Note">✎</button></span>`; };
  const useful = p => days.some(d => ['yes', 'maybe'].includes(((p.avail || {})[d.date] || {}).s));
  // Fixed order (nothing moves when you click): by role, then A–Z. Inactive people (Staff Directory Status) aren't listed.
  const people = co.people.filter(p => !p.inactive).sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
  const shown = hide ? people.filter(p => useful(p) || stfTouched.has(p.name)) : people, gone = people.length - shown.length;
  const rows = shown.map((p, i) => (i === 0 || roleRank(shown[i - 1].role) !== roleRank(p.role) ? `<span class="av-group">${esc(ROLE_GROUP[roleRank(p.role)])}</span>` : '')
    + `<span class="av-name">${esc(p.name)}</span>${days.map(d => cell(p, d)).join('')}`).join('');
  const count = d => co.people.filter(p => ((p.avail || {})[d.date] || {}).s === 'yes').length;
  const label = hide ? 'Show everyone' : 'Hide people who are unavailable or haven’t answered';
  const key = stfKey(), n = studentCount(co);
  const left = `<aside class="stf-side">
      <div class="stf-card"><b>${n}</b> student${n === 1 ? '' : 's'}<span class="muted small">from the roster</span></div>
      <div class="stf-card">${co.locked ? '<b>Locked</b><span class="muted small">staff reach out to you now</span>' : co.lockOn ? `Staff availability due<b>${monthDay(co.lockOn)}</b>` : '<span class="muted small">No Academy Week date yet</span>'}</div></aside>`;
  const right = '<aside class="stf-side"></aside>'; // (left empty for now)
  return `<section class="box stf-avail"><div class="box-head stf-av-head"><h2>Availability</h2>
      <span class="head-actions"><button class="eye ${hide ? 'off' : ''}" data-act="stfHideNo" title="${label}" aria-label="${label}">${hide ? EYE_OFF : EYE}</button>
        <button class="eye inq-reload ${stfLoading[key] ? 'spin' : ''}" data-act="stfRefresh" title="Read the Staffing tab again" aria-label="Refresh">${RESET}</button>
        ${co.staffingUrl ? `<a class="btn tiny" href="${esc(co.staffingUrl)}" target="_blank" rel="noopener" data-name="${esc(key)} Staffing">Staffing tab ↗</a>` : ''}</span></div>
    <div class="stf-av-body">${left}<div class="stf-av-main">
    <div class="av-grid" style="--n:${days.length}">
      <span></span>${days.map(d => `<span class="av-h">${esc(shortMd(d.date))}<span class="muted small">${count(d)} available</span></span>`).join('')}
      ${rows}
    </div>
    ${hide && gone ? `<p class="muted small av-hidden">${gone} ${gone === 1 ? 'person' : 'people'} hidden (no ✓ or ? this week) · <button class="link" data-act="stfHideNo">Show all</button></p>` : ''}
    ${hide && !shown.length ? '<p class="empty">Nobody has said they’re available yet.</p>' : ''}</div>${right}</div></section>`;
}
function stfPickModal() {
  const k = S.stfPick, co = stfCo(), i = Number(k.day), rows = co.sections.flatMap(s => s.rows);
  const slot = rows.find(r => r.label === k.label) || { cells: [] }, cur = cellOf(co, slot, i);
  const taken = name => rows.find(r => r.label !== k.label && sameStaff(cellOf(co, r, i), name));
  const groups = { yes: [], maybe: [], none: [], no: [] };
  const away = co.people.filter(p => p.inactive);
  co.people.filter(p => !p.inactive).forEach(p => { const a = (p.avail || {})[k.date]; groups[a && a.s ? a.s : 'none'].push({ ...p, a }); });
  const person = (p, cls = '') => { const t = taken(p.name), on = sameStaff(cur, p.name);
    return `<button class="pick-row ${cls} ${on ? 'on' : ''}" data-act="stfSet" data-name="${esc(p.name)}" ${t || on || S.stfBusy ? 'disabled' : ''}>
      <span><b>${esc(p.name)}</b>${p.role ? `<span class="muted small"> · ${esc(p.role)}</span>` : ''}</span>
      <span class="muted small">${on ? 'in this slot' : t ? 'on ' + esc(t.label) : p.a && p.a.note ? esc(p.a.note) : ''}${p.a && p.a.by ? ' (entered by ' + esc(p.a.by) + ')' : ''}</span></button>`; };
  const group = (title, list, cls) => list.length ? `<p class="pick-h">${title}</p>${list.map(p => person(p, cls)).join('')}` : '';
  const oth = k.other ? `<div class="stf-other-fields">
      <label class="field">What for<input id="stf-o-what" data-draft="stf-o-what" list="stf-o-list" value="${esc(S.drafts['stf-o-what'] ?? '')}" placeholder="Ex. Admin help" autocomplete="off"></label>
      <datalist id="stf-o-list"><option>Admin help</option></datalist>
      <label class="field">Flat amount<input id="stf-o-amt" data-draft="stf-o-amt" value="${esc(S.drafts['stf-o-amt'] ?? '')}" placeholder="$" inputmode="decimal" autocomplete="off"></label>
      ${filled(cur) ? `<button class="btn small" data-act="stfOtherSave" ${S.stfBusy ? 'disabled' : ''}>Save</button>` : ''}</div>
      <p class="muted small">Added to their pay on that day as a flat amount (no timesheet).${filled(cur) ? '' : ' Then pick who:'}</p>` : '';
  return `<div class="overlay" data-act="stfPickClose"><div class="modal small-modal stf-pick" data-stop>
    <div class="modal-head"><h2>${esc(k.label)} · ${parseIso(k.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h2><button class="x big" data-act="stfPickClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      ${oth}
      ${OWNERS.map(o => person({ name: o, role: '' })).join('')}
      ${group('Available', groups.yes, 'yes')}${group('Maybe', groups.maybe, 'meh')}${group('No answer yet', groups.none, '')}${group('Unavailable', groups.no, 'bad')}
      ${away.length ? (S.stfShowAway ? group('Inactive (away for now)', away.map(p => ({ ...p, a: (p.avail || {})[k.date] })), 'away')
        : `<button class="link pick-away" data-act="stfShowAway">Show inactive (${away.length})</button>`) : ''}
    </div>
    <div class="modal-foot pay-foot"><span class="muted small">${S.stfBusy ? 'Saving…' : 'Goes in the draft'}</span>
      <span>${k.other ? (filled(cur) ? `<button class="btn small" data-act="stfSet" data-name="—" ${S.stfBusy ? 'disabled' : ''}>Remove</button>` : '')
        : `<button class="btn small" data-act="stfSet" data-name="OPEN" ${cur === 'OPEN' || !cur || S.stfBusy ? 'disabled' : ''}>OPEN</button>
      <button class="btn small" data-act="stfSet" data-name="—" title="This slot isn't needed this day" ${cur === '—' || S.stfBusy ? 'disabled' : ''}>— not needed</button>`}</span></div>
  </div></div>`;
}
function stfAvModal() {
  const e = S.stfAv, co = stfCo(), p = co.people.find(x => x.name === e.name), a = (p.avail || {})[e.date] || {};
  return `<div class="overlay" data-act="stfAvClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>${esc(e.name)} · ${parseIso(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h2><button class="x big" data-act="stfAvClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <div class="seg av-seg">${['yes', 'maybe', 'no'].map(s => `<button class="${e.s === s ? 'on ' + s : ''}" data-act="stfAvS" data-s="${s}">${AV_LABEL[s]}</button>`).join('')}</div>
      <label class="field">Note<input id="stf-av-note" data-draft="stf-av-note" value="${esc(S.drafts['stf-av-note'] ?? a.note ?? '')}" placeholder="Optional, like “until 1500”" maxlength="200" autocomplete="off"></label>
      <p class="muted small">${a.s ? (a.by ? `Entered by ${esc(a.by)}.` : `${esc(e.name.split(' ')[0])} picked this on the Staff Portal.`) : 'No answer yet.'} It shows on their Staff Portal as “added by ${S.user && /^nbrown@/i.test(S.user.email || '') ? 'Nick' : 'Bella'}”, and they can still change it until it locks.</p>
    </div>
    <div class="modal-foot pay-foot">${a.s ? `<button class="link" data-act="stfAvSave" data-clear="1">Clear</button>` : '<span></span>'}
      <button class="btn primary" data-act="stfAvSave" ${!e.s ? 'disabled' : ''}>Save</button></div>
  </div></div>`;
}
function staffingModals() { return (S.stfPick && stfCo() ? stfPickModal() : '') + (S.stfAv && stfCo() ? stfAvModal() : ''); }
async function stfDo(fn) {
  const key = stfKey(); S.stfBusy = true; render();
  try { const out = await fn(); if (out && out.sections) { S.stf[key] = out; keepCopy('stf-' + key, out); } return true; }
  catch (e) { toast(e.message); return false; }
  finally { S.stfBusy = false; render(); }
}
// Availability clicks: shown at once, saved one after another.
let avQueue = Promise.resolve();
const avPending = {}; // "cohort|name|date" → { s, note, prev, t }
const stfPerson = (key, name) => ((S.stf && S.stf[key]) || { people: [] }).people.find(x => x.name === name);
function stfSaveAvail(name, date, s, note) {
  const key = stfKey(), p = stfPerson(key, name), me = S.user && /^nbrown@/i.test(S.user.email || '') ? 'Nick' : 'Bella';
  if (!p) return;
  p.avail = p.avail || {};
  const k = key + '|' + name + '|' + date, was = avPending[k];
  const prev = was ? was.prev : (p.avail[date] ? { ...p.avail[date] } : null); // (what's saved, if this save fails)
  if (!s && !note) delete p.avail[date]; else p.avail[date] = { s, note, by: me };
  stfTouched.add(name);
  keepCopy('stf-' + key, S.stf[key]); render();
  if (was) clearTimeout(was.t);
  const e = avPending[k] = { s, note, prev };
  e.t = setTimeout(() => {
    avQueue = avQueue.then(() => StaffApi.call('adminSaveAvail', { cohort: key, name, date, s, note })
      .then(out => { // (only this box, and only if you haven't clicked it again since)
        if (avPending[k] !== e) return;
        delete avPending[k];
        const q = stfPerson(key, name), saved = (out.avail || {})[date];
        if (q && saved) { q.avail = q.avail || {}; q.avail[date] = saved; keepCopy('stf-' + key, S.stf[key]); }
      })
      .catch(err => {
        if (avPending[k] !== e) return;
        delete avPending[k];
        const q = stfPerson(key, name);
        if (q) { q.avail = q.avail || {}; if (prev) q.avail[date] = prev; else delete q.avail[date]; keepCopy('stf-' + key, S.stf[key]); render(); }
        toast('Not saved (' + name + ', ' + shortMd(date) + '): ' + err.message);
      }));
  }, 500);
}
async function staffingAct(a, el = {}) {
  const d = el.dataset || {}, key = stfKey(), co = stfCo();
  switch (a) {
    case 'stfTab': S.staffTab = d.t; pref('staffTab', d.t); stfTouched.clear(); render(); return true;
    case 'stfWeek': S.stfKey = d.cohort; pref('stfKey', d.cohort); S.stfErr = null; S.stfWeekMenu = false; stfTouched.clear(); render(); return true;
    case 'stfWeekMenu': S.stfWeekMenu = !S.stfWeekMenu; render(); return true;
    case 'stfHideNo': pref('stfHideNo', pref('stfHideNo') === '1' ? '0' : '1'); stfTouched.clear(); render(); return true;
    case 'stfGo': // the Finalize staffing to-do, or a cohort in Staffing by Cohort
      S.view = 'staff'; pref('view', 'staff'); S.staffTab = 'stf'; pref('staffTab', 'stf'); S.stfKey = d.cohort || S.cohortKey; pref('stfKey', S.stfKey);
      S.open = null; S.menuOpen = false; S.stfErr = null; render(); window.scrollTo(0, 0); return true;
    case 'stfRefresh': S.stfErr = null; loadStaffing(key, true); return true;
    case 'stfStations': {
      const old = co.plan.stations || {}, st = { ...old }, i = Number(d.day), day = co.days.filter(x => x.date)[i], before = dayPlan(co, day);
      if (d.n === '') delete st[d.date]; else st[d.date] = Math.max(1, Number(d.n));
      co.plan.stations = st; const now = dayPlan(co, day);
      // Fewer stations: anyone in a slot that's no longer needed comes off that day (you're asked first).
      const gone = [];
      ['Instructor', 'Assistant', 'Patient'].forEach(kind => {
        const was = before.need[kind] || 0, is = now.need[kind] || 0;
        if (is < was) daySlots(co, i, kind, was).filter(x => !x.extra).slice(is).forEach(x => { if (filled(x.value)) gone.push(x); });
      });
      if (gone.length && !confirm(gone.map(x => `${x.value} is in ${x.label}`).join('\n') + `\n\nTake ${gone.length === 1 ? 'them' : 'them all'} off ${shortMd(d.date)}?`)) { co.plan.stations = old; render(); return true; }
      render();
      await stfDo(async () => {
        for (const x of gone) await StaffApi.call('adminDraftSlot', { cohort: key, label: x.label, day: i, name: '—', virtual: !!x.added });
        return StaffApi.call('adminSavePlan', { cohort: key, stations: st });
      });
      return true;
    }
    case 'stfPick': if (!S.stfBusy) {
      S.stfPick = { label: d.label, day: d.day, date: d.date, added: !!d.added, other: !!d.other };
      if (d.other) { const x = ((co.plan && co.plan.other) || {})[d.label + '|' + d.day] || {}; S.drafts['stf-o-what'] = x.what || ''; S.drafts['stf-o-amt'] = x.amount ? String(x.amount) : ''; }
      render(); } return true;
    case 'stfOtherSave': {
      const k = S.stfPick, row = co.sections.flatMap(s => s.rows).find(r => r.label === k.label), cur = row ? cellOf(co, row, Number(k.day)) : (draftOf(co)[k.label + '|' + k.day] || '');
      if (await stfDo(() => StaffApi.call('adminDraftSlot', { cohort: key, label: k.label, day: k.day, name: cur, virtual: k.added, other: { what: S.drafts['stf-o-what'], amount: S.drafts['stf-o-amt'] } }))) S.stfPick = null;
      render(); return true;
    }
    case 'stfPickClose': S.stfPick = null; S.stfShowAway = false; render(); return true;
    case 'stfShowAway': S.stfShowAway = true; render(); return true;
    case 'stfSet': {
      const k = S.stfPick;
      if (k.other && d.name !== '—' && (!String(S.drafts['stf-o-what'] || '').trim() || !(parseFloat(String(S.drafts['stf-o-amt'] || '').replace(/[$,]/g, '')) > 0))) { toast('Fill in what it’s for and the flat amount first.'); return true; }
      const other = k.other && d.name !== '—' ? { what: S.drafts['stf-o-what'], amount: String(S.drafts['stf-o-amt']).replace(/[$,]/g, '') } : undefined;
      if (await stfDo(() => StaffApi.call('adminDraftSlot', { cohort: key, label: k.label, day: k.day, name: d.name, virtual: k.added, other }))) { S.stfPick = null; S.stfShowAway = false; }
      render(); return true;
    }
    case 'stfApply': {
      const changes = sheetChanges(co), n = Object.keys(changes).length;
      if (!confirm(`Put ${n} change${n === 1 ? '' : 's'} on ${key}’s Staffing tab? Staff will see ${n === 1 ? 'it' : 'them'} on their Schedule.`)) return true;
      if (await stfDo(() => StaffApi.call('adminApplyDraft', { cohort: key, changes }))) toast('On the Staffing tab.');
      return true;
    }
    case 'stfClearDraft': if (confirm('Clear the draft? The slots go back to what’s on the Staffing tab.')) await stfDo(() => StaffApi.call('adminSavePlan', { cohort: key, clearDraft: true })); return true;
    case 'stfOwner': { // Nick / Bella on or off a day (in the draft): into the first open Instructor slot it needs, or back off
      const i = Number(d.day), day = co.days.filter(x => x.date)[i], need = dayPlan(co, day).need.Instructor, slots = daySlots(co, i, 'Instructor', need);
      const mine = co.sections.flatMap(s => s.rows).map(r => ({ ...r, value: cellOf(co, r, i) })).concat(slots.filter(x => x.added)).find(x => sameStaff(x.value, d.name));
      if (mine) { const extra = slots.find(x => x.label === mine.label && x.extra); await stfDo(() => StaffApi.call('adminDraftSlot', { cohort: key, label: mine.label, day: i, name: extra ? '—' : 'OPEN', virtual: !!mine.added })); return true; }
      const free = slots.find(x => !x.extra && !filled(x.value));
      if (!free) { toast(`All ${need} instructor slot${need === 1 ? ' is' : 's are'} filled that day. Add a station (+) first.`); return true; }
      await stfDo(() => StaffApi.call('adminDraftSlot', { cohort: key, label: free.label, day: i, name: d.name, virtual: !!free.added }));
      return true;
    }
    case 'stfAvCycle': { const p = stfPerson(key, d.name); if (!p) return true; const a = (p.avail || {})[d.date] || {}; stfSaveAvail(d.name, d.date, AV_NEXT[a.s || ''], a.note || ''); return true; }
    case 'stfAvEd': { const p = co.people.find(x => x.name === d.name), cur = (p.avail || {})[d.date] || {};
      S.stfAv = { name: d.name, date: d.date, s: cur.s || '' }; S.drafts['stf-av-note'] = cur.note || ''; render();
      setTimeout(() => { const x = document.getElementById('stf-av-note'); if (x) x.focus(); }, 0); return true; }
    case 'stfAvS': S.stfAv.s = d.s; render(); return true;
    case 'stfAvClose': S.stfAv = null; render(); return true;
    case 'stfAvSave': { const e = S.stfAv, clear = !!d.clear; stfSaveAvail(e.name, e.date, clear ? '' : e.s, clear ? '' : String(S.drafts['stf-av-note'] || '').trim()); S.stfAv = null; render(); return true; }
  }
  return false;
}
function staffingEscape() {
  if (S.stfAv) { S.stfAv = null; return true; }
  if (S.stfPick) { S.stfPick = null; return true; }
  return false;
}

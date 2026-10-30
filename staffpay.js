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
const qHours = (a, b) => { if (!a || !b) return 0; const m = t => { const [h, x] = t.split(':').map(Number); return h * 60 + x; }; const d = m(b) - m(a); return d > 0 ? Math.round(d / 15) / 4 : 0; };
const shortDay = iso => parseIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/* ---------- Loading ---------- */
const staffLoading = {};
async function loadStaffCohort(cohort, fresh = false) {
  if (!staffReady() || !cohort || staffLoading['co:' + cohort]) return;
  staffLoading['co:' + cohort] = true;
  S.staffCo = S.staffCo || {};
  try { S.staffCo[cohort] = await StaffApi.call('adminCohort', { cohort, fresh }); S.staffCoErr = null; }
  catch (e) { S.staffCoErr = e.message; console.warn('Staff pay not loaded:', e.message); }
  staffLoading['co:' + cohort] = false; render();
}
async function loadStaffAll(fresh = false) {
  if (!staffReady() || staffLoading.all) return;
  staffLoading.all = true; S.staffAllErr = null; render();
  try { S.staffAll = await StaffApi.call('adminStaff', { fresh }); }
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
  if (!S.staffAll && !staffLoading.all && !S.staffAllErr) setTimeout(() => loadStaffAll(), 0);
  const a = S.staffAll;
  if (!a) return S.staffAllErr ? `<div class="alert">Couldn’t load staff: ${esc(S.staffAllErr)} <button class="btn small" data-act="staffRefresh">Try again</button></div>` : '<p class="loading">Loading staff…</p>';
  const owed = [];
  a.people.forEach(p => p.unpaid.forEach(u => owed.push({ name: p.name, ...u })));
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
      <section class="box"><div class="box-head admin-head"><h2>Staff Portal</h2></div>
        <p class="muted small">Staff sign in here to fill in their times. Text them the link, or let them scan this.</p>
        <div class="staff-qr" id="staffQr"></div>
        <p class="center"><a href="${STAFF_PORTAL_URL}" target="_blank" rel="noopener" data-chrome>${STAFF_PORTAL_URL.replace('https://', '')}</a></p>
        <p class="center"><button class="btn small" data-act="staffCopyLink">Copy link</button></p>
      </section>
    </div>
  </div>`;
}
function staffListBox(a) {
  const bar = p => {
    const pct = Math.min(100, (p.year / a.limit) * 100), soon = Math.min(100, ((p.year + p.coming) / a.limit) * 100);
    const cls = p.year >= a.limit ? 'over' : p.year >= a.alerts[0] ? 'near' : '';
    return `<div class="yr ${cls}" title="${money(p.year)} so far${p.coming ? ' + about ' + money(p.coming) + ' still scheduled' : ''} (limit ${money(a.limit)})">
      <div class="yr-bar"><span class="yr-soon" style="width:${soon}%"></span><span class="yr-now" style="width:${pct}%"></span></div>
      <span class="yr-num">${money(p.year)}${p.coming ? ` <span class="muted">+${money(p.coming)}</span>` : ''}</span></div>`;
  };
  const em = e => [e.name, e.phone, e.relation].filter(Boolean).join(' · ');
  return `<section class="box"><div class="box-head admin-head"><h2>Staff</h2><span class="head-actions">
      <button class="eye" data-act="staffRefresh" title="Read the sheets again" aria-label="Refresh">${RESET}</button>
      <button class="add-plus" data-act="staffEdOpen" title="Add someone" aria-label="Add someone">+</button></span></div>
    <p class="muted small">From the Staff Directory tab in $ Finances. ${a.year} totals count paid and not-yet-paid rows on the Payroll tab; the faded part is days still on the schedule (about ${8} hrs each).</p>
    <div class="staff-table">
      <div class="st-row st-head"><span>Name</span><span>Phone</span><span>Email</span><span>Emergency contact</span><span>Portal</span><span>${a.year} (limit ${money(a.limit)})</span></div>
      ${a.people.map(p => `<div class="st-row">
        <span><button class="link-btn" data-act="staffEdOpen" data-name="${esc(p.name)}">${esc(p.name)}</button>${p.role || p.roleText ? `<span class="muted small st-role">${esc(p.role || p.roleText)}</span>` : '<span class="small st-role tbd">No role picked</span>'}</span>
        <span>${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : '<span class="tbd">None</span>'}</span>
        <span class="st-email">${p.email ? esc(p.email) : '<span class="tbd">None</span>'}</span>
        <span>${em(p.emergency) ? esc(em(p.emergency)) : '<span class="tbd">None</span>'}</span>
        <span>${p.account ? '<span class="tag sage-tag">Set up</span>' : '<span class="muted small">Not yet</span>'}</span>
        ${bar(p)}
      </div>`).join('')}
    </div></section>`;
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
    const ed = P.ed[d.date] || {}, role = ed.role ?? d.role, start = ed.start ?? d.start, end = ed.end ?? d.end;
    const hrs = qHours(start, end), rate = rates[role] ?? d.rate, dirty = P.ed[d.date] && (role !== d.role || start !== d.start || end !== d.end);
    const lock = d.paid || !d.editable;
    return `<div class="pay-row ${d.paid ? 'paid' : ''} ${!d.row ? 'empty-day' : ''}">
      <span class="pr-date">${shortDay(d.date)}${!d.row ? '<span class="tag-soft">no times yet</span>' : ''}${d.over && !d.paid ? `<span class="tag-soft warn" title="Their maximum eligible role is ${esc(p.maxRole)}">above ${esc(p.maxRole)}</span>` : ''}</span>
      ${lock ? `<span>${esc(d.role)}</span><span>${d.start ? to12(d.start) + ' – ' + to12(d.end) : '—'}</span>`
        : `<select data-payf="role" data-date="${d.date}" aria-label="Role">${PAY_ROLES.map(r => `<option ${r === role ? 'selected' : ''}>${r}</option>`).join('')}</select>
           <span class="pr-times"><input type="time" step="300" id="pay-s-${d.date}" data-payf="start" data-date="${d.date}" value="${esc(start)}" aria-label="Start">
           <input type="time" step="300" id="pay-e-${d.date}" data-payf="end" data-date="${d.date}" value="${esc(end)}" aria-label="End"></span>`}
      <span class="pr-num">${hrs || d.hours ? (lock ? d.hours : hrs) + ' hrs' : ''}</span>
      <span class="pr-num">${lock ? money(d.total) : hrs ? money(hrs * rate) : ''}<span class="muted small"> ${money(rate)}/hr</span></span>
      <span class="pr-act">${d.paid ? `<span class="tag sage-tag">Paid${d.check ? ' #' + esc(d.check) : ''}</span>`
        : !d.editable ? '<span class="muted small">typed on the sheet</span>'
        : dirty ? `<button class="btn tiny" data-act="paySaveDay" data-date="${d.date}" ${P.busy ? 'disabled' : ''}>Save</button>`
        : d.row ? `<button class="x" data-act="payClearDay" data-date="${d.date}" title="Clear this day's times" aria-label="Clear">×</button>` : ''}</span>
    </div>`;
  };
  const flatRow = f => `<div class="pay-row flat ${f.paid ? 'paid' : ''}"><span class="pr-date">${shortDay(f.date)}</span><span class="pr-desc">Flat rate: ${esc(f.desc)}</span><span></span>
    <span class="pr-num">${money(f.total)}</span><span class="pr-act">${f.paid ? `<span class="tag sage-tag">Paid${f.check ? ' #' + esc(f.check) : ''}</span>`
      : `<button class="x" data-act="payFlatDel" data-row="${f.row}" title="Delete" aria-label="Delete">×</button>`}</span></div>`;
  const days = co.days.filter(d => d.date);
  const fl = P.flat;
  const flatForm = fl ? `<div class="pay-flat-form">
      <select data-payflat="date" aria-label="Date">${days.map(d => `<option value="${d.date}" ${d.date === fl.date ? 'selected' : ''}>${shortDay(d.date)}</option>`).join('')}</select>
      <input id="pay-fdesc" data-payflat="desc" value="${esc(fl.desc)}" placeholder="What it was (paperwork help…)">
      <input id="pay-famt" data-payflat="amount" value="${esc(fl.amount)}" placeholder="$50" inputmode="decimal">
      <button class="btn tiny" data-act="payFlatAdd" ${P.busy ? 'disabled' : ''}>Add</button><button class="link" data-act="payFlatCancel">Cancel</button></div>`
    : `<button class="link" data-act="payFlatOpen">+ Flat-rate job</button>`;
  return `<div class="overlay" data-act="payClose"><div class="modal pay-modal" data-stop>${head}
    <div class="modal-body pad-top">
      <p class="muted small">${esc(P.cohort)} Academy Week${p.maxRole ? ' · ' + esc(p.maxRole) : p.matched ? ' · no maximum eligible role picked yet' : ''}${p.phone ? ' · ' + esc(p.phone) : ''}${p.email ? ' · ' + esc(p.email) : ''}${p.matched ? (p.account ? '' : ' · hasn’t set up the Staff Portal yet') : ''}</p>
      ${!p.matched ? `<div class="alert">${esc(p.name)} isn’t on the Staff Directory tab, so they can’t sign in to put in times. <button class="btn small" data-act="staffEdOpen" data-new="${esc(p.name)}">Add them</button></div>` : ''}
      <div class="pay-table">${p.days.map(dayRow).join('')}${p.flats.map(flatRow).join('')}</div>
      <div class="pay-under">${p.paid ? '' : flatForm}<span class="pay-total">Total <b>${money(p.total)}</b>${p.unpaid && p.unpaid !== p.total ? ` · <span class="muted">${money(p.unpaid)} not paid yet</span>` : ''}</span></div>
      ${p.missing.length && !p.paid ? `<p class="muted small">No times yet for ${p.missing.map(shortDay).join(', ')}. You can type them in here, or they can do it in the Staff Portal.</p>` : ''}
      ${P.err ? `<div class="alert">${esc(P.err)}</div>` : ''}
      ${P.pdfUrl ? `<p class="small">Timesheet saved to Payroll Docs → ${esc(p.name)}. <a href="${esc(P.pdfUrl)}" target="_blank" rel="noopener" data-chrome>Open it ↗</a></p>` : ''}
    </div>
    <div class="modal-foot pay-foot">
      ${p.unpaid > 0 ? `<label class="pay-check">Check #<input id="pay-check" data-draft="pay-check" value="${esc(S.drafts['pay-check'] || '')}" inputmode="numeric" autocomplete="off"></label>
        <button class="btn primary" data-act="payMark" ${P.busy ? 'disabled' : ''}>${P.busy ? 'Saving…' : 'Mark paid · ' + money(p.unpaid)}</button>`
      : p.paid ? `<span class="muted">Paid${p.checks.length ? ' · Check #' + p.checks.map(esc).join(', #') : ''}</span>
        <button class="btn small" data-act="payPdf" ${P.busy ? 'disabled' : ''}>Timesheet PDF</button>
        <button class="link" data-act="payUndo" ${P.busy ? 'disabled' : ''}>Undo paid</button>` : '<span class="muted">Nothing to pay yet.</span>'}
    </div>
  </div></div>`;
}

function staffModals() { return (S.pay ? payModal() : '') + (S.staffEd ? staffEdModal() : ''); }

// Typing in the Pay window (times, role, the flat-rate line).
function staffInput(t) {
  if (t.dataset.payf && S.pay) {
    const d = t.dataset.date, co = S.staffCo[S.pay.cohort], p = co && co.people.find(x => x.name === S.pay.name || x.staffName === S.pay.name);
    const day = p && p.days.find(x => x.date === d);
    const ed = S.pay.ed[d] = S.pay.ed[d] || { role: day.role, start: day.start, end: day.end };
    ed[t.dataset.payf] = t.value;
    render(); return true;
  }
  if (t.dataset.payflat && S.pay && S.pay.flat) { S.pay.flat[t.dataset.payflat] = t.value; return true; }
  return false;
}
function staffEscape() {
  if (S.staffEd) { if (S.staffEd.busy) return true; S.staffEd = null; return true; }
  if (S.pay) { if (S.pay.busy) return true; S.pay = null; return true; }
  return false;
}

async function payDo(fn) {
  const P = S.pay; P.busy = true; P.err = ''; render();
  try { const out = await fn(); if (out && out.people) S.staffCo[P.cohort] = out; S.staffAll = null; }
  catch (e) { P.err = e.message; }
  P.busy = false; render();
}

async function staffAct(a, el = {}) {
  const d = el.dataset || {};
  switch (a) {
    case 'staffRefresh': S.staffAll = null; S.staffAllErr = null; loadStaffAll(true); return true;
    case 'staffCopyLink': try { await navigator.clipboard.writeText(STAFF_PORTAL_URL); toast('Link copied.'); } catch { toast(STAFF_PORTAL_URL); } return true;
    case 'payOpen': {
      if (!staffReady()) { toast('The Staff Apps Script isn’t connected yet.'); return true; }
      const cohort = d.cohort || S.cohortKey;
      S.pay = { cohort, name: d.name, ed: {}, flat: null, busy: false, err: '', pdfUrl: '' }; S.drafts['pay-check'] = '';
      render();
      if (!S.staffCo || !S.staffCo[cohort]) await loadStaffCohort(cohort, true);
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
    case 'payFlatOpen': { const co = S.staffCo[S.pay.cohort], p = payPerson(); S.pay.flat = { date: (p.days[p.days.length - 1] || co.days[0] || {}).date || '', desc: '', amount: '' }; render(); setTimeout(() => { const x = document.getElementById('pay-fdesc'); if (x) x.focus(); }, 0); return true; }
    case 'payFlatCancel': S.pay.flat = null; render(); return true;
    case 'payFlatAdd': {
      const P = S.pay, f = P.flat;
      await payDo(async () => { const out = await StaffApi.call('adminFlat', { cohort: P.cohort, name: payPerson().name, date: f.date, desc: f.desc, amount: f.amount }); P.flat = null; return out; });
      return true;
    }
    case 'payFlatDel': {
      if (!confirm('Delete this flat-rate job?')) return true;
      const P = S.pay;
      await payDo(() => StaffApi.call('adminFlat', { cohort: P.cohort, name: payPerson().name, row: Number(d.row), del: true }));
      return true;
    }
    case 'payMark': {
      const P = S.pay, check = String(S.drafts['pay-check'] || '').trim();
      if (!check) { toast('Type the check #.'); return true; }
      if (Object.keys(P.ed).some(k => P.ed[k])) { const dirty = payPerson().days.some(x => { const e = P.ed[x.date]; return e && (e.role !== x.role || e.start !== x.start || e.end !== x.end); }); if (dirty && !confirm('A day has changes that aren’t saved. Mark paid without them?')) return true; }
      await payDo(async () => { const out = await StaffApi.call('adminMarkPaid', { cohort: P.cohort, name: payPerson().name, check }); P.ed = {}; P.pdfUrl = out.pdfUrl || ''; if (out.pdfErr) P.err = 'Marked paid, but the timesheet PDF wasn’t saved: ' + out.pdfErr; toast(payPerson().name + ' marked paid · ' + money(out.paidTotal) + ' · Check #' + check); return out; });
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
      S.staffEd = { orig: p ? p.name : '', account: p ? p.account : false, busy: false, err: '' };
      render(); setTimeout(() => { const x = document.getElementById('se-' + (p ? 'phone' : 'name')); if (x) x.focus(); }, 0);
      return true;
    }
    case 'staffEdClose': if (S.staffEd && !S.staffEd.busy) { S.staffEd = null; render(); } return true;
    case 'staffEdSave': {
      const e = S.staffEd, g = k => String(S.drafts['se-' + k] || '').trim();
      if (!g('name')) { e.err = 'Type their name.'; render(); return true; }
      if (e.orig && g('name') !== e.orig && !confirm(`Change the name from ${e.orig} to ${g('name')}? Their rows on the Payroll tab change too.`)) return true;
      e.busy = true; e.err = ''; render();
      try {
        S.staffAll = await StaffApi.call('adminSavePerson', { orig: e.orig, name: g('name'), role: g('role'), phone: g('phone'), email: g('email'), notes: g('notes'),
          emergency: { name: g('emName'), phone: g('emPhone'), relation: g('emRel') } });
        S.staffEd = null; toast('Saved to the Staff Directory.');
        if (S.cohortKey) loadStaffCohort(S.cohortKey, true);
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
   (checked when its Academy Week has already started). Its button opens the cohort sheet's Staffing tab. */
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
  const co = staffCohortData(), url = (co && co.staffingUrl) || (S.sheet && S.sheet.sheetUrl);
  return url ? `<a class="btn tiny" href="${esc(url)}" target="_blank" rel="noopener" data-name="${esc(S.cohortKey)} Staffing" title="The Staffing tab in ${esc(S.cohortKey)}'s sheet">Staffing ↗</a>` : '';
}

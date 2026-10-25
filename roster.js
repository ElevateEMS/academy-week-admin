/* Orientation rosters (replacing BoldSign): one per orientation date, the cohort's own plus each late
   enrollee's (late enrollees on the same date share one).

   - Each roster is a Course To-Do (id oroster-{date}), due that day, so it's in the Morning Email too.
     Made from the day this started for the cohort (cohorts/{key}.rostersStart), so earlier orientations
     already done in BoldSign don't come back.
   - Students sign on sign.html (their private link, in the "First class assignments due" reminder),
     which ticks their Orientation Roster box (column H). Until December only Test cohorts make links
     (SIGNING_LIVE here and in the Admin Apps Script); other cohorts' to-dos just say "Send orientation
     roster (BoldSign)".
   - The roster pop-up: who's signed, Not attending, your and Nick's signatures, the EC's line at the
     bottom, then the PDF on your form (orientation-roster-1.pdf for up to 15 students, -2 for more),
     saved with the signatures (Admin folder). Saving it with everyone signed checks off the to-do (and, for the
     cohort's own orientation, "Orientation roster" on the Documentation Checklist).

   Saved in Firebase: cohorts/{key}/rosters/{date}
     { out: { sid: true }, inst: { nick|bella: { png, at, by } }, ec: { who, png, at }, saved: { url, name, at, by, complete } }
   The students' signatures and the finished rosters are in Drive ("<cohort folder>/Admin - <cohort>/Orientation Roster
   Signatures"), read and saved through the Apps Script. */

const SIGNING_LIVE = false; // December: true (and the same in the Admin Apps Script), once the Student Hub has the card
const signingOn = (key = S.cohortKey) => SIGNING_LIVE || isTestCohort(key || '');
const INSTRUCTORS = [
  { key: 'nick', name: 'Nicholas Brown', cert: 'F201600733' },
  { key: 'bella', name: 'Gabriella Brown', cert: 'F201600639' },
];
const ROSTER_HOURS = 4; // registered with the state for the most it could take: start time to 4 hours later

/* ---------- Times ---------- */
// "11:00 AM" / "6:30 pm" / "1830" / "18:30" → "1830" ('' if it can't tell)
function milTime(t) {
  const s = String(t || '').trim().toLowerCase();
  let m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)\.?m?\.?$/);
  if (m) { let h = Number(m[1]) % 12; if (m[3] === 'p') h += 12; return String(h).padStart(2, '0') + (m[2] || '00'); }
  m = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return m[1].padStart(2, '0') + m[2];
  return '';
}
const milPlus = (mil, h) => mil ? String((Number(mil.slice(0, 2)) + h) % 24).padStart(2, '0') + mil.slice(2) : '';
const rosterTimes = p => { const s = milTime(p.time); return s ? s + '-' + milPlus(s, ROSTER_HOURS) : ''; };

/* ---------- Who's on which roster ---------- */
// [{ date, late, people: [emPerson…] }]: the cohort's own orientation (everyone not on their own date),
// then each late date. Students who enrolled after orientation but have no date yet wait.
function rosters() {
  const out = [], main = cohortInfo().firstDay, byDate = {};
  emPeople().forEach(p => {
    if (p.late) (byDate[p.orient] = byDate[p.orient] || []).push(p);
    else if (!p.needsLate && isIsoDate(main)) (byDate[main + '|main'] = byDate[main + '|main'] || []).push(p);
  });
  if (isIsoDate(main)) out.push({ date: main, late: false, people: byDate[main + '|main'] || [] });
  Object.keys(byDate).filter(k => !k.endsWith('|main')).sort().forEach(d => {
    if (d === main) { out[0].people.push(...byDate[d]); out[0].mixed = true; return; } // a "late" date that's the cohort's own day
    out.push({ date: d, late: true, people: byDate[d] });
  });
  return out;
}
const rosterFor = date => rosters().find(r => r.date === date) || null;
// The name as it goes on a state roster: "Dawson, Tyler (TJ)" → "Tyler Dawson" (no nickname).
const rosterName = name => { const c = String(name).replace(/\s*\([^)]*\)/g, '').trim(); if (!c.includes(',')) return c; const [last, ...first] = c.split(','); return (first.join(',').trim() + ' ' + last.trim()).trim(); };
const rosterDoc = date => (S.rosterDocs || {})[date] || {};
const onRoster = (r, doc = rosterDoc(r.date)) => r.people.filter(p => !(doc.out || {})[p.sid]);
const sheetStudent = sid => (S.sheet && S.sheet.students || []).find(s => slug(s.name) === sid) || {};
const courseNoFor = r => { const i = cohortInfo(); return String((r.late && i.lateCourseNo) || i.courseNo || '').replace(/#/g, '').trim(); }; // (plain: the form's column already says Course #)
// Signed: from the signatures in Drive once they've been read, otherwise the Orientation Roster box (column H).
function signedMap(r) {
  const got = (S.rosterSigs || {})[r.date], out = {};
  r.people.forEach(p => {
    const name = sheetStudent(p.sid).name || p.name;
    const sig = got && got.list ? got.list.find(x => x.name === name) : null;
    out[p.sid] = got && got.list ? sig || null : sheetStudent(p.sid).orientRoster ? { fromSheet: true } : null;
  });
  return out;
}
function rosterCount(r) {
  const list = onRoster(r), signed = signedMap(r);
  return { signed: list.filter(p => signed[p.sid]).length, total: list.length };
}

/* ---------- The to-dos ---------- */
const rosterTodoText = r => (signingOn() ? 'Orientation roster' : 'Send orientation roster (BoldSign)') + ' · ' + monthDay(r.date)
  + (r.late ? ' · late: ' + r.people.map(p => rosterName(p.name)).join(', ') : '');
const rosterSyncing = new Set();
let rosterStartClaimed = null;
// After each render: a to-do for each roster from the day this started, kept in step (names, date moves).
// Each one shows up ROSTER_LEAD_DAYS before its orientation (until then the Setup Checklist has the room),
// and from then on its student list is kept saved in Drive for the signing page.
const ROSTER_LEAD_DAYS = 2;
function syncRosters() {
  const key = S.cohortKey, doc = S.cohortDoc;
  if (!S.sheet || !key || !doc || !S.todosLoaded) return;
  if (!doc.rostersStart) {
    if (rosterStartClaimed !== key) { rosterStartClaimed = key; Store.claimValue('cohorts/' + key, 'rostersStart', todayIso()).catch(() => { rosterStartClaimed = null; }); }
    return;
  }
  const removed = doc.removedRepeats || {}, soon = addDays(todayIso(), ROSTER_LEAD_DAYS);
  const list = rosters().filter(r => r.date >= doc.rostersStart && r.date <= soon && r.people.length);
  const want = new Set(list.map(r => 'oroster-' + r.date));
  const put = (id, data) => {
    if (rosterSyncing.has(id)) return;
    rosterSyncing.add(id);
    Store.set(P('todos/' + id), data).catch(() => {}).finally(() => rosterSyncing.delete(id));
  };
  list.forEach(r => {
    const id = 'oroster-' + r.date, have = S.todos.find(t => t.id === id), text = rosterTodoText(r);
    if (!have && !removed[id]) put(id, { text, done: false, day: SETUP, kind: 'ctodo', order: -2000 + list.indexOf(r), created: Date.now(), repeat: true, roster: r.date, due: r.date, dueAuto: false });
    else if (have && !have.done && have.text !== text && /^(orientation roster|send orientation roster)/i.test(have.text || '')) put(id, { text }); // (unless you retyped it)
  });
  if (signingOn()) list.forEach(saveListSoon);
  // A late enrollee's date moved (or they came off it), or it isn't 2 days out yet: an unfinished roster goes away.
  S.todos.filter(t => t.roster && !t.done && !want.has(t.id) && !rosterDoc(t.roster).saved).forEach(t => {
    if (rosterSyncing.has(t.id)) return;
    rosterSyncing.add(t.id);
    Store.del(P('todos/' + t.id)).catch(() => {}).finally(() => rosterSyncing.delete(t.id));
  });
}
// The roster's student list, saved to Drive whenever it changes (rosters/{date}.listKey remembers what was last saved,
// so opening the app on two computers doesn't save it twice).
const listSaving = new Set();
function saveListSoon(r) {
  const list = rosterList(r), key = JSON.stringify(list), have = rosterDoc(r.date).listKey, id = S.cohortKey + '|' + r.date;
  if (have === key || listSaving.has(id)) return;
  listSaving.add(id);
  Sheets.saveRosterList(S.cohortKey, r.date, list)
    .then(() => Store.set(rosterPath(r.date), { listKey: key }))
    .then(() => listSaving.delete(id))
    .catch(e => { console.warn('Roster list not saved yet:', e.message); setTimeout(() => listSaving.delete(id), 30000); }); // (tries again in a bit)
}
const hasRosterTodos = () => itemsFor(SETUP, 'ctodo').some(t => t.roster && !t.done);
// The button on a roster to-do (only where students sign in the app).
const SIG_ICON = '<svg viewBox="0 0 24 24"><path d="M3 17c2.5-6 4.5-9 6-9 2 0 0 8 2 8 1.5 0 2.5-4 4-4 1.2 0 1 2.5 2.5 2.5 1 0 2-1 3-2"/><path d="M3 21h18"/></svg>';
function rosterBtn(t) {
  if (!signingOn() || !t.roster) return '';
  const r = rosterFor(t.roster);
  const c = r ? rosterCount(r) : { signed: 0, total: 0 };
  return `<button class="btn tiny ro-btn" data-act="rosterOpen" data-date="${t.roster}" title="Orientation roster: ${c.signed} of ${c.total} signed" aria-label="Open the orientation roster">${SIG_ICON}${c.signed}/${c.total}</button>`;
}
// On the to-do: "Orientation roster" with the date small beside it, and a late roster's names on a line underneath.
// (The saved text keeps everything, for the Morning Email.)
function rosterLabel(t) {
  const [what] = String(t.text || '').split(' · ');
  const names = (String(t.text || '').match(/ · late: (.+)$/) || [])[1];
  return `<span class="txt ro-label">${esc(what || 'Orientation roster')} <span class="ro-date">${monthDay(t.roster)}</span>${names ? `<span class="ro-names">${esc(names)}</span>` : ''}</span>`;
}

/* ---------- The roster pop-up ---------- */
const sigImg = (png, alt) => `<img class="ro-sig" src="${png.startsWith('data:') ? png : 'data:image/png;base64,' + png}" alt="${esc(alt)}">`;
const atText = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
function rosterModal() {
  const ro = S.roster, r = rosterFor(ro.date);
  if (!r) return `<div class="overlay" data-act="rosterClose"><div class="modal small-modal" data-stop><div class="modal-head"><h2>Orientation Roster</h2>
    <button class="x big" data-act="rosterClose" aria-label="Close">×</button></div><div class="modal-body pad-top"><p class="empty">Nobody is on a roster for ${monthDay(ro.date)} anymore.</p></div></div></div>`;
  const doc = rosterDoc(r.date), got = (S.rosterSigs || {})[r.date] || {}, signed = signedMap(r), list = onRoster(r, doc);
  const c = rosterCount(r), inst = doc.inst || {}, ec = doc.ec || {}, courseNo = courseNoFor(r);
  if (ro.url) {
    return `<div class="overlay" data-act="rosterClose"><div class="modal pdf packet-view" data-stop>
      <div class="modal-head"><h2>Roster PDF <span class="muted small">${monthDay(r.date)} · ${list.length} student${list.length === 1 ? '' : 's'}</span></h2>
        <span class="panel-actions"><button class="link" data-act="rosterBack">‹ Back to the roster</button>
        <a class="btn small" href="${ro.url}" target="_blank" rel="noopener">Open in new tab ↗</a>
        <button class="x big" data-act="rosterClose" aria-label="Close">×</button></span></div>
      <iframe src="${ro.url}" title="Roster PDF"></iframe>
    </div></div>`;
  }
  const rows = r.people.map((p, i) => {
    const out = !!(doc.out || {})[p.sid], sig = signed[p.sid];
    const sigCell = out ? '<span class="muted small">Not attending</span>'
      : sig && sig.png ? sigImg(sig.png, rosterName(p.name) + ' signature') + `<span class="ro-at ${sig.late ? 'late' : ''}">${sig.late ? 'late · ' : ''}${esc(atText(sig.signedAt))}</span>`
      : sig ? '<span class="em-yes">✓</span> <span class="muted small">signed (box ticked in the sheet)</span>'
      : '<span class="tbd">Not signed yet</span>';
    return `<tr class="${out ? 'ro-out' : ''}"><td class="c muted">${i + 1}</td><td><b>${esc(rosterName(p.name))}</b></td><td class="c">${esc(rosterTimes(p)) || '<span class="tbd">time?</span>'}</td>
      <td class="ro-sig-cell">${sigCell}</td>
      <td class="ro-acts">${!out && !sig ? `<button class="link" data-act="rosterLink" data-sid="${p.sid}">Copy signing link</button>` : ''}
        ${!out && sig && sig.png ? `<button class="link" data-act="rosterClearSig" data-sid="${p.sid}">Clear</button>` : ''}
        <button class="link" data-act="rosterOut" data-sid="${p.sid}">${out ? 'Attending' : 'Not attending'}</button></td></tr>`;
  }).join('');
  // The EC button: whoever has it on, their signature also goes on the bottom line (Instructor, Printed Name / Signature / Date).
  const instRow = x => {
    const s = instSig(doc, x.key), isEc = ec.who === x.key;
    return `<div class="ro-inst"><span class="ro-inst-name"><b>${x.name}</b> <span class="muted small">${x.cert}</span></span>
      <button class="ro-ec-btn ${isEc ? 'on' : ''}" data-act="rosterEcWho" data-who="${x.key}" title="${isEc ? 'The EC: their signature also goes on the bottom line' : 'Make ' + x.name + ' the EC'}" aria-pressed="${isEc}">EC</button>
      ${s ? `${sigImg(s.png, x.name + ' signature')}<button class="link" data-act="rosterInstClear" data-who="${x.key}">Clear</button>`
        : `<button class="btn small" data-act="rosterInstSign" data-who="${x.key}">Sign</button>`}</div>`;
  };
  const ecWho = INSTRUCTORS.find(x => x.key === ec.who), ecDone = !!(ecWho && instSig(doc, ecWho.key));
  const unsigned = list.filter(p => !signed[p.sid]);
  const blocked = got.busy ? 'Reading the signatures…' : !list.length ? 'Nobody is on this roster.' : list.length > 30 ? 'The form has room for 30 students.'
    : !ecWho ? 'Pick the EC.' : !ecDone ? 'The EC signs above.' : '';
  return `<div class="overlay" data-act="rosterClose"><div class="modal roster-modal" data-stop>
    <div class="modal-head"><h2>Orientation Roster <span class="muted small">${esc(longDate(r.date))}${r.late ? ' · late enrollees' : ''}</span></h2>
      <span class="panel-actions"><button class="eye inq-reload ${got.busy ? 'spin' : ''}" data-act="rosterRefresh" title="Check for new signatures" aria-label="Check for new signatures" ${got.busy ? 'disabled' : ''}>${RELOAD}</button>
      ${ro.busy ? '' : '<button class="x big" data-act="rosterClose" aria-label="Close">×</button>'}</span></div>
    <div class="modal-body pad-top" data-keep-scroll="roster">
      <div class="ro-top">
        <span><span class="muted small">Course #</span> <b>${courseNo ? esc(courseNo) : '<span class="tbd">not entered</span>'}</b></span>
        <span><span class="muted small">Program</span> <b>Initial</b></span><span><span class="muted small">Course type</span> <b>Didactic</b></span>
        <span><span class="muted small">Topic</span> <b>Orientation</b></span>
        <span class="ro-count ${c.signed === c.total && c.total ? 'all' : ''}">${c.signed}/${c.total} signed</span>
      </div>
      ${!courseNo ? '<p class="em-warn">No VAOEMS Course No. yet: add it in Course Details (pencil) so it prints on the roster.</p>' : ''}
      ${got.err ? `<div class="alert">${esc(got.err)}</div>` : ''}
      <p class="mini-head">Students</p>
      <table class="roster ro-table"><thead><tr><th class="c">#</th><th>Name</th><th class="c">Times</th><th>Signature</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Nobody yet.</td></tr>'}</tbody></table>
      <p class="muted small">Students sign from the Orientation Roster assignment in the Student Portal, or from the link in a reminder email.</p>
      <p class="mini-head">Instructors</p>
      ${INSTRUCTORS.map(instRow).join('')}
      ${doc.saved ? `<p class="ro-saved">✓ Saved ${esc(atText(doc.saved.at))}${doc.saved.complete ? '' : ' (before everyone signed)'}: <a href="${esc(doc.saved.url)}" target="_blank" rel="noopener">${esc(doc.saved.name)} ↗</a></p>` : ''}
      ${ro.err ? `<div class="alert">${esc(ro.err)}</div>` : ''}
    </div>
    <div class="modal-foot ro-foot"><span class="muted small">${ro.busy ? esc(ro.busy) : blocked || (unsigned.length ? unsigned.length + ' still to sign' : '')}</span>
      <button class="btn" data-act="rosterPreview" ${ro.busy || !list.length || list.length > 30 ? 'disabled' : ''}>Preview PDF</button>
      <button class="btn primary" data-act="rosterSave" ${ro.busy || blocked ? 'disabled' : ''}>${doc.saved ? 'Save again' : 'Save to Drive'}</button></div>
  </div></div>`;
}

// An instructor's signature on this roster: { png, at }. (Before the EC button, the EC signed the bottom line
// separately: that signature counts as theirs if they hadn't signed their own line.)
function instSig(doc, key) {
  const s = (doc.inst || {})[key], ec = doc.ec || {};
  if (s && s.png) return s;
  return ec.who === key && ec.png ? { png: ec.png, at: ec.at } : null;
}

/* ---------- Drawing a signature (its own pop-up on top, so redraws don't wipe it) ---------- */
function sigPadOpen(title, note) {
  return new Promise(done => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay sigpad-overlay';
    wrap.innerHTML = `<div class="modal small-modal sigpad-modal">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="x big" data-x aria-label="Cancel">×</button></div>
      <div class="modal-body pad-top"><p class="muted small">${esc(note)}</p>
        <div class="sig-box"><div class="sig-line"></div><canvas aria-label="Signature box"></canvas></div></div>
      <div class="modal-foot"><button class="link" data-clear>Clear</button><button class="btn primary" data-done disabled>Done</button></div></div>`;
    document.body.appendChild(wrap);
    const pad = SigPad(wrap.querySelector('canvas')), btn = wrap.querySelector('[data-done]');
    const close = val => { removeEventListener('keydown', onKey, true); wrap.remove(); done(val); };
    const onKey = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(''); } };
    addEventListener('keydown', onKey, true);
    wrap.querySelector('canvas').addEventListener('pointerup', () => { btn.disabled = !pad.hasInk(); });
    wrap.querySelector('[data-clear]').onclick = () => { pad.clear(); btn.disabled = true; };
    wrap.querySelector('[data-x]').onclick = () => close('');
    wrap.addEventListener('click', e => { if (e.target === wrap) close(''); });
    btn.onclick = () => close(pad.png());
  });
}

/* ---------- The PDF (your form, filled in: rosterform.js) ---------- */
const mdy = iso => { const [y, m, d] = iso.split('-'); return m + '/' + d + '/' + y; };
async function rosterPdf(r) {
  const PDFLib = await loadPdfLib();
  const doc = rosterDoc(r.date), list = onRoster(r, doc), signed = signedMap(r), ec = doc.ec || {};
  const ecWho = INSTRUCTORS.find(x => x.key === ec.who), ecSig = ecWho && instSig(doc, ecWho.key);
  return RosterForm.fill(PDFLib, {
    date: mdy(r.date), courseNo: courseNoFor(r), title: S.cohortKey + ' Orientation Roster ' + mdy(r.date),
    people: list.map(p => ({ name: rosterName(p.name), times: rosterTimes(p), png: (signed[p.sid] || {}).png || '' })),
    inst: Object.fromEntries(INSTRUCTORS.map(x => [x.key, (instSig(doc, x.key) || {}).png || ''])),
    ec: ecSig ? { name: ecWho.name, png: ecSig.png, date: mdy(isoOf(ecSig.at ? new Date(ecSig.at) : new Date())) } : null, // the EC's own signature, in both places
  });
}
// What the student signing page shows: everyone on this roster (names and times, never anyone's signature).
// Saved with the signatures in Drive each time links are made, so a late enrollee added later shows up too.
const rosterList = r => ({ late: r.late, people: onRoster(r).map(p => ({ name: sheetStudent(p.sid).name || p.name, print: rosterName(p.name), times: rosterTimes(p) })) });
const rosterFileName = r => S.cohortKey + ' Orientation Roster ' + mdy(r.date).replace(/\//g, '-') + (r.late ? ' (late enrollees)' : '') + '.pdf';
function bytesB64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- Doing things ---------- */
async function loadRosterSigs(date) {
  const key = S.cohortKey;
  S.rosterSigs = S.rosterSigs || {};
  const cur = S.rosterSigs[date] || {};
  S.rosterSigs[date] = { ...cur, busy: true, err: '' }; render();
  try {
    const list = await Sheets.rosterSigs(key, date);
    if (key !== S.cohortKey) return;
    S.rosterSigs[date] = { list, at: Date.now() };
    // Keep the Orientation Roster boxes (and the to-do's count) in step without re-reading the sheet.
    if (S.sheet) S.sheet.students.forEach(s => { if (list.some(x => x.name === s.name)) s.orientRoster = true; });
  } catch (e) {
    S.rosterSigs[date] = { ...cur, busy: false, err: 'Couldn’t read the signatures: ' + e.message + (/unknown request/i.test(e.message) ? ' (the Admin Apps Script needs its new version deployed)' : '') };
  }
  render();
}
const rosterPath = date => P('rosters/' + date);
const rosterPerson = (r, sid) => r.people.find(p => p.sid === sid);
// Each student's private signing link ({ sid: url }), made by the Apps Script (Test cohorts only until December).
async function signLinksFor(r, people) {
  const out = {}, groups = {};
  people.forEach(p => { const k = rosterTimes(p); (groups[k] = groups[k] || []).push(p); }); // their times go in the link
  for (const k of Object.keys(groups)) {
    const list = groups[k], start = milTime(list[0].time);
    const names = list.map(p => sheetStudent(p.sid).name || p.name);
    const links = await Sheets.signLinks(S.cohortKey, { date: r.date, start, end: milPlus(start, ROSTER_HOURS), late: r.late, list: rosterList(r) }, names);
    list.forEach((p, i) => { out[p.sid] = links[names[i]] ? new URL('sign.html?t=' + links[names[i]], location.href).href : ''; });
  }
  return out;
}

async function rosterAct(a, el = {}) {
  const d = el.dataset || {}, ro = S.roster;
  const r = ro ? rosterFor(ro.date) : null;
  const who = INSTRUCTORS.find(x => x.key === d.who);
  switch (a) {
    case 'rosterOpen': S.roster = { date: d.date }; render(); loadRosterSigs(d.date); return true;
    case 'rosterClose': if (ro && ro.busy) return true; if (ro && ro.url) URL.revokeObjectURL(ro.url); S.roster = null; render(); return true;
    case 'rosterBack': URL.revokeObjectURL(ro.url); ro.url = ''; render(); return true;
    case 'rosterRefresh': loadRosterSigs(ro.date); return true;
    case 'rosterOut': {
      const out = !!(rosterDoc(ro.date).out || {})[d.sid];
      await Store.set(rosterPath(ro.date), { out: { [d.sid]: !out } }); return true;
    }
    case 'rosterLink': {
      const p = r && rosterPerson(r, d.sid); if (!p) return true;
      try {
        const link = (await signLinksFor(r, [p]))[p.sid];
        if (!link) throw new Error('They aren’t on the cohort sheet.');
        try { await navigator.clipboard.writeText(link); toast('Signing link for ' + rosterName(p.name) + ' copied.'); }
        catch { prompt('Copy their signing link:', link); }
      } catch (e) { toast(e.message); }
      return true;
    }
    case 'rosterClearSig': {
      const p = r && rosterPerson(r, d.sid); if (!p) return true;
      if (!confirm(`Clear ${rosterName(p.name)}’s signature from this roster?\n\nIt goes to the Drive trash, their Orientation Roster box is unticked, and their link lets them sign again.`)) return true;
      try {
        await Sheets.clearRosterSig(S.cohortKey, ro.date, sheetStudent(p.sid).name || p.name);
        const s = sheetStudent(p.sid); if (s) s.orientRoster = false;
      } catch (e) { toast(e.message); }
      loadRosterSigs(ro.date); return true;
    }
    case 'rosterInstSign': {
      if (!who) return true;
      const isEc = (rosterDoc(ro.date).ec || {}).who === who.key;
      const png = await sigPadOpen(who.name, 'Your signature on the Instructors line' + (isEc ? ', and on the bottom line as the EC (with today’s date).' : '.'));
      if (!png) return true;
      await Store.set(rosterPath(ro.date), { inst: { [who.key]: { png, at: new Date().toISOString(), by: (S.user && S.user.email) || '' } } });
      return true;
    }
    case 'rosterInstClear': {
      const ec = rosterDoc(ro.date).ec || {};
      await Store.set(rosterPath(ro.date), { inst: { [d.who]: null }, ...(ec.who === d.who && ec.png ? { ec: { png: null, at: null } } : {}) }); return true;
    }
    case 'rosterEcWho': { // only one EC: pressing theirs again turns it off
      const ec = rosterDoc(ro.date).ec || {}, inst = rosterDoc(ro.date).inst || {};
      if (ec.who === d.who) { await Store.set(rosterPath(ro.date), { ec: { who: null, png: null, at: null } }); return true; }
      // (an EC signature from before keeps counting as theirs: copied onto their own line)
      const keep = ec.png && ec.who && !(inst[ec.who] && inst[ec.who].png) ? { inst: { [ec.who]: { png: ec.png, at: ec.at || null } } } : {};
      await Store.set(rosterPath(ro.date), { ...keep, ec: { who: d.who, png: null, at: null } }); return true;
    }
    case 'rosterPreview': case 'rosterSave': {
      if (!r || ro.busy) return true;
      const list = onRoster(r), signed = signedMap(r), missing = list.filter(p => !signed[p.sid]);
      if (a === 'rosterSave' && missing.length && !confirm(`${missing.length} still to sign: ${missing.map(p => rosterName(p.name)).join(', ')}.\n\nSave the roster anyway? You can save it again once they sign (it replaces the file), and the to-do stays open until everyone has.`)) return true;
      ro.busy = a === 'rosterSave' ? 'Saving to Drive…' : 'Making the PDF…'; ro.err = ''; render();
      try {
        if (signingOn() && !((S.rosterSigs || {})[r.date] || {}).list) await loadRosterSigs(r.date);
        const bytes = await rosterPdf(r);
        if (a === 'rosterPreview') ro.url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        else {
          const out = await Sheets.saveRosterPdf(S.cohortKey, rosterFileName(r), bytesB64(bytes));
          const complete = !missing.length;
          await Store.set(rosterPath(r.date), { saved: { url: out.url, name: out.name, at: new Date().toISOString(), by: (S.user && S.user.email) || '', complete } });
          if (complete) {
            await Store.set(P('todos/oroster-' + r.date), { done: true });
            if (!r.late) await Store.set('cohorts/' + S.cohortKey, { docChecks: { 'class-orientation-roster': true } });
          }
          toast(complete ? 'Roster saved to Admin - ' + S.cohortKey + ' → Orientation Roster Signatures. The to-do is checked off.' : 'Roster saved. Save it again once everyone has signed.');
        }
      } catch (e) {
        ro.err = e.message + (/unknown request/i.test(e.message) ? ' (the Admin Apps Script needs its new version deployed)' : '');
      }
      ro.busy = ''; render(); return true;
    }
  }
  return false;
}

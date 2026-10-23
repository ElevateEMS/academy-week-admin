/* Emails: the Course page's Emails box, the draft preview, Setup → Email Templates and Book Codes.

   Loaded before app.js; everything here runs only when app.js calls it, so it can use
   app.js's S, Store, esc, render, students, cohortInfo, datePicker and so on.

   The app never sends anything to students. "Create Gmail draft" asks the Apps Script to
   put the drafts in gbrown@'s Drafts, where you read them over and send them yourself.

   Saved in Firebase:
     emailTemplates/{id}             your edits to a template (defaults.js has the starting ones), or a new one
     bookCodes/{code}                { code, added, order, sid, cohort, name, at }  (sid set = issued, never reused)
     cohorts/{key}                   emailsStart: the day the Emails box started for this cohort (anything due
                                     before that was already handled by hand), emailsInit (one-time setup claimed)
     cohorts/{key}/students/{sid}    sent: { templateId: 'yyyy-mm-dd' | 'before' }, bookCode,
                                     late: { date, time } (their own orientation), payDates: { next, final } (extension)
     cohorts/{key}/emailLog/{id}     { tpl, name, date, at, names, count, by }  (drafts made, newest first in the box) */

/* ---------- Templates ---------- */
const EM_NICK = () => DEFAULTS.email.nick;
function emailTemplates({ all = false } = {}) {
  const saved = S.emailTpls || {};
  const list = DEFAULTS.emailTemplates.map(t => ({ ...t, ...(saved[t.id] || {}), id: t.id, isDefault: true }));
  Object.values(saved).forEach(t => { if (!list.some(x => x.id === t.id)) list.push({ ...t }); });
  return list.map(t => ({ ...t, when: { from: 'manual', days: 0, ...(t.when || {}) } })).filter(t => all || !t.off);
}
const tplById = id => emailTemplates({ all: true }).find(t => t.id === id);

// check (Cohort Graduates): everyone attending Academy Week, all checked; you uncheck anyone when you draft it.
const WHO = { all: 'Whole cohort', check: 'Cohort Graduates', textbook: 'Textbook ✓ students', 'unpaid-next': 'Haven’t paid Next', 'unpaid-final': 'Haven’t paid Final', pick: 'Students you pick' };
const FROM = { enroll: 'As each student enrolls', orientation: 'Orientation', next: 'Next installment due', final: 'Final installment due', academy: 'Academy Week start', manual: 'Only when you pick it' };
function whenText(w) {
  if (w.from === 'enroll' || w.from === 'manual') return FROM[w.from];
  const name = { orientation: 'orientation', next: 'Next is due', final: 'Final is due', academy: 'Academy Week' }[w.from];
  const n = Number(w.days) || 0, a = Math.abs(n);
  if (!n) return (w.from === 'next' || w.from === 'final') ? 'Morning ' + name : 'Day of ' + name;
  const span = a >= 14 && a % 7 === 0 ? (a / 7) + ' weeks' : a + ' day' + (a === 1 ? '' : 's');
  return span + (n < 0 ? ' before ' : ' after ') + name;
}

/* ---------- Dates the way the emails write them ---------- */
// Dec 12 → Nov 12 (the last day of the month when that month is shorter)
const monthBefore = iso => { const [y, m, d] = iso.split('-').map(Number), last = new Date(y, m - 1, 0).getDate(); return isoOf(new Date(y, m - 2, Math.min(d, last))); };
const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
// "Saturday, January 9th" (plus ", 2027" when it isn't this year); short: "Sat., August 8th"
function emDate(iso, { short = false } = {}) {
  if (!isIsoDate(iso)) return '';
  const d = parseIso(iso);
  const wd = d.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
  const yr = d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '';
  return wd + (short ? '., ' : ', ') + d.toLocaleDateString('en-US', { month: 'long' }) + ' ' + ordinal(d.getDate()) + yr;
}
const emSoon = iso => { const t = todayIso(); return !iso ? 'new' : iso === t ? 'today' : iso === addDays(t, 1) ? 'tomorrow' : iso < t ? 'was due ' + monthDay(iso) : monthDay(iso); };

/* ---------- Students, as the emails see them ---------- */
// Blocked (in the sheet) and not attending (in the app) are left out; Paused stay in.
// late: their own orientation date and time (late enrollees). payDates: an extension.
const validEmail = e => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(e || '').trim());
function emPerson(s) {
  const doc = S.studentsDoc[s.sid] || {}, sent = doc.sent || {};
  const late = doc.late && isIsoDate(doc.late.date) ? doc.late : null;
  const base = cohortInfo().firstDay;
  const orient = late ? late.date : isIsoDate(base) ? base : '';
  const pd = doc.payDates || {};
  return {
    sid: s.sid, name: s.name, email: String(s.email || '').trim(),
    textbook: !!s.textbook, paidNext: !!s.paidNext, paidFinal: !!s.paidFinal,
    late: !!late, orient, time: late ? String(late.time || '') : DEFAULTS.email.orientationTime,
    next: isIsoDate(pd.next) ? pd.next : orient ? addDays(orient, late ? 14 : -1) : '',
    final: isIsoDate(pd.final) ? pd.final : orient ? addDays(orient, late ? 28 : 29) : '',
    ext: { next: isIsoDate(pd.next), final: isIsoDate(pd.final) },
    sent, bookCode: doc.bookCode || '',
    // Enrolled after the cohort's orientation and their own date isn't in yet.
    needsLate: !late && !sent.welcome && pastOrientation(),
  };
}
const emPeople = () => students().filter(s => !s.out).map(emPerson);
const emPersonBySid = sid => { const s = students().find(x => x.sid === sid); return s ? emPerson(s) : null; };
// The cohort's own dates, for an email to the whole group.
function emCohortPerson() {
  const f = cohortInfo().firstDay, orient = isIsoDate(f) ? f : '';
  return { orient, time: DEFAULTS.email.orientationTime, next: orient ? addDays(orient, -1) : '', final: orient ? addDays(orient, 29) : '', late: false, ext: {} };
}

function whoFits(t, p) {
  if (t.who === 'textbook') return p.textbook;
  if (t.who === 'unpaid-next') return !p.paidNext;
  if (t.who === 'unpaid-final') return !p.paidFinal;
  if (t.who === 'pick') return false;
  return true;
}
// The date this email is due for this student, and whether it's their own (late enrollee / extension).
function emAnchor(from, p) {
  if (from === 'orientation') return { date: p.orient, custom: p.late };
  if (from === 'next') return { date: p.next, custom: p.late || p.ext.next };
  if (from === 'final') return { date: p.final, custom: p.late || p.ext.final };
  if (from === 'academy') return { date: (S.sheet && S.sheet.academyStart) || '', custom: false };
  return { date: '', custom: false };
}

/* ---------- What's due (the Emails box) ---------- */
// One row per email: everyone on the cohort's dates together, anyone on their own dates on their own.
function emailRows() {
  const start = (S.cohortDoc && S.cohortDoc.emailsStart) || todayIso();
  const people = emPeople(), rows = {}, undated = new Set();
  const skipped = (S.cohortDoc && S.cohortDoc.emailSkip) || {};
  emailTemplates().forEach(t => {
    const from = t.when.from;
    if (from === 'manual') return;
    if (t.who === 'pick' || t.who === 'check') { // a reminder row; you choose who when you draft it (check = everyone starts checked)
      const a = emAnchor(from, emCohortPerson()), date = a.date ? addDays(a.date, Number(t.when.days) || 0) : '';
      if (from !== 'enroll' && !date) { undated.add(from); return; }
      const key = t.id + '|pick|' + date;
      if ((date && date < start) || people.some(p => p.sent[t.id])) return;
      rows[key] = { key, tpl: t, date, custom: false, pick: true, sids: people.map(p => p.sid) };
      return;
    }
    people.forEach(p => {
      if (p.sent[t.id] || !whoFits(t, p)) return;
      let date = '', custom = false;
      if (from !== 'enroll') {
        if (p.needsLate && from !== 'academy') return; // waits for their own orientation date (asked on their Welcome)
        const a = emAnchor(from, p);
        if (!a.date) { undated.add(from); return; }
        date = addDays(a.date, Number(t.when.days) || 0); custom = a.custom;
        if (date < start) return; // before the Emails box started: already handled by hand
      }
      const key = t.id + '|' + (custom ? p.sid : 'cohort') + '|' + date;
      (rows[key] = rows[key] || { key, tpl: t, date, custom, sids: [] }).sids.push(p.sid);
    });
  });
  // Same day: in the order of the template list (on track before behind, etc.).
  const order = Object.fromEntries(emailTemplates({ all: true }).map((t, i) => [t.id, i]));
  Object.keys(rows).forEach(k => { if (skipped[k]) delete rows[k]; }); // × "not needed for this cohort"
  const list = Object.values(rows).sort((a, b) => (a.date || '0').localeCompare(b.date || '0') || order[a.tpl.id] - order[b.tpl.id]);
  list.undated = undated;
  return list;
}
function rowWho(r) {
  const n = r.sids.length, s = n === 1 ? '' : 's';
  if (r.pick) return r.tpl.who === 'check' ? n + ' attending · uncheck anyone first' : 'you pick who';
  if (r.custom || n === 1) { const p = emPersonBySid(r.sids[0]); return p ? esc(p.name) : '1 student'; }
  if (r.tpl.when.from === 'enroll') return n + ' new student' + s;
  if (/^unpaid/.test(r.tpl.who)) return n + ' unpaid';
  if (r.tpl.who === 'textbook') return n + ' with Textbook';
  return n + ' student' + s;
}
// Only the "you're behind" reminders can be skipped for a cohort (the × on their row).
const EM_SKIPPABLE = ['next-early', 'next-day', 'final-early', 'final-day', 'coursework-behind'];
const freeCodes = () => (S.bookCodes || []).filter(c => !c.sid).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.code).localeCompare(String(b.code)));

const MAIL = '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M4 7l8 6 8-6"/></svg>';
function emailsBox() {
  const rows = emailRows(), t = todayIso();
  const due = rows.filter(r => !r.date || r.date <= t), later = rows.filter(r => r.date && r.date > t);
  const row = r => `<li class="em-row ${r.date && r.date < t ? 'overdue' : ''}">
      <span class="em-main"><span class="em-name">${esc(r.tpl.name)}</span><span class="em-sub">${emSoon(r.date)} · ${rowWho(r)}</span></span>
      ${EM_SKIPPABLE.includes(r.tpl.id) ? `<button class="x em-skip" data-act="emSkip" data-row="${esc(r.key)}" title="Not needed for this cohort" aria-label="Not needed for this cohort">×</button>` : ''}
      <button class="btn tiny" data-act="emDraft" data-row="${esc(r.key)}">Draft</button></li>`;
  const notes = [];
  if (rows.undated.has('orientation') || rows.undated.has('next') || rows.undated.has('final')) notes.push('Add the orientation date in Course Details to schedule the orientation and payment emails.');
  if (rows.undated.has('academy')) notes.push('Add the Academy Week start date in Course Details to schedule the Academy Week emails.');
  const needCodes = rows.filter(r => r.tpl.id === 'bookcode').reduce((n, r) => n + r.sids.filter(sid => !(emPersonBySid(sid) || {}).bookCode).length, 0);
  const free = freeCodes().length;
  if (free < needCodes || free < DEFAULTS.email.lowCodes) notes.push(`Only ${free} unused book code${free === 1 ? '' : 's'} left${needCodes ? ` (${needCodes} needed)` : ''}. <button class="link" data-act="bookCodesOpen">Add codes</button>`);
  const log = [...(S.emailLog || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `${notes.map(n => `<p class="em-note">${n}</p>`).join('')}
    <p class="mini-head">Due now <span class="count">${due.length || ''}</span></p>
    <ul class="em-list">${due.map(row).join('') || '<li class="empty">Nothing due today.</li>'}</ul>
    ${later.length ? `<p class="mini-head">Coming up</p>
      <ul class="em-list later">${later.map(row).join('')}</ul>` : ''}
    ${log.length ? `<details class="em-done" ${S.emailDoneOpen ? 'open' : ''}><summary data-act="emailDoneToggle">Drafted <span class="count">${log.length}</span></summary>
      <ul class="em-list done">${log.slice(0, 20).map(x => `<li class="em-row"><span class="em-main"><span class="em-name">✓ ${esc(x.name)}</span>
        <span class="em-sub">${monthDay(isoOf(new Date(x.at)))} · ${x.count === 1 ? esc((x.names || [])[0] || '1 student') : x.count + ' students'}</span></span></li>`).join('')}</ul></details>` : ''}`;
}

/* ---------- Filling in a template ---------- */
// {if late}…{else}…{end}: words ("late", "group", "owes next", "has book" …) joined by "and", any of them with "not".
const EM_IFS = {
  late: p => !!(p && p.late), group: (p, g) => g, 'one student': (p, g) => !g,
  'owes next': p => !!(p && !p.paidNext), 'owes final': p => !!(p && !p.paidFinal),
  'owes tuition': p => !!(p && (!p.paidNext || !p.paidFinal)), 'paid in full': p => !!(p && p.paidNext && p.paidFinal),
  'has book': p => !!(p && p.textbook), 'needs book': p => !!(p && !p.textbook), extension: p => !!(p && (p.ext.next || p.ext.final)),
};
function emTest(expr, p, group) {
  return expr.split(/\s+and\s+/i).every(term => {
    const neg = /^not\s+/i.test(term.trim()), k = term.trim().replace(/^not\s+/i, '').toLowerCase();
    const v = EM_IFS[k] ? EM_IFS[k](p, group) : false;
    return neg ? !v : v;
  });
}
function applyIfs(text, test) {
  // Innermost first, so an {if} can sit inside another one.
  const re = /\{if ([^{}]+)\}((?:(?!\{if )[\s\S])*?)(?:\{else\}((?:(?!\{if )[\s\S])*?))?\{end\}/i;
  let m, guard = 0;
  while ((m = re.exec(text)) && guard++ < 500) text = text.slice(0, m.index) + (test(m[1].trim()) ? m[2] : (m[3] || '')) + text.slice(m.index + m[0].length);
  return text;
}
function referralCode(name) {
  const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  let first, last;
  if (clean.includes(',')) [last, first] = clean.split(',').map(x => x.trim()); else { const w = clean.split(/\s+/); last = w.pop(); first = w.join(' '); }
  const yr = (String(S.cohortKey).match(/\d{4}/) || [''])[0].slice(2);
  return (first || '').charAt(0).toUpperCase() + String(last || '').replace(/[^A-Za-z]/g, '') + 'EMT' + yr;
}
function fullName(name) { const n = coverName(name); return (n.first + ' ' + n.last).trim(); }
// Every fill-in, for one student (p) or the whole group (p = null).
function emValues(p) {
  const i = cohortInfo(), c = p || emCohortPerson();
  const days = weekDays().filter(d => d.iso), aw = (S.sheet && S.sheet.academyStart) || '';
  const meet = i.meet ? (/^https?:/i.test(i.meet) ? i.meet : 'https://' + i.meet) : '';
  const v = {
    'first name': p ? firstName(p.name) : '', 'full name': p ? fullName(p.name) : '', cohort: S.cohortKey || '',
    'orientation date': emDate(c.orient), 'orientation time': c.time,
    'next due': emDate(c.next), 'final due': emDate(c.final),
    'cpr date': emDate(i.cpr), 'academy week start': emDate(aw),
    'academy week dates': days.length ? emDate(days[0].iso) + ' – ' + emDate(days[days.length - 1].iso) : '',
    'coursework deadline': isIsoDate(aw) ? emDate(addDays(aw, -1)) + ' at 8:00 AM' : '',
    'fingerprinting deadline': isIsoDate(aw) ? emDate(monthBefore(aw)) : '',
    'meet link': meet, 'jbl code': i.jbl || '',
    'referral code': p ? referralCode(p.name) : '', 'book code': p ? (p.code || p.bookCode || '') : '',
  };
  [1, 2, 3, 4, 5].forEach(n => { const d = days.find(x => x.n === n); v['day ' + n] = d ? emDate(d.iso, { short: true }) : ''; });
  return v;
}
const EM_PERSONAL = ['first name', 'full name', 'referral code', 'book code'];
// → { subject, body, missing: [fill-ins that came out TBD] }
const OLD_SIGNOFF = /\n*Best regards,\s*\n\s*\n?\s*Gabriella Brown\s*\n\s*Elevate EMS, LLC\s*$/;
function emFill(t, p, group) {
  const vals = emValues(p), missing = new Set();
  const fill = text => applyIfs(String(text || ''), expr => emTest(expr, p, group))
    .replace(/\{([^{}]+)\}/g, (m, k) => {
      const key = k.trim().toLowerCase();
      if (!(key in vals)) return m;
      if (vals[key]) return vals[key];
      // A student's own detail with no student (the group email, or no code yet): highlighted, not TBD.
      if (EM_PERSONAL.includes(key)) return '[[' + k.trim() + ']]';
      missing.add(k.trim()); return 'TBD';
    })
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { subject: fill(t.subject).replace(/\s+/g, ' '), body: fill(t.body).replace(OLD_SIGNOFF, ''), missing: [...missing] };
}

/* ---------- Email text → HTML (bold, italic, links, bullets) ---------- */
function emInline(s, { marks = false } = {}) {
  s = esc(s);
  const keep = [];
  const hold = html => { keep.push(html); return '\u0001' + (keep.length - 1) + '\u0002'; };
  s = s.replace(/\[\[([^\]]+)\]\]/g, (m, x) => hold(marks ? `<mark class="em-fill">${x}</mark>` : '[[' + x + ']]'));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, x, u) => hold(`<a href="${u}" target="_blank" rel="noopener">${x}</a>`));
  s = s.replace(/https?:\/\/[^\s<\u0001]+[^\s<.,;:!?)\u0001]/g, u => hold(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`));
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?=\S)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
  return s.replace(/\u0001(\d+)\u0002/g, (m, n) => keep[Number(n)]);
}
function emHtml(text, opts = {}) {
  const body = String(text || '').split(/\n{2,}/).map(block => {
    let html = '', para = [], list = [];
    const flushP = () => { if (para.length) html += `<p style="margin:0 0 12px">${para.map(l => emInline(l, opts)).join('<br>')}</p>`; para = []; };
    const flushL = () => { if (list.length) html += `<ul style="margin:0 0 12px;padding-left:26px">${list.map(l => `<li style="margin:0 0 3px">${emInline(l, opts)}</li>`).join('')}</ul>`; list = []; };
    block.split('\n').forEach(l => { const m = l.match(/^\s*[-•]\s+(.*)$/); if (m) { flushP(); list.push(m[1]); } else { flushL(); para.push(l); } });
    flushP(); flushL();
    return html;
  }).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${body}</div>`;
}
const emPlain = text => String(text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*(?=\S)(.+?)\*(?!\*)/g, '$1$2')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, x, u) => x === u ? u : x + ' (' + u + ')');

const EM_SIG = '<p class="em-sig">Your Gmail signature (Best regards, Gabriella Brown, logo) is added here</p>';

/* ---------- The drafts one click makes ---------- */
// A "To: Nick, BCC everyone" email when it's for a group on the cohort's dates; otherwise one per student.
function emBuild(ed) {
  const t = tplById(ed.tplId);
  if (!t) return [];
  const people = ed.sids.map(emPersonBySid).filter(Boolean);
  if (t.id === 'bookcode') { // the codes these students would get (the real ones are claimed when the drafts are made)
    const free = freeCodes();
    people.filter(p => !p.bookCode).forEach((p, i) => { p.code = free[i] ? free[i].code : '[[no unused book code left]]'; });
  }
  const one = (t.send === 'each' || ed.custom || people.length === 1);
  const make = (key, group, list) => {
    const f = emFill(t, group ? null : list[0], group);
    const edit = (ed.edits || {})[key] || {};
    const emails = list.filter(p => validEmail(p.email)).map(p => p.email);
    return {
      key, group, people: list, noEmail: list.filter(p => !validEmail(p.email)),
      to: group ? EM_NICK() : emails.join(', '), cc: !group && t.ccNick ? EM_NICK() : '', bcc: group ? emails.join(', ') : '',
      subject: edit.subject ?? f.subject, body: edit.body ?? f.body, auto: f, missing: f.missing, edited: !!(edit.subject != null || edit.body != null),
    };
  };
  return one ? people.map(p => make(p.sid, false, [p])) : people.length ? [make('group', true, people)] : [];
}
// Late enrollees in this batch whose own orientation date/time isn't saved yet.
const emNeedsLate = ed => ed.sids.map(emPersonBySid).filter(p => p && (p.needsLate || (p.late && !p.time)));

function emailDraftModal() {
  const ed = S.emailDraft, t = tplById(ed.tplId);
  if (!t) return '';
  const drafts = emBuild(ed), lateList = emNeedsLate(ed);
  ed.idx = Math.min(ed.idx || 0, Math.max(0, drafts.length - 1));
  const dr = drafts[ed.idx];
  const fills = dr ? (dr.subject + dr.body).match(/\[\[[^\]]+\]\]/g) || [] : [];
  const latePanel = lateList.length ? `<div class="em-late">
      ${lateList.map(p => `<div class="em-late-row"><p><b>${esc(p.name)}</b> enrolled after orientation. When is their orientation?</p>
        <div class="em-late-fields">${datePicker('eml-date-' + p.sid, { optional: true, empty: 'Pick a date', title: 'Their orientation' })}
          <input id="eml-time-${p.sid}" data-draft="eml-time-${p.sid}" class="${S.drafts['eml-time-' + p.sid] ? '' : 'need'}" placeholder="Time, e.g. 6:30 PM" value="${esc(S.drafts['eml-time-' + p.sid] || '')}" autocomplete="off">
          <button class="btn small primary" data-act="emLateSave" data-sid="${p.sid}">Save</button></div></div>`).join('')}
      <p class="muted small">Their payments follow their date: Next 2 weeks after it, Final 2 weeks after that.</p></div>` : '';
  const recips = dr ? `<div class="em-recips">
      <div><span>To</span><b>${esc(dr.to) || '<span class="tbd">no email in the sheet</span>'}</b></div>
      ${dr.cc ? `<div><span>Cc</span><b>${esc(dr.cc)}</b></div>` : ''}
      ${dr.group ? `<div><span>Bcc</span><details><summary>${dr.people.length - dr.noEmail.length} student${dr.people.length - dr.noEmail.length === 1 ? '' : 's'}</summary>
        <span class="muted small">${dr.people.filter(p => validEmail(p.email)).map(p => esc(p.name)).join(', ')}</span></details></div>` : ''}
      ${dr.noEmail.length ? `<p class="em-warn">No email in the cohort sheet for ${dr.noEmail.map(p => esc(p.name)).join(', ')}, so ${dr.group ? 'they’re left out' : 'this one is skipped'} for now.</p>` : ''}
      ${dr.missing.length ? `<p class="em-warn">Blank in Course Details, so the email says TBD: ${dr.missing.map(esc).join(', ')}</p>` : ''}
    </div>` : '';
  const nav = drafts.length > 1 ? `<div class="em-nav"><button class="x" data-act="emIdx" data-dir="-1" ${ed.idx ? '' : 'disabled'} aria-label="Previous">‹</button>
      <span>Email ${ed.idx + 1} of ${drafts.length} · <b>${esc(dr.people[0].name)}</b></span>
      <button class="x" data-act="emIdx" data-dir="1" ${ed.idx < drafts.length - 1 ? '' : 'disabled'} aria-label="Next">›</button></div>` : '';
  const ready = drafts.filter(x => x.to), skipped = drafts.length - ready.length;
  const blocked = !drafts.length ? 'Nobody to email.' : lateList.length ? 'Add their orientation date and time first.'
    : !ready.length ? 'Nobody here has an email in the cohort sheet.' : ready.some(x => /\[\[[^\]]+\]\]/.test(x.subject + x.body)) ? 'Fill in the highlighted parts first.' : '';
  return `<div class="overlay" data-act="emDraftClose"><div class="modal em-draft" data-stop>
    <div class="modal-head"><h2>${esc(t.name)}</h2>${ed.busy ? '' : '<button class="x big" data-act="emDraftClose" aria-label="Close">×</button>'}</div>
    <div class="modal-body pad-top" data-keep-scroll="emDraft">
      ${latePanel}
      ${t.note ? `<p class="em-note">${esc(t.note)}</p>` : ''}
      ${nav}
      ${dr ? `${recips}
      <label class="field">Subject<input id="em-subj-${dr.key}" data-emedit="subject" data-key="${dr.key}" value="${esc(dr.subject)}" ${ed.busy ? 'disabled' : ''}></label>
      <div class="em-panes">
        <label class="field">Email text <span class="small">${dr.edited ? `changed for this email · <button class="link" data-act="emUndo" data-key="${dr.key}">undo my changes</button>` : 'edit anything here'}</span>
          <textarea id="em-body-${dr.key}" data-emedit="body" data-key="${dr.key}" data-keep-scroll="emBody" rows="18" ${ed.busy ? 'disabled' : ''}>${esc(dr.body)}</textarea></label>
        <div class="field">How it will look${fills.length ? ' <span class="em-fill-note">fill in the highlighted parts</span>' : ''}
          <div class="em-preview" data-keep-scroll="emPrev"><div id="emPreview">${emHtml(dr.body, { marks: true })}</div>${EM_SIG}</div></div>
      </div>` : '<p class="empty">Nobody left to email for this one.</p>'}
      ${ed.err ? `<div class="alert">${esc(ed.err)}</div>` : ''}
    </div>
    <div class="modal-foot"><span class="muted small">${ed.busy ? 'Making the drafts…' : blocked || 'Goes to your Gmail Drafts (gbrown@). Nothing is sent.'
      + (skipped ? ` ${skipped} without an email in the sheet ${skipped === 1 ? 'is' : 'are'} skipped for now.` : '')}</span>
      <button class="btn primary" data-act="emCreate" ${blocked || ed.busy ? 'disabled' : ''}>${ed.busy ? 'Creating…' : ready.length > 1 ? `Create ${ready.length} Gmail drafts` : 'Create Gmail draft'}</button></div>
  </div></div>`;
}

// + Draft an email: pick the template, then who it's for.
function emailPickModal() {
  const pk = S.emailPick, t = pk.tplId && tplById(pk.tplId);
  let body;
  if (!t) {
    body = `<p class="muted small">Any template, any time: send someone their book code early, a congratulations, an incomplete.</p>
      <div class="em-pick-list">${emailTemplates().map(x => `<button class="em-pick" data-act="emPickTpl" data-id="${x.id}"><b>${esc(x.name)}</b><span>${esc(whenText(x.when))} · ${x.send === 'bcc' ? 'BCC' : 'one per student'}</span></button>`).join('')}</div>`;
  } else {
    const people = emPeople();
    const all = people.length && people.every(p => pk.sids.includes(p.sid));
    body = `<div class="em-pick-tools"><p class="muted small">${t.send === 'bcc' ? 'One email To: Nick with everyone you check in BCC (just one person gets it addressed to them).' : 'One email per student you check.'}</p>
      <button class="link" data-act="emPickAll" data-v="${all ? 0 : 1}">${all ? 'Uncheck all' : 'Check all'}</button></div>
      <div class="binder-list">${people.map(p => `<label>${circle(pk.sids.includes(p.sid), `data-act="emPickSid" data-sid="${p.sid}"`)}<span>${esc(p.name)}${p.sent[t.id] ? ` <em class="tag-soft">drafted ${p.sent[t.id] === 'before' ? 'before the app' : monthDay(p.sent[t.id])}</em>` : ''}</span></label>`).join('')}</div>`;
  }
  return `<div class="overlay" data-act="emPickClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>${t ? esc(t.name) : 'Draft an Email'}</h2><button class="x big" data-act="emPickClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">${body}</div>
    ${t ? `<div class="modal-foot"><button class="link" data-act="emPickTpl" data-id="">‹ Templates</button>
      <button class="btn primary" data-act="emPickGo" ${pk.sids.length ? '' : 'disabled'}>Preview ${pk.sids.length || ''}</button></div>` : ''}
  </div></div>`;
}

/* ---------- Student Emails (people icon on the Emails box) ---------- */
// Click a student's Orientation date: late enrollee (their own orientation; payments follow it).
// Click their due dates: an extension (only for alternative deadlines).
function emailStudentsModal() {
  const people = emPeople();
  const yes = v => v ? '<span class="em-yes">✓</span>' : '<span class="muted">–</span>';
  const rows = people.map(p => {
    const drafted = Object.keys(p.sent).filter(k => p.sent[k] && p.sent[k] !== 'before'), sentN = drafted.length;
    const sentTip = drafted.map(k => (tplById(k) || { name: k }).name + ' · ' + monthDay(p.sent[k])).join('\n');
    return `<tr>
      <td><b>${esc(p.name)}</b>${p.late ? ' <em class="tag-soft">late enrollee</em>' : ''}${p.ext.next || p.ext.final ? ' <em class="tag-soft">extension</em>' : ''}${p.needsLate ? ' <em class="tag-soft warn">needs orientation date</em>' : ''}
        <div class="muted small">${validEmail(p.email) ? esc(p.email) : '<span class="tbd">no email in the sheet</span>'}</div></td>
      <td class="c">${yes(p.textbook)}</td><td class="c">${yes(p.paidNext)}</td><td class="c">${yes(p.paidFinal)}</td>
      <td class="c"><button class="cell-link" data-act="emLateOpen" data-sid="${p.sid}" title="Late enrollee: their own orientation">${p.orient ? monthDay(p.orient) + (p.late ? ' · ' + esc(p.time || 'time?') : '') : 'TBD'}</button></td>
      <td class="c"><button class="cell-link" data-act="emExtOpen" data-sid="${p.sid}" title="Extension: different payment deadlines">${p.next ? monthDay(p.next) : 'TBD'} / ${p.final ? monthDay(p.final) : 'TBD'}</button></td>
      <td class="c">${p.bookCode ? esc(p.bookCode) : '<span class="muted">–</span>'}</td>
      <td class="c" title="${esc(sentTip)}">${sentN || '<span class="muted">–</span>'}</td></tr>`;
  }).join('');
  return `<div class="overlay" data-act="emStuClose"><div class="modal em-stu" data-stop>
    <div class="modal-head"><h2>Student Emails</h2><button class="x big" data-act="emStuClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top" data-keep-scroll="emStu">
      <table class="roster em-table"><thead><tr><th>Student</th><th class="c">Textbook</th><th class="c">Next</th><th class="c">Final</th><th class="c">Orientation</th><th class="c">Due: Next / Final</th><th class="c">Book code</th><th class="c">Drafted</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">No students yet.</td></tr>'}</tbody></table>
    </div>
  </div></div>`;
}
// Next/Final when there's no extension: 2 and 4 weeks after a late enrollee's orientation,
// otherwise the day before and 29 days after the cohort's.
function usualDue(lateDate) {
  const f = cohortInfo().firstDay, orient = isIsoDate(lateDate) ? lateDate : isIsoDate(f) ? f : '';
  if (!orient) return { next: '', final: '' };
  return isIsoDate(lateDate) ? { next: addDays(orient, 14), final: addDays(orient, 28) } : { next: addDays(orient, -1), final: addDays(orient, 29) };
}
function emStuEditModal() {
  const ed = S.emailStu, p = emPersonBySid(ed.sid);
  if (!p) return '';
  const k = x => 'ems-' + x + '-' + p.sid;
  let title, body, undo = '';
  if (ed.kind === 'late') {
    const date = S.drafts[k('date')], due = usualDue(date), pd = (S.studentsDoc[p.sid] || {}).payDates || {};
    title = 'Late Enrollee';
    body = `<p class="muted small">${esc(p.name)}’s own orientation. Their emails use it.</p>
      <div class="em-late-fields">${datePicker(k('date'), { optional: true, empty: 'Pick a date', title: 'Their orientation' })}
        <input id="${k('time')}" data-draft="${k('time')}" class="${S.drafts[k('time')] ? '' : 'need'}" placeholder="Time, e.g. 6:30 PM" value="${esc(S.drafts[k('time')] || '')}" autocomplete="off"></div>
      ${isIsoDate(date) ? `<p class="em-due-note">Next due <b>${monthDay(due.next)}</b> · Final due <b>${monthDay(due.final)}</b>, set automatically.${isIsoDate(pd.next) || isIsoDate(pd.final) ? ' (Their extension dates still apply.)' : ''}</p>` : ''}`;
    if (p.late) undo = `<button class="link" data-act="emLateClear" data-sid="${p.sid}">Back to the cohort’s orientation</button>`;
  } else {
    const late = (S.studentsDoc[p.sid] || {}).late || {}, due = usualDue(late.date);
    title = 'Extension';
    body = `<p class="muted small">${esc(p.name)}’s payment deadlines. Change only the one you’re extending; their reminders move to the new date.</p>
      <div class="em-ext-fields"><span>Next installment</span>${datePicker(k('next'), { optional: true, empty: 'TBD', title: 'Next installment due' })}
        <span class="muted small">usually ${due.next ? monthDay(due.next) : 'TBD'}</span>
        <span>Final installment</span>${datePicker(k('final'), { optional: true, empty: 'TBD', title: 'Final installment due' })}
        <span class="muted small">usually ${due.final ? monthDay(due.final) : 'TBD'}</span></div>`;
    if (p.ext.next || p.ext.final) undo = `<button class="link" data-act="emExtClear" data-sid="${p.sid}">Back to the usual dates</button>`;
  }
  return `<div class="overlay" data-act="emStuEditClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>${title}</h2><button class="x big" data-act="emStuEditClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">${body}</div>
    <div class="modal-foot">${undo}<button class="btn primary" data-act="${ed.kind === 'late' ? 'emLateSave2' : 'emExtSave'}" data-sid="${p.sid}">Save</button></div>
  </div></div>`;
}
// Saves a student's late/extension change; a payment reminder already drafted for a date that
// just moved comes back for the new date.
async function emSaveStudent(sid, upd) {
  const before = emPersonBySid(sid);
  await Store.set(P('students/' + sid), upd);
  const doc = S.studentsDoc[sid] || {};
  S.studentsDoc[sid] = { ...doc, ...upd, late: 'late' in upd ? upd.late : doc.late, payDates: { ...(doc.payDates || {}), ...(upd.payDates || {}) } };
  const after = emPersonBySid(sid), resend = {};
  if (before && after) emailTemplates({ all: true }).forEach(t => {
    if ((t.when.from === 'next' && before.next !== after.next) || (t.when.from === 'final' && before.final !== after.final)) resend[t.id] = null;
  });
  if (Object.keys(resend).length) await Store.set(P('students/' + sid), { sent: resend });
}
const emStuDone = sid => { ['date', 'time', 'next', 'final'].forEach(x => delete S.drafts['ems-' + x + '-' + sid]); S.emailStu = null; };

/* ---------- Setup → Book Codes ---------- */
function bookCodesModal() {
  const all = S.bookCodes || [], free = freeCodes(), used = all.filter(c => c.sid).sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<div class="overlay" data-act="bookCodesClose"><div class="modal small-modal em-codes" data-stop>
    <div class="modal-head"><h2>Book Codes</h2><button class="x big" data-act="bookCodesClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top" data-keep-scroll="bookCodes">
      <p class="em-count"><b>${free.length}</b> unused · ${used.length} issued</p>
      <label class="field">Paste new codes (one per line, or separated by commas or spaces)
        <textarea id="bcPaste" data-draft="bcPaste" rows="4">${esc(S.drafts.bcPaste || '')}</textarea></label>
      <button class="btn primary small" data-act="bookCodesAdd">Add codes</button>
      <p class="muted small">Each code goes to one student, once. A code stays theirs even if the draft is deleted, so it’s never handed out twice.</p>
      ${free.length ? `<p class="mini-head">Unused</p><div class="em-chips">${free.map(c => `<span class="name-chip">${esc(c.code)}<button class="x" data-act="bookCodeDel" data-id="${esc(c.id)}" aria-label="Remove" title="Remove (typo)">×</button></span>`).join('')}</div>` : ''}
      ${used.length ? `<p class="mini-head">Issued</p><table class="em-used">${used.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.name || '')}</td><td class="muted">${esc(c.cohort || '')}</td><td class="muted">${c.at ? monthDay(isoOf(new Date(c.at))) : ''}</td></tr>`).join('')}</table>` : ''}
    </div>
  </div></div>`;
}

/* ---------- Setup → Email Templates ---------- */
const EM_HELP = `<details class="em-help"><summary>Formatting</summary>
  <p><b>Fill-ins</b> (a course detail left blank in Course Details says TBD; a student’s own name, referral code or book code shows highlighted when you preview the group email): {first name} {full name} {cohort} {orientation date} {orientation time} {next due} {final due} {CPR date} {academy week start} {academy week dates} {day 1} … {day 5} {coursework deadline} {fingerprinting deadline} {meet link} {JBL code} {referral code} {book code}</p>
  <p><b>Only for some students:</b> {if late}…{else}…{end}. Words you can use: late, group (the To: Nick email), owes next, owes final, owes tuition, paid in full, has book, needs book, extension. Join with “and”; put “not” in front to flip one.</p>
  <p><b>Formatting:</b> **bold**, *italic*, [words](https://link), a line starting with “- ” is a bullet, a blank line starts a new paragraph. [[like this]] marks something you type in before the draft can be made.</p></details>`;
function emailTplModal() {
  const ed = S.emailTplEd, list = emailTemplates({ all: true });
  const d = ed.draft;
  const sample = ed.as === 'group' ? null : emPersonBySid(ed.as) || emPeople()[0] || null;
  const prev = d ? emFill(d, sample, !sample) : null;
  const opt = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  const days = d ? Number(d.when.days) || 0 : 0;
  const form = d ? `<div class="em-tpl-form">
      <button class="link em-back" data-act="emtBack">‹ All templates</button>
      <div class="em-tpl-row"><label class="field">Name<input id="emt-name" data-emtpl="name" value="${esc(d.name)}"></label>
        <label class="em-on">${circle(!d.off, 'data-emtpl="on" id="emt-on"')} Shows up in the Emails box</label></div>
      <label class="field">Subject<input id="emt-subject" data-emtpl="subject" value="${esc(d.subject)}"></label>
      <div class="em-tpl-row">
        <label class="field">When<select id="emt-from" data-emtpl="from">${opt(FROM, d.when.from)}</select></label>
        ${d.when.from === 'enroll' || d.when.from === 'manual' ? '' : `<label class="field em-days">Days<span><input id="emt-days" data-emtpl="days" type="number" min="0" value="${Math.abs(days)}">
          <select id="emt-dir" data-emtpl="dir"><option value="-1" ${days < 0 ? 'selected' : ''}>before</option><option value="0" ${days === 0 ? 'selected' : ''}>day of</option><option value="1" ${days > 0 ? 'selected' : ''}>after</option></select></span></label>`}
        <label class="field">Who<select id="emt-who" data-emtpl="who">${opt(WHO, d.who)}</select></label>
      </div>
      <div class="em-tpl-row"><div class="field">Sent as<div class="seg">
          <button class="${d.send === 'bcc' ? 'on' : ''}" data-act="emtSend" data-v="bcc">One email To: Nick, everyone in BCC</button>
          <button class="${d.send !== 'bcc' ? 'on' : ''}" data-act="emtSend" data-v="each">One per student</button></div></div>
        ${d.send !== 'bcc' ? `<label class="em-on">${circle(!!d.ccNick, 'data-emtpl="ccNick" id="emt-cc"')} CC Nick</label>` : ''}</div>
      <label class="field">Reminder for you <span class="small">(shows when you draft it; not in the email)</span><input id="emt-note" data-emtpl="note" value="${esc(d.note || '')}" placeholder="e.g. Attach the assessment sheet"></label>
      <div class="em-panes">
        <label class="field">Email text<textarea id="emt-body" data-emtpl="body" rows="22">${esc(d.body)}</textarea></label>
        <div class="field">Preview as <select id="emt-as" data-emtpl="as"><option value="group" ${ed.as === 'group' ? 'selected' : ''}>the group email</option>
          ${emPeople().map(p => `<option value="${p.sid}" ${sample && sample.sid === p.sid && ed.as !== 'group' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <div class="em-preview"><div id="emtPreview"><p class="em-prev-subj">${esc(prev.subject)}</p>${emHtml(prev.body, { marks: true })}</div>${EM_SIG}</div></div>
      </div>
      ${EM_HELP}
    </div>` : '<p class="empty pad-top">Pick a template on the left.</p>';
  // On a narrow window the list and the editor take turns (ed.view: 'list' or 'edit').
  return `<div class="overlay" data-act="emtClose"><div class="modal em-tpl ${ed.view === 'edit' ? 'editing' : ''}" data-stop>
    <div class="modal-head"><h2>Email Templates</h2><button class="x big" data-act="emtClose" aria-label="Close">×</button></div>
    <div class="em-tpl-grid">
      <div class="em-tpl-list">${list.map(t => `<button class="em-pick ${ed.sel === t.id ? 'on' : ''} ${t.off ? 'off' : ''}" data-act="emtSel" data-id="${t.id}"><b>${esc(t.name)}</b><span>${esc(whenText(t.when))}</span></button>`).join('')}
        <button class="link em-new" data-act="emtNew">+ New template</button></div>
      <div class="modal-body" data-keep-scroll="emTpl">${form}</div>
    </div>
    <div class="modal-foot">${d && tplById(ed.sel) && tplById(ed.sel).isDefault && S.emailTpls[ed.sel] ? '<button class="link" data-act="emtReset">Back to the original</button>' : ''}
      ${d && tplById(ed.sel) && !tplById(ed.sel).isDefault ? '<button class="link" data-act="emtDel">Delete this template</button>' : ''}
      <span class="muted small">${ed.dirty ? 'Not saved yet.' : 'Changes apply to drafts made from now on.'}</span>
      <button class="btn primary" data-act="emtSave" ${ed.dirty ? '' : 'disabled'}>Save</button></div>
  </div></div>`;
}
const NEW_TPL = { name: 'New email', subject: '', body: 'Hi {first name}!\n\n', when: { from: 'manual', days: 0 }, who: 'pick', send: 'each' };
const emtCopy = t => t ? { name: t.name, subject: t.subject, body: t.body, when: { ...t.when }, who: t.who, send: t.send, ccNick: !!t.ccNick, note: t.note || '', off: !!t.off } : null;

/* ---------- Doing things ---------- */
// Once per cohort: everyone already on the roster counts as welcomed, and anything due before
// today was handled by hand, so the box starts with only what's ahead.
async function emailInit() {
  const key = S.cohortKey;
  if (!S.sheet || (S.cohortDoc && S.cohortDoc.emailsStart)) return;
  try {
    if (!(await Store.claim('cohorts/' + key, 'emailsInit')) || key !== S.cohortKey) return;
    await Store.set('cohorts/' + key, { emailsStart: todayIso() });
    await Promise.all(S.sheet.students.map(s => Store.set('cohorts/' + key + '/students/' + slug(s.name), { sent: { welcome: 'before' } })));
  } catch (e) { console.warn('Emails not set up yet:', e.message); }
}

// Gives each student without one the next unused code (checked on the server, so two computers can't give out the same one).
async function claimBookCode(p) {
  if (p.bookCode) return p.bookCode;
  for (const c of freeCodes()) {
    if (await Store.claimValue('bookCodes/' + c.id, 'sid', p.sid)) {
      await Store.set('bookCodes/' + c.id, { cohort: S.cohortKey, name: p.name, at: Date.now() });
      await Store.set(P('students/' + p.sid), { bookCode: c.code });
      return c.code;
    }
  }
  throw new Error('No unused book codes left. Add more in Setup → Book Codes.');
}

async function emCreate() {
  const ed = S.emailDraft, t = tplById(ed.tplId);
  if (!ed || ed.busy || !t) return;
  ed.busy = true; ed.err = ''; render();
  try {
    const drafts = emBuild(ed).filter(dr => dr.to); // anyone without an email in the sheet waits
    if (t.id === 'bookcode') { // the real codes, swapped in for the ones the preview showed
      for (const dr of drafts) {
        const p = dr.people[0], shown = p.code || p.bookCode, code = await claimBookCode(p);
        if (shown && shown !== code) { dr.body = dr.body.split(shown).join(code); dr.subject = dr.subject.split(shown).join(code); }
        p.bookCode = code;
      }
    }
    const out = drafts.map(dr => ({ to: dr.to, cc: dr.cc, bcc: dr.bcc, subject: dr.subject, html: emHtml(dr.body), text: emPlain(dr.body) }));
    let warn = '';
    for (let i = 0; i < out.length; i += 20) { const res = await Sheets.createDrafts(out.slice(i, i + 20)); if (res && res.warning) warn = res.warning; }
    const day = todayIso(), sids = drafts.flatMap(dr => dr.people.filter(p => validEmail(p.email)).map(p => p.sid));
    await Promise.all(sids.map(sid => Store.set(P('students/' + sid), { sent: { [t.id]: day } })));
    const names = drafts.flatMap(dr => dr.people.filter(p => validEmail(p.email)).map(p => p.name));
    await Store.add(P('emailLog'), { tpl: t.id, name: t.name, date: ed.date || day, at: Date.now(), names, count: names.length, by: (S.user && S.user.email) || '' });
    S.emailDraft = null;
    Object.keys(S.drafts).forEach(k => { if (k.startsWith('eml-')) delete S.drafts[k]; });
    toast(out.length === 1 ? 'The draft is in your Gmail Drafts.' : out.length + ' drafts are in your Gmail Drafts.');
    if (warn) alert(warn);
  } catch (err) {
    ed.busy = false; ed.err = err.message;
  }
  render();
}

async function emailAct(a, el, e) {
  const d = el.dataset || {};
  switch (a) {
    case 'emSkip': {
      const r = emailRows().find(x => x.key === d.row);
      if (!r || !confirm(`${r.tpl.name}${r.date ? ' (' + monthDay(r.date) + ')' : ''} isn't needed for ${S.cohortKey}?\n\nIt comes off the Emails box and won't come back for this cohort.`)) return true;
      await Store.set('cohorts/' + S.cohortKey, { emailSkip: { [d.row]: true } }); return true;
    }
    case 'emailDoneToggle': e && e.preventDefault(); S.emailDoneOpen = !S.emailDoneOpen; render(); return true;
    case 'emDraft': {
      const r = emailRows().find(x => x.key === d.row);
      if (!r) { render(); return true; }
      if (r.pick) { S.emailPick = { tplId: r.tpl.id, sids: r.tpl.who === 'check' ? emPeople().map(p => p.sid) : [], date: r.date }; render(); return true; }
      S.emailDraft = { tplId: r.tpl.id, sids: r.sids, date: r.date, custom: r.custom, idx: 0, edits: {} };
      emLateDrafts(); render(); return true;
    }
    case 'emDraftClose':
      if (S.emailDraft && S.emailDraft.busy) return true;
      if (S.emailDraft && Object.keys(S.emailDraft.edits).length && !confirm('Close without making the draft? Your changes to the email will be lost.')) return true;
      S.emailDraft = null; render(); return true;
    case 'emIdx': { const ed = S.emailDraft; ed.idx = Math.max(0, (ed.idx || 0) + Number(d.dir)); render(); return true; }
    case 'emUndo': delete S.emailDraft.edits[d.key]; render(); return true;
    case 'emCreate': await emCreate(); return true;
    case 'emLateSave': {
      const date = S.drafts['eml-date-' + d.sid], time = String(S.drafts['eml-time-' + d.sid] || '').trim();
      if (!isIsoDate(date) || !time) { toast('Pick their orientation date and type the time.'); return true; }
      await Store.set(P('students/' + d.sid), { late: { date, time } });
      toast('Saved. Their emails and payment dates follow ' + monthDay(date) + '.'); render(); return true;
    }

    case 'emPickOpen': S.emailPick = { tplId: null, sids: [] }; render(); return true;
    case 'emPickClose': S.emailPick = null; render(); return true;
    case 'emPickTpl': {
      const t = d.id && tplById(d.id);
      // Starts with whoever the template is usually for (nobody for "students you pick").
      S.emailPick = { tplId: d.id || null, sids: t ? emPeople().filter(p => whoFits(t, p) && !p.sent[t.id]).map(p => p.sid) : [] };
      render(); return true;
    }
    case 'emPickSid': { const pk = S.emailPick; pk.sids = pk.sids.includes(d.sid) ? pk.sids.filter(x => x !== d.sid) : [...pk.sids, d.sid]; render(); return true; }
    case 'emPickAll': S.emailPick.sids = d.v === '1' ? emPeople().map(p => p.sid) : []; render(); return true;
    case 'emPickGo': {
      const pk = S.emailPick;
      S.emailDraft = { tplId: pk.tplId, sids: [...pk.sids], date: pk.date || '', custom: false, idx: 0, edits: {} };
      S.emailPick = null; emLateDrafts(); render(); return true;
    }

    case 'emStuOpen': S.emailStuOpen = true; S.emailStu = null; render(); return true;
    case 'emStuClose': S.emailStuOpen = false; S.emailStu = null; render(); return true;
    case 'emLateOpen': case 'emExtOpen': {
      const p = emPersonBySid(d.sid), late = (S.studentsDoc[d.sid] || {}).late || {};
      S.drafts['ems-date-' + d.sid] = isIsoDate(late.date) ? late.date : '';
      S.drafts['ems-time-' + d.sid] = late.time || '';
      S.drafts['ems-next-' + d.sid] = p.next || '';
      S.drafts['ems-final-' + d.sid] = p.final || '';
      S.emailStu = { sid: d.sid, kind: a === 'emLateOpen' ? 'late' : 'ext' }; render(); return true;
    }
    case 'emStuEditClose': emStuDone(S.emailStu.sid); render(); return true;
    case 'emLateSave2': {
      const date = S.drafts['ems-date-' + d.sid], time = String(S.drafts['ems-time-' + d.sid] || '').trim();
      if (!isIsoDate(date) || !time) { toast('Pick their orientation date and type the time.'); return true; }
      await emSaveStudent(d.sid, { late: { date, time } });
      emStuDone(d.sid); toast('Saved. Their emails and payment dates follow ' + monthDay(date) + '.'); render(); return true;
    }
    case 'emLateClear':
      if (!confirm('Put them back on the cohort’s orientation and payment dates?')) return true;
      await emSaveStudent(d.sid, { late: null }); emStuDone(d.sid); toast('Back on the cohort’s dates.'); render(); return true;
    case 'emExtSave': {
      const late = (S.studentsDoc[d.sid] || {}).late || {}, due = usualDue(late.date);
      const next = S.drafts['ems-next-' + d.sid], fin = S.drafts['ems-final-' + d.sid];
      // The usual date isn't an extension, so it isn't saved as one.
      await emSaveStudent(d.sid, { payDates: { next: isIsoDate(next) && next !== due.next ? next : null, final: isIsoDate(fin) && fin !== due.final ? fin : null } });
      emStuDone(d.sid); toast('Saved.'); render(); return true;
    }
    case 'emExtClear':
      await emSaveStudent(d.sid, { payDates: { next: null, final: null } }); emStuDone(d.sid); toast('Back on the usual dates.'); render(); return true;

    case 'bookCodesOpen': S.bookCodesOpen = true; S.menuOpen = false; render(); return true;
    case 'bookCodesClose': S.bookCodesOpen = false; render(); return true;
    case 'bookCodesAdd': {
      const have = new Set((S.bookCodes || []).map(c => String(c.code)));
      const codes = String(S.drafts.bcPaste || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
      const fresh = codes.filter(x => !have.has(x));
      if (!codes.length) { toast('Paste the codes in first.'); return true; }
      const now = Date.now();
      await Promise.all(fresh.map((code, i) => Store.set('bookCodes/' + code.replace(/[^\w-]/g, '_'), { code, added: now, order: now + i, sid: null }, false)));
      S.drafts.bcPaste = '';
      toast(!fresh.length ? (codes.length === 1 ? 'That code is' : 'Those codes are') + ' already in the list.'
        : fresh.length + ' code' + (fresh.length === 1 ? '' : 's') + ' added' + (codes.length > fresh.length ? ` (${codes.length - fresh.length} already in the list)` : '') + '.');
      render(); return true;
    }
    case 'bookCodeDel': {
      const c = (S.bookCodes || []).find(x => x.id === d.id);
      if (!c || c.sid || !confirm('Remove code ' + c.code + '? (Only for a typo: an unused code is never given to anyone once removed.)')) return true;
      await Store.del('bookCodes/' + c.id); return true;
    }

    case 'emtOpen': {
      const first = emailTemplates({ all: true })[0];
      S.emailTplEd = { sel: first.id, draft: emtCopy(first), dirty: false, as: first.send === 'bcc' ? 'group' : (emPeople()[0] || {}).sid || 'group', view: 'list' };
      S.menuOpen = false; render(); return true;
    }
    case 'emtClose':
      if (S.emailTplEd.dirty && !confirm('Close without saving your changes?')) return true;
      S.emailTplEd = null; render(); return true;
    case 'emtSel': {
      const ed = S.emailTplEd;
      if (ed.dirty && ed.sel !== d.id && !confirm('Switch templates without saving your changes?')) return true;
      const t = tplById(d.id);
      Object.assign(ed, { sel: d.id, draft: emtCopy(t), dirty: false, view: 'edit', as: t.send === 'bcc' ? 'group' : (emPeople()[0] || {}).sid || 'group' });
      render(); return true;
    }
    case 'emtBack': S.emailTplEd.view = 'list'; render(); return true;
    case 'emtSend': S.emailTplEd.draft.send = d.v; S.emailTplEd.dirty = true; render(); return true;
    case 'emtNew': {
      const ed = S.emailTplEd;
      if (ed.dirty && !confirm('Start a new template without saving your changes?')) return true;
      const id = 'custom-' + Store.newId(), fresh = emtCopy(NEW_TPL);
      await Store.set('emailTemplates/' + id, fresh, false);
      Object.assign(ed, { sel: id, draft: emtCopy(NEW_TPL), dirty: false, view: 'edit', as: (emPeople()[0] || {}).sid || 'group' });
      render(); return true;
    }
    case 'emtSave': {
      const ed = S.emailTplEd, dr = ed.draft;
      if (!dr.name.trim()) { toast('Give it a name.'); return true; }
      await Store.set('emailTemplates/' + ed.sel, { ...dr, name: dr.name.trim(), when: { from: dr.when.from, days: Number(dr.when.days) || 0 } }, false);
      ed.dirty = false; toast('Template saved.'); render(); return true;
    }
    case 'emtReset': {
      const ed = S.emailTplEd;
      if (!confirm('Put this template back the way it started? Your changes to it will be gone.')) return true;
      await Store.del('emailTemplates/' + ed.sel);
      const t = DEFAULTS.emailTemplates.find(x => x.id === ed.sel);
      Object.assign(ed, { draft: emtCopy({ ...t, when: { ...t.when } }), dirty: false });
      render(); return true;
    }
    case 'emtDel': {
      const ed = S.emailTplEd;
      if (!confirm('Delete this template?')) return true;
      await Store.del('emailTemplates/' + ed.sel);
      const first = DEFAULTS.emailTemplates[0];
      Object.assign(ed, { sel: first.id, draft: emtCopy(tplById(first.id)), dirty: false });
      render(); return true;
    }
  }
  return false;
}
// The late-enrollee date/time boxes in the draft pop-up start from whatever's saved.
function emLateDrafts() {
  (S.emailDraft ? S.emailDraft.sids : []).forEach(sid => {
    const late = (S.studentsDoc[sid] || {}).late || {};
    if (S.drafts['eml-date-' + sid] === undefined && isIsoDate(late.date)) S.drafts['eml-date-' + sid] = late.date;
    if (S.drafts['eml-time-' + sid] === undefined && late.time) S.drafts['eml-time-' + sid] = late.time;
  });
}

// Typing in the draft pop-up or the template editor (called from app.js's input listener).
let emRedraw = 0;
function emailInput(t) {
  if (t.dataset.emedit && S.emailDraft) {
    const ed = S.emailDraft, key = t.dataset.key;
    const dr = emBuild(ed).find(x => x.key === key); if (!dr) return true;
    const cur = ed.edits[key] || {};
    ed.edits[key] = { ...cur, [t.dataset.emedit]: t.value };
    if (cur.body == null && t.dataset.emedit === 'subject') ed.edits[key].body = dr.body; // keep the text as shown
    if (cur.subject == null && t.dataset.emedit === 'body') ed.edits[key].subject = dr.subject;
    const prev = document.getElementById('emPreview');
    if (prev && t.dataset.emedit === 'body') prev.innerHTML = emHtml(t.value, { marks: true });
    clearTimeout(emRedraw); emRedraw = setTimeout(render, 350); // the Create button and notes catch up after a pause
    return true;
  }
  if (t.dataset.emtpl && S.emailTplEd) {
    const ed = S.emailTplEd, dr = ed.draft, f = t.dataset.emtpl;
    if (f === 'as') { ed.as = t.value; render(); return true; }
    if (f === 'on') dr.off = !t.checked;
    else if (f === 'ccNick') dr.ccNick = t.checked;
    else if (f === 'from') { dr.when.from = t.value; if (t.value === 'enroll' || t.value === 'manual') dr.when.days = 0; else if (!dr.when.days) dr.when.days = -1; }
    else if (f === 'days' || f === 'dir') {
      const n = Math.abs(Number((document.getElementById('emt-days') || {}).value) || 0), dir = Number((document.getElementById('emt-dir') || {}).value);
      dr.when.days = dir < 0 ? -n : dir > 0 ? n : 0;
    } else dr[f] = t.value;
    ed.dirty = true;
    if (f === 'body' || f === 'subject') {
      const sample = ed.as === 'group' ? null : emPersonBySid(ed.as) || emPeople()[0] || null;
      const p = emFill(dr, sample, !sample), box = document.getElementById('emtPreview');
      if (box) box.innerHTML = `<p class="em-prev-subj">${esc(p.subject)}</p>${emHtml(p.body, { marks: true })}`;
      const foot = document.querySelector('.em-tpl .modal-foot .btn.primary'); if (foot) foot.disabled = false;
    } else render();
    return true;
  }
  return false;
}

// Escape closes the top email pop-up (true when it did).
function emailEscape() {
  if (S.emailDraft) {
    const ed = S.emailDraft;
    if (!ed.busy && (!Object.keys(ed.edits).length || confirm('Close without making the draft? Your changes to the email will be lost.'))) S.emailDraft = null;
    return true;
  }
  if (S.emailPick) { S.emailPick = null; return true; }
  if (S.emailTplEd) { if (!S.emailTplEd.dirty || confirm('Close without saving your changes?')) S.emailTplEd = null; return true; }
  if (S.bookCodesOpen) { S.bookCodesOpen = false; return true; }
  if (S.emailStu) { emStuDone(S.emailStu.sid); return true; }
  if (S.emailStuOpen) { S.emailStuOpen = false; return true; }
  return false;
}
function emailModals() {
  return (S.emailStuOpen ? emailStudentsModal() : '') + (S.emailStu ? emStuEditModal() : '') + (S.emailPick ? emailPickModal() : '') + (S.emailDraft ? emailDraftModal() : '')
    + (S.emailTplEd ? emailTplModal() : '') + (S.bookCodesOpen ? bookCodesModal() : '');
}

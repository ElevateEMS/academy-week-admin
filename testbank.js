/* Test Bank (Admin header → Test Bank): every chapter's quiz, specialty and test bank questions, with the right answers.
   Phase 1: browse by chapter, change a right answer, fix wording, see each question's history, pick the quiz's questions
   (18 of yours + 2 specialty = 20). Exams and new questions come next; the student exam screen after that.

   Firestore (Bella and Nick only, like everything else):
     tbChapters/{01…39|ride|pharm}   { title, module, q: { qid: question } }
        question = { kind: quiz|bank|specialty, type: mc|multi|tf|drag|dropdown, name, stem (html), choices: [html],
                     correct: [choice index…] (mc / multi / tf), gaps: [choice index per blank] + groups (drag / dropdown;
                     the stem has {{0}}, {{1}}… where the blanks go), ref ("Chapter 2, Page 53"), part (specialty 1–5), order }
     tbChapters/{id}/history/{auto}  { qid, at, by, what: answer|wording, before, after }
     tbSets/{quiz-01…|exam-m1…|ride|pharm}  { kind: quiz|exam, title, qids: [qid…], counts (a graded chapter quiz), pass, perPage, intro }
     tbImages/{id}                   { data: data URL }  (a picture in a question: <img data-img="id">)
   The first time, the page asks for the import file (made from the Navigate export; it stays on your Mac, never on GitHub). */

// Chapter names: the same as the Student Portal's chapter list (Student Hub index.html), not JBL's tags.
const TB_TITLES = ['', 'EMS Systems/Public Health', 'Workforce Safety and Wellness', 'Medical, Legal, and Ethical Issues', 'Communications and Documentation',
  'Medical Terminology', 'The Human Body', 'Life Span Development', 'Lifting and Moving Patients', 'Team Approach', 'Patient Assessment',
  'Airway and Ventilation Management', 'Principles of Pharmacology', 'Shock', 'BLS Resuscitation', 'Medical Overview', 'Respiratory Emergencies',
  'Cardiovascular Emergencies', 'Neurologic Emergencies', 'Gastrointestinal and Urologic Emergencies', 'Endocrine and Hematologic Emergencies',
  'Allergy and Anaphylaxis', 'Toxicology', 'Behavioral Health Emergencies', 'Trauma Overview', 'Bleeding', 'Soft-Tissue Injuries',
  'Face and Neck Injuries', 'Head and Spine Injuries', 'Chest Injuries', 'Abdominal and Genitourinary Injuries', 'Orthopaedic Injuries',
  'Environmental Emergencies', 'Gynecologic Emergencies', 'OB and Neonatal Care Series', 'Patients With Special Challenges', 'Transport Operations',
  'Vehicle Extrication and Special Rescue', 'Incident Management / MCIM I', 'Terrorism Response and Disaster Management'];
const tbTitle = cid => /^\d+$/.test(cid) ? TB_TITLES[Number(cid)] || 'Chapter ' + Number(cid) : ((tb().chapters || {})[cid] || {}).title || '';
const TB_MODULES = { 1: [1, 8], 2: [9, 15], 3: [16, 23], 4: [24, 31], 5: [32, 39] };
const TB_OTHER = [['ride', 'Ride Along Readiness'], ['pharm', 'Pharmacology']];
const TB_TABS = [['quiz', 'Quiz'], ['spec', 'Specialty'], ['all', 'All questions']];
const TB_QUIZ_SIZE = 20, TB_SPEC_PICKS = 2, TB_EXAM_SIZE = 70, TB_EXAM_SPEC = 5;
const tbModuleOf = cid => Number(Object.keys(TB_MODULES).find(m => Number(cid) >= TB_MODULES[m][0] && Number(cid) <= TB_MODULES[m][1]));
const tbExamSet = cid => /^\d+$/.test(cid) ? (tb().sets || {})['exam-m' + tbModuleOf(cid)] || null : null;
const tbQ = id => (((tb().chapters || {})[id.split('-')[0]] || {}).q || {})[id];
const TB_ICON = '<svg viewBox="0 0 24 24"><path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5"/><path d="M8.5 8.5h6M8.5 11.5h4"/></svg>';
const tb = () => S.tb || (S.tb = { ch: pref('tbCh') || '01', tab: pref('tbTab') || 'quiz', q: '', imgs: {}, imgWant: new Set() });
const tbLetter = i => String.fromCharCode(65 + i);
const tbPlain = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

// Watched once the page is opened (Firebase keeps its own copy, so later visits are instant).
function tbLoad() {
  const t = tb();
  if (t.watching) return;
  t.watching = true;
  Store.watch('tbSets', list => { t.sets = Object.fromEntries(list.map(d => [d.id, d])); t.setsIn = true; render(); });
  Store.watch('tbChapters', list => { t.chapters = Object.fromEntries(list.map(d => [d.id, d])); t.chIn = true; render(); });
}
function tbHistoryWatch(cid) {
  const t = tb();
  if (t.histFor === cid) return;
  if (t.histUnwatch) t.histUnwatch();
  t.histFor = cid; t.hist = [];
  t.histUnwatch = Store.watch('tbChapters/' + cid + '/history', list => { t.hist = list.sort((a, b) => b.at - a.at); render(); });
}
// Pictures load one at a time as their questions show.
function tbImgs(html) {
  const t = tb();
  return String(html || '').replace(/<img data-img="([^"]+)">/g, (m, id) => {
    if (t.imgs[id]) return `<img class="tb-img" src="${t.imgs[id]}" alt="">`;
    if (!t.imgWant.has(id)) {
      t.imgWant.add(id);
      Store.get('tbImages/' + id).then(d => { if (d && d.data) { t.imgs[id] = d.data; render(); } });
    }
    return '<span class="tb-img-wait">Loading picture…</span>';
  });
}

/* ---------- The page ---------- */
function testBankTitle() { return '<h1>Test Bank</h1>'; }
function testBankView() {
  tbLoad();
  const t = tb();
  if (!t.setsIn || !t.chIn) return '<p class="muted tb-loading">Loading the Test Bank…</p>';
  if (!Object.keys(t.sets || {}).length) return tbImportView();
  const exam = /^exam-/.test(t.ch);
  if (exam ? !t.sets[t.ch] : !t.chapters[t.ch]) t.ch = '01';
  if (!/^exam-/.test(t.ch)) tbHistoryWatch(t.ch);
  return `<div class="tb">${tbSide()}<section class="tb-main box">${/^exam-/.test(t.ch) ? tbExamMain() : tbMain()}</section></div>`;
}
function tbQuizSet(cid) { return (tb().sets || {})[/^\d+$/.test(cid) ? 'quiz-' + cid : cid] || null; }
function tbSide() {
  const t = tb();
  const row = (cid, label, sub) => {
    const set = tbQuizSet(cid), ch = t.chapters[cid] || {}, q = ch.q || {};
    const spec = set ? set.qids.filter(id => (q[id] || {}).kind === 'specialty').length : 0;
    const done = set && set.counts !== false && set.qids.length === TB_QUIZ_SIZE && spec === TB_SPEC_PICKS;
    return `<button class="tb-ch ${t.ch === cid ? 'on' : ''}" data-act="tbCh" data-ch="${cid}"><span class="tb-ch-n">${esc(sub)}</span><span class="tb-ch-t">${esc(label)}</span>${done ? '<span class="tb-ch-done" title="18 + 2 specialty">✓</span>' : ''}</button>`;
  };
  return `<aside class="tb-side box">${Object.entries(TB_MODULES).map(([m, [a, b]]) => `<p class="tb-mod">Module ${m} <span class="muted">· Ch ${a}–${b}</span></p>`
    + Array.from({ length: b - a + 1 }, (_, i) => { const n = a + i, cid = String(n).padStart(2, '0'); return row(cid, tbTitle(cid), n); }).join('')).join('')}
    <p class="tb-mod">Module exams</p>${Object.keys(TB_MODULES).map(m => { const set = t.sets['exam-m' + m]; if (!set) return '';
      const spec = set.qids.filter(id => (tbQ(id) || {}).kind === 'specialty').length, done = set.qids.length === TB_EXAM_SIZE && spec === TB_EXAM_SPEC;
      return `<button class="tb-ch ${t.ch === 'exam-m' + m ? 'on' : ''}" data-act="tbCh" data-ch="exam-m${m}"><span class="tb-ch-n">•</span><span class="tb-ch-t">Module ${m} Exam</span>${done ? '<span class="tb-ch-done" title="65 + 5 specialty">✓</span>' : ''}</button>`; }).join('')}
    <p class="tb-mod">Other quizzes</p>${TB_OTHER.map(([cid, l]) => row(cid, l, '•')).join('')}</aside>`;
}
function tbMain() {
  const t = tb(), cid = t.ch, ch = t.chapters[cid] || {}, q = ch.q || {}, set = tbQuizSet(cid), other = !/^\d+$/.test(cid);
  const tabs = other ? [['quiz', 'Quiz']] : TB_TABS;
  const tab = tabs.some(([k]) => k === t.tab) ? t.tab : 'quiz';
  const ids = Object.keys(q).filter(id => !q[id].deleted);
  const inQuiz = new Set(set ? set.qids : []);
  const counts = { quiz: inQuiz.size, spec: ids.filter(id => q[id].kind === 'specialty').length, all: ids.filter(id => q[id].kind === 'bank').length };
  let list = tab === 'quiz' ? (set ? set.qids.filter(id => q[id]) : []) : ids.filter(id => q[id].kind === (tab === 'spec' ? 'specialty' : 'bank')).sort((a, b) => (q[a].order || 0) - (q[b].order || 0));
  const find = t.q.trim().toLowerCase();
  if (find) list = list.filter(id => (tbPlain(q[id].stem) + ' ' + q[id].choices.map(tbPlain).join(' ')).toLowerCase().includes(find));
  const spec = set ? set.qids.filter(id => (q[id] || {}).kind === 'specialty').length : 0;
  const counter = !set ? '' : set.counts === false && other ? `<span class="tb-count">${set.qids.length} questions${set.pass ? ' · pass ' + set.pass + '%' : ''}</span>`
    : `<span class="tb-count ${set.qids.length === TB_QUIZ_SIZE && spec === TB_SPEC_PICKS ? 'ok' : ''}">Quiz: ${set.qids.length - spec} + ${spec} specialty = ${set.qids.length}${set.counts === false ? ' · not graded' : ' of ' + TB_QUIZ_SIZE}${set.qids.length > TB_QUIZ_SIZE ? ` · take ${set.qids.length - TB_QUIZ_SIZE} off` : ''}</span>`;
  return `<div class="tb-head"><div><h2>${other ? '' : 'Chapter ' + Number(cid) + ' · '}${esc(tbTitle(cid))}</h2>${ch.module ? `<span class="muted small">Module ${ch.module}</span>` : ''}</div>${counter}</div>
    ${set && set.intro ? `<p class="tb-intro">${esc(set.intro).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="tb-bar"><nav class="tb-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tbTab" data-tab="${k}">${l} <span>${counts[k]}</span></button>`).join('')}</nav>
      <span class="tb-bar-right">${t.newQ ? '' : `<button class="btn tiny" data-act="tbNew" data-ch="${cid}">+ New question</button>`}<input class="tb-find" id="tb-find" placeholder="Search this chapter" value="${esc(t.q)}" autocomplete="off"></span></div>
    ${t.newQ && t.newQ.ch === cid ? tbNewForm(cid) : ''}
    ${tab === 'spec' ? `<p class="muted small tb-note">A 5-part case: Part 1 sets the scene and the later parts build on it. Pick ${TB_SPEC_PICKS} for the quiz.</p>` : ''}
    <div class="tb-cards">${list.map((id, i) => tbCard(cid, id, q[id], { n: tab === 'quiz' ? i + 1 : null, inQuiz: inQuiz.has(id), tab, spec })).join('') || `<p class="muted">${find ? 'Nothing matches.' : 'None.'}</p>`}</div>`;
}

/* ---------- One question ---------- */
function tbCard(cid, qid, q, o) {
  const t = tb(), key = cid + '/' + qid, edit = t.edit === key, ask = t.ask && t.ask.key === key ? t.ask : null, pick = t.pick && t.pick.key === key ? t.pick : null;
  const hist = (t.hist || []).filter(h => h.qid === qid), histOpen = t.histOpen === key;
  const tags = [q.kind === 'specialty' ? `<span class="tb-tag spec">Specialty${q.part ? ' · Part ' + q.part : ''}</span>` : '', q.type === 'multi' ? '<span class="tb-tag">Select all</span>' : '',
    q.type === 'drag' ? '<span class="tb-tag">Drag &amp; drop</span>' : '', q.type === 'dropdown' ? '<span class="tb-tag">Dropdowns</span>' : '', q.type === 'tf' ? '<span class="tb-tag">True / False</span>' : '',
    q.mine ? '<span class="tb-tag mine">Yours</span>' : '', o.exam && o.inQuiz ? `<span class="tb-tag ok">Also on the Chapter ${Number(cid)} quiz</span>` : ''].join('');
  const numeric = /^\d+$/.test(cid), exSet = tbExamSet(cid), onExam = !!(exSet && exSet.qids.includes(qid)), m = numeric ? tbModuleOf(cid) : 0;
  const quizBtn = !numeric || o.exam ? '' : o.inQuiz ? `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="0" title="Take it off the Chapter ${Number(cid)} quiz">Take off quiz</button>`
    : `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="1">Add to quiz</button>`;
  const examBtn = !exSet ? '' : o.exam ? `<button class="btn tiny" data-act="tbExam" data-ch="${cid}" data-q="${qid}" data-on="0">Take off exam</button>`
    : onExam ? `<button class="btn tiny on-exam" data-act="tbExam" data-ch="${cid}" data-q="${qid}" data-on="0" title="Click to take it off the Module ${m} exam">✓ On Module ${m} exam</button>`
    : `<button class="btn tiny" data-act="tbExam" data-ch="${cid}" data-q="${qid}" data-on="1">+ Module ${m} exam</button>`;
  const qx = t.qx && t.qx.key === key ? t.qx : null, del = t.del === key;
  const body = edit ? tbEditBody(cid, qid, q) : tbShowBody(cid, qid, q, ask, pick);
  return `<article class="tb-card ${o.inQuiz && o.tab !== 'quiz' && !o.exam ? 'in-quiz' : ''}">
    <div class="tb-card-top">${o.n ? `<span class="tb-num">${o.n}</span>` : ''}<span class="tb-tags">${o.inQuiz && o.tab !== 'quiz' && !o.exam ? '<span class="tb-tag ok">✓ On quiz</span>' : ''}${tags}</span>
      <span class="tb-card-btns">${edit ? '' : `${quizBtn}${examBtn}<button class="copy-btn" data-act="tbEdit" data-ch="${cid}" data-q="${qid}" title="Fix the wording" aria-label="Fix the wording">${ICONS.pencil}</button>${q.mine ? `<button class="copy-btn" data-act="tbDel" data-key="${key}" title="Delete this question" aria-label="Delete this question">${ICONS.trash}</button>` : ''}`}</span></div>
    ${qx ? `<div class="tb-ask">This one is also on the <b>Module ${qx.m} exam</b>. Take it off the exam too? <button class="btn tiny primary" data-act="tbQx" data-both="1">Take off both</button><button class="btn tiny" data-act="tbQx" data-both="0">Just the quiz</button><button class="link" data-act="tbQxNo">Cancel</button></div>` : ''}
    ${del ? `<div class="tb-ask">Delete this question? It comes off any quiz or exam it’s on. <button class="btn tiny primary danger" data-act="tbDelYes" data-ch="${cid}" data-q="${qid}">Delete</button><button class="link" data-act="tbDelNo">Cancel</button></div>` : ''}
    ${body}
    <div class="tb-card-foot">${q.ref ? `<span class="muted small">${esc(q.ref)}</span>` : '<span></span>'}
      ${hist.length ? `<button class="link small" data-act="tbHist" data-key="${key}">History (${hist.length})</button>` : ''}</div>
    ${histOpen ? `<ul class="tb-hist">${hist.map(h => `<li><span class="muted small">${esc(new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${esc(String(h.by || '').split('@')[0])}</span> ${tbHistText(h, q)}</li>`).join('')}</ul>` : ''}
  </article>`;
}
function tbAnswerText(q, v) {
  if (q.type === 'drag' || q.type === 'dropdown') return (v || []).map((c, i) => (i + 1) + ': ' + tbPlain(q.choices[c])).join(', ');
  return (v || []).map(i => tbLetter(i) + ' (' + tbPlain(q.choices[i]).slice(0, 40) + ')').join(' + ');
}
function tbHistText(h, q) {
  if (h.what === 'answer') return `Right answer: ${esc(tbAnswerText(q, h.before))} → <b>${esc(tbAnswerText(q, h.after))}</b>`;
  if (h.what === 'added') return 'Added';
  if (h.what === 'deleted') return 'Deleted';
  if (h.what === 'wording') return `Wording changed <details><summary class="link small">Before</summary><div class="tb-before">${tbImgs(h.before && h.before.stem)}${(h.before && h.before.choices || []).map((c, i) => `<p>${tbLetter(i)}. ${c}</p>`).join('')}</div></details>`;
  return esc(h.what || '');
}
// The question as students would see it, with the right answer(s) marked. Click a choice to make it the right one.
function tbShowBody(cid, qid, q, ask, pick) {
  if (q.type === 'drag' || q.type === 'dropdown') return tbGapBody(cid, qid, q, pick);
  const right = new Set(q.correct || []), sel = pick ? new Set(pick.sel) : null;
  const choice = (c, i) => {
    const on = sel ? sel.has(i) : right.has(i);
    const act = q.type === 'multi' ? (pick ? `data-act="tbPickTick" data-i="${i}"` : '') : `data-act="tbAsk" data-ch="${cid}" data-q="${qid}" data-i="${i}"`;
    return `<li><button class="tb-choice ${on ? 'right' : ''} ${act ? '' : 'still'}" ${act} ${act ? '' : 'tabindex="-1"'}><span class="tb-letter">${tbLetter(i)}</span><span class="tb-ctext">${tbImgs(c)}</span>${on && !sel ? '<span class="tb-check">✓</span>' : ''}${sel ? `<span class="tb-tick ${on ? 'on' : ''}"></span>` : ''}</button></li>`;
  };
  return `<div class="tb-stem">${tbImgs(q.stem)}</div><ol class="tb-choices">${q.choices.map(choice).join('')}</ol>
    ${ask ? `<div class="tb-ask">Make <b>${tbLetter(ask.i)}</b> the right answer?${tbTakenNote()} <button class="btn tiny primary" data-act="tbAskYes">Yes, change it</button><button class="link" data-act="tbAskNo">Cancel</button></div>` : ''}
    ${q.type === 'multi' ? (pick ? `<div class="tb-ask">Tick every right answer (students must get all of them).${tbTakenNote()} <button class="btn tiny primary" data-act="tbPickSave" ${pick.sel.length ? '' : 'disabled'}>Save</button><button class="link" data-act="tbPickNo">Cancel</button></div>`
      : `<button class="link small tb-change" data-act="tbPick" data-ch="${cid}" data-q="${qid}">Change the right answers</button>`) : ''}`;
}
// Drag & drop / dropdowns: each blank shows its right choice; "Change the right answers" turns them into menus.
function tbGapBody(cid, qid, q, pick) {
  const groupOf = c => (q.groups || [])[c] || 1;
  const stem = tbImgs(q.stem).replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const i = Number(n), right = (q.gaps || [])[i];
    if (pick) return `<select class="tb-gap-sel" data-change="tbGap" data-i="${i}">${q.choices.map((c, j) => groupOf(j) === groupOf(right) ? `<option value="${j}" ${pick.sel[i] === j ? 'selected' : ''}>${esc(tbPlain(c))}</option>` : '').join('')}</select>`;
    return `<span class="tb-gap" title="Blank ${i + 1}">${esc(tbPlain(q.choices[right] || '?'))}</span>`;
  });
  return `<div class="tb-stem">${stem}</div>
    <p class="tb-pool"><span class="muted small">Options:</span> ${q.choices.map(c => `<span class="tb-opt">${esc(tbPlain(c))}</span>`).join('')}</p>
    ${pick ? `<div class="tb-ask">Pick the right choice for each blank.${tbTakenNote()} <button class="btn tiny primary" data-act="tbPickSave">Save</button><button class="link" data-act="tbPickNo">Cancel</button></div>`
      : `<button class="link small tb-change" data-act="tbPick" data-ch="${cid}" data-q="${qid}">Change the right answers</button>`}`;
}
// (Once the portal grades quizzes, a change here will offer to re-grade the attempts already taken.)
function tbTakenNote() { return ''; }

/* ---------- Fixing the wording ---------- */
// Shown as plain text: line breaks are kept; <b>, <i>, <sub>, <sup> and tables still work if typed.
const tbToText = h => String(h || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<\/?p>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
function tbFromText(s) {
  const raw = String(s || '').trim().replace(/&(?![a-z#0-9]+;)/gi, '&amp;');
  const html = /<(table|ul|ol)/i.test(raw) ? raw : raw.split(/\n\s*\n/).map(p => p.replace(/\n/g, '<br>')).join('</p><p>');
  return tbSanitize(/\n\s*\n/.test(raw) && !/<(table|ul|ol)/i.test(raw) ? '<p>' + html + '</p>' : html);
}
const TB_TAGS = new Set(['P', 'BR', 'B', 'I', 'U', 'SUB', 'SUP', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'UL', 'OL', 'LI', 'IMG']);
function tbSanitize(html) {
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const walk = el => [...el.childNodes].forEach(n => {
    if (n.nodeType !== 1) return;
    walk(n);
    if (!TB_TAGS.has(n.tagName)) { n.replaceWith(...n.childNodes); return; }
    [...n.attributes].forEach(a => { if (!(n.tagName === 'IMG' && a.name === 'data-img')) n.removeAttribute(a.name); });
  });
  const root = doc.body.firstChild; walk(root);
  return root.innerHTML;
}
function tbEditBody(cid, qid, q) {
  const k = f => 'tb-' + f + '-' + qid, dv = (f, v) => esc(S.drafts[k(f)] ?? v);
  const gaps = q.type === 'drag' || q.type === 'dropdown';
  return `<div class="tb-edit">
    <label class="field">Question${gaps ? ' <span class="muted small">({{1}}, {{2}}… are the blanks: keep them)</span>' : ''}<textarea id="${k('stem')}" data-draft="${k('stem')}" rows="4">${dv('stem', tbToText(q.stem).replace(/\{\{(\d+)\}\}/g, (m, n) => '{{' + (Number(n) + 1) + '}}'))}</textarea></label>
    ${q.type === 'tf' ? '' : q.choices.map((c, i) => `<label class="tb-edit-choice"><span>${gaps ? i + 1 : tbLetter(i)}</span><input id="${k('c' + i)}" data-draft="${k('c' + i)}" value="${dv('c' + i, tbToText(c))}" autocomplete="off"></label>`).join('')}
    <label class="field">Page reference<input id="${k('ref')}" data-draft="${k('ref')}" value="${dv('ref', q.ref || '')}" placeholder="Chapter 2, Page 53" autocomplete="off"></label>
    <div class="tb-ask"><button class="btn tiny primary" data-act="tbEditSave" data-ch="${cid}" data-q="${qid}">Save</button><button class="link" data-act="tbEditNo" data-q="${qid}">Cancel</button>
      <span class="muted small">The right answer doesn’t change here: click a choice for that.</span></div></div>`;
}

/* ---------- Saving (each change: the question, then a line in its history; ⌘Z undoes both) ---------- */
async function tbSaveQ(cid, qid, patch, what, before, after) {
  await Store.set('tbChapters/' + cid, { q: { [qid]: { ...patch, updated: Date.now(), by: S.user && S.user.email || '' } } });
  await Store.add('tbChapters/' + cid + '/history', { qid, at: Date.now(), by: S.user && S.user.email || '', what, before, after });
}
async function tbQuizToggle(cid, qid, on) {
  const set = tbQuizSet(cid), t = tb(), q = (t.chapters[cid] || {}).q || {};
  if (!set) return;
  let qids = set.qids.filter(x => x !== qid);
  if (on) {
    const spec = qids.filter(x => (q[x] || {}).kind === 'specialty').length;
    if (q[qid].kind === 'specialty' && spec >= TB_SPEC_PICKS) { toast(`The quiz already has ${TB_SPEC_PICKS} specialty questions. Take one off first.`); return; }
    qids = [...qids, qid];
  }
  await Store.set('tbSets/' + (/^\d+$/.test(cid) ? 'quiz-' + cid : cid), { qids });
}

// On / off a module exam (the module the chapter is in). Up to 5 specialty questions; it can go over 70 while you swap.
async function tbExamToggle(cid, qid, on) {
  const set = tbExamSet(cid), q = tbQ(qid);
  if (!set || !q) return;
  let qids = set.qids.filter(x => x !== qid);
  if (on) {
    if (q.kind === 'specialty' && qids.filter(x => (tbQ(x) || {}).kind === 'specialty').length >= TB_EXAM_SPEC) { toast(`The exam already has ${TB_EXAM_SPEC} specialty questions. Take one off first.`); return; }
    qids = [...qids, qid];
  }
  await Store.set('tbSets/exam-m' + tbModuleOf(cid), { qids });
}

/* ---------- A module exam: its questions by chapter, with the counter (65 of yours + 5 specialty = 70) ---------- */
function tbExamMain() {
  const t = tb(), set = t.sets[t.ch], m = set.module, [a, b] = TB_MODULES[m];
  const items = set.qids.map(id => ({ id, cid: id.split('-')[0], q: tbQ(id) })).filter(x => x.q && !x.q.deleted);
  const spec = items.filter(x => x.q.kind === 'specialty').length, total = items.length;
  const find = t.q.trim().toLowerCase();
  const shown = find ? items.filter(x => (tbPlain(x.q.stem) + ' ' + x.q.choices.map(tbPlain).join(' ')).toLowerCase().includes(find)) : items;
  const ok = total === TB_EXAM_SIZE && spec === TB_EXAM_SPEC;
  const groups = Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0')).map(cid => {
    const mine = shown.filter(x => x.cid === cid);
    if (!mine.length) return '';
    const quiz = new Set((tbQuizSet(cid) || {}).qids || []);
    return `<h3 class="tb-exam-ch">Chapter ${Number(cid)} · ${esc(tbTitle(cid))} <span class="muted small">${mine.length}</span></h3>`
      + mine.map(x => tbCard(cid, x.id, x.q, { exam: true, inQuiz: quiz.has(x.id), tab: 'exam' })).join('');
  }).join('');
  return `<div class="tb-head"><div><h2>Module ${m} Exam</h2><span class="muted small">Chapters ${a}–${b} · 2 hours · ${TB_EXAM_SIZE} questions</span></div>
      <span class="tb-count ${ok ? 'ok' : ''}">Exam: ${total - spec} + ${spec} specialty = ${total} of ${TB_EXAM_SIZE}${total > TB_EXAM_SIZE ? ` · take ${total - TB_EXAM_SIZE} off` : total < TB_EXAM_SIZE ? ` · add ${TB_EXAM_SIZE - total}` : ''}${spec !== TB_EXAM_SPEC ? ` · ${TB_EXAM_SPEC} specialty to pick` : ''}</span></div>
    <div class="tb-bar"><span class="muted small tb-exam-tip">Add questions from any Module ${m} chapter with <b>+ Module ${m} exam</b> on its card (5 of them specialty).</span>
      <input class="tb-find" id="tb-find" placeholder="Search this exam" value="${esc(t.q)}" autocomplete="off"></div>
    <div class="tb-cards">${groups || `<p class="muted">${find ? 'Nothing matches.' : 'No questions yet.'}</p>`}</div>`;
}

/* ---------- + New question (multiple choice, select all, or true / false) ---------- */
function tbNewForm(cid) {
  const t = tb(), nq = t.newQ, numeric = /^\d+$/.test(cid), m = numeric ? tbModuleOf(cid) : 0;
  const dv = k => esc(S.drafts[k] || '');
  const types = [['mc', 'Multiple choice'], ['multi', 'Select all'], ['tf', 'True / False']];
  const choice = i => {
    const on = nq.correct.includes(i), mark = `<button class="tb-right ${nq.type === 'multi' ? 'sq' : ''} ${on ? 'on' : ''}" data-act="tbNewRight" data-i="${i}" title="${on ? 'Right answer' : 'Make this a right answer'}" aria-label="Right answer">${on ? '✓' : ''}</button>`;
    if (nq.type === 'tf') return `<div class="tb-new-choice">${mark}<span class="tb-letter">${tbLetter(i)}</span><span>${i ? 'False' : 'True'}</span></div>`;
    return `<div class="tb-new-choice">${mark}<span class="tb-letter">${tbLetter(i)}</span><input id="tbn-c${i}" data-draft="tbn-c${i}" value="${dv('tbn-c' + i)}" placeholder="Choice ${tbLetter(i)}" autocomplete="off">${nq.n > 2 ? `<button class="x" data-act="tbNewLess" data-i="${i}" aria-label="Remove this choice">×</button>` : ''}</div>`;
  };
  return `<article class="tb-card tb-new"><div class="tb-new-head"><b>New question</b><div class="seg">${types.map(([k, l]) => `<button class="${nq.type === k ? 'on' : ''}" data-act="tbNewType" data-v="${k}">${l}</button>`).join('')}</div></div>
    <textarea id="tbn-stem" data-draft="tbn-stem" rows="3" placeholder="Type the question">${dv('tbn-stem')}</textarea>
    <p class="muted small">${nq.type === 'multi' ? 'Tick every right answer (students must get all of them).' : 'Tick the right answer.'}</p>
    ${Array.from({ length: nq.type === 'tf' ? 2 : nq.n }, (_, i) => choice(i)).join('')}
    ${nq.type !== 'tf' && nq.n < 6 ? '<button class="link small" data-act="tbNewMore">+ Add a choice</button>' : ''}
    <input id="tbn-ref" data-draft="tbn-ref" value="${dv('tbn-ref')}" placeholder="Page reference (e.g. Chapter ${numeric ? Number(cid) : 2}, Page 53)" autocomplete="off">
    <div class="tb-new-flags">${numeric ? `<label>${circle(nq.quiz, 'data-act="tbNewFlag" data-k="quiz"')} Put it on the Chapter ${Number(cid)} quiz</label>
      <label>${circle(nq.exam, 'data-act="tbNewFlag" data-k="exam"')} Put it on the Module ${m} exam</label>` : `<span class="muted small">It goes on the ${esc(tbTitle(cid))} quiz.</span>`}</div>
    <div class="tb-ask"><button class="btn tiny primary" data-act="tbNewSave">Save question</button><button class="link" data-act="tbNewNo">Cancel</button></div></article>`;
}
async function tbNewSave() {
  const t = tb(), nq = t.newQ;
  if (!nq) return;
  const cid = nq.ch, numeric = /^\d+$/.test(cid), q = (t.chapters[cid] || {}).q || {};
  const stem = tbFromText(S.drafts['tbn-stem'] || '');
  if (!tbPlain(stem)) { toast('Type the question first.'); return; }
  const choices = nq.type === 'tf' ? ['True', 'False'] : Array.from({ length: nq.n }, (_, i) => tbFromText(S.drafts['tbn-c' + i] || ''));
  if (choices.some(c => !tbPlain(c))) { toast('Every choice needs words (or remove it with ×).'); return; }
  if (!nq.correct.length) { toast('Tick the right answer.'); return; }
  if (nq.type === 'multi' && nq.correct.length < 2) { toast('A select-all question needs at least 2 right answers (or make it multiple choice).'); return; }
  let n = 1; while (q[cid + '-m' + String(n).padStart(2, '0')]) n++;
  const qid = cid + '-m' + String(n).padStart(2, '0'), now = Date.now(), by = S.user && S.user.email || '';
  const doc = { kind: numeric ? 'bank' : 'quiz', mine: true, type: nq.type, name: tbPlain(stem).slice(0, 80), stem, choices, correct: nq.correct,
    ref: String(S.drafts['tbn-ref'] || '').trim(), order: 100000 + n, created: now, updated: now, by };
  t.newQ = null; Object.keys(S.drafts).filter(k => k.startsWith('tbn-')).forEach(k => delete S.drafts[k]);
  await Store.set('tbChapters/' + cid, { q: { [qid]: doc } });
  await Store.add('tbChapters/' + cid + '/history', { qid, at: now, by, what: 'added' });
  if (nq.quiz) { const set = tbQuizSet(cid); if (set) await Store.set('tbSets/' + (numeric ? 'quiz-' + cid : cid), { qids: [...set.qids, qid] }); }
  if (nq.exam && numeric) await tbExamToggle(cid, qid, true);
  if (numeric && !nq.quiz) { t.tab = 'all'; pref('tbTab', 'all'); }
  toast('Question saved' + (nq.quiz ? ' and put on the quiz' : '') + (nq.exam ? (nq.quiz ? ' and the exam' : ' and put on the exam') : '') + '.');
  render();
}

/* ---------- First time: the import file ---------- */
function tbImportView() {
  const t = tb();
  return `<section class="box tb-import"><h2>Set up the Test Bank</h2>
    <p>Pick <b>test-bank-import.json</b> (in your Elevate EMS Admin folder, next to this app’s folder). It has every chapter’s quiz, specialty and test bank questions from Navigate, the 5 module exams as they are today, and the Ride Along Readiness and Pharmacology quizzes.</p>
    <p class="muted small">It’s saved where only you and Nick can see it. Keep the file itself off GitHub: it has the answer keys.</p>
    ${t.importBusy ? `<p><b>${esc(t.importBusy)}</b></p>` : `<label class="btn primary">Choose the file…<input type="file" accept=".json,application/json" data-change="tbImport" hidden></label>`}</section>`;
}
async function tbImportData(data) {
  const t = tb();
  if (!data || !data.chapters || !data.sets) throw new Error('That isn’t the Test Bank import file.');
  const ch = Object.entries(data.chapters), sets = Object.entries(data.sets), imgs = Object.entries(data.images || {});
  let n = 0;
  const step = () => { t.importBusy = `Saving… ${++n} of ${ch.length + sets.length + imgs.length}`; render(); };
  for (const [id, d] of imgs) { await Store.quiet.set('tbImages/' + id, { data: d }, false); step(); }
  for (const [id, d] of ch) { await Store.quiet.set('tbChapters/' + id, { ...d, title: d.title || (id === '15' ? 'Medical Overview' : '') }, false); step(); }
  for (const [id, d] of sets) { await Store.quiet.set('tbSets/' + id, d, false); step(); }
  await Store.quiet.set('meta/testBank', { importedAt: Date.now(), by: S.user && S.user.email || '', made: data.made || '' });
}

/* ---------- Clicks ---------- */
async function tbAct(a, el) {
  const d = el.dataset || {}, t = tb();
  const chq = () => ((t.chapters[d.ch] || {}).q || {})[d.q];
  switch (a) {
    case 'tbCh': t.ch = d.ch; pref('tbCh', d.ch); t.q = ''; t.edit = t.ask = t.pick = null; render(); window.scrollTo(0, 0); return true;
    case 'tbTab': t.tab = d.tab; pref('tbTab', d.tab); t.ask = t.pick = null; render(); return true;
    case 'tbAsk': { const q = chq(); if (!q || (q.correct || []).length === 1 && q.correct[0] === Number(d.i)) return true; t.ask = { key: d.ch + '/' + d.q, ch: d.ch, q: d.q, i: Number(d.i) }; t.pick = null; render(); return true; }
    case 'tbAskNo': t.ask = null; render(); return true;
    case 'tbAskYes': {
      const k = t.ask; t.ask = null; if (!k) return true;
      const q = ((t.chapters[k.ch] || {}).q || {})[k.q]; if (!q) return true;
      await tbSaveQ(k.ch, k.q, { correct: [k.i] }, 'answer', q.correct || [], [k.i]);
      toast(`Right answer is now ${tbLetter(k.i)}.`); return true;
    }
    case 'tbPick': { const q = chq(); if (!q) return true; t.ask = null; t.pick = { key: d.ch + '/' + d.q, ch: d.ch, q: d.q, sel: [...(q.type === 'drag' || q.type === 'dropdown' ? q.gaps : q.correct || [])] }; render(); return true; }
    case 'tbPickTick': { const p = t.pick, i = Number(d.i); if (!p) return true; p.sel = p.sel.includes(i) ? p.sel.filter(x => x !== i) : [...p.sel, i].sort((x, y) => x - y); render(); return true; }
    case 'tbPickNo': t.pick = null; render(); return true;
    case 'tbPickSave': {
      const p = t.pick; t.pick = null; if (!p) return true;
      const q = ((t.chapters[p.ch] || {}).q || {})[p.q]; if (!q) return true;
      const gaps = q.type === 'drag' || q.type === 'dropdown', before = gaps ? q.gaps : q.correct || [];
      if (JSON.stringify(before) === JSON.stringify(p.sel)) { render(); return true; }
      await tbSaveQ(p.ch, p.q, gaps ? { gaps: p.sel } : { correct: p.sel }, 'answer', before, p.sel);
      toast('Right answers saved.'); return true;
    }
    case 'tbEdit': t.edit = d.ch + '/' + d.q; t.ask = t.pick = null; render(); { const f = document.getElementById('tb-stem-' + d.q); if (f) f.focus(); } return true;
    case 'tbEditNo': t.edit = null; Object.keys(S.drafts).filter(k => k.endsWith('-' + d.q) && k.startsWith('tb-')).forEach(k => delete S.drafts[k]); render(); return true;
    case 'tbEditSave': {
      const q = chq(); if (!q) return true;
      const k = f => 'tb-' + f + '-' + d.q, val = (f, v) => S.drafts[k(f)] ?? v;
      const gaps = q.type === 'drag' || q.type === 'dropdown';
      let stem = tbFromText(val('stem', tbToText(q.stem).replace(/\{\{(\d+)\}\}/g, (m, n) => '{{' + (Number(n) + 1) + '}}')));
      if (gaps) {
        stem = stem.replace(/\{\{(\d+)\}\}/g, (m, n) => '{{' + (Number(n) - 1) + '}}');
        const found = (stem.match(/\{\{\d+\}\}/g) || []).length;
        if (found !== (q.gaps || []).length) { toast(`The question needs all ${(q.gaps || []).length} blanks ({{1}}…{{${(q.gaps || []).length}}}).`); return true; }
      }
      const choices = q.type === 'tf' ? q.choices : q.choices.map((c, i) => { const v = val('c' + i, tbToText(c)); return gaps ? tbPlain(v) : tbFromText(v); });
      if (choices.some(c => !tbPlain(c))) { toast('Every choice needs words.'); return true; }
      const ref = String(val('ref', q.ref || '')).trim();
      t.edit = null; Object.keys(S.drafts).filter(x => x.endsWith('-' + d.q) && x.startsWith('tb-')).forEach(x => delete S.drafts[x]);
      if (stem === q.stem && JSON.stringify(choices) === JSON.stringify(q.choices) && ref === (q.ref || '')) { render(); return true; }
      await tbSaveQ(d.ch, d.q, { stem, choices, ref }, 'wording', { stem: q.stem, choices: q.choices, ref: q.ref || '' }, { stem, choices, ref });
      toast('Saved.'); return true;
    }
    case 'tbQuiz': {
      const ex = tbExamSet(d.ch);
      if (d.on === '0' && ex && ex.qids.includes(d.q)) { t.qx = { key: d.ch + '/' + d.q, ch: d.ch, q: d.q, m: tbModuleOf(d.ch) }; render(); return true; }
      await tbQuizToggle(d.ch, d.q, d.on === '1'); return true;
    }
    case 'tbQxNo': t.qx = null; render(); return true;
    case 'tbQx': { const k = t.qx; t.qx = null; if (!k) return true; await tbQuizToggle(k.ch, k.q, false); if (d.both === '1') await tbExamToggle(k.ch, k.q, false); render(); return true; }
    case 'tbExam': await tbExamToggle(d.ch, d.q, d.on === '1'); return true;
    case 'tbDel': t.del = t.del === d.key ? null : d.key; render(); return true;
    case 'tbDelNo': t.del = null; render(); return true;
    case 'tbDelYes': {
      t.del = null; const q = chq(); if (!q || !q.mine) return true;
      await Store.set('tbChapters/' + d.ch, { q: { [d.q]: { deleted: true, updated: Date.now() } } });
      for (const [id, set] of Object.entries(t.sets)) if (set.qids.includes(d.q)) await Store.set('tbSets/' + id, { qids: set.qids.filter(x => x !== d.q) });
      await Store.add('tbChapters/' + d.ch + '/history', { qid: d.q, at: Date.now(), by: S.user && S.user.email || '', what: 'deleted' });
      toast('Deleted.'); return true;
    }
    case 'tbNew': t.newQ = { ch: d.ch, type: 'mc', n: 4, correct: [], quiz: !/^\d+$/.test(d.ch), exam: false }; render(); { const f = document.getElementById('tbn-stem'); if (f) f.focus(); } return true;
    case 'tbNewType': { const nq = t.newQ; if (!nq) return true; nq.type = d.v; nq.correct = []; if (d.v === 'tf') nq.n = 2; else if (nq.n < 3) nq.n = 4; render(); return true; }
    case 'tbNewMore': if (t.newQ && t.newQ.n < 6) { t.newQ.n++; render(); } return true;
    case 'tbNewLess': { const nq = t.newQ, i = Number(d.i); if (!nq || nq.n <= 2) return true;
      for (let j = i; j < nq.n - 1; j++) S.drafts['tbn-c' + j] = S.drafts['tbn-c' + (j + 1)] || ''; delete S.drafts['tbn-c' + (nq.n - 1)];
      nq.correct = nq.correct.filter(x => x !== i).map(x => x > i ? x - 1 : x); nq.n--; render(); return true; }
    case 'tbNewRight': { const nq = t.newQ, i = Number(d.i); if (!nq) return true;
      nq.correct = nq.type === 'multi' ? (nq.correct.includes(i) ? nq.correct.filter(x => x !== i) : [...nq.correct, i].sort((a, b) => a - b)) : [i]; render(); return true; }
    case 'tbNewFlag': if (t.newQ) { t.newQ[d.k] = !t.newQ[d.k]; render(); } return true;
    case 'tbNewNo': t.newQ = null; Object.keys(S.drafts).filter(k => k.startsWith('tbn-')).forEach(k => delete S.drafts[k]); render(); return true;
    case 'tbNewSave': await tbNewSave(); return true;
    case 'tbHist': t.histOpen = t.histOpen === d.key ? null : d.key; render(); return true;
  }
  return false;
}
document.addEventListener('change', async e => {
  const el = e.target, t = S.tb;
  if (!t) return;
  if (el.dataset.change === 'tbGap' && t.pick) { t.pick.sel[Number(el.dataset.i)] = Number(el.value); return; }
  if (el.dataset.change === 'tbImport' && el.files && el.files[0]) {
    t.importBusy = 'Reading the file…'; render();
    try { await tbImportData(JSON.parse(await el.files[0].text())); t.importBusy = ''; toast('Test Bank is set up.'); }
    catch (err) { t.importBusy = ''; toast('Couldn’t import it: ' + err.message); }
    render();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'tb-find' && S.tb) { S.tb.q = e.target.value; render(); } });

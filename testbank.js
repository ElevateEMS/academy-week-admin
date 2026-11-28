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
const TB_EXAM_ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>';
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
  setTimeout(tbPairsOnce, 0);
  if (!t.sideShown) { t.sideShown = true; setTimeout(tbSideToCurrent, 0); }
  const exam = /^exam-/.test(t.ch), prac = t.ch === 'practice';
  if (!prac && (exam ? !t.sets[t.ch] : !t.chapters[t.ch])) t.ch = '01';
  if (!exam && !prac) tbHistoryWatch(t.ch);
  return `<div class="tb">${tbSide()}<section class="tb-main box">${prac ? tbPracticeMain() : exam ? tbExamMain() : tbMain()}</section></div>`;
}
const tbFolded = () => new Set(String(pref('tbFold') || '').split(',').filter(Boolean).map(Number));
// Keep the open chapter in view inside the side list (only the list scrolls, not the page).
function tbSideToCurrent() {
  const side = document.querySelector('.tb-side'), on = side && side.querySelector('.tb-ch.on');
  if (!on) return;
  const top = on.offsetTop - side.offsetTop, bottom = top + on.offsetHeight;
  if (top < side.scrollTop + 8) side.scrollTop = top - 40; else if (bottom > side.scrollTop + side.clientHeight - 8) side.scrollTop = bottom - side.clientHeight + 40;
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
  // Each module: its chapters, then its exam (like the JBL course, where the exam sits under the module's last chapter).
  const examRow = m => { const set = t.sets['exam-m' + m]; if (!set) return '';
    const spec = set.qids.filter(id => (tbQ(id) || {}).kind === 'specialty').length, done = set.qids.length === TB_EXAM_SIZE && spec === TB_EXAM_SPEC;
    return `<button class="tb-ch tb-ch-exam ${t.ch === 'exam-m' + m ? 'on' : ''}" data-act="tbCh" data-ch="exam-m${m}"><span class="tb-ch-n">${TB_EXAM_ICON}</span><span class="tb-ch-t">Module ${m} Exam</span>${done ? '<span class="tb-ch-done" title="65 + 5 specialty">✓</span>' : ''}</button>`; };
  // A module folds to its heading (remembered on this computer); the one you're in stays open. ✓ = all its quizzes + its exam done.
  const fold = tbFolded(), here = /^exam-m/.test(t.ch) ? Number(t.ch.slice(6)) : /^\d+$/.test(t.ch) ? tbModuleOf(t.ch) : 0;
  const modDone = (m, a, b) => { const ex = t.sets['exam-m' + m]; if (!ex) return false;
    const exSpec = ex.qids.filter(id => (tbQ(id) || {}).kind === 'specialty').length;
    return ex.qids.length === TB_EXAM_SIZE && exSpec === TB_EXAM_SPEC && Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0')).every(cid => {
      const set = tbQuizSet(cid); if (!set || set.counts === false) return true;
      const sp = set.qids.filter(id => (tbQ(id) || {}).kind === 'specialty').length; return set.qids.length === TB_QUIZ_SIZE && sp === TB_SPEC_PICKS; }); };
  return `<aside class="tb-side box" data-keep-scroll="tb-side">${Object.entries(TB_MODULES).map(([m, [a, b]]) => { const open = !fold.has(Number(m)) || Number(m) === here;
    return `<button class="tb-mod tb-mod-btn" data-act="tbFold" data-m="${m}" aria-expanded="${open}"><span class="tb-caret">${open ? '▾' : '▸'}</span>Module ${m} <span class="muted">· Ch ${a}–${b}</span>${modDone(m, a, b) ? '<span class="tb-ch-done" title="All its quizzes and its exam are done">✓</span>' : ''}</button>`
    + (open ? Array.from({ length: b - a + 1 }, (_, i) => { const n = a + i, cid = String(n).padStart(2, '0'); return row(cid, tbTitle(cid), n); }).join('') + examRow(m) : ''); }).join('')}
    <p class="tb-mod">Other quizzes</p>${TB_OTHER.map(([cid, l]) => row(cid, l, '•')).join('')}
    <p class="tb-mod">Students</p><button class="tb-ch ${t.ch === 'practice' ? 'on' : ''}" data-act="tbCh" data-ch="practice"><span class="tb-ch-n">${TB_PRAC_ICON}</span><span class="tb-ch-t">NREMT Practice</span></button></aside>`;
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
  const pv = set ? `<button class="btn tiny" data-act="tbPreview" data-set="${/^\d+$/.test(cid) ? 'quiz-' + cid : cid}">Preview as student</button>` : '';
  return `<div class="tb-head"><div><h2>${other ? '' : 'Chapter ' + Number(cid) + ' · '}${esc(tbTitle(cid))}</h2>${ch.module ? `<span class="muted small">Module ${ch.module}</span>` : ''}</div><div class="tb-head-right">${counter}${pv}</div></div>
    ${set && set.intro ? `<p class="tb-intro">${esc(set.intro).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="tb-bar"><nav class="tb-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tbTab" data-tab="${k}">${l} <span>${counts[k]}</span></button>`).join('')}</nav>
      <span class="tb-bar-right">${t.newQ ? '' : `<button class="btn tiny" data-act="tbNew" data-ch="${cid}">+ New question</button>`}<input class="tb-find" id="tb-find" placeholder="Search this chapter" value="${esc(t.q)}" autocomplete="off"></span></div>
    ${t.newQ && t.newQ.ch === cid ? tbNewForm(cid) : ''}
    ${tab === 'spec' ? tbCaseHead(cid) : ''}
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
  const caseQ = q.kind === 'specialty';
  const quizBtn = !numeric || o.exam || caseQ ? '' : o.inQuiz ? `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="0" title="Take it off the Chapter ${Number(cid)} quiz">Take off quiz</button>`
    : `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="1">Add to quiz</button>`;
  const examBtn = !exSet || (caseQ && !o.exam) ? '' : caseQ ? '' : o.exam ? `<button class="btn tiny" data-act="tbExam" data-ch="${cid}" data-q="${qid}" data-on="0">Take off exam</button>`
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
    if (q[qid].kind === 'specialty') { toast('Quizzes always use Parts 1 and 2 of the chapter’s case.'); return; }
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
      <div class="tb-head-right"><span class="tb-count ${ok ? 'ok' : ''}">Exam: ${total - spec} + ${spec} specialty = ${total} of ${TB_EXAM_SIZE}${total > TB_EXAM_SIZE ? ` · take ${total - TB_EXAM_SIZE} off` : total < TB_EXAM_SIZE ? ` · add ${TB_EXAM_SIZE - total}` : ''}${spec !== TB_EXAM_SPEC ? ` · ${TB_EXAM_SPEC} specialty to pick` : ''}</span>
        <button class="btn tiny" data-act="tbPreview" data-set="${t.ch}">Preview as student</button></div></div>
    <div class="tb-case-pick"><label>Case study <select data-change="tbExamCase" data-m="${m}"><option value="">Pick a chapter…</option>${Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'))
      .map(cid => `<option value="${cid}" ${set.caseCh === cid ? 'selected' : ''}>Chapter ${Number(cid)} · ${esc(tbTitle(cid))}</option>`).join('')}</select></label>
      <span class="muted small">All 5 parts go on the exam, back to back (Parts 1 and 2 are also on that chapter’s quiz).</span></div>
    <div class="tb-bar"><span class="muted small tb-exam-tip">Add your own questions from any Module ${m} chapter with <b>+ Module ${m} exam</b> on its card.</span>
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

/* ---------- The specialty case: Parts 1 & 2 on the quiz, all 5 parts on one module exam, and its scene ---------- */
const tbParts = cid => Object.entries(((tb().chapters || {})[cid] || {}).q || {}).filter(([, q]) => q.kind === 'specialty' && !q.deleted)
  .sort((a, b) => (a[1].part || 0) - (b[1].part || 0)).map(([id]) => id);
// The scene from Part 1, shown above Parts 2–5 ("Continuing the scenario"). Saved one wins; otherwise Part 1's opening,
// without its heading or question.
function tbCaseAuto(cid) {
  const p1 = tbQ(tbParts(cid)[0] || '');
  if (!p1) return '';
  const paras = String(p1.stem).split(/<\/p>|<br>|<table/i).map(x => tbPlain(x)).filter(Boolean)
    .filter(x => !/^part \d+\s*:/i.test(x) && !/^(answer area|items)$/i.test(x));
  const out = [];
  for (const para of paras) {
    const sentences = para.match(/[^.?!]+[.?!]+["”’)]*|[^.?!]+$/g) || [para];
    const keep = sentences.filter(x => !/\?\s*["”’)]*$/.test(x.trim()) && !/^\s*(select|move|choose|drag|match|place|\(?note)/i.test(x));
    if (keep.length) out.push(keep.join('').trim());
    if (keep.length < sentences.length) break; // (the question starts here)
  }
  return out.join(' ').trim();
}
const tbCaseText = cid => { const c = (tb().chapters || {})[cid] || {}; return c.caseSetup != null ? c.caseSetup : tbCaseAuto(cid); };
function tbCaseHead(cid) {
  const t = tb(), exSet = tbExamSet(cid), m = tbModuleOf(cid), onExam = exSet && exSet.caseCh === cid, edit = t.caseEdit === cid;
  const ch = t.chapters[cid] || {};
  return `<div class="tb-case">
    <p class="tb-case-rules"><span class="tb-tag ok">Parts 1 &amp; 2 are on the quiz</span> (always, back to back)${exSet ? ` · ${onExam ? `<span class="tb-tag exam">✓ This case is on the Module ${m} exam</span>` : `<button class="btn tiny" data-act="tbUseCase" data-ch="${cid}">Use this case on the Module ${m} exam</button>`}` : ''}</p>
    <div class="tb-case-box"><span class="tb-case-label">Case setup <span class="muted small">(shown above Parts 2–5: “Continuing the scenario”)</span>${edit ? '' : `<button class="copy-btn" data-act="tbCaseEdit" data-ch="${cid}" title="Fix the case setup" aria-label="Fix the case setup">${ICONS.pencil}</button>`}</span>
      ${edit ? `<textarea id="tb-case-${cid}" data-draft="tb-case-${cid}" rows="4">${esc(S.drafts['tb-case-' + cid] ?? tbCaseText(cid))}</textarea>
        <div class="tb-ask"><button class="btn tiny primary" data-act="tbCaseSave" data-ch="${cid}">Save</button><button class="link" data-act="tbCaseNo" data-ch="${cid}">Cancel</button>${ch.caseSetup != null ? `<button class="link small" data-act="tbCaseReset" data-ch="${cid}">Go back to the automatic one</button>` : ''}</div>`
      : `<p>${esc(tbCaseText(cid)) || '<span class="muted">None found in Part 1: click the pencil to type it.</span>'}</p>`}</div></div>`;
}
// A module exam's case: that chapter's 5 parts (in order) replace whatever case was on it.
async function tbExamCase(m, cid) {
  const set = (tb().sets || {})['exam-m' + m];
  if (!set) return;
  const qids = set.qids.filter(id => (tbQ(id) || {}).kind !== 'specialty');
  await Store.set('tbSets/exam-m' + m, { qids: cid ? [...qids, ...tbParts(cid)] : qids, caseCh: cid || null });
  if (cid) toast(`Chapter ${Number(cid)}’s case is on the Module ${m} exam.`);
}
// Once: every graded chapter quiz gets Parts 1 & 2 (and no other specialty parts).
async function tbPairsOnce() {
  const t = tb();
  if (t.pairsDone || !t.setsIn || !t.chIn || !Object.keys(t.sets || {}).length) return;
  t.pairsDone = true;
  const meta = await Store.get('meta/testBank');
  if (meta && meta.pairs) return;
  if (!(await Store.claim('meta/testBank', 'pairs'))) return;
  for (let n = 1; n <= 39; n++) {
    const cid = String(n).padStart(2, '0'), set = t.sets['quiz-' + cid];
    if (!set || set.counts === false) continue;
    const pair = tbParts(cid).slice(0, 2), keep = set.qids.filter(id => (tbQ(id) || {}).kind !== 'specialty');
    await Store.quiet.set('tbSets/quiz-' + cid, { qids: [...keep, ...pair] });
  }
}

/* ---------- Preview as student (exam-player.js): the real screen, graded here, nothing saved ---------- */
// The chapter quizzes' start-screen note (Ride Along Readiness and Pharmacology have their own).
const TB_QUIZ_INTRO = 'Open note. You can take this quiz as many times as you like; your highest score counts.';
async function tbPictures(html) {
  const t = tb(), ids = [...String(html || '').matchAll(/<img data-img="([^"]+)">/g)].map(m => m[1]);
  for (const id of ids) if (!t.imgs[id]) { const d = await Store.get('tbImages/' + id); if (d && d.data) t.imgs[id] = d.data; }
  return String(html || '').replace(/<img data-img="([^"]+)">/g, (m, id) => t.imgs[id] ? `<img src="${t.imgs[id]}" alt="">` : '');
}
// Right or wrong, all or nothing: every box of a select-all, every blank of a drag & drop / dropdown.
function tbGrade(q, v) {
  if (q.type === 'drag' || q.type === 'dropdown') return Array.isArray(v) && (q.gaps || []).every((g, i) => v[i] === g);
  if (q.type === 'multi') return Array.isArray(v) && JSON.stringify([...v].sort()) === JSON.stringify([...(q.correct || [])].sort());
  return v === (q.correct || [])[0];
}
function tbShown(q, v) {
  if (v == null || (Array.isArray(v) && !v.length)) return '<i>No answer</i>';
  if (q.type === 'drag' || q.type === 'dropdown') return v.map((c, i) => (i + 1) + ': ' + esc(c == null ? '–' : tbPlain(q.choices[c]))).join(' · ');
  return (Array.isArray(v) ? v : [v]).map(i => esc(tbPlain(q.choices[i]))).join(' + ');
}
// The right answer in the same shape as a student's answer (what exam-player.js shows after checking / in a review).
const tbRight = q => q.type === 'drag' || q.type === 'dropdown' ? (q.gaps || []) : q.type === 'multi' ? (q.correct || []) : (q.correct || [])[0];
// One question as the student screen gets it: no answer key, pictures filled in, a case's parts tied together.
async function tbPlayerQ(id, q) {
  const gaps = q.type === 'drag' || q.type === 'dropdown', caseCid = q.kind === 'specialty' ? id.split('-')[0] : null;
  return { id, type: q.type, stem: await tbPictures(q.stem), choices: await Promise.all(q.choices.map(tbPictures)), groups: q.groups || null,
    group: caseCid ? 'case-' + caseCid : null, part: q.part || 0, caseText: caseCid && q.part > 1 ? tbCaseText(caseCid) : '',
    gapCount: gaps ? (q.gaps || []).length : 0, gapGroups: gaps ? (q.gaps || []).map(g => (q.groups || [])[g] || 1) : null };
}
async function tbPreview(setId) {
  const t = tb(), set = t.sets[setId];
  if (!set || typeof ExamPlayer === 'undefined') return;
  const items = set.qids.map(id => ({ id, q: tbQ(id) })).filter(x => x.q && !x.q.deleted);
  if (!items.length) { toast('Nothing on it yet.'); return; }
  toast('Opening the preview…');
  const questions = [];
  for (const { id, q } of items) questions.push(await tbPlayerQ(id, q));
  const exam = set.kind === 'exam', cid = set.ch;
  const title = exam ? set.title : /^\d+$/.test(cid || '') ? `Chapter ${Number(cid)} Quiz: ${tbTitle(cid)}` : set.title;
  ExamPlayer.open({
    title, kind: exam ? 'exam' : 'quiz', limitMin: exam ? 120 : 0, preview: true, passMark: set.pass || null,
    intro: exam ? '' : set.intro || (set.counts === false ? '' : TB_QUIZ_INTRO), questions,
    onSubmit: async answers => {
      // Quizzes: students get this review after submitting. Module exams: score only (the review shows in this preview).
      const review = items.map(({ id, q }) => ({ id, ok: tbGrade(q, answers[id]), right: tbRight(q), ref: q.ref || '' }));
      const score = review.filter(r => r.ok).length, pct = Math.round(score / items.length * 100);
      return { score, total: items.length, pct, passed: set.pass ? pct >= set.pass : null, review };
    },
  });
}

/* ---------- NREMT Practice (practice.js + exam-player.js): Study Mode and NREMT Simulation ----------
   Pool = every chapter question (quiz, test bank, specialty, module exams too); never Ride Along or Pharmacology.
   Categories = JBL TestPrep's six; chapters 5, 6 and 10 (terminology, the body, patient assessment) are spread across
   all of them. Sim = how many of 120 come from each. In Admin it's a preview: attempts live only until the page reloads. */
const TB_CATS = [
  { key: 'airway', label: 'Airway and Breathing', ch: [11, 16], sim: 22 },
  { key: 'cardio', label: 'Cardiology', ch: [13, 14, 17], sim: 24 },
  { key: 'medical', label: 'Medical', ch: [12, 15, 18, 19, 20, 21, 22, 23, 32], sim: 30 },
  { key: 'obped', label: 'Obstetrics and Pediatrics', ch: [7, 33, 34], sim: 12 },
  { key: 'trauma', label: 'Trauma', ch: [24, 25, 26, 27, 28, 29, 30, 31], sim: 18 },
  { key: 'ops', label: 'Operations', ch: [1, 2, 3, 4, 8, 9, 35, 36, 37, 38, 39], sim: 14 },
];
const TB_CAT_SPREAD = [5, 6, 10], TB_SIM_MAX = 120, TB_SIM_MIN = 70, TB_SIM_PASS = 80;
const TB_PRAC_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l8 4-8 4-8-4z"/><path d="M6 9.5V14c0 1.7 2.7 3 6 3s6-1.3 6-3V9.5M20 7v6"/></svg>';
const tbCatLabel = k => (TB_CATS.find(c => c.key === k) || {}).label || '';
// A question's category: by its chapter; the spread chapters land on one by a steady hash (same answer every time).
function tbCatOf(id) {
  const n = Number(id.slice(0, 2)), c = TB_CATS.find(x => x.ch.includes(n));
  if (c) return c.key;
  const key = /-s\d+$/.test(id) ? id.slice(0, 2) + '-case' : id; // (a case's parts stay together)
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let at = h % TB_SIM_MAX;
  for (const x of TB_CATS) { if (at < x.sim) return x.key; at -= x.sim; }
  return TB_CATS[0].key;
}
function tbPracPool() {
  const t = tb(), out = [];
  Object.entries(t.chapters || {}).forEach(([cid, ch]) => { if (!/^\d+$/.test(cid)) return;
    Object.entries(ch.q || {}).forEach(([id, q]) => { if (!q.deleted) out.push({ id, q, cid, cat: tbCatOf(id), spec: q.kind === 'specialty' }); }); });
  return out;
}
const tbShuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Units: one question, or one chapter's whole case (its parts in order).
function tbUnits(list) {
  const units = [], cases = {};
  list.forEach(x => { if (!x.spec) units.push([x]); else (cases[x.cid] = cases[x.cid] || []).push(x); });
  Object.values(cases).forEach(c => units.push(c.sort((a, b) => (a.q.part || 0) - (b.q.part || 0))));
  return units;
}
// The preview's pretend student: sample sessions so Past attempts isn't empty, plus what was answered in this preview.
function tbPrac() {
  const t = tb();
  if (!t.prac) { const d = n => Date.now() - n * 864e5;
    t.prac = { seen: {}, attempts: [
      { at: d(21), mode: 'study', label: 'Airway and Breathing, Cardiology', total: 25, right: 16, pct: 64, secs: 1260, sample: true },
      { at: d(16), mode: 'study', label: 'Module 3', total: 50, right: 36, pct: 72, secs: 2580, sample: true },
      { at: d(10), mode: 'sim', label: 'All categories', total: 120, right: 89, pct: 74, secs: 6120, passed: false, sample: true },
      { at: d(3), mode: 'sim', label: 'All categories', total: 84, right: 74, pct: 88, secs: 4310, passed: true, sample: true },
    ] }; }
  return t.prac;
}
function tbPracData() {
  const P = tbPrac(), pool = tbPracPool(), cats = {}, chs = {};
  TB_CATS.forEach(c => { cats[c.key] = { key: c.key, label: c.label, total: 0, spec: 0, fresh: 0 }; });
  pool.forEach(x => { const c = cats[x.cat], h = chs[x.cid] = chs[x.cid] || { cid: x.cid, n: Number(x.cid), title: tbTitle(x.cid), total: 0, spec: 0, fresh: 0 };
    [c, h].forEach(o => { o.total++; if (x.spec) o.spec++; if (!(x.id in P.seen)) o.fresh++; }); });
  const modules = Object.entries(TB_MODULES).map(([m, [a, b]]) => ({ m: Number(m), chapters: Array.from({ length: b - a + 1 }, (_, i) => chs[String(a + i).padStart(2, '0')]).filter(Boolean) })).filter(m => m.chapters.length);
  return { cats: TB_CATS.map(c => cats[c.key]), modules, attempts: P.attempts.map(a => ({ ...a, canReview: !!a.result })) };
}
function tbPractice() {
  if (typeof Practice === 'undefined') return;
  Practice.open({ preview: true, ...tbPracData(), onStudy: tbStudyStart, onSim: tbSimStart, onReview: tbPracReview, onClose: () => {} });
}
const tbPracBack = () => Practice.refresh(tbPracData());
function tbBreakdown(res) {
  return TB_CATS.map(c => { const r = res.filter(x => x.cat === c.key); return { label: c.label, right: r.filter(x => x.ok).length, total: r.length }; }).filter(b => b.total);
}
function tbPracSave(mode, label, result, answers) {
  tbPrac().attempts.push({ at: Date.now(), mode, label, total: result.total, right: result.score, pct: result.pct, secs: result.seconds, passed: result.passed,
    result, answers: Object.fromEntries(result.review.map(r => [r.id, answers[r.id]])) });
}
async function tbStudyStart(o) {
  const P = tbPrac(), pool = tbPracPool();
  const chosen = pool.filter(x => (o.by === 'cat' ? o.cats.includes(x.cat) : o.chapters.includes(x.cid)) && (o.cases || !x.spec));
  // New ones first (plus ones missed before, if asked), then the rest.
  const units = tbUnits(chosen), first = [], rest = [];
  units.forEach(u => (u.every(x => !(x.id in P.seen)) || (o.wrong && u.some(x => P.seen[x.id] === false)) ? first : rest).push(u));
  const want = o.count || chosen.length, pick = [];
  for (const u of [...tbShuffle(first), ...tbShuffle(rest)]) { if (pick.length + u.length <= want) pick.push(...u); if (pick.length >= want) break; }
  if (!pick.length) { toast('Nothing to study there.'); return; }
  toast('Getting your questions ready…');
  const questions = []; for (const x of pick) questions.push(await tbPlayerQ(x.id, x.q));
  const byId = Object.fromEntries(pick.map(x => [x.id, x])), res = {};
  const label = o.by === 'cat' ? (o.cats.length === TB_CATS.length ? 'All categories' : o.cats.map(tbCatLabel).join(', '))
    : Object.entries(TB_MODULES).map(([m, [a, b]]) => { const ids = Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0')), got = ids.filter(id => o.chapters.includes(id));
        return got.length === ids.length ? 'Module ' + m : got.length ? 'Ch ' + got.map(Number).join(', ') : ''; }).filter(Boolean).join(' · ');
  ExamPlayer.open({
    title: 'Study Mode', kind: 'quiz', mode: 'study', preview: true, autoStart: true, limitMin: o.timer ? pick.length : 0, questions,
    check: async (id, v) => { const x = byId[id], ok = tbGrade(x.q, v); res[id] = ok; P.seen[id] = ok; return { ok, right: tbRight(x.q), ref: x.q.ref || '' }; },
    onSubmit: async (answers, meta) => {
      const done = meta.checked.filter(id => id in res);
      const review = done.map(id => ({ id, ok: res[id], right: tbRight(byId[id].q), ref: byId[id].q.ref || '', cat: tbCatLabel(byId[id].cat) }));
      const score = review.filter(r => r.ok).length, total = review.length;
      const result = { score, total, pct: total ? Math.round(score / total * 100) : 0, passed: null, review, seconds: meta.seconds,
        breakdown: tbBreakdown(done.map(id => ({ cat: byId[id].cat, ok: res[id] }))), skipped: Math.max(0, meta.reached - total),
        note: total ? '' : 'You didn’t check any answers, so there’s no score this time.' };
      if (total) tbPracSave('study', label, result, answers);
      return result;
    },
    onClose: tbPracBack,
  });
}
// 95% sure the true score is above (or below) 80%? (Wilson interval.)
function tbSimSure(k, n) {
  const z = 1.96, p = k / n, d = 1 + z * z / n, mid = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d, pass = TB_SIM_PASS / 100;
  return mid - half > pass ? 'pass' : mid + half < pass ? 'fail' : null;
}
async function tbSimStart() {
  const P = tbPrac(), pool = tbPracPool();
  // 120 spots in the category mix, spread evenly so any first 70 are balanced too.
  const slots = [], got = Object.fromEntries(TB_CATS.map(c => [c.key, 0]));
  for (let i = 1; i <= TB_SIM_MAX; i++) { const c = TB_CATS.reduce((best, x) => (x.sim * i / TB_SIM_MAX - got[x.key]) > (best.sim * i / TB_SIM_MAX - got[best.key]) ? x : best); got[c.key]++; slots.push(c.key); }
  const fresh = x => !(x.id in P.seen), byCat = {};
  TB_CATS.forEach(c => { const l = pool.filter(x => x.cat === c.key && !x.spec); byCat[c.key] = [...tbShuffle(l.filter(fresh)), ...tbShuffle(l.filter(x => !fresh(x)))]; });
  let list = slots.map(k => byCat[k].shift()).filter(Boolean);
  // At most one specialty case: half the time, either a whole case or its Parts 1–3, at a random early spot.
  if (Math.random() < .5) {
    const cases = tbUnits(pool.filter(x => x.spec)).filter(u => u.length >= 3), u = cases[Math.floor(Math.random() * cases.length)];
    if (u) { const parts = Math.random() < .5 ? u : u.slice(0, 3), cat = parts[0].cat;
      let drop = parts.length; for (let j = list.length - 1; j >= 0 && drop; j--) if (list[j].cat === cat) { list.splice(j, 1); drop--; }
      list.splice(3 + Math.floor(Math.random() * 55), 0, ...parts.map(x => ({ ...x, cat }))); }
  }
  toast('Getting your simulation ready…');
  const questions = []; for (const x of list) questions.push(await tbPlayerQ(x.id, x.q));
  const byId = Object.fromEntries(list.map(x => [x.id, x])), res = [];
  let verdict = null;
  ExamPlayer.open({
    title: 'NREMT Simulation', kind: 'exam', mode: 'sim', preview: true, autoStart: true, keepOrder: true, limitMin: 120, questions,
    onAnswer: async (id, v) => {
      const x = byId[id], ok = tbGrade(x.q, v); res.push({ id, ok, cat: x.cat }); P.seen[id] = ok;
      const n = res.length, k = res.filter(r => r.ok).length;
      if (n >= TB_SIM_MIN) verdict = tbSimSure(k, n);
      return { stop: !!verdict || n >= TB_SIM_MAX };
    },
    onSubmit: async (answers, meta) => {
      const n = res.length, score = res.filter(r => r.ok).length, pct = n ? Math.round(score / n * 100) : 0;
      const passed = verdict ? verdict === 'pass' : n < TB_SIM_MIN ? false : pct >= TB_SIM_PASS;
      const note = verdict ? `It stopped at question ${n}: it was clear you’re ${verdict === 'pass' ? 'above' : 'below'} ${TB_SIM_PASS}%.`
        : meta.timeUp && n < TB_SIM_MIN ? `Time ran out before question ${TB_SIM_MIN}, so it counts as not passed.`
        : meta.ended && n < TB_SIM_MIN ? `You ended it before question ${TB_SIM_MIN}, so it counts as not passed.`
        : meta.timeUp ? `Time ran out after ${n} questions: ${TB_SIM_PASS}% or higher passes.`
        : meta.ended ? `You ended it after ${n} questions: ${TB_SIM_PASS}% or higher passes.` : `All ${n} questions: ${TB_SIM_PASS}% or higher passes.`;
      const review = res.map(r => ({ id: r.id, ok: r.ok, right: tbRight(byId[r.id].q), ref: byId[r.id].q.ref || '', cat: tbCatLabel(r.cat) }));
      const result = { score, total: n, pct, passed, note, review, breakdown: tbBreakdown(res), seconds: meta.seconds };
      if (n) tbPracSave('sim', 'All categories', result, answers);
      return result;
    },
    onClose: tbPracBack,
  });
}
async function tbPracReview(i) {
  const a = tbPrac().attempts[i];
  if (!a || !a.result) return;
  const questions = []; for (const r of a.result.review) { const q = tbQ(r.id); if (q) questions.push(await tbPlayerQ(r.id, q)); }
  ExamPlayer.review({ title: a.mode === 'sim' ? 'NREMT Simulation' : 'Study Mode', kind: a.mode === 'sim' ? 'exam' : 'quiz', mode: a.mode, preview: true, questions, answers: a.answers, result: a.result, onClose: tbPracBack });
}
// Admin's page for it: what's in each category, and the button to try it as a student.
function tbPracticeMain() {
  const pool = tbPracPool(), n = k => pool.filter(x => x.cat === k).length;
  return `<div class="tb-head"><div><h2>NREMT Practice</h2><span class="muted small">Study Mode + NREMT Simulation for students · goes live with the Student Portal</span></div>
      <div class="tb-head-right"><button class="btn tiny" data-act="tbPractice">Preview as student</button></div></div>
    <p class="tb-intro">Uses every chapter question (quizzes, test banks, specialty cases and module exam questions): ${pool.length.toLocaleString()} now. Never Ride Along Readiness or Pharmacology. Changes you make in the Test Bank show up here on their own. Never graded.</p>
    <table class="tb-cats"><thead><tr><th>Category</th><th>Chapters</th><th>Questions</th><th>Of 120 in a simulation</th></tr></thead><tbody>
      ${TB_CATS.map(c => `<tr><td><b>${esc(c.label)}</b></td><td>${c.ch.join(', ')}</td><td>${n(c.key).toLocaleString()}</td><td>${c.sim}</td></tr>`).join('')}
      <tr><td class="muted">Spread across all six</td><td>${TB_CAT_SPREAD.join(', ')}</td><td class="muted">(counted above)</td><td></td></tr></tbody></table>
    <div class="tb-prac-notes">
      <p><b>Study Mode</b>: students pick categories or modules/chapters, how many (10, 25, 50, 100 or all), specialty cases on or off, questions they got wrong before, and a timer (1 minute each). <b>Check answer</b> shows right or wrong, the right answer and the page to read. New questions come first.</p>
      <p><b>NREMT Simulation</b>: 70–120 questions in the mix above, 2 hours, no going back. After question 70 it stops once it’s 95% sure they’re above or below ${TB_SIM_PASS}%; otherwise question 120 decides. At most one specialty case (whole, or Parts 1–3). The end shows pass / not passed, each category, and a review.</p>
      <p class="muted small">In this preview, the Past attempts page starts with sample sessions, and your own preview sessions are added until the page reloads. Nothing is saved.</p></div>`;
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
    case 'tbCh': t.ch = d.ch; pref('tbCh', d.ch); t.q = ''; t.edit = t.ask = t.pick = null; render(); window.scrollTo(0, 0); tbSideToCurrent(); return true;
    case 'tbFold': { const f = tbFolded(), m = Number(d.m); f.has(m) ? f.delete(m) : f.add(m); pref('tbFold', [...f].join(',')); render(); return true; }
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
    case 'tbPreview': await tbPreview(d.set); return true;
    case 'tbPractice': tbPractice(); return true;
    case 'tbUseCase': await tbExamCase(tbModuleOf(d.ch), d.ch); return true;
    case 'tbCaseEdit': t.caseEdit = d.ch; render(); { const f = document.getElementById('tb-case-' + d.ch); if (f) f.focus(); } return true;
    case 'tbCaseNo': t.caseEdit = null; delete S.drafts['tb-case-' + d.ch]; render(); return true;
    case 'tbCaseSave': { const v = String(S.drafts['tb-case-' + d.ch] ?? tbCaseText(d.ch)).trim(); t.caseEdit = null; delete S.drafts['tb-case-' + d.ch];
      await Store.set('tbChapters/' + d.ch, { caseSetup: v }); toast('Case setup saved.'); return true; }
    case 'tbCaseReset': t.caseEdit = null; delete S.drafts['tb-case-' + d.ch]; await Store.set('tbChapters/' + d.ch, { caseSetup: null }); return true;
    case 'tbHist': t.histOpen = t.histOpen === d.key ? null : d.key; render(); return true;
  }
  return false;
}
document.addEventListener('change', async e => {
  const el = e.target, t = S.tb;
  if (!t) return;
  if (el.dataset.change === 'tbExamCase') { tbExamCase(Number(el.dataset.m), el.value); return; }
  if (el.dataset.change === 'tbGap' && t.pick) { t.pick.sel[Number(el.dataset.i)] = Number(el.value); return; }
  if (el.dataset.change === 'tbImport' && el.files && el.files[0]) {
    t.importBusy = 'Reading the file…'; render();
    try { await tbImportData(JSON.parse(await el.files[0].text())); t.importBusy = ''; toast('Test Bank is set up.'); }
    catch (err) { t.importBusy = ''; toast('Couldn’t import it: ' + err.message); }
    render();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'tb-find' && S.tb) { S.tb.q = e.target.value; render(); } });

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
const TB_QUIZ_SIZE = 20, TB_SPEC_PICKS = 2;
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
  if (!t.chapters[t.ch]) t.ch = '01';
  tbHistoryWatch(t.ch);
  return `<div class="tb">${tbSide()}<section class="tb-main box">${tbMain()}</section></div>`;
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
      <input class="tb-find" id="tb-find" placeholder="Search this chapter" value="${esc(t.q)}" autocomplete="off"></div>
    ${tab === 'spec' ? `<p class="muted small tb-note">A 5-part case: Part 1 sets the scene and the later parts build on it. Pick ${TB_SPEC_PICKS} for the quiz.</p>` : ''}
    <div class="tb-cards">${list.map((id, i) => tbCard(cid, id, q[id], { n: tab === 'quiz' ? i + 1 : null, inQuiz: inQuiz.has(id), tab, spec })).join('') || `<p class="muted">${find ? 'Nothing matches.' : 'None.'}</p>`}</div>`;
}

/* ---------- One question ---------- */
function tbExamsOf(qid) {
  return Object.values(tb().sets || {}).filter(s => s.kind === 'exam' && s.qids.includes(qid)).map(s => s.title);
}
function tbCard(cid, qid, q, o) {
  const t = tb(), key = cid + '/' + qid, edit = t.edit === key, ask = t.ask && t.ask.key === key ? t.ask : null, pick = t.pick && t.pick.key === key ? t.pick : null;
  const hist = (t.hist || []).filter(h => h.qid === qid), histOpen = t.histOpen === key;
  const tags = [q.kind === 'specialty' ? `<span class="tb-tag spec">Specialty${q.part ? ' · Part ' + q.part : ''}</span>` : '', q.type === 'multi' ? '<span class="tb-tag">Select all</span>' : '',
    q.type === 'drag' ? '<span class="tb-tag">Drag &amp; drop</span>' : '', q.type === 'dropdown' ? '<span class="tb-tag">Dropdowns</span>' : '', q.type === 'tf' ? '<span class="tb-tag">True / False</span>' : '',
    ...tbExamsOf(qid).map(x => `<span class="tb-tag exam">On ${esc(x)}</span>`)].join('');
  const quizBtn = !/^\d+$/.test(cid) ? '' : o.inQuiz ? `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="0" title="Take it off the Chapter ${Number(cid)} quiz">Take off quiz</button>`
    : `<button class="btn tiny" data-act="tbQuiz" data-ch="${cid}" data-q="${qid}" data-on="1">Add to quiz</button>`;
  const body = edit ? tbEditBody(cid, qid, q) : tbShowBody(cid, qid, q, ask, pick);
  return `<article class="tb-card ${o.inQuiz && o.tab !== 'quiz' ? 'in-quiz' : ''}">
    <div class="tb-card-top">${o.n ? `<span class="tb-num">${o.n}</span>` : ''}<span class="tb-tags">${o.inQuiz && o.tab !== 'quiz' ? '<span class="tb-tag ok">✓ On quiz</span>' : ''}${tags}</span>
      <span class="tb-card-btns">${edit ? '' : `${quizBtn}<button class="copy-btn" data-act="tbEdit" data-ch="${cid}" data-q="${qid}" title="Fix the wording" aria-label="Fix the wording">${ICONS.pencil}</button>`}</span></div>
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
    case 'tbQuiz': await tbQuizToggle(d.ch, d.q, d.on === '1'); return true;
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

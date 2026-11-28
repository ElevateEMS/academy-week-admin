/* The quiz / exam screen students see (NREMT / JBL TestPrep style). Used by Admin's "Preview as student" now, and by the
   Student Portal later: it only shows questions and collects answers. It never gets the answer keys; whoever opens it
   grades the answers (onSubmit) and hands back the score.

   ExamPlayer.open({
     title, kind: 'quiz' | 'exam', limitMin (exams: 120; quizzes: none, a running clock instead),
     intro (text shown before starting), passMark (optional %), preview (Admin only: says so on screen),
     questions: [{ id, type: mc|multi|tf|drag|dropdown, stem (html), choices: [html], groups, gapCount,
                   group (a case's parts share one), part (their order), caseText (the scene, shown above Parts 2–5) }],
     onSubmit: async answers => ({ score, total, pct, passed, review }),   // answers = { id: value }
   })
   value: mc / tf = the choice's index; multi = [indexes]; drag / dropdown = [choice index per blank] (null = empty).
   Question order is shuffled, except a case's parts stay back to back, in order, at a random spot. Choices are shuffled
   too, except true / false and ones like "All of the above".

   Practice (the Student Portal's Study Mode and NREMT Simulation) adds:
     mode: 'study'  → CHECK ANSWER on each question: check(id, value) → { ok, right (a value, same shape as an answer), ref };
                      the right answer is only handed over after the student commits to theirs.
     mode: 'sim'    → no going back, no list, no flags; each NEXT sends the answer: onAnswer(id, value) → { stop } (the
                      grader decides when it knows enough); keepOrder: true keeps the grader's question order.
     autoStart: true skips the start page. limitMin > 0 = a countdown that ends the test at 0 (any kind).
   onSubmit's result can carry review: [{ id, ok, right, ref }] (shown with the student's answers), breakdown:
   [{ label, right, total }], note, passed. ExamPlayer.review({ title, questions, answers, result, onClose }) opens a
   finished attempt straight to its results (Past attempts). */
const ExamPlayer = (() => {
  let st = null, root = null, tick = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const plain = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').trim(); };
  const keepOrder = q => q.type === 'tf' || q.choices.some(c => /\b(all|none|both) of the (above|following)\b|\bboth [a-d] and [a-d]\b|^[a-d] and [a-d]$/i.test(plain(c)));
  const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const L = i => String.fromCharCode(65 + i);

  function open(cfg) {
    close();
    // Shuffle whole units: each question on its own, or a case's parts together (Part 1, 2, …).
    const units = [], byGroup = {};
    cfg.questions.forEach(q => { if (!q.group) units.push([q]); else if (byGroup[q.group]) byGroup[q.group].push(q); else units.push(byGroup[q.group] = [q]); });
    Object.values(byGroup).forEach(u => u.sort((a, b) => (a.part || 0) - (b.part || 0)));
    const qs = [].concat(...(cfg.keepOrder ? units : shuffle(units))).map(q => ({ ...q, order: (q.type === 'mc' || q.type === 'multi') && !keepOrder(q) ? shuffle(q.choices.map((c, i) => i)) : q.choices.map((c, i) => i) }));
    st = { cfg, qs, i: 0, ans: {}, flags: new Set(), notes: '', hide: false, phase: 'intro', agree: false, pop: null, tools: { calc: false, notes: false }, at: { calc: null, notes: null }, calc: { show: '0', acc: null, op: null, fresh: true }, pickChip: null, checked: {} };
    mount();
    if (cfg.autoStart) start(); else draw();
  }
  // A finished attempt, opened straight to its results and review.
  function review(cfg) {
    close();
    st = { cfg, qs: cfg.questions.map(q => ({ ...q, order: q.order || q.choices.map((c, i) => i) })), i: 0, ans: cfg.answers || {}, flags: new Set(), phase: 'done', result: cfg.result, took: cfg.result.seconds || 0, tools: {}, at: {}, checked: {}, revTab: 'missed', past: true };
    mount(); draw();
  }
  function mount() {
    root = document.createElement('div');
    root.className = 'xp-root';
    document.body.appendChild(root);
    document.body.classList.add('xp-open');
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', e => { if (e.target.id === 'xp-notes') st.notes = e.target.value; });
    root.addEventListener('dragstart', e => { const c = e.target.closest('[data-chip]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.chip); });
    root.addEventListener('dragover', e => { if (e.target.closest('[data-blank]')) e.preventDefault(); });
    root.addEventListener('drop', e => { const b = e.target.closest('[data-blank]'); if (!b) return; e.preventDefault(); place(Number(b.dataset.blank), Number(e.dataTransfer.getData('text/plain'))); });
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', dragStart);
    // Resizing My Notes by its corner: remember the height for the rest of the test.
    root.addEventListener('pointerup', () => { const n = root && root.querySelector('#xp-notes'); if (n && n.style.height && st) { const h = parseInt(n.style.height, 10); if (h && h !== st.notesH) { st.notesH = h; n.closest('.xp-notes').classList.add('sized'); } } });
  }
  function close() {
    clearInterval(tick); tick = null;
    if (root) root.remove();
    root = null; st = null;
    document.body.classList.remove('xp-open');
    document.removeEventListener('keydown', onKey, true);
  }
  const answered = q => { const v = st.ans[q.id]; return Array.isArray(v) ? v.length > 0 && (q.type === 'multi' || v.every(x => x != null)) : v != null; };
  const elapsed = () => (Date.now() - st.started) / 1000;
  const left = () => st.cfg.limitMin * 60 - elapsed();
  const countdown = () => st.cfg.limitMin > 0;
  const study = () => st.cfg.mode === 'study', sim = () => st.cfg.mode === 'sim';
  const locked = q => study() && !!st.checked[q.id];

  /* ---------- Screens ---------- */
  function draw() {
    if (!root) return;
    const keepNotes = document.activeElement && document.activeElement.id === 'xp-notes';
    const scrolls = ['.xp-main', '.xp-nav-list', '.xp-dock', '.xp-intro'].map(s => { const el = root.querySelector(s); return el ? el.scrollTop : 0; }); // (picking an answer keeps your place)
    root.innerHTML = st.phase === 'intro' ? introView() : st.phase === 'done' ? doneView() : testView();
    ['.xp-main', '.xp-nav-list', '.xp-dock', '.xp-intro'].forEach((s, i) => { const el = root.querySelector(s); if (el && scrolls[i]) el.scrollTop = scrolls[i]; });
    if (keepNotes) { const n = root.querySelector('#xp-notes'); if (n) { n.focus(); n.selectionStart = n.selectionEnd = n.value.length; } }
  }
  function introView() {
    const c = st.cfg, exam = c.kind === 'exam';
    return `<div class="xp-intro"><div class="xp-intro-card">
      ${c.preview ? '<p class="xp-preview-tag">Preview: what students see. Nothing is saved.</p>' : ''}
      <h1>${esc(c.title)}</h1>
      <p class="xp-meta">${st.qs.length} questions · ${exam ? c.limitMin / 60 + ' hours' : 'no time limit'}${c.passMark ? ' · ' + c.passMark + '% to pass' : ''}</p>
      ${c.intro ? `<div class="xp-intro-text">${esc(c.intro).replace(/\n/g, '<br>')}</div>` : ''}
      ${exam ? `<div class="xp-before"><h2>Before you begin</h2><ul>
          <li>Turn on <b>Do Not Disturb</b>.</li><li>Close your other tabs and apps.</li><li>Plug in or charge your device.</li>
          <li>You have <b>${c.limitMin / 60} hours</b>. The timer keeps running if you leave, and the exam submits itself when time runs out.</li>
          <li>Leaving this screen is recorded.</li></ul></div>
        <p class="xp-honest">You’re not just practicing for a test: you’re preparing to care for real people. Take this exam the way you’ll take the final and the NREMT, on your own and from what you know. An honest provider starts as an honest student.</p>
        <label class="xp-agree"><input type="checkbox" data-x="agree" ${st.agree ? 'checked' : ''}> I understand and will complete this exam independently, as outlined in the course policy.</label>` : ''}
      <div class="xp-intro-btns"><button class="xp-btn" data-x="quit">${c.preview ? 'Close preview' : 'Not now'}</button>
        <button class="xp-btn primary" data-x="start" ${exam && !st.agree ? 'disabled' : ''}>Start ${exam ? 'exam' : 'quiz'}</button></div>
    </div></div>`;
  }
  function testView() {
    const q = st.qs[st.i], c = st.cfg, n = st.qs.length, ck = st.checked[q.id];
    const time = countdown() ? `<span class="xp-time ${left() < 300 ? 'low' : ''}" title="Time left">${clock(left())}</span>` : `<span class="xp-time" title="Time so far">${clock(elapsed())}</span>`;
    // The simulation shows no list and no count (like the NREMT, it doesn't say how many are coming) and can't flag.
    const tools = [['calc', ICON.calc, 'CALCULATOR'], ['notes', ICON.notes, 'MY NOTES']];
    if (!c.mode) tools.push(['flag', ICON.flag, st.flags.has(q.id) ? 'UNFLAG QUESTION' : 'FLAG QUESTION']);
    tools.push(['menu', ICON.up, 'HIDE THIS MENU']);
    const foot = sim() ? `<button class="xp-btn" data-x="submit">END TEST</button><button class="xp-btn primary" data-x="simnext" ${answered(q) && !st.busy ? '' : 'disabled'}>NEXT →</button>`
      : study() ? `<button class="xp-btn" data-x="prev" ${st.i ? '' : 'disabled'}>← PREVIOUS</button>
        <button class="xp-btn" data-x="submit">END SESSION</button>
        <span class="xp-foot-r">${ck ? '' : `<button class="xp-btn primary" data-x="check" ${answered(q) && !st.busy ? '' : 'disabled'}>CHECK ANSWER</button>`}
          <button class="xp-btn ${ck ? 'primary' : ''}" data-x="${st.i < n - 1 ? 'next' : 'submit'}">${st.i < n - 1 ? (ck ? 'NEXT →' : 'SKIP →') : 'FINISH'}</button></span>`
      : `<button class="xp-btn" data-x="prev" ${st.i ? '' : 'disabled'}>← PREVIOUS</button>
        <button class="xp-btn" data-x="submit">SUBMIT</button>
        <button class="xp-btn primary" data-x="next" ${st.i < n - 1 ? '' : 'disabled'}>NEXT →</button>`;
    return `<div class="xp ${st.hide ? 'menu-hidden' : ''} ${sim() ? 'no-list' : ''}">
      <header class="xp-head"><div class="xp-head-in">
        <div class="xp-titles"><div class="xp-title">${esc(c.title)}${c.preview ? ' <span class="xp-pv">Preview</span>' : ''}</div><div class="xp-of">Question ${st.i + 1}${sim() ? '' : ' of ' + n}</div></div>${time}</div>
        ${st.hide ? `<button class="xp-show" data-x="menu">SHOW MENU</button>` : `<nav class="xp-tools" style="--n:${tools.length}">${tools.map(([k, ic, l]) =>
          `<button data-x="${k}" class="${(k === 'flag' ? st.flags.has(q.id) : st.tools[k]) ? 'on' : ''} t-${k}">${ic}${l}</button>`).join('')}</nav>`}
      </header>
      <div class="xp-body ${docked().length ? 'with-dock' : ''}">
        ${sim() ? '' : `<nav class="xp-nav"><button class="xp-nav-arrow" data-x="up" aria-label="Previous question">▲</button><div class="xp-nav-list">${st.qs.map((x, j) => {
          const r = st.checked[x.id], mark = r ? (r.ok ? 'ok' : 'no') : answered(x) ? 'done' : '';
          return `<button class="${j === st.i ? 'cur' : ''} ${mark}" data-x="go" data-i="${j}"><span class="xp-n">${j + 1}</span>${st.flags.has(x.id) ? `<span class="xp-fl" aria-label="Flagged">${ICON.flagFill}</span>` : ''}</button>`; }).join('')}</div>
          <button class="xp-nav-arrow" data-x="down" aria-label="Next question">▼</button></nav>`}
        <main class="xp-main">${ck ? markedView(q, st.ans[q.id], ck) : questionView(q)}</main>
        ${docked().length ? `<aside class="xp-dock">${docked().map(toolView).join('')}</aside>` : ''}
      </div>
      <footer class="xp-foot">${foot}</footer>
      ${['calc', 'notes'].filter(k => st.tools[k] && st.at[k]).map(toolView).join('')}${st.pop === 'confirm' ? confirmView() : ''}
    </div>`;
  }
  function questionView(q) {
    const v = st.ans[q.id];
    if (q.type === 'drag' || q.type === 'dropdown') return gapView(q, v || []);
    const multi = q.type === 'multi';
    return `${caseBox(q)}<div class="xp-stem">${q.stem}</div>${multi ? '<p class="xp-hint">Select all that apply.</p>' : ''}
      <div class="xp-choices">${q.order.map((ci, k) => {
        const on = multi ? (v || []).includes(ci) : v === ci;
        return `<label class="xp-choice ${on ? 'on' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="xp-${esc(q.id)}" data-x="pick" data-c="${ci}" ${on ? 'checked' : ''}><span class="xp-letter">${L(k)})</span><span>${q.choices[ci]}</span></label>`;
      }).join('')}</div>`;
  }
  // Drag & drop: drag an option (or tap it, then tap a blank) into each blank. Dropdowns: pick in each blank.
  function gapView(q, v) {
    const grp = j => (q.groups || [])[j] || 1;
    let k = -1;
    const stem = q.stem.replace(/\{\{(\d+)\}\}/g, (m, n) => {
      const b = Number(n), cur = v[b];
      if (q.type === 'dropdown') {
        const g = (q.gapGroups || [])[b] || 1;
        return `<select class="xp-sel" data-x="gap" data-b="${b}"><option value="">Choose…</option>${q.choices.map((c, j) => grp(j) === g ? `<option value="${j}" ${cur === j ? 'selected' : ''}>${esc(plain(c))}</option>` : '').join('')}</select>`;
      }
      return `<span class="xp-blank ${cur != null ? 'full' : ''} ${st.pickChip != null ? 'ready' : ''}" data-blank="${b}" data-x="blank" title="${cur != null ? 'Tap to empty' : 'Drop an option here'}">${cur != null ? esc(plain(q.choices[cur])) : '&nbsp;'}</span>`;
    });
    return `${caseBox(q)}<div class="xp-stem">${stem}</div>
      ${q.type === 'drag' ? `<p class="xp-hint">Drag each option into the answer area (or tap an option, then tap a blank). Tap a filled blank to empty it.</p>
        <div class="xp-pool">${q.choices.map((c, j) => `<span class="xp-chip ${st.pickChip === j ? 'on' : ''}" draggable="true" data-chip="${j}" data-x="chip">${esc(plain(c))}</span>`).join('')}</div>` : ''}`;
  }
  // A question with its answer shown: the right choices green, a wrong pick red, then the page to read. Study Mode
  // (after CHECK ANSWER) and every review list use it.
  function markedView(q, v, r, inReview) {
    const right = r.right, ok = r.ok;
    const fill = j => j == null ? '–' : esc(plain(q.choices[j]));
    let body;
    if (q.type === 'drag' || q.type === 'dropdown') {
      const mine = Array.isArray(v) ? v : [];
      const stem = q.stem.replace(/\{\{(\d+)\}\}/g, (m, n) => { const b = Number(n), good = right && mine[b] === right[b];
        return `<span class="xp-blank full ${good ? 'is-right' : 'is-wrong'}">${mine[b] != null ? fill(mine[b]) : '&nbsp;'}</span>`; });
      body = `<div class="xp-stem">${stem}</div>${!ok && right ? `<p class="xp-right-line"><b>Right answer:</b> ${right.map((j, b) => (right.length > 1 ? (b + 1) + ': ' : '') + fill(j)).join(' · ')}</p>` : ''}`;
    } else {
      const rs = Array.isArray(right) ? right : [right], mine = Array.isArray(v) ? v : v == null ? [] : [v];
      body = `<div class="xp-stem">${q.stem}</div>${q.type === 'multi' ? '<p class="xp-hint">Select all that apply.</p>' : ''}
        <div class="xp-choices marked">${q.order.map((ci, k) => { const isR = rs.includes(ci), picked = mine.includes(ci);
          return `<div class="xp-choice ${isR ? 'is-right' : picked ? 'is-wrong' : ''}"><span class="xp-mark">${isR ? '✓' : picked ? '✗' : ''}</span><span class="xp-letter">${L(k)})</span><span>${q.choices[ci]}</span>${picked ? '<span class="xp-yours">Your answer</span>' : ''}</div>`; }).join('')}</div>`;
    }
    const none = v == null || (Array.isArray(v) && !v.some(x => x != null));
    return `${inReview ? '' : caseBox(q)}${body}
      <div class="xp-fb ${ok ? 'ok' : 'no'}"><b>${ok ? '✓ Correct' : none ? 'Not answered' : '✗ Not quite'}</b>${r.ref ? `<span>Read more: ${esc(r.ref)}</span>` : ''}</div>`;
  }
  const caseBox = q => q.caseText ? `<div class="xp-case"><b>Continuing the scenario</b><p>${esc(q.caseText)}</p></div>` : '';
  // Calculator and My Notes: docked on the right (the question gets narrower, nothing is covered), or dragged anywhere by
  // the blue bar; dragging one back to the right edge docks it again. Where it is stays for the rest of the test.
  const docked = () => ['calc', 'notes'].filter(k => st.tools[k] && !st.at[k]);
  const toolView = k => {
    const a = st.at[k], style = a ? ` style="left:${a.x}px;top:${a.y}px"` : '';
    return (k === 'calc' ? calcView : notesView)(a ? 'xp-pop float' : 'xp-pop', style);
  };
  const toolHead = (k, label) => `<div class="xp-pop-head" data-drag="${k}" title="Drag to move it">${ICON.grip}${label}<button data-x="pop" data-w="${k}" aria-label="Close">×</button></div>`;
  function calcView(cls, style) {
    const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
    return `<div class="${cls} xp-calc" data-tool="calc"${style}>${toolHead('calc', 'Calculator')}
      <div class="xp-calc-screen">${esc(st.calc.show)}</div>
      <div class="xp-calc-keys"><button data-x="key" data-k="C" class="wide">C</button><button data-x="key" data-k="±">±</button><button data-x="key" data-k="%">%</button>${keys.map(k => `<button data-x="key" data-k="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : ''}">${k}</button>`).join('')}</div></div>`;
  }
  function notesView(cls, style) {
    // Opens tall (fills the side panel, or most of the window when floating); drag its corner to make it smaller (kept).
    return `<div class="${cls} xp-notes ${st.notesH ? 'sized' : ''}" data-tool="notes"${style}>${toolHead('notes', 'My Notes')}
      <textarea id="xp-notes"${st.notesH ? ` style="height:${st.notesH}px"` : ''} placeholder="Scratch paper for the whole test: only you see it, and it isn’t saved.">${esc(st.notes)}</textarea></div>`;
  }
  function confirmView() {
    if (sim()) return `<div class="xp-veil"><div class="xp-confirm"><h2>End the simulation now?</h2>
        <p>It’s scored on the ${st.i} question${st.i === 1 ? '' : 's'} you’ve sent so far. Fewer than 70 counts as not passed.</p>
        <div class="xp-intro-btns"><button class="xp-btn" data-x="pop">Keep going</button><button class="xp-btn primary" data-x="send">End it</button></div></div></div>`;
    if (study()) { const done = Object.keys(st.checked).length;
      return `<div class="xp-veil"><div class="xp-confirm"><h2>End this study session?</h2>
        <p>You checked ${done} of ${st.qs.length} question${st.qs.length === 1 ? '' : 's'}. Your score counts the ones you checked.</p>
        <div class="xp-intro-btns"><button class="xp-btn" data-x="pop">Keep going</button><button class="xp-btn primary" data-x="send">End and see my score</button></div></div></div>`; }
    const miss = st.qs.map((q, j) => answered(q) ? null : j).filter(x => x != null), fl = st.qs.filter(q => st.flags.has(q.id)).length;
    return `<div class="xp-veil"><div class="xp-confirm">
      ${miss.length ? `<h2>${miss.length} question${miss.length === 1 ? ' is' : 's are'} unanswered</h2>
        <p class="xp-miss">${miss.map(j => `<button data-x="go" data-i="${j}">${j + 1}</button>`).join('')}</p>` : `<h2>Submit your ${st.cfg.kind}?</h2>`}
      ${fl ? `<p>${fl} ${fl === 1 ? 'is' : 'are'} flagged for review.</p>` : ''}
      <p class="xp-muted">You can’t change answers after this.</p>
      <div class="xp-intro-btns"><button class="xp-btn" data-x="pop">Go back</button><button class="xp-btn primary" data-x="send">${miss.length ? 'Submit anyway' : 'Submit'}</button></div></div></div>`;
  }
  function doneView() {
    const r = st.result || {}, c = st.cfg;
    if (st.sending) return `<div class="xp-intro"><div class="xp-intro-card"><h1>${c.mode ? 'Scoring…' : 'Submitting…'}</h1></div></div>`;
    const rev = Array.isArray(r.review) ? r.review : null, missed = rev ? rev.filter(x => !x.ok) : [];
    const tab = st.revTab || 'missed', list = rev ? (tab === 'missed' ? missed : rev) : [];
    const byId = Object.fromEntries(st.qs.map(q => [q.id, q]));
    // Module exams: students only get their score; the review shows in Admin's preview only.
    const revHead = c.kind === 'exam' && !c.mode ? 'Review (preview only: students only see their score)' : c.mode ? 'Review' : 'Review your answers';
    return `<div class="xp-intro"><div class="xp-intro-card ${rev ? 'wide' : ''}">
      ${c.preview ? `<p class="xp-preview-tag">Preview: ${c.mode ? 'kept in Past attempts until this page reloads. Nothing is saved.' : 'nothing was saved.'}</p>` : ''}
      <h1>${esc(c.title)}</h1>
      ${st.timeUp ? `<p class="xp-meta">Time ran out, so it ${c.mode ? 'ended' : 'was submitted'} with your answers so far.</p>` : ''}
      <div class="xp-score ${r.passed === false ? 'fail' : r.passed ? 'pass' : ''}"><b>${r.pct != null ? r.pct + '%' : ''}</b><span>${r.score != null ? r.score + ' of ' + r.total + ' correct' : esc(r.error || '')}</span>
        ${r.passed != null ? `<span class="xp-verdict">${r.passed ? 'Passed' : 'Not passed yet'}${c.passMark ? ' (' + c.passMark + '% to pass)' : ''}</span>` : ''}</div>
      ${r.note ? `<p class="xp-note">${esc(r.note)}</p>` : ''}
      <p class="xp-meta">Time: ${clock(st.took || 0)}${r.skipped ? ` · ${r.skipped} skipped` : ''}</p>
      ${(r.breakdown || []).length ? `<div class="xp-break"><h2>By category</h2>${r.breakdown.map(b => { const p = b.total ? Math.round(b.right / b.total * 100) : 0;
        return `<div class="xp-bar-row"><span class="xp-bar-l">${esc(b.label)}</span><span class="xp-bar"><i class="${p >= 80 ? 'hi' : p >= 65 ? 'mid' : 'lo'}" style="width:${p}%"></i></span><span class="xp-bar-n">${b.right}/${b.total}</span></div>`; }).join('')}</div>` : ''}
      ${rev && rev.length ? `<div class="xp-revs"><div class="xp-rev-head"><h2>${revHead}</h2><span class="xp-seg"><button data-x="rev" data-t="missed" class="${tab === 'missed' ? 'on' : ''}">Missed (${missed.length})</button><button data-x="rev" data-t="all" class="${tab === 'all' ? 'on' : ''}">All (${rev.length})</button></span></div>
        ${list.length ? list.map(x => { const q = byId[x.id]; return q ? `<div class="xp-rev-q"><p class="xp-rev-n">Question ${rev.indexOf(x) + 1}${x.cat ? ' · ' + esc(x.cat) : ''}</p>${markedView(q, st.ans[x.id], x, true)}</div>` : ''; }).join('') : '<p class="xp-muted">Nothing missed. Nice work!</p>'}</div>` : ''}
      <div class="xp-intro-btns"><span></span><button class="xp-btn primary" data-x="quit">${c.mode ? 'Back to practice' : 'Close'}</button></div></div></div>`;
  }

  /* ---------- Doing things ---------- */
  function start() {
    st.phase = 'test'; st.started = Date.now();
    tick = setInterval(() => {
      if (!st || st.phase !== 'test') return;
      if (countdown() && left() <= 0) { st.timeUp = true; send(); return; }
      const t = root.querySelector('.xp-time');
      if (t) { t.textContent = clock(countdown() ? left() : elapsed()); t.classList.toggle('low', countdown() && left() < 300); }
    }, 1000);
    draw();
  }
  async function send() {
    if (st.sending || st.phase === 'done') return;
    clearInterval(tick);
    st.took = elapsed(); st.phase = 'done'; st.sending = true; st.pop = null; draw();
    try { st.result = await st.cfg.onSubmit(JSON.parse(JSON.stringify(st.ans)), { seconds: Math.round(st.took), timeUp: !!st.timeUp, ended: !!st.ended, checked: Object.keys(st.checked), reached: st.i + 1 }); }
    catch (e) { st.result = { error: 'Couldn’t submit: ' + e.message }; }
    st.sending = false; draw();
  }
  // Study Mode: hand over this one answer, get back right / wrong + the right answer.
  async function check() {
    const q = st.qs[st.i];
    if (!answered(q) || st.checked[q.id] || st.busy) return;
    st.busy = true; draw();
    try { st.checked[q.id] = await st.cfg.check(q.id, JSON.parse(JSON.stringify(st.ans[q.id]))); }
    catch (e) { alert('Couldn’t check it: ' + e.message); }
    st.busy = false; draw();
  }
  // Simulation: each NEXT sends the answer; the grader says when it knows enough (or this was the last one).
  async function simNext() {
    const q = st.qs[st.i];
    if (!answered(q) || st.busy || st.phase !== 'test') return;
    st.busy = true; draw();
    let r = {};
    try { r = await st.cfg.onAnswer(q.id, JSON.parse(JSON.stringify(st.ans[q.id]))) || {}; }
    catch (e) { st.busy = false; draw(); alert('Couldn’t save that answer: ' + e.message); return; }
    st.busy = false;
    if (r.stop || st.i >= st.qs.length - 1) { send(); return; }
    st.i++; st.pickChip = null; draw();
    const m = root.querySelector('.xp-main'); if (m) m.scrollTop = 0;
  }
  function place(b, j) {
    const q = st.qs[st.i], v = (st.ans[q.id] || []).slice();
    v[b] = j; for (let k = 0; k < (q.gapCount || 0); k++) if (v[k] === undefined) v[k] = null;
    st.ans[q.id] = v; st.pickChip = null; draw();
  }
  function calcKey(k) {
    const c = st.calc, num = Number(c.show);
    const run = () => { if (c.op == null || c.acc == null) return num; const a = c.acc; return c.op === '+' ? a + num : c.op === '−' ? a - num : c.op === '×' ? a * num : num === 0 ? NaN : a / num; };
    const show = n => String(Number.isFinite(n) ? +n.toPrecision(12) : 'Error');
    if (/^[0-9]$/.test(k)) { c.show = c.fresh || c.show === '0' ? k : (c.show.length < 14 ? c.show + k : c.show); c.fresh = false; }
    else if (k === '.') { if (c.fresh) { c.show = '0.'; c.fresh = false; } else if (!c.show.includes('.')) c.show += '.'; }
    else if (k === 'C') Object.assign(c, { show: '0', acc: null, op: null, fresh: true });
    else if (k === '±') c.show = show(-num);
    else if (k === '%') c.show = show(num / 100);
    else if (k === '=') { c.show = show(run()); c.acc = null; c.op = null; c.fresh = true; }
    else { const r = run(); c.acc = r; c.show = show(r); c.op = k; c.fresh = true; }
    draw();
  }
  function onClick(e) {
    const b = e.target.closest('[data-x]');
    if (!b || !st) return;
    const x = b.dataset.x, q = st.qs[st.i];
    if (x === 'pick' || x === 'agree' || x === 'gap') return; // (handled on change)
    e.preventDefault();
    if (x === 'start') { if (st.cfg.kind !== 'exam' || st.agree) start(); return; }
    if (x === 'quit') { const done = st.cfg.onClose; close(); if (done) done(); return; }
    if (x === 'rev') { st.revTab = b.dataset.t; draw(); return; }
    if (x === 'check') { check(); return; }
    if (x === 'simnext') { simNext(); return; }
    if ((x === 'chip' || x === 'blank') && locked(q)) return;
    if (x === 'next' && st.i < st.qs.length - 1) { st.i++; st.pickChip = null; }
    else if (x === 'prev' && st.i > 0) { st.i--; st.pickChip = null; }
    else if (x === 'go') { st.i = Number(b.dataset.i); st.pickChip = null; if (st.pop === 'confirm') st.pop = null; }
    else if (x === 'up' || x === 'down') { const l = root.querySelector('.xp-nav-list'); if (l) l.scrollBy({ top: x === 'up' ? -200 : 200, behavior: 'smooth' }); return; }
    else if (x === 'flag') st.flags.has(q.id) ? st.flags.delete(q.id) : st.flags.add(q.id);
    else if (x === 'menu') st.hide = !st.hide;
    else if (x === 'calc' || x === 'notes') st.tools[x] = !st.tools[x];
    else if (x === 'pop') { if (b.dataset.w) st.tools[b.dataset.w] = false; else st.pop = null; }
    else if (x === 'key') { calcKey(b.dataset.k); return; }
    else if (x === 'submit') st.pop = 'confirm';
    else if (x === 'send') { if (sim()) st.ended = true; send(); return; }
    else if (x === 'chip') { const j = Number(b.dataset.chip); st.pickChip = st.pickChip === j ? null : j; }
    else if (x === 'blank') {
      const k = Number(b.dataset.blank);
      if (st.pickChip != null) { place(k, st.pickChip); return; }
      const v = (st.ans[q.id] || []).slice(); if (v[k] != null) { v[k] = null; st.ans[q.id] = v; }
    }
    draw();
    if (x === 'next' || x === 'prev' || x === 'go') { const cur = root.querySelector('.xp-nav-list .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' }); const m = root.querySelector('.xp-main'); if (m) m.scrollTop = 0; }
  }
  function dragStart(e) {
    const head = e.target.closest('[data-drag]');
    if (!head || e.target.closest('button')) return;
    const k = head.dataset.drag, box = head.closest('[data-tool]'), r = box.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    e.preventDefault();
    box.classList.add('float', 'dragging'); box.style.width = r.width + 'px';
    const move = ev => {
      const x = Math.min(innerWidth - 60, Math.max(0, ev.clientX - dx)), y = Math.min(innerHeight - r.height - 8, Math.max(0, ev.clientY - dy)); // (the whole box stays on screen)
      if (box.parentElement.classList.contains('xp-dock')) root.querySelector('.xp').appendChild(box);
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    const up = ev => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      const b = box.getBoundingClientRect();
      st.at[k] = b.right > innerWidth - 30 || ev.clientX > innerWidth - 40 ? null : { x: Math.round(b.left), y: Math.round(b.top) }; // (back at the right edge: docked)
      draw();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  }
  function onChange(e) {
    const t = e.target, q = st && st.qs[st.i];
    if (!t.dataset || !st) return;
    if (t.dataset.x === 'agree') { st.agree = t.checked; draw(); return; }
    if ((t.dataset.x === 'pick' || t.dataset.x === 'gap') && locked(q)) return;
    if (t.dataset.x === 'pick') {
      const c = Number(t.dataset.c);
      if (q.type === 'multi') { const v = new Set(st.ans[q.id] || []); t.checked ? v.add(c) : v.delete(c); st.ans[q.id] = [...v].sort((a, b) => a - b); }
      else st.ans[q.id] = c;
      draw(); return;
    }
    if (t.dataset.x === 'gap') {
      const v = (st.ans[q.id] || Array(q.gapCount || 0).fill(null)).slice();
      v[Number(t.dataset.b)] = t.value === '' ? null : Number(t.value);
      st.ans[q.id] = v; draw();
    }
  }
  // ← / → move between questions (not while typing in My Notes); Escape closes a pop-up.
  function onKey(e) {
    if (!st || st.phase !== 'test') return;
    if (e.target && /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName) && e.target.type !== 'radio' && e.target.type !== 'checkbox') return;
    if (e.key === 'Escape' && st.pop) { st.pop = null; draw(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && (st.tools.calc || st.tools.notes)) { st.tools.calc = st.tools.notes = false; draw(); e.stopPropagation(); return; }
    if (st.pop || sim()) return;
    if (e.key === 'ArrowRight' && st.i < st.qs.length - 1) { st.i++; draw(); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowLeft' && st.i > 0) { st.i--; draw(); e.preventDefault(); e.stopPropagation(); }
  }
  const ICON = {
    calc: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h0M14 11h2M8 15h2M12 15h0M14 15h2M8 18h2M14 18h2"/></svg>',
    notes: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
    flagFill: '<svg viewBox="0 0 24 24"><path d="M6 21V4" stroke-width="2.2"/><path d="M6 4h11l-2.5 4.2L17 12.4H6z" fill="currentColor"/></svg>',
    grip: '<svg viewBox="0 0 24 24" class="xp-grip"><circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/></svg>',
  };
  return { open, review, close, isOpen: () => !!st };
})();

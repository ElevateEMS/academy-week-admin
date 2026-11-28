/* The quiz / exam screen students see (NREMT / JBL TestPrep style). Used by Admin's "Preview as student" now, and by the
   Student Portal later: it only shows questions and collects answers. It never gets the answer keys; whoever opens it
   grades the answers (onSubmit) and hands back the score.

   ExamPlayer.open({
     title, kind: 'quiz' | 'exam', limitMin (exams: 120; quizzes: none, a running clock instead),
     intro (text shown before starting), passMark (optional %), preview (Admin only: says so on screen),
     questions: [{ id, type: mc|multi|tf|drag|dropdown, stem (html), choices: [html], groups, gapCount }],
     onSubmit: async answers => ({ score, total, pct, passed, review }),   // answers = { id: value }
   })
   value: mc / tf = the choice's index; multi = [indexes]; drag / dropdown = [choice index per blank] (null = empty).
   Question order is shuffled; choices are shuffled too, except true / false and ones like "All of the above". */
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
    const qs = shuffle(cfg.questions).map(q => ({ ...q, order: (q.type === 'mc' || q.type === 'multi') && !keepOrder(q) ? shuffle(q.choices.map((c, i) => i)) : q.choices.map((c, i) => i) }));
    st = { cfg, qs, i: 0, ans: {}, flags: new Set(), notes: '', hide: false, phase: 'intro', agree: false, pop: null, calc: { show: '0', acc: null, op: null, fresh: true }, pickChip: null };
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
    draw();
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

  /* ---------- Screens ---------- */
  function draw() {
    if (!root) return;
    const keepNotes = document.activeElement && document.activeElement.id === 'xp-notes';
    root.innerHTML = st.phase === 'intro' ? introView() : st.phase === 'done' ? doneView() : testView();
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
    const q = st.qs[st.i], c = st.cfg, n = st.qs.length, exam = c.kind === 'exam';
    const time = exam ? `<span class="xp-time ${left() < 300 ? 'low' : ''}" title="Time left">${clock(left())}</span>` : `<span class="xp-time" title="Time so far">${clock(elapsed())}</span>`;
    return `<div class="xp ${st.hide ? 'menu-hidden' : ''}">
      <header class="xp-head"><div class="xp-head-in">
        <div class="xp-titles"><div class="xp-title">${esc(c.title)}${c.preview ? ' <span class="xp-pv">Preview</span>' : ''}</div><div class="xp-of">Question ${st.i + 1} of ${n}</div></div>${time}</div>
        ${st.hide ? `<button class="xp-show" data-x="menu">SHOW MENU</button>` : `<nav class="xp-tools">
          <button data-x="calc" class="${st.pop === 'calc' ? 'on' : ''}">${ICON.calc}CALCULATOR</button>
          <button data-x="notes" class="${st.pop === 'notes' ? 'on' : ''}">${ICON.notes}MY NOTES</button>
          <button data-x="flag" class="${st.flags.has(q.id) ? 'on' : ''}">${ICON.flag}${st.flags.has(q.id) ? 'UNFLAG QUESTION' : 'FLAG QUESTION'}</button>
          <button data-x="menu">${ICON.up}HIDE THIS MENU</button></nav>`}
      </header>
      <div class="xp-body">
        <nav class="xp-nav"><button class="xp-nav-arrow" data-x="up" aria-label="Previous question">▲</button><div class="xp-nav-list">${st.qs.map((x, j) =>
          `<button class="${j === st.i ? 'cur' : ''} ${answered(x) ? 'done' : ''}" data-x="go" data-i="${j}">${j + 1}${st.flags.has(x.id) ? '<span class="xp-fl">⚑</span>' : ''}</button>`).join('')}</div>
          <button class="xp-nav-arrow" data-x="down" aria-label="Next question">▼</button></nav>
        <main class="xp-main">${questionView(q)}</main>
      </div>
      <footer class="xp-foot"><button class="xp-btn" data-x="prev" ${st.i ? '' : 'disabled'}>← PREVIOUS</button>
        <button class="xp-btn" data-x="submit">SUBMIT</button>
        <button class="xp-btn primary" data-x="next" ${st.i < n - 1 ? '' : 'disabled'}>NEXT →</button></footer>
      ${st.pop === 'calc' ? calcView() : ''}${st.pop === 'notes' ? notesView() : ''}${st.pop === 'confirm' ? confirmView() : ''}
    </div>`;
  }
  function questionView(q) {
    const v = st.ans[q.id];
    if (q.type === 'drag' || q.type === 'dropdown') return gapView(q, v || []);
    const multi = q.type === 'multi';
    return `<div class="xp-stem">${q.stem}</div>${multi ? '<p class="xp-hint">Select all that apply.</p>' : ''}
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
    return `<div class="xp-stem">${stem}</div>
      ${q.type === 'drag' ? `<p class="xp-hint">Drag each option into the answer area (or tap an option, then tap a blank). Tap a filled blank to empty it.</p>
        <div class="xp-pool">${q.choices.map((c, j) => `<span class="xp-chip ${st.pickChip === j ? 'on' : ''}" draggable="true" data-chip="${j}" data-x="chip">${esc(plain(c))}</span>`).join('')}</div>` : ''}`;
  }
  function calcView() {
    const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
    return `<div class="xp-pop xp-calc"><div class="xp-pop-head">Calculator<button data-x="pop" aria-label="Close">×</button></div>
      <div class="xp-calc-screen">${esc(st.calc.show)}</div>
      <div class="xp-calc-keys"><button data-x="key" data-k="C" class="wide">C</button><button data-x="key" data-k="±">±</button><button data-x="key" data-k="%">%</button>${keys.map(k => `<button data-x="key" data-k="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : ''}">${k}</button>`).join('')}</div></div>`;
  }
  function notesView() {
    return `<div class="xp-pop xp-notes"><div class="xp-pop-head">My Notes<button data-x="pop" aria-label="Close">×</button></div>
      <textarea id="xp-notes" placeholder="Scratch paper: only you see this, and it isn’t saved.">${esc(st.notes)}</textarea></div>`;
  }
  function confirmView() {
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
    if (st.sending) return `<div class="xp-intro"><div class="xp-intro-card"><h1>Submitting…</h1></div></div>`;
    return `<div class="xp-intro"><div class="xp-intro-card">
      ${c.preview ? '<p class="xp-preview-tag">Preview: nothing was saved.</p>' : ''}
      <h1>${esc(c.title)}</h1>
      ${st.timeUp ? '<p class="xp-meta">Time ran out, so it was submitted with your answers so far.</p>' : ''}
      <div class="xp-score ${r.passed === false ? 'fail' : r.passed ? 'pass' : ''}"><b>${r.pct != null ? r.pct + '%' : ''}</b><span>${r.score != null ? r.score + ' of ' + r.total + ' correct' : esc(r.error || '')}</span>
        ${r.passed != null ? `<span>${r.passed ? 'Passed' : 'Not passed yet'}${c.passMark ? ' (' + c.passMark + '% to pass)' : ''}</span>` : ''}</div>
      <p class="xp-meta">Time: ${clock(st.took || 0)}</p>
      ${r.review ? `<details class="xp-review"><summary>Review answers (preview only: students don’t see this)</summary>${r.review}</details>` : ''}
      <div class="xp-intro-btns"><button class="xp-btn primary" data-x="quit">Close</button></div></div></div>`;
  }

  /* ---------- Doing things ---------- */
  function start() {
    st.phase = 'test'; st.started = Date.now();
    tick = setInterval(() => {
      if (!st || st.phase !== 'test') return;
      if (st.cfg.kind === 'exam' && left() <= 0) { st.timeUp = true; send(); return; }
      const t = root.querySelector('.xp-time');
      if (t) { t.textContent = clock(st.cfg.kind === 'exam' ? left() : elapsed()); t.classList.toggle('low', st.cfg.kind === 'exam' && left() < 300); }
    }, 1000);
    draw();
  }
  async function send() {
    if (st.sending || st.phase === 'done') return;
    clearInterval(tick);
    st.took = elapsed(); st.phase = 'done'; st.sending = true; st.pop = null; draw();
    try { st.result = await st.cfg.onSubmit(JSON.parse(JSON.stringify(st.ans)), { seconds: Math.round(st.took), timeUp: !!st.timeUp }); }
    catch (e) { st.result = { error: 'Couldn’t submit: ' + e.message }; }
    st.sending = false; draw();
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
    if (x === 'quit') { if (st.cfg.onClose) st.cfg.onClose(); close(); return; }
    if (x === 'next' && st.i < st.qs.length - 1) { st.i++; st.pickChip = null; }
    else if (x === 'prev' && st.i > 0) { st.i--; st.pickChip = null; }
    else if (x === 'go') { st.i = Number(b.dataset.i); st.pickChip = null; if (st.pop === 'confirm') st.pop = null; }
    else if (x === 'up' || x === 'down') { const l = root.querySelector('.xp-nav-list'); if (l) l.scrollBy({ top: x === 'up' ? -200 : 200, behavior: 'smooth' }); return; }
    else if (x === 'flag') st.flags.has(q.id) ? st.flags.delete(q.id) : st.flags.add(q.id);
    else if (x === 'menu') st.hide = !st.hide;
    else if (x === 'calc' || x === 'notes') st.pop = st.pop === x ? null : x;
    else if (x === 'pop') st.pop = null;
    else if (x === 'key') { calcKey(b.dataset.k); return; }
    else if (x === 'submit') st.pop = 'confirm';
    else if (x === 'send') { send(); return; }
    else if (x === 'chip') { const j = Number(b.dataset.chip); st.pickChip = st.pickChip === j ? null : j; }
    else if (x === 'blank') {
      const k = Number(b.dataset.blank);
      if (st.pickChip != null) { place(k, st.pickChip); return; }
      const v = (st.ans[q.id] || []).slice(); if (v[k] != null) { v[k] = null; st.ans[q.id] = v; }
    }
    draw();
    if (x === 'next' || x === 'prev' || x === 'go') { const cur = root.querySelector('.xp-nav-list .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' }); const m = root.querySelector('.xp-main'); if (m) m.scrollTop = 0; }
  }
  function onChange(e) {
    const t = e.target, q = st && st.qs[st.i];
    if (!t.dataset || !st) return;
    if (t.dataset.x === 'agree') { st.agree = t.checked; draw(); return; }
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
    if (st.pop) return;
    if (e.key === 'ArrowRight' && st.i < st.qs.length - 1) { st.i++; draw(); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowLeft' && st.i > 0) { st.i--; draw(); e.preventDefault(); e.stopPropagation(); }
  }
  const ICON = {
    calc: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h0M14 11h2M8 15h2M12 15h0M14 15h2M8 18h2M14 18h2"/></svg>',
    notes: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  };
  return { open, close, isOpen: () => !!st };
})();

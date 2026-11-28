/* Practice for the NREMT (Study Mode + NREMT Simulation): the home page, the study-session setup, the simulation's start
   page and Past attempts. Used by Admin's Test Bank preview now and by the Student Portal later. Like exam-player.js it
   never sees questions or answer keys: whoever opens it picks the questions and runs the test (ExamPlayer).

   Practice.open({
     preview, info (html),                       // Admin only: says so on screen, nothing saved; ⓘ shows info
     cats: [{ key, label, total, spec, fresh }], // fresh = not answered yet; spec = specialty-style ones in total
     modules: [{ m, chapters: [{ cid, n, title, total, spec, fresh }] }],
     attempts: [{ at, mode: 'study' | 'sim', label, total, right, pct, secs, passed, sample, canReview }],
     onStudy(settings), onSim(), onReview(attemptIndex), onClose(),
   })
   settings = { by: 'cat' | 'ch', cats: [keys], chapters: [cids], count, cases (specialty-style on), wrong, timer (stopwatch shown) }
   Practice.refresh({ cats, modules, attempts }) after a test ends. */
const Practice = (() => {
  let st = null, root = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString();
  const clock = s => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const COUNTS = [10, 25, 50, 70, 100, 120];

  function open(cfg) {
    close();
    st = { cfg, page: 'home', s: { by: 'cat', cats: new Set(cfg.cats.map(c => c.key)), chapters: new Set(), count: 10, cases: true, wrong: false, timer: true }, openMods: new Set() };
    root = document.createElement('div');
    root.className = 'xp-root pr-root';
    document.body.appendChild(root);
    document.body.classList.add('pr-open');
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    draw();
  }
  function close() {
    if (root) root.remove();
    root = null; st = null;
    document.body.classList.remove('pr-open');
    document.removeEventListener('keydown', onKey, true);
  }
  // Escape closes the ⓘ pop-up (not while a test is open on top).
  function onKey(e) { if (e.key === 'Escape' && st && st.info && !(window.ExamPlayer && ExamPlayer.isOpen())) { st.info = false; draw(); e.stopPropagation(); } }
  function refresh(data) { if (!st) return; Object.assign(st.cfg, data); if (st.page !== 'past') st.page = 'home'; draw(); } // (after a session: back to the home page, with the new score)
  function draw() {
    if (!root) return;
    const page = st.page === 'study' ? studyView() : st.page === 'sim' ? simView() : st.page === 'past' ? pastView() : homeView();
    root.innerHTML = `<div class="pr"><header class="pr-head"><div class="pr-head-in">
        ${st.page === 'home' ? '' : `<button class="pr-back" data-p="home" aria-label="Back">←</button>`}
        <div><div class="pr-title">${st.page === 'study' ? 'Study Mode' : st.page === 'sim' ? 'NREMT Simulation' : st.page === 'past' ? 'Past attempts' : 'NREMT Practice'}</div>
          ${st.cfg.preview ? '<div class="pr-sub">Previewing as student · nothing is saved</div>' : ''}</div>
        <span class="pr-head-btns">${st.cfg.info ? `<button class="pr-i ${st.info ? 'on' : ''}" data-p="info" aria-label="About this page" aria-expanded="${!!st.info}">i</button>` : ''}
        <button class="pr-x" data-p="close" aria-label="Close">×</button></span></div></header>
      <main class="pr-main">${page}</main>
      ${st.info ? `<div class="pr-info-veil" data-p="info"></div><div class="pr-info" role="dialog" aria-label="About NREMT Practice"><h2>About NREMT Practice</h2>${st.cfg.info}</div>` : ''}</div>`;
  }

  /* ---------- Home ---------- */
  function homeView() {
    const c = st.cfg, total = c.cats.reduce((a, x) => a + x.total, 0), fresh = c.cats.reduce((a, x) => a + x.fresh, 0);
    const sims = c.attempts.filter(a => a.mode === 'sim'), last = sims[sims.length - 1];
    return `<div class="pr-wrap">
      <div class="pr-modes">
        <section class="pr-mode"><div class="pr-mode-ic">${ICON.book}</div><h2>Study Mode</h2>
          <p>Pick the topics and how many questions. Check each answer as you go: you’ll see the right answer and the page to read.</p>
          <button class="xp-btn primary" data-p="study">Set up a study session</button></section>
        <section class="pr-mode sim"><div class="pr-mode-ic">${ICON.clock}</div><h2>NREMT Simulation</h2>
          <p>70 to 120 questions in 2 hours, like the real exam. No going back. It ends as soon as it’s clear you’re above or below 80%.</p>
          <button class="xp-btn primary" data-p="sim">Start a simulation</button></section>
      </div>
      <section class="pr-card"><div class="pr-card-head"><h2>Your progress</h2>${c.attempts.length ? `<button class="pr-link" data-p="past">Past attempts →</button>` : ''}</div>
        <div class="pr-stats">
          <div><b>${num(total - fresh)}</b><span>of ${num(total)} questions answered</span></div>
          <div><b>${c.attempts.length}</b><span>practice session${c.attempts.length === 1 ? '' : 's'}</span></div>
          <div><b class="${last ? (last.passed ? 'pass' : 'fail') : ''}">${last ? last.pct + '%' : '–'}</b><span>${last ? 'last simulation · ' + (last.passed ? 'passed' : 'not passed yet') : 'no simulation yet'}</span></div>
        </div>
        ${c.attempts.length ? chart(c.attempts.slice(-12)) : '<p class="pr-muted">Your scores will show here after your first session.</p>'}
      </section></div>`;
  }

  /* ---------- Study setup ---------- */
  const avail = () => {
    const c = st.cfg, s = st.s, take = x => x.total - (s.cases ? 0 : x.spec);
    if (s.by === 'cat') return c.cats.filter(x => s.cats.has(x.key)).reduce((a, x) => a + take(x), 0);
    return c.modules.flatMap(m => m.chapters).filter(x => s.chapters.has(x.cid)).reduce((a, x) => a + take(x), 0);
  };
  function studyView() {
    const c = st.cfg, s = st.s, n = howMany();
    const box = (on, p, attrs, label, counts) => `<label class="pr-check ${on ? 'on' : ''}"><input type="checkbox" data-p="${p}" ${attrs} ${on ? 'checked' : ''}><span>${label}</span>${counts ? `<span class="pr-count">${counts}</span>` : ''}</label>`;
    const cnt = x => `${num(x.fresh)} new / ${num(x.total)}`;
    const allCats = c.cats.every(x => s.cats.has(x.key));
    const pick = s.by === 'cat'
      ? `<div class="pr-grid">${box(allCats, 'allcats', '', '<b>All categories</b>', cnt({ fresh: c.cats.reduce((a, x) => a + x.fresh, 0), total: c.cats.reduce((a, x) => a + x.total, 0) }))}
          ${c.cats.map(x => box(s.cats.has(x.key), 'cat', `data-k="${x.key}"`, esc(x.label), cnt(x))).join('')}</div>`
      : `<div class="pr-mods">${c.modules.map(m => { const ids = m.chapters.map(x => x.cid), on = ids.every(id => s.chapters.has(id)), some = ids.some(id => s.chapters.has(id)), open = st.openMods.has(m.m);
          return `<div class="pr-mod"><div class="pr-mod-row">${box(on, 'mod', `data-m="${m.m}" ${!on && some ? 'data-some="1"' : ''}`, `<b>Module ${m.m}</b> <span class="pr-muted">Ch ${m.chapters[0].n}–${m.chapters[m.chapters.length - 1].n}</span>`, cnt({ fresh: m.chapters.reduce((a, x) => a + x.fresh, 0), total: m.chapters.reduce((a, x) => a + x.total, 0) }))}
            <button class="pr-fold" data-p="fold" data-m="${m.m}" aria-expanded="${open}">${open ? 'Hide chapters' : (some && !on ? ids.filter(id => s.chapters.has(id)).length + ' picked · ' : '') + 'Pick chapters'}</button></div>
            ${open ? `<div class="pr-grid chs">${m.chapters.map(x => box(s.chapters.has(x.cid), 'ch', `data-c="${x.cid}"`, `${x.n}. ${esc(x.title)}`, cnt(x))).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
    // Two columns (what to study | how many + Start), so it fits one screen; phones stack them.
    return `<div class="pr-wrap pr-study"><section class="pr-card pr-pick">
      <div class="pr-card-head"><h2>What to study</h2><span class="xp-seg"><button data-p="by" data-v="cat" class="${s.by === 'cat' ? 'on' : ''}">By category</button><button data-p="by" data-v="ch" class="${s.by === 'ch' ? 'on' : ''}">By module &amp; chapter</button></span></div>
      <p class="pr-muted small">“New” = questions you haven’t answered yet. New ones come first.</p>
      ${pick}</section>
      <section class="pr-card pr-side"><h2>How many questions</h2>
        <div class="pr-chips">${COUNTS.map(k => `<button class="${s.count === k ? 'on' : ''}" data-p="count" data-v="${k}">${k}</button>`).join('')}</div>
        <div class="pr-opts">
          ${toggle('timer', s.timer, 'Timer', '')}
          ${toggle('cases', s.cases, 'Specialty-style questions', 'Select all that apply, drag and drop, dropdowns')}
          ${toggle('wrong', s.wrong, 'Include questions I got wrong before', 'Mixed in with new ones.')}
        </div>
        <button class="xp-btn primary pr-start" data-p="gostudy" ${n ? '' : 'disabled'}>${startLabel(n)}</button></section></div>`;
  }
  const howMany = () => Math.min(st.s.count, avail());
  const startLabel = n => n ? `Start (${num(n)} question${n === 1 ? '' : 's'})` : 'Pick something to study';
  const toggle = (k, on, label, sub) => `<label class="pr-tog"><input type="checkbox" data-p="opt" data-k="${k}" ${on ? 'checked' : ''}><span class="pr-sw"></span><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;

  /* ---------- Simulation start ---------- */
  function simView() {
    return `<div class="pr-wrap narrow"><section class="pr-card">
      <h2>How it works</h2>
      <ul class="pr-rules">
        <li><b>70 to 120 questions, 2 hours.</b> Questions come from every category in your course question bank, in proportions modeled on the NREMT.</li>
        <li><b>No going back.</b> Answer each question to move on, like the real exam. Calculator and My Notes are there if you need them.</li>
        <li><b>It ends when it knows.</b> After question 70, it stops as soon as it’s clear you’re above or below 80%. Otherwise it goes to 120.</li>
        <li><b>If time runs out</b> before question 70, it counts as not passed.</li>
        <li>At the end: your score, how you did in each category, and a review of what you missed.</li>
      </ul>
      <p class="pr-muted small">Find a quiet spot and give yourself the full 2 hours.</p></section>
      <div class="pr-go"><button class="xp-btn" data-p="home">Back</button><button class="xp-btn primary" data-p="gosim">Start the simulation</button></div></div>`;
  }

  /* ---------- Past attempts ---------- */
  function chart(list) {
    const W = 640, H = 190, L = 34, R = 10, T = 12, B = 26, n = list.length;
    const x = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1), y = p => T + (100 - p) * (H - T - B) / 100;
    const line = list.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(a.pct).toFixed(1)}`).join(' ');
    return `<svg class="pr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores over time">
      ${[0, 50, 100].map(p => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="g"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${y(80)}" y2="${y(80)}" class="pass"/><text x="${L + 4}" y="${y(80) + 14}" class="pass-t">80% to pass</text>
      ${n > 1 ? `<path d="${line}" class="ln"/>` : ''}
      ${list.map((a, i) => `<circle cx="${x(i)}" cy="${y(a.pct)}" r="5.5" class="${a.mode}"><title>${day(a.at)} · ${a.mode === 'sim' ? 'Simulation' : 'Study'} · ${a.pct}%</title></circle>`).join('')}
      ${list.map((a, i) => i === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${n === 1 ? 'middle' : i ? 'end' : 'start'}">${new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>` : '').join('')}
    </svg><p class="pr-legend"><span class="dot sim"></span>NREMT Simulation <span class="dot study"></span>Study Mode</p>`;
  }
  function pastView() {
    const a = st.cfg.attempts.map((x, i) => [x, i]).reverse();
    if (!a.length) return `<div class="pr-wrap narrow"><section class="pr-card"><p class="pr-muted">Nothing yet. Your sessions will show here.</p></section></div>`;
    return `<div class="pr-wrap"><section class="pr-card">${chart(st.cfg.attempts.slice(-20))}</section>
      <section class="pr-card pr-table-card"><table class="pr-table"><thead><tr><th>Date</th><th>Mode</th><th>Topics</th><th>Score</th><th>Time</th><th>Per question</th></tr></thead><tbody>
      ${a.map(([x, i]) => `<tr class="${x.canReview ? 'go' : ''}" ${x.canReview ? `data-p="rev" data-i="${i}" tabindex="0"` : ''}>
        <td>${day(x.at)}${x.sample ? ' <span class="pr-tag">Sample</span>' : ''}</td>
        <td>${x.mode === 'sim' ? 'Simulation' : 'Study'}</td><td class="pr-topics">${esc(x.label)}</td>
        <td><b class="${x.mode === 'sim' ? (x.passed ? 'pass' : 'fail') : ''}">${x.pct}%</b> <span class="pr-muted">${x.right}/${x.total}${x.mode === 'sim' ? ' · ' + (x.passed ? 'Passed' : 'Not passed') : ''}</span></td>
        <td>${clock(x.secs)}</td><td>${clock(x.total ? x.secs / x.total : 0)}</td></tr>`).join('')}</tbody></table>
      <p class="pr-muted small">Tap a session to review it.</p></section></div>`;
  }

  /* ---------- Doing things ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-p]');
    if (!b || !st) return;
    const p = b.dataset.p, s = st.s, c = st.cfg;
    if (b.tagName === 'INPUT') {
      if (p === 'allcats') { s.cats = b.checked ? new Set(c.cats.map(x => x.key)) : new Set(); }
      else if (p === 'cat') b.checked ? s.cats.add(b.dataset.k) : s.cats.delete(b.dataset.k);
      else if (p === 'mod') { const m = c.modules.find(x => String(x.m) === b.dataset.m); m.chapters.forEach(x => b.checked ? s.chapters.add(x.cid) : s.chapters.delete(x.cid)); }
      else if (p === 'ch') b.checked ? s.chapters.add(b.dataset.c) : s.chapters.delete(b.dataset.c);
      else if (p === 'opt') s[b.dataset.k] = b.checked;
      keep(); return;
    }
    if (b.tagName === 'LABEL') return;
    if (p === 'info') { st.info = !st.info; keep(); return; }
    if (p === 'close') { const done = c.onClose; close(); if (done) done(); return; }
    if (p === 'home' || p === 'study' || p === 'sim' || p === 'past') { st.page = p; draw(); root.querySelector('.pr-main').scrollTop = 0; return; }
    if (p === 'by') s.by = b.dataset.v;
    else if (p === 'count') s.count = Number(b.dataset.v);
    else if (p === 'fold') st.openMods.has(Number(b.dataset.m)) ? st.openMods.delete(Number(b.dataset.m)) : st.openMods.add(Number(b.dataset.m));
    else if (p === 'gostudy') { if (avail()) c.onStudy({ by: s.by, cats: [...s.cats], chapters: [...s.chapters], count: howMany(), cases: s.cases, wrong: s.wrong, timer: s.timer }); return; }
    else if (p === 'gosim') { c.onSim(); return; }
    else if (p === 'rev') { c.onReview(Number(b.dataset.i)); return; }
    keep();
  }
  // Redraw without losing the scroll spot.
  function keep() { const m = root.querySelector('.pr-main'), y = m ? m.scrollTop : 0; draw(); const n = root.querySelector('.pr-main'); if (n) n.scrollTop = y; }
  const ICON = {
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5c-.8 0-1.5.6-1.5 1.3z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5.6 1.5 1.3z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 3h5"/></svg>',
  };
  return { open, close, refresh, isOpen: () => !!st };
})();

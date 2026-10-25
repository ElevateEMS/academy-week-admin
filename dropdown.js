/* ---------- Dropdowns ----------
   Every <select> keeps its look when closed, but opens our own list (app colors) instead of the
   browser's gray/blue one. The select itself doesn't take clicks (html.dd-on in styles.css); a click
   on it (or its label) opens the list, and picking sets select.value and fires input + change, so
   all the existing handlers (data-change, data-draft, data-emtpl…) work as before.
   Optional on a select: data-dd-foot="Link text" + data-dd-foot-act="someAct" adds a small link at
   the bottom of the list that runs act(someAct) and reopens the list (the cohort menu's former & test). */
(() => {
  document.documentElement.classList.add('dd-on');
  let pop = null, cur = null, active = -1, items = [];

  const usable = s => s && s.tagName === 'SELECT' && !s.multiple && !s.disabled;
  // The select under a click: the target itself, the select a label is for, or one inside the target at that point.
  function hitSelect(e) {
    const t = e.target;
    if (!t || !t.closest) return null;
    if (usable(t)) return t;
    const lab = t.closest('label');
    if (lab && usable(lab.control) && !t.closest('input, textarea, button, a')) return lab.control;
    if (e.clientX == null || t === document.body || t === document.documentElement) return null;
    for (const s of t.querySelectorAll('select')) {
      if (!usable(s)) continue;
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return s;
    }
    return null;
  }

  function close(refocus) {
    if (!pop) return;
    pop.remove(); pop = null; items = []; active = -1;
    if (refocus && cur && cur.isConnected) cur.focus({ preventScroll: true });
    cur = null;
  }

  function open(sel) {
    close();
    cur = sel;
    pop = document.createElement('div');
    pop.className = 'dd-pop';
    pop.setAttribute('role', 'listbox');
    let html = '', i = 0;
    const row = o => {
      const idx = i++;
      // A "+ add …" prompt with no value is the select's label, not a choice.
      if (o.value === '' && /^\s*\+/.test(o.text)) return '';
      const on = o.selected;
      return `<button type="button" class="dd-opt${on ? ' on' : ''}" role="option" aria-selected="${on}" data-i="${idx}" ${o.disabled ? 'disabled' : ''}>`
        + `<span class="dd-check">${on ? '✓' : ''}</span><span>${esc(o.text)}</span></button>`;
    };
    [...sel.children].forEach(c => {
      if (c.tagName === 'OPTGROUP') html += `<div class="dd-group">${esc(c.label)}</div>` + [...c.children].map(row).join('');
      else if (c.tagName === 'OPTION') html += row(c);
    });
    if (sel.dataset.ddFoot) html += `<div class="dd-foot"><button type="button" class="link" data-dd-foot>${esc(sel.dataset.ddFoot)}</button></div>`;
    pop.innerHTML = html || '<div class="dd-group">Nothing to pick</div>';
    document.body.appendChild(pop);
    items = [...pop.querySelectorAll('.dd-opt:not([disabled])')];
    place();
    const on = pop.querySelector('.dd-opt.on');
    active = on ? items.indexOf(on) : -1;
    if (on) on.scrollIntoView({ block: 'nearest' });
    paint();
  }

  // Under the select (or above it when there's more room there), never off screen.
  function place() {
    if (!pop || !cur) return;
    const r = cur.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, gap = 4, pad = 8;
    pop.style.minWidth = Math.min(r.width, vw - pad * 2) + 'px';
    const below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
    const h = pop.scrollHeight, up = h > below && above > below;
    pop.style.maxHeight = Math.max(120, Math.min(360, up ? above : below)) + 'px';
    const ph = pop.offsetHeight, pw = pop.offsetWidth;
    pop.style.top = (up ? r.top - gap - ph : r.bottom + gap) + 'px';
    pop.style.left = Math.max(pad, Math.min(r.left, vw - pw - pad)) + 'px';
  }

  function paint() {
    items.forEach((b, k) => b.classList.toggle('active', k === active));
    if (items[active]) items[active].scrollIntoView({ block: 'nearest' });
  }

  function choose(idx) {
    let sel = cur;
    if (sel && !sel.isConnected && sel.id) sel = document.getElementById(sel.id); // redrawn while open
    close(true);
    if (!sel || !sel.isConnected) return;
    if (sel.selectedIndex === idx) return;
    sel.selectedIndex = idx;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function footer() {
    const sel = cur, a = sel.dataset.ddFootAct, id = sel.id;
    close();
    if (a && typeof act === 'function') act(a, sel);
    if (id) setTimeout(() => { const s = document.getElementById(id); if (usable(s)) open(s); }, 30); // after the redraw
  }

  // Clicks: on a select (or its label) open the list; inside the list pick; anywhere else close it.
  addEventListener('click', e => {
    if (pop && pop.contains(e.target)) {
      e.stopPropagation(); e.preventDefault();
      const opt = e.target.closest('.dd-opt');
      if (opt && !opt.disabled) choose(Number(opt.dataset.i));
      else if (e.target.closest('[data-dd-foot]')) footer();
      return;
    }
    const s = hitSelect(e);
    if (s) {
      e.stopPropagation(); e.preventDefault();
      if (pop && cur === s) close(true); else { open(s); s.focus({ preventScroll: true }); }
      return;
    }
    if (pop) close();
  }, true);
  // iPhone/iPad: a tap on a select (or its label) would also open Apple's own picker (it opens on the focus
  // the tap causes, before "click"). So a tap is handled at touchend, and its click and focus are cancelled.
  let touch = null;
  addEventListener('touchstart', e => { const t = e.touches[0]; touch = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    if (!t || !touch || Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) return; // a scroll, not a tap
    if (pop && pop.contains(e.target)) return; // (taps inside the list go through as clicks)
    const s = hitSelect({ target: e.target, clientX: t.clientX, clientY: t.clientY });
    if (!s) return;
    e.preventDefault(); // no click, no focus → no Apple picker
    if (pop && cur === s) close(); else open(s);
  }, { capture: true, passive: false });
  // (and if a select gets focus some other way on a touch screen, let go of it so the picker doesn't open)
  addEventListener('focusin', e => { if (usable(e.target) && matchMedia('(hover: none)').matches) e.target.blur(); }, true);

  // (the list isn't part of the page, so its presses mustn't reach the page's drag/highlight handlers)
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(t =>
    addEventListener(t, e => { if (pop && pop.contains(e.target)) { e.stopPropagation(); if (t === 'mousedown') e.preventDefault(); } }, true));

  addEventListener('keydown', e => {
    if (!pop) {
      // A focused select opens the list instead of the browser's.
      if (usable(e.target) && (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key))) { e.preventDefault(); e.stopPropagation(); open(e.target); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (!items.length) return;
      active = active < 0 ? 0 : (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      if (items[active]) choose(Number(items[active].dataset.i)); return;
    }
  }, true);

  // Scrolling the page or resizing closes it (scrolling inside the list doesn't).
  addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());

  // The pointer over a select (it doesn't take the mouse itself, so it can't set its own cursor).
  let hov = false;
  addEventListener('mousemove', e => {
    const on = !!(e.target && e.target.querySelector && (usable(e.target) || e.target.querySelector('select')) && hitSelect(e));
    if (on !== hov) { hov = on; document.documentElement.classList.toggle('dd-hover', on); }
  }, { passive: true });
})();

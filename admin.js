/* Admin page (header → logo or Admin): the business side, not tied to a cohort. Shared by Bella and Nick.
   Firestore:
     meta/admin        { info: { started, insurance, phone, portal, website }, links: [{ id, name, url }] }
     adminTodos/{id}   { text, done, created, doneAt }
     adminDates/{id}   { date (YYYY-MM-DD), text, created }
     adminNotes/{id}   { text, color, created }   (sticky notes)
   Quick Links and the portal/website open in a big panel inside the app, with "Open in Chrome ↗".
   Google Sheets only show in the panel when Google allows it (signed in to Google in this browser);
   otherwise the panel is blank or asks to sign in, and Open in Chrome is the way. */

const NOTE_COLORS = ['yellow', 'blush', 'sage', 'blue', 'paper'];
const ARROW = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5c0 .8-.7 1.5-1.5 1.5h-11c-.8 0-1.5-.7-1.5-1.5v-11C4 6.7 4.7 6 5.5 6H10"/></svg>';

function adminWatch() {
  return [
    Store.watch('meta/admin', d => { S.admin = d || {}; render(); }),
    Store.watch('adminTodos', list => { S.adminTodos = list; render(); }),
    Store.watch('adminDates', list => { S.adminDates = list; render(); }),
    Store.watch('adminNotes', list => { S.adminNotes = list; render(); }),
  ];
}
const adminInfo = () => ({ ...DEFAULTS.adminInfo, ...((S.admin && S.admin.info) || {}) });
const adminLinks = () => (S.admin && S.admin.links) || DEFAULTS.adminLinks;
const fullUrl = u => { u = String(u || '').trim(); return !u || /^https?:\/\//i.test(u) ? u : 'https://' + u; };
const isGoogle = u => /^https:\/\/(docs|drive|sheets)\.google\.com\//i.test(u);

function adminView() {
  return `<div class="board admin-board">
    <div class="board-col">${adminInfoBox()}${adminLinksBox()}</div>
    <div class="board-col">${adminTodoBox()}${adminDatesBox()}</div>
    <div class="board-col">${adminNotesBox()}</div>
  </div>`;
}
const adminHead = (title, extra = '') => `<div class="box-head admin-head"><h2>${title}</h2>${extra ? `<span class="head-actions">${extra}</span>` : ''}</div>`;

/* ---------- Business Info ---------- */
// "May 1, 2024 · 2 yrs 5 mos in business"
function inBusiness(iso) {
  const a = parseIso(iso), b = new Date();
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) m--;
  if (m < 0) return '';
  const y = Math.floor(m / 12), mo = m % 12;
  const parts = [y ? y + (y === 1 ? ' yr' : ' yrs') : '', mo ? mo + (mo === 1 ? ' mo' : ' mos') : ''].filter(Boolean);
  return parts.length ? parts.join(' ') + ' in business' : 'just started';
}
function adminInfoBox() {
  const i = adminInfo();
  const none = '<span class="tbd">Not added</span>';
  const row = (label, val) => `<div class="info-row"><span>${label}</span><b>${val}</b></div>`;
  const site = (name, url) => url ? `<button class="link-btn" data-act="adminOpenUrl" data-name="${esc(name)}" data-url="${esc(fullUrl(url))}">${esc(url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</button>` : none;
  return `<section class="box shaded admin-info">
    ${adminHead('Business Info', `<button class="eye" data-act="adminInfoOpen" title="Edit business info" aria-label="Edit business info">${ICONS.pencil}</button>`)}
    <div class="info-rows">
      ${row('Started', isIsoDate(i.started) ? `${esc(longDate(i.started))}<span class="muted small info-sub">${inBusiness(i.started)}</span>` : none)}
      ${row('Insurance', i.insurance ? esc(i.insurance) : none)}
      ${row('Phone', i.phone ? `<a href="tel:${esc(i.phone.replace(/[^\d+]/g, ''))}">${esc(i.phone)}</a>` : none)}
      ${row('Student Portal', site('Student Portal', i.portal))}
      ${row('Website', site('Website', i.website))}
    </div>
  </section>`;
}
function adminInfoModal() {
  const f = (k, label, type = 'text', ph = '') => `<label class="field">${label}
    <input id="ai-${k}" type="${type}" data-draft="ai-${k}" value="${esc(S.drafts['ai-' + k] ?? '')}" placeholder="${ph}" autocomplete="off"></label>`;
  return `<div class="overlay" data-act="adminInfoClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Business Info</h2><button class="x big" data-act="adminInfoClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      ${f('started', 'Business start date', 'date')}
      ${f('insurance', 'Insurance company')}
      ${f('phone', 'Business phone', 'tel', '(804) 555-0100')}
      ${f('portal', 'Student Portal link', 'url', 'student.elevateemsacademy.com')}
      ${f('website', 'Website link', 'url', 'www.elevateemsacademy.com')}
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="adminInfoSave">Save</button></div>
  </div></div>`;
}

/* ---------- Quick Links ---------- */
function adminLinksBox() {
  const links = adminLinks();
  const add = S.adminLinkAdd ? `<div class="link-add">
      <input id="al-name" data-draft="al-name" placeholder="Name (e.g. Pirate Ship)" value="${esc(S.drafts['al-name'] || '')}" autocomplete="off">
      <input id="al-url" data-draft="al-url" data-add="adminLink" placeholder="Link (paste it here)" value="${esc(S.drafts['al-url'] || '')}" autocomplete="off">
      <div class="link-add-foot"><button class="link" data-act="adminLinkCancel">Cancel</button><button class="btn small primary" data-act="adminLinkSave">Add link</button></div>
    </div>` : '';
  return `<section class="box shaded admin-links">
    ${adminHead('Quick Links', `<button class="add-plus small-plus" data-act="adminLinkAdd" title="Add a link" aria-label="Add a link">+</button>`)}
    ${add}
    <ul class="checks quick-links">${links.map(l => `<li>
      <button class="link-btn ql-name" data-act="adminOpen" data-id="${esc(l.id)}">${esc(l.name)}</button>
      <a class="eye" href="${esc(l.url)}" target="_blank" rel="noopener" title="Open in Chrome" aria-label="Open ${esc(l.name)} in Chrome">${ARROW}</a>
      <button class="x" data-act="adminLinkDel" data-id="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">×</button></li>`).join('') || '<li class="empty">No links yet.</li>'}</ul>
    <p class="muted small ql-foot">Opens here in the app. ${ARROW.replace('<svg', '<svg class="inline-ic"')} opens it in Chrome instead.</p>
  </section>`;
}
function adminPanel() {
  const p = S.adminPanel;
  return `<div class="overlay" data-act="adminPanelClose"><div class="modal pdf admin-panel" data-stop>
    <div class="modal-head"><h2>${esc(p.name)}</h2><span class="panel-actions">
      <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener" data-act="adminPanelClose">Open in Chrome ↗</a>
      <button class="x big" data-act="adminPanelClose" aria-label="Close">×</button></span></div>
    ${isGoogle(p.url) ? '<p class="panel-note">Blank, or asking you to sign in? Google doesn’t always allow its pages inside another app. Use <b>Open in Chrome</b>.</p>' : ''}
    <iframe src="${esc(p.url)}" title="${esc(p.name)}" allow="clipboard-read; clipboard-write"></iframe>
  </div></div>`;
}

/* ---------- To Do ---------- */
function adminTodoBox() {
  const open = S.adminTodos.filter(t => !t.done).sort((a, b) => (a.created || 0) - (b.created || 0));
  const done = S.adminTodos.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return `<section class="box admin-todo">
    ${adminHead('To Do', done.length ? '<button class="link" data-act="adminTodoClear">Clear checked</button>' : '')}
    <div class="add-row"><input id="ad-todo" data-draft="ad-todo" data-add="adminTodo" placeholder="+ to do" value="${esc(S.drafts['ad-todo'] || '')}"></div>
    <ul class="checks">${[...open, ...done].map(t => `<li class="${t.done ? 'done' : ''}">
      <label>${circle(t.done, `data-act="adminTodo" data-id="${t.id}"`)}<span><span class="txt">${esc(t.text)}</span></span></label>
      <button class="x" data-act="adminTodoDel" data-id="${t.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>
  </section>`;
}

/* ---------- Key Dates ---------- */
function daysAway(iso) {
  const n = Math.round((parseIso(iso) - parseIso(todayIso())) / 864e5);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? 'in ' + n + ' days' : -n + ' days ago';
}
function adminDatesBox() {
  const t = todayIso(), byDate = (a, b) => a.date.localeCompare(b.date);
  const next = S.adminDates.filter(x => x.date >= t).sort(byDate);
  const past = S.adminDates.filter(x => x.date < t).sort(byDate).reverse();
  const item = x => {
    const away = daysAway(x.date), soon = x.date >= t && Math.round((parseIso(x.date) - parseIso(t)) / 864e5) <= 14;
    return `<li class="${x.date < t ? 'past' : ''}"><span class="kd-date">${esc(parseIso(x.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(x.date.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) }))}</span>
      <span class="kd-text">${esc(x.text)}</span><span class="kd-away ${soon ? 'soon' : ''}">${away}</span>
      <button class="x" data-act="adminDateDel" data-id="${x.id}" aria-label="Delete">×</button></li>`;
  };
  return `<section class="box admin-dates">
    ${adminHead('Key Dates', past.length ? `<button class="link" data-act="adminPastToggle">${S.adminShowPast ? 'Hide' : 'Show'} past</button>` : '')}
    <div class="kd-add">${datePicker('ad-date')}<input id="ad-text" data-draft="ad-text" data-add="adminDate" placeholder="What’s happening? Enter to add" value="${esc(S.drafts['ad-text'] || '')}" autocomplete="off"></div>
    <ul class="checks key-dates">${next.map(item).join('') || '<li class="empty">No dates coming up.</li>'}${S.adminShowPast ? past.map(item).join('') : ''}</ul>
  </section>`;
}

/* ---------- Sticky Notes ---------- */
function adminNotesBox() {
  const notes = [...S.adminNotes].sort((a, b) => (b.created || 0) - (a.created || 0));
  return `<section class="box admin-notes">
    ${adminHead('Sticky Notes', '<button class="add-plus small-plus" data-act="adminNoteAdd" title="New sticky note" aria-label="New sticky note">+</button>')}
    <div class="stickies">${notes.map(n => {
      const id = 'an-' + n.id;
      return `<div class="sticky c-${NOTE_COLORS.includes(n.color) ? n.color : 'yellow'}">
        <textarea id="${id}" data-draft="${id}" data-anote="${n.id}" data-grow rows="3" placeholder="Type a note">${esc(S.drafts[id] ?? n.text ?? '')}</textarea>
        <div class="sticky-foot"><button class="dot" data-act="adminNoteColor" data-id="${n.id}" title="Change color" aria-label="Change color"></button>
          <button class="x" data-act="adminNoteDel" data-id="${n.id}" aria-label="Delete note">×</button></div>
      </div>`;
    }).join('') || '<p class="empty">No sticky notes. Tap + to add one.</p>'}</div>
  </section>`;
}
const noteSaveTimers = {};
function saveStickySoon(nid, id) {
  clearTimeout(noteSaveTimers[id]);
  noteSaveTimers[id] = setTimeout(async () => {
    const text = S.drafts[id];
    if (text === undefined) return;
    await Store.set('adminNotes/' + nid, { text });
    if (document.activeElement && document.activeElement.id === id) return; // keep the draft while typing
    if (S.drafts[id] === text) delete S.drafts[id];
  }, 700);
}

/* ---------- Hooks called from app.js ---------- */
function adminModals() {
  return (S.adminInfoEd ? adminInfoModal() : '') + (S.adminPanel ? adminPanel() : '');
}
function adminInput(t) {
  if (!t.dataset.anote) return false;
  S.drafts[t.id] = t.value; grow(t);
  saveStickySoon(t.dataset.anote, t.id);
  return true;
}
function adminEscape() {
  if (S.adminPanel) S.adminPanel = null;
  else if (S.adminInfoEd) S.adminInfoEd = false;
  else if (S.adminLinkAdd) { S.adminLinkAdd = false; delete S.drafts['al-name']; delete S.drafts['al-url']; }
  else return false;
  return true;
}
// Enter in one of the Admin page's add lines.
function adminEnter(t) {
  const a = { adminTodo: 'adminTodoAdd', adminDate: 'adminDateAdd', adminLink: 'adminLinkSave' }[t.dataset.add];
  if (!a) return false;
  adminAct(a, t);
  return true;
}
async function adminAct(a, el = {}) {
  const d = el.dataset || {};
  switch (a) {
    case 'adminOpen': { const l = adminLinks().find(x => x.id === d.id); if (l) { S.adminPanel = { name: l.name, url: fullUrl(l.url) }; render(); } return true; }
    case 'adminOpenUrl': S.adminPanel = { name: d.name, url: d.url }; render(); return true;
    case 'adminPanelClose': S.adminPanel = null; render(); return true;
    case 'adminInfoOpen': {
      const i = adminInfo();
      ['started', 'insurance', 'phone', 'portal', 'website'].forEach(k => { S.drafts['ai-' + k] = i[k] || ''; });
      S.adminInfoEd = true; render(); return true;
    }
    case 'adminInfoClose': S.adminInfoEd = false; render(); return true;
    case 'adminInfoSave': {
      const info = Object.fromEntries(['started', 'insurance', 'phone', 'portal', 'website'].map(k => [k, String(S.drafts['ai-' + k] || '').trim()]));
      info.portal = fullUrl(info.portal); info.website = fullUrl(info.website);
      await Store.set('meta/admin', { info });
      Object.keys(S.drafts).filter(k => k.startsWith('ai-')).forEach(k => delete S.drafts[k]);
      S.adminInfoEd = false; toast('Business info saved.'); render(); return true;
    }
    case 'adminLinkAdd': S.adminLinkAdd = !S.adminLinkAdd; render(); setTimeout(() => { const i = document.getElementById('al-name'); if (i) i.focus(); }, 0); return true;
    case 'adminLinkCancel': S.adminLinkAdd = false; delete S.drafts['al-name']; delete S.drafts['al-url']; render(); return true;
    case 'adminLinkSave': {
      const name = String(S.drafts['al-name'] || '').trim(), url = fullUrl(S.drafts['al-url']);
      if (!name || !url) { toast('Add a name and a link.'); return true; }
      await Store.set('meta/admin', { links: [...adminLinks(), { id: Store.newId(), name, url }] });
      delete S.drafts['al-name']; delete S.drafts['al-url']; S.adminLinkAdd = false; render(); return true;
    }
    case 'adminLinkDel': {
      const l = adminLinks().find(x => x.id === d.id);
      if (!l || !confirm(`Remove ${l.name} from Quick Links?`)) return true;
      await Store.set('meta/admin', { links: adminLinks().filter(x => x.id !== d.id) }); return true;
    }
    case 'adminTodoAdd': {
      const text = String(S.drafts['ad-todo'] || '').trim(); if (!text) return true;
      delete S.drafts['ad-todo'];
      await Store.add('adminTodos', { text, done: false, created: Date.now() }); return true;
    }
    case 'adminTodo': {
      const t = S.adminTodos.find(x => x.id === d.id); if (!t) return true;
      await Store.set('adminTodos/' + t.id, { done: !t.done, doneAt: t.done ? null : Date.now() }); return true;
    }
    case 'adminTodoDel': await Store.del('adminTodos/' + d.id); return true;
    case 'adminTodoClear':
      if (!confirm('Clear the checked to-dos?')) return true;
      await Promise.all(S.adminTodos.filter(t => t.done).map(t => Store.del('adminTodos/' + t.id))); return true;
    case 'adminDateAdd': {
      const text = String(S.drafts['ad-text'] || '').trim(), date = S.drafts['ad-date'] || todayIso();
      if (!text) { toast('Type what the date is for.'); return true; }
      delete S.drafts['ad-text']; delete S.drafts['ad-date'];
      await Store.add('adminDates', { date, text, created: Date.now() }); return true;
    }
    case 'adminDateDel': await Store.del('adminDates/' + d.id); return true;
    case 'adminPastToggle': S.adminShowPast = !S.adminShowPast; render(); return true;
    case 'adminNoteAdd': {
      const id = await Store.add('adminNotes', { text: '', color: 'yellow', created: Date.now() });
      setTimeout(() => { const t = document.getElementById('an-' + id); if (t) t.focus(); }, 50); return true;
    }
    case 'adminNoteColor': {
      const n = S.adminNotes.find(x => x.id === d.id); if (!n) return true;
      const i = NOTE_COLORS.indexOf(n.color);
      await Store.set('adminNotes/' + n.id, { color: NOTE_COLORS[(i + 1) % NOTE_COLORS.length] }); return true;
    }
    case 'adminNoteDel': {
      const n = S.adminNotes.find(x => x.id === d.id);
      if (n && String(n.text || '').trim() && !confirm('Delete this sticky note?')) return true;
      delete S.drafts['an-' + d.id];
      await Store.del('adminNotes/' + d.id); return true;
    }
  }
  return false;
}

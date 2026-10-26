/* Admin page (header → logo or Admin): the business side, not tied to a cohort. Shared by Bella and Nick.
   Firestore:
     meta/admin        { info: { started, insurance, phone, portal, website }, links: [{ id, name, url }] }
     adminTodos/{id}   { text, done, created, doneAt }
     adminDates/{id}   { date (YYYY-MM-DD), text, created }
     adminNotes/{id}   { text, color, created }   (sticky notes)
   Info Requests (website inquiries → reply drafts) live in the Admin Apps Script, not Firebase:
   listInquiries / checkInquiries / saveInquirySettings (sheets.js).
   Quick Links and the portal/website open in a big panel inside the app (nearly the whole window),
   with "Open in Chrome ↗". */

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

// The right column is Sticky Notes or To Do (Setup → Preferences → Admin Page); the other is only hidden.
const adminSide = () => (S.settings && S.settings.adminSide) === 'todo' ? 'todo' : 'notes';
function adminView() {
  return `<div class="board admin-board">
    <div class="board-col">${adminInfoBox()}${adminDatesBox()}</div>
    <div class="board-col">${adminChangesBox()}${adminInquiryBox()}</div>
    <div class="board-col">${adminSide() === 'todo' ? adminTodoBox() : adminNotesBox()}</div>
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
// Business Info fields: [label in the box, label in the edit window, input type, placeholder].
// Plus any you add yourself (meta/admin.custom: [{ id, label, value }], keyed 'c:' + id in the order).
// Their order is yours to set (drag the grip in the edit window); saved as meta/admin.infoOrder.
const INFO_FIELDS = {
  started: ['Started', 'Business start date', 'date', ''],
  phone: ['Phone', 'Business phone', 'tel', '(804) 555-0100'],
  website: ['Website', 'Website link', 'url', 'www.elevateemsacademy.com'],
  portal: ['Student Portal', 'Student Portal link', 'url', 'student.elevateemsacademy.com'],
  insurance: ['Insurance', 'Insurance company', 'text', ''],
  address: ['Address', 'Business address', 'text', 'Street, city, state ZIP'],
  ein: ['EIN', 'EIN', 'text', '12-3456789'],
};
const infoCustom = () => (S.admin && S.admin.custom) || [];
function infoOrder() {
  const keys = [...Object.keys(INFO_FIELDS), ...infoCustom().map(c => 'c:' + c.id)];
  const saved = ((S.admin && S.admin.infoOrder) || []).filter(k => keys.includes(k));
  return [...saved, ...keys.filter(k => !saved.includes(k))];
}
function adminInfoBox() {
  const i = adminInfo();
  const none = '<span class="tbd">Not added</span>';
  const row = (label, val) => `<div class="info-row"><span>${label}</span><b>${val}</b></div>`;
  const site = (name, url) => url ? `<button class="link-btn" data-act="adminOpenUrl" data-name="${esc(name)}" data-url="${esc(fullUrl(url))}">${esc(url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</button>` : none;
  const val = {
    started: isIsoDate(i.started) ? `${esc(longDate(i.started))}<span class="muted small info-sub">${inBusiness(i.started)}</span>` : none,
    phone: i.phone ? `<a href="tel:${esc(i.phone.replace(/[^\d+]/g, ''))}">${esc(i.phone)}</a>` : none,
    website: site('Website', i.website),
    portal: site('Student Portal', i.portal),
    insurance: i.insurance ? esc(i.insurance) : none,
    address: i.address ? esc(i.address) : none,
    ein: i.ein ? esc(i.ein) : none,
  };
  const custom = Object.fromEntries(infoCustom().map(c => [c.id, c]));
  const rowFor = k => {
    if (INFO_FIELDS[k]) return row(INFO_FIELDS[k][0], val[k]);
    const c = custom[k.slice(2)], v = String(c.value || '');
    return row(esc(c.label), !v ? none : /^(https?:\/\/|www\.)\S+$/i.test(v) ? site(c.label, v) : esc(v)); // a link opens in the panel
  };
  return `<section class="box shaded admin-info">
    ${adminHead('Business Info', `<button class="eye" data-act="adminInfoOpen" title="Edit business info" aria-label="Edit business info">${ICONS.pencil}</button>`)}
    <div class="info-rows">${infoOrder().map(rowFor).join('')}</div>
  </section>`;
}
function adminInfoModal() {
  const f = k => {
    if (k.startsWith('c:')) { // one you added: its own name and what it says, and a × to take it out
      const id = k.slice(2), lk = 'aic-label-' + id, vk = 'aic-value-' + id;
      return `<div class="ai-row ai-custom" data-k="${k}"><span class="ai-grip" data-aigrip title="Drag to reorder" aria-label="Drag to reorder">${ICONS.grip}</span>
        <div class="field">
          <input id="${lk}" data-draft="${lk}" class="ai-name" value="${esc(S.drafts[lk] ?? '')}" placeholder="Name it (e.g. OEMS program #)" aria-label="Field name" autocomplete="off">
          <input id="${vk}" data-draft="${vk}" value="${esc(S.drafts[vk] ?? '')}" placeholder="What it says" aria-label="Field value" autocomplete="off">
        </div>
        <button class="x" data-act="aiCustomDel" data-id="${esc(id)}" title="Remove this field" aria-label="Remove this field">×</button></div>`;
    }
    const [, label, type, ph] = INFO_FIELDS[k];
    const field = type === 'date' // the app's own calendar (cream), not the browser's
      ? `<div class="field">${label}<span class="ai-date">${datePicker('ai-' + k, { optional: true, title: label })}</span></div>`
      : `<label class="field">${label}<input id="ai-${k}" type="${type}" data-draft="ai-${k}" value="${esc(S.drafts['ai-' + k] ?? '')}" placeholder="${ph}" autocomplete="off"></label>`;
    return `<div class="ai-row" data-k="${k}"><span class="ai-grip" data-aigrip title="Drag to reorder" aria-label="Drag to reorder">${ICONS.grip}</span>${field}</div>`; };
  return `<div class="overlay" data-act="adminInfoClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Business Info</h2><button class="x big" data-act="adminInfoClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <p class="muted small ai-hint">Drag the grip to change the order.</p>
      <div class="ai-list">${S.adminOrderDraft.map(f).join('')}</div>
      <button class="btn small" data-act="aiCustomAdd">+ Add a field</button>
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="adminInfoSave">Save</button></div>
  </div></div>`;
}

/* ---------- Quick Links ---------- */
// Quick Links: icon buttons in the header (Admin page only), left of the gear. Each link has an icon
// (LINK_ICONS); a new one without one shows its first letter. Edited from Setup → Quick Links.
const LINK_ICONS = {
  dollar: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M16.5 7.5c-.6-1.4-2.3-2.3-4.5-2.3-2.6 0-4.4 1.3-4.4 3.2 0 4.4 9.1 2.3 9.1 6.9 0 2-1.9 3.4-4.7 3.4-2.4 0-4.2-1-4.8-2.6"/></svg>',
  paycheck: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h5M6 14h3"/><path d="M17 9.2v5.6M18.6 10.2c-.3-.6-.9-1-1.7-1-1 0-1.6.5-1.6 1.2 0 1.6 3.4.9 3.4 2.6 0 .7-.7 1.3-1.8 1.3-.9 0-1.6-.4-1.8-1"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 2.8v5.6c0 4.6-3.1 8.4-7.5 9.6-4.4-1.2-7.5-5-7.5-9.6V5.8z"/><path d="M8.7 12.2l2.3 2.3 4.4-4.8"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.6"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5c0-1.1.9-2 2-2H10l2 2.5h6.5c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2z"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M4 7l8 6 8-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M6.5 3.8l2.6-.3 1.5 4-1.9 1.4a11 11 0 0 0 6.4 6.4l1.4-1.9 4 1.5-.3 2.6c-.1 1-1 1.8-2 1.7C10.6 18.8 5.2 13.4 4.8 5.8c-.1-1 .7-1.9 1.7-2z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};
const DEFAULT_LINK_ICON = { certkeeper: 'shield', finances: 'dollar', payroll: 'paycheck' };
const linkIcon = l => LINK_ICONS[l.icon || DEFAULT_LINK_ICON[l.id]] || `<span class="ql-letter">${esc((l.name || '?').trim().charAt(0).toUpperCase())}</span>`;
function adminHeaderLinks() {
  return adminLinks().map(l => `<button class="icon-btn ql-icon" data-act="adminOpen" data-id="${esc(l.id)}" title="${esc(l.name)}" aria-label="${esc(l.name)}">${linkIcon(l)}</button>`).join('')
    + `<button class="icon-btn" data-act="qlOpen" title="Quick Log: add an expense" aria-label="Quick Log: add an expense">${RECEIPT_ICON}</button>`
    + '<span class="head-div ql-div" aria-hidden="true"></span>';
}

/* ---------- Quick Log: an expense or income into "<year> Expenses" / "<year> Income" in $ Finances ----------
   (Admin header button, and quicklog.html.) Expense is picked to start. */
// Date (today unless you change it), category (that tab's own dropdown, read from the sheet), amount, notes, and a
// receipt photo if you have one (saved in Finances → "<year> receipts"; the row's Notes link to it).
const CASH_ICON = '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M12 8.4v7.2"/><path d="M14 10.1c-.3-.6-1-1-2-1-1.1 0-1.9.6-1.9 1.4 0 1.9 4 1 4 2.9 0 .8-.8 1.4-2.1 1.4-1 0-1.8-.4-2.1-1.1"/><path d="M5.5 9v0M18.5 15v0"/></svg>';
const RECEIPT_ICON = '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/></svg>';
const qlKind = () => S.drafts['ql-kind'] === 'Income' ? 'Income' : 'Expenses';
function qlStart() {
  S.drafts['ql-kind'] = 'Expenses';
  S.ql = { cats: keepCopy('qlCats-Expenses') || [], tab: '', loading: true, busy: false, err: '', photo: null, done: '' };
  S.drafts['ql-date'] = todayIso(); S.drafts['ql-cat'] = ''; S.drafts['ql-amount'] = ''; S.drafts['ql-notes'] = '';
  setTimeout(qlLoad, 0); // (qlShell calls this while drawing the page)
}
async function qlLoad() {
  const q = S.ql; if (!q) return;
  q.loading = true;
  const kind = qlKind();
  try {
    const r = await Sheets.financeInfo(S.drafts['ql-date'] || todayIso(), kind);
    if (kind !== qlKind() || S.ql !== q) return; // (switched while it loaded)
    q.cats = r.categories || []; q.tab = r.tab; q.err = ''; keepCopy('qlCats-' + kind, q.cats);
  }
  catch (e) { q.err = e.message; }
  q.loading = false; render();
}
function qlForm() {
  const q = S.ql, v = k => esc(S.drafts['ql-' + k] ?? '');
  const cats = [...new Set([...q.cats, S.drafts['ql-cat']].filter(Boolean))];
  const kind = qlKind();
  const pick = (k, label, icon) => `<button class="ql-k ${kind === k ? 'on' : ''}" data-act="qlKind" data-k="${k}" aria-pressed="${kind === k}">${icon}<span>${label}</span></button>`;
  return `<div class="ql-kind" role="group" aria-label="Expense or income">${pick('Expenses', 'Expense', RECEIPT_ICON)}${pick('Income', 'Income', CASH_ICON)}</div>
    ${q.err ? `<p class="em-note">${esc(q.err)}</p>` : ''}
    ${q.done ? `<p class="ql-done">✓ ${esc(q.done)}</p>` : ''}
    <div class="inq-fields two">
      <div class="field">Date<span class="ai-date">${datePicker('ql-date', { title: 'Date of the expense' })}</span></div>
      <label class="field">Amount<span class="ql-amount"><i>$</i><input id="ql-amount" data-draft="ql-amount" value="${v('amount')}" inputmode="decimal" placeholder="0.00" autocomplete="off"></span></label>
    </div>
    <label class="field">Category<select id="ql-cat" data-draft="ql-cat"><option value="">${q.loading && !cats.length ? 'Loading…' : 'Pick a category'}</option>${cats.map(c => `<option ${S.drafts['ql-cat'] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="field">Notes<input id="ql-notes" data-draft="ql-notes" value="${v('notes')}" placeholder="${kind === 'Income' ? 'Who and what for, e.g. Beeson - deposit' : 'What it was, e.g. Amazon folders x10'}" autocomplete="off"></label>
    <div class="field"><span>${kind === 'Income' ? 'Photo' : 'Receipt'} (optional)</span>
      ${q.photo ? `<div class="ql-photo">${q.photo.preview ? `<img src="${q.photo.preview}" alt="Receipt">` : `<span class="muted small">${esc(q.photo.name)}</span>`}
          <button class="link" data-act="qlPhotoClear">Remove</button></div>`
        : `<label class="btn ql-pick">${RECEIPT_ICON}<span>Add a photo</span><input id="ql-file" type="file" accept="image/*,application/pdf" hidden></label>`}</div>`;
}
function qlModal() {
  const q = S.ql;
  return `<div class="overlay" data-act="qlClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Quick Log</h2><button class="x big" data-act="qlClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">${qlForm()}</div>
    <div class="modal-foot"><span class="muted small">${q.tab ? 'Adds a row to ' + esc(q.tab) : ''}</span>
      <button class="btn primary" data-act="qlSave" ${q.busy ? 'disabled' : ''}>${q.busy ? 'Saving…' : qlKind() === 'Income' ? 'Add income' : 'Add expense'}</button></div>
  </div></div>`;
}
// quicklog.html (phone shortcut): just the Quick Log.
function qlShell() {
  if (!S.ql) qlStart();
  const q = S.ql;
  return `<header class="calls-top"><img src="logo.png" alt=""><h1>Quick Log</h1></header>
  <main class="calls-wrap ql-wrap">${qlForm()}
    <button class="btn primary wide ql-save" data-act="qlSave" ${q.busy ? 'disabled' : ''}>${q.busy ? 'Saving…' : qlKind() === 'Income' ? 'Add income' : 'Add expense'}</button>
    ${q.tab ? `<p class="muted small ql-tab">Adds a row to ${esc(q.tab)} in $ Finances.</p>` : ''}
    <p class="calls-foot"><a href="./" class="link">Open the full app</a> · <button class="link" data-act="signout">Sign out</button></p></main>`;
}
// A photo: made smaller (longest side 1600px, JPEG) so it uploads quickly; a PDF (or one the browser can't draw) goes as it is.
function qlReadFile(file) {
  const asData = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
  if (!/^image\//.test(file.type) || /heic|heif/i.test(file.type)) return asData(file).then(url => ({ url, type: file.type || 'application/octet-stream', preview: /^image\/(jpe?g|png|gif|webp)$/.test(file.type) ? url : '' }));
  return asData(file).then(url => new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const small = c.toDataURL('image/jpeg', 0.82); ok({ url: small, type: 'image/jpeg', preview: small });
    };
    img.onerror = () => ok({ url, type: file.type, preview: '' });
    img.src = url;
  }));
}
function linksEdModal() {
  const list = S.linksDraft;
  return `<div class="overlay" data-act="linksEdClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Links</h2><button class="x big" data-act="linksEdClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <p class="muted small">The icons at the top of the Admin page. Each opens inside the app (with Open in Chrome there too). Drag the grip to reorder; click an icon to change it.</p>
      <div class="lk-list">${list.map((l, i) => `<div class="lk-row" data-i="${i}">
        <span class="ai-grip lk-grip" data-lkgrip title="Drag to reorder" aria-label="Drag to reorder">${ICONS.grip}</span>
        <button type="button" class="icon-btn lk-ic ${S.lkPick === i ? 'on' : ''}" data-act="lkPick" data-i="${i}" title="Change icon" aria-label="Change icon">${linkIcon(l)}</button>
        <input id="lk-${i}-name" data-lk="${i}:name" value="${esc(l.name)}" placeholder="Name" autocomplete="off">
        <input id="lk-${i}-url" data-lk="${i}:url" value="${esc(l.url)}" placeholder="Link" autocomplete="off">
        <button class="x" data-act="lkDel" data-i="${i}" aria-label="Remove ${esc(l.name)}">×</button>
        ${S.lkPick === i ? `<div class="lk-icons">${Object.keys(LINK_ICONS).map(k => `<button type="button" class="icon-btn ${l.icon === k ? 'on' : ''}" data-act="lkIcon" data-i="${i}" data-k="${k}" title="${k}">${LINK_ICONS[k]}</button>`).join('')}
          <button type="button" class="icon-btn" data-act="lkIcon" data-i="${i}" data-k="" title="First letter"><span class="ql-letter">${esc((l.name || '?').charAt(0).toUpperCase())}</span></button></div>` : ''}
      </div>`).join('') || '<p class="empty">No links yet.</p>'}</div>
      <button class="btn small" data-act="lkAdd">+ Add a link</button>
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="lkSave">Save</button></div>
  </div></div>`;
}
// Every link that would open a new Chrome tab (Docs, Sheets, the instructor link…) opens in this panel
// instead, with "Open in Chrome ↗" there. Google Meet (it needs the camera), Drive folders (Google won't
// show them in a panel: "you need access") and links marked data-chrome still go straight to Chrome,
// and so does ⌘/Ctrl-click.
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[target="_blank"][href]');
  if (!a || a.hasAttribute('data-chrome') || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const url = a.href;
  if (!/^https?:/i.test(url) || inChrome(url)) return;
  e.preventDefault();
  const name = a.dataset.name || a.textContent.replace(/↗/g, '').trim() || 'Link';
  S.adminPanel = { name, url }; render();
});
function openPanel(name, url) { // a Drive folder or Meet goes to Chrome instead (see above)
  if (inChrome(url)) { window.open(url, '_blank', 'noopener'); return; }
  S.adminPanel = { name, url }; render();
}
// Sites that won't show inside the panel: Meet, Drive folders, and the Squarespace website (it says
// "same site only"). The Student Portal and Docs/Sheets are fine in the panel.
const inChrome = url => /\/\/meet\.google\.com\//i.test(url) || /\/\/drive\.google\.com\/(drive\/)?(u\/\d+\/)?folders\//i.test(url)
  || /\/\/(www\.)?elevateemsacademy\.com(\/|$)/i.test(url);
function adminPanel() {
  const p = S.adminPanel;
  return `<div class="overlay" data-act="adminPanelClose"><div class="modal pdf admin-panel" data-stop>
    <div class="modal-head"><h2>${esc(p.name)}</h2><span class="panel-actions">
      <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener" data-chrome data-act="adminPanelClose">Open in Chrome ↗</a>
      <button class="x big" data-act="adminPanelClose" aria-label="Close">×</button></span></div>
    <iframe src="${esc(p.url)}" title="${esc(p.name)}" allow="clipboard-read; clipboard-write"></iframe>
  </div></div>`;
}

/* ---------- To Do ---------- */
function adminTodoBox() {
  const open = S.adminTodos.filter(t => !t.done).sort((a, b) => (a.created || 0) - (b.created || 0));
  const done = S.adminTodos.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return `<section class="box admin-todo">
    ${adminHead('To Do', (done.length ? '<button class="link" data-act="adminTodoClear">Clear checked</button>' : '') + '<button class="add-plus small-plus" data-act="adminTodoOpen" title="Add a to-do" aria-label="Add a to-do">+</button>')}
    ${S.adminTodoAdd ? `<div class="add-row"><input id="ad-todo" data-draft="ad-todo" data-add="adminTodo" data-aclose="todo" placeholder="Type a to-do, then Enter" value="${esc(S.drafts['ad-todo'] || '')}" autocomplete="off"></div>` : ''}
    <ul class="checks">${[...open, ...done].map(t => `<li class="${t.done ? 'done' : ''}">
      <label>${circle(t.done, `data-act="adminTodo" data-id="${t.id}"`)}<span><span class="txt">${esc(t.text)}</span></span></label>
      ${dueBits('admin', t, t.done)}<button class="x" data-act="adminTodoDel" data-id="${t.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>
  </section>`;
}

/* ---------- Changes for Future Classes ----------
   "Do before next cohort" items are kept the way they always were: as kind 'next' to-dos in the cohort
   before the one they're for, which shows them on its Setup Checklist (and in its Course To-Do once the
   rest of the checklist is done). New ones here go to the soonest Upcoming cohort, so they're kept in
   the cohort just before it; with no Upcoming cohort yet, in the newest cohort, so they land on the next
   one you add. "Future updates" is one shared list (updates/). */
function changesHome() {
  const ranked = S.cohorts.map(c => ({ ...c, r: cohortRank(c.key) })).filter(c => c.r != null).sort((a, b) => a.r - b.r);
  const up = ranked.find(c => /upcoming/i.test(c.status || ''));
  if (up) { const before = ranked.filter(c => c.r < up.r).pop(); return { src: before ? before.key : null, target: up.key }; }
  const last = ranked[ranked.length - 1];
  return { src: last ? last.key : null, target: null };
}
let unwatchNext = null, nextFor = null;
function watchAdminNext(key) {
  if (key === nextFor) return;
  if (unwatchNext) unwatchNext();
  unwatchNext = null; nextFor = key; S.adminNext = [];
  if (key) unwatchNext = Store.watch('cohorts/' + key + '/todos', list => { S.adminNext = list.filter(x => x.kind === 'next'); render(); });
}
function adminChangesBox() {
  const home = changesHome();
  watchAdminNext(home.src);
  const plus = (k, label) => `<button class="add-plus small-plus" data-act="chAdd" data-k="${k}" title="${label}" aria-label="${label}">+</button>`;
  const byOrder = (a, c) => (a.order || a.created || 0) - (c.order || c.created || 0), byNew = (a, c) => (a.created || 0) - (c.created || 0);
  const nxt = [...(S.adminNext || [])].sort(byOrder);
  const upd = [...S.updates.filter(x => !x.done).sort(byNew), ...S.updates.filter(x => x.done).sort(byNew)];
  const k = 'add-anext-' + SETUP;
  const where = home.target ? esc(home.target) + '’s' : 'the next cohort’s';
  return `<section class="box admin-changes ${hidden('next') ? 'hide-done' : ''}">
    ${adminHead('Changes for Future Classes', nxt.some(t => t.done) || S.updates.some(x => x.done) ? hideToggle('next') : '')}
    <p class="mini-head with-plus">Do before next cohort ${home.src ? plus('anext', 'Add a change') : ''}</p>
    <p class="muted small changes-foot">${home.src ? `Shows up on ${where} Setup Checklist.` : 'Add a cohort first.'}</p>
    ${S.changesAdd === 'anext' ? `<div class="add-row"><input id="${k}" data-draft="${k}" data-add="adminNext" data-chadd="anext" placeholder="Type a change, then Enter" value="${esc(S.drafts[k] || '')}"></div>` : ''}
    <ul class="checks">${nxt.map(x => `<li class="${x.done ? 'done' : ''}">
      <label>${circle(x.done, `data-act="adminNextDone" data-id="${x.id}"`)}<span>${hlTxt('anext', x.id, x.text, x.hl)}</span></label>${dueBits('anext', x, x.done)}
      <button class="x" data-act="adminNextDel" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>
    <hr class="box-sep"><p class="mini-head with-plus">Future updates ${plus('upd', 'Add an update')}</p>
    ${S.changesAdd === 'upd' ? `<div class="add-row"><input id="updIn" data-draft="upd" data-add="upd" data-chadd="upd" placeholder="Type an update, then Enter" value="${esc(S.drafts.upd || '')}"></div>` : ''}
    <ul class="checks">${upd.map(x => `<li class="${x.done ? 'done' : ''}">
      <label>${circle(x.done, `data-act="updDone" data-id="${x.id}"`)}<span>${hlTxt('upd', x.id, x.text, x.hl)}</span></label>
      <button class="x" data-act="delUpd" data-id="${x.id}" aria-label="Delete">×</button></li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul>
  </section>`;
}

/* ---------- Key Dates ---------- */
function daysAway(iso) {
  const n = Math.round((parseIso(iso) - parseIso(todayIso())) / 864e5);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? 'in ' + n + ' days' : -n + ' days ago';
}
// Each Upcoming/Active cohort's Orientation, Full CPR and Academy Week come in on their own from its
// Course Details (the cohort's sheet, via the Apps Script). They have no ×: change them in Course Details.
async function loadCohortDates() {
  if (S.kdBusy) return;
  S.kdBusy = true;
  try { S.kdCohorts = await Sheets.cohortDates(); S.kdErr = ''; keepCopy('kd', S.kdCohorts); }
  catch (e) { S.kdErr = /unknown request/i.test(e.message) ? 'Course dates need the new Admin Apps Script version deployed.' : e.message; }
  S.kdBusy = false; S.kdAt = Date.now(); render();
}
// Bella's and Nick's recerts from CertKeeper (its elevateCerts function, which only answers our two
// staff sign-ins): certs that expire, once they're inside their earliest CertKeeper reminder.
// CertKeeper sends the reminder emails; this only shows them here. They stay up until renewed there.
const CERTKEEPER_URL = 'https://us-central1-certkeeper-e198e.cloudfunctions.net/elevateCerts';
async function loadRecerts() {
  if (S.rcBusy || !Store.configured) return;
  S.rcBusy = true;
  try {
    const res = await fetch(CERTKEEPER_URL, { headers: { Authorization: 'Bearer ' + await Store.idToken() } });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'CertKeeper didn’t answer.');
    S.recerts = out.certs || []; S.rcErr = ''; keepCopy('rc', S.recerts);
  } catch (e) { S.rcErr = 'Couldn’t check CertKeeper: ' + e.message; }
  S.rcBusy = false; S.rcAt = Date.now(); render();
}
const recertKeyDates = () => (S.recerts || []).filter(c => isIsoDate(c.expiresOn))
  .map(c => ({ id: 'ck-' + c.id, date: c.expiresOn, text: `${c.who}: ${c.abbr || c.name} expires`, auto: true, recert: true }));

const AW_DAYS = 5; // Academy Week: start date + 4 more days
function cohortKeyDates() {
  const out = [];
  (S.kdCohorts || []).forEach(c => {
    if (/^(test|qa)\b/i.test(c.key)) return;
    if (isIsoDate(c.firstDay)) out.push({ id: 'o-' + c.key, date: c.firstDay, text: c.key + ' Orientation', auto: true });
    if (isIsoDate(c.cpr)) out.push({ id: 'c-' + c.key, date: c.cpr, text: c.key + ' Full CPR course', auto: true });
    if (isIsoDate(c.academyStart)) {
      const end = new Date(parseIso(c.academyStart)); end.setDate(end.getDate() + AW_DAYS - 1);
      out.push({ id: 'a-' + c.key, date: c.academyStart, end: isoOf(end), text: c.key + ' Academy Week', auto: true });
    }
  });
  return out;
}
// "Nov 9–13" or "Nov 30–Dec 4"
function dateRange(a, b) {
  const x = parseIso(a), y = parseIso(b), m = d => d.toLocaleDateString('en-US', { month: 'short' });
  return m(x) + ' ' + x.getDate() + '–' + (m(x) === m(y) ? '' : m(y) + ' ') + y.getDate();
}
function adminDatesBox() {
  if (!S.kdAt && !S.kdCohorts) S.kdCohorts = keepCopy('kd'); // last time's, shown at once while the fresh ones load
  if (!S.rcAt && !S.recerts) S.recerts = keepCopy('rc');
  if (!S.kdBusy && (!S.kdAt || Date.now() - S.kdAt > 5 * 60e3)) setTimeout(() => loadCohortDates(), 0); // fresh every 5 minutes while open
  if (!S.rcBusy && (!S.rcAt || Date.now() - S.rcAt > 30 * 60e3)) setTimeout(() => loadRecerts(), 0); // CertKeeper: every 30 minutes
  const t = todayIso(), byDate = (a, b) => a.date.localeCompare(b.date);
  const all = [...S.adminDates, ...cohortKeyDates(), ...recertKeyDates()];
  const over = x => !x.recert && (x.end || x.date) < t; // Academy Week stays up until its last day is over; a recert until it's renewed
  const next = all.filter(x => !over(x)).sort(byDate);
  const past = all.filter(over).sort(byDate).reverse();
  const item = x => {
    const now = x.end && x.date <= t && t <= x.end;
    const away = now ? 'this week' : x.recert && x.date < t ? 'expired' : daysAway(x.date);
    const soon = now || (x.recert && x.date < t) || (x.date >= t && Math.round((parseIso(x.date) - parseIso(t)) / 864e5) <= (x.recert ? 30 : 14));
    // Cohort dates skip the year (their title has it); your own dates show it when it isn't this year.
    const when = x.end ? dateRange(x.date, x.end)
      : parseIso(x.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!x.auto && x.date.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) });
    return `<li class="${x.date < t ? 'past' : ''}"><span class="kd-date">${esc(when)}</span>
      <span class="kd-text">${esc(x.text)}</span><span class="kd-away ${soon ? 'soon' : ''}">${away}</span>
      ${x.auto ? '' : `<button class="x" data-act="adminDateDel" data-id="${x.id}" aria-label="Delete">×</button>`}</li>`;
  };
  return `<section class="box admin-dates">
    ${adminHead('Key Dates', (past.length ? `<button class="eye ${S.adminShowPast ? '' : 'off'}" data-act="adminPastToggle" title="${S.adminShowPast ? 'Hide' : 'Show'} past dates" aria-label="${S.adminShowPast ? 'Hide' : 'Show'} past dates">${S.adminShowPast ? EYE : EYE_OFF}</button>` : '') + '<button class="add-plus small-plus" data-act="adminDateOpen" title="Add a date" aria-label="Add a date">+</button>')}
    ${S.adminDateAdd ? `<div class="kd-form"><div class="kd-add">${datePicker('ad-date')}<input id="ad-text" data-draft="ad-text" data-add="adminDate" placeholder="What’s happening?" value="${esc(S.drafts['ad-text'] || '')}" autocomplete="off"></div>
      <div class="link-add-foot"><button class="link" data-act="adminDateCancel">Cancel</button><button class="btn small primary" data-act="adminDateAdd">Add date</button></div></div>` : ''}
    <ul class="checks key-dates">${next.map(item).join('') || '<li class="empty">No dates coming up.</li>'}${S.adminShowPast ? past.map(item).join('') : ''}</ul>
    ${S.kdErr ? `<p class="muted small">${esc(S.kdErr)}</p>` : ''}${S.rcErr ? `<p class="muted small">${esc(S.rcErr)}</p>` : ''}
  </section>`;
}

/* ---------- Info Requests ----------
   The Admin Apps Script checks every hour for website form emails (forwarded from the admin Gmail)
   and makes a reply draft in gbrown@'s Drafts. This box shows the last 30 days and the reply settings. */
const SEASONS_INQ = [['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall']];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
async function loadInquiries(check = false) {
  if (S.inqBusy) return;
  S.inqBusy = check ? 'check' : 'load'; render();
  try {
    const res = await (check ? Sheets.checkInquiries() : Sheets.listInquiries());
    S.inq = res; S.inqErr = ''; keepCopy('inq', res);
    if (check) toast([res.added ? `${res.added} new` : '', res.drafted ? `${res.drafted} reply draft${res.drafted === 1 ? '' : 's'} in your Gmail Drafts` : ''].filter(Boolean).join(' · ') || 'Nothing new.');
  } catch (e) {
    S.inqErr = /unknown request/i.test(e.message) ? 'The Admin Apps Script needs its new version deployed.' : e.message;
  }
  S.inqBusy = null; S.inqAt = Date.now(); render();
}
const INQ_STATUSES = ['Missed call', 'Needs follow-up', 'Plans to enroll', 'Responded', 'Enrolled', 'Close Out'];
const NEW_CALL_STATUSES = ['Needs follow-up', 'Plans to enroll', 'Missed call']; // what an inquiry you're adding can be (Missed call: calls only)
const NEW_INQ_SOURCES = ['Call', 'Email', 'Text']; // how they reached out (Website forms and voicemails come in by themselves)
const TEXT_ICON = '<svg viewBox="0 0 24 24"><path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8 10h8M8 13h5"/></svg>';
const SOURCE_ICONS = { Call: () => LINK_ICONS.phone, Email: () => LINK_ICONS.mail, Text: () => TEXT_ICON };
const INQ_SECTION = { 'Missed call': 'Missed calls' }; // a section's heading, when it isn't the status itself
const inqStatus = x => x.status === 'Not interested' ? 'Close Out' : x.status; // (renamed; an older saved list may still say it)
// Their contact history (newest last) and the last time you talked.
const inqContacts = x => Array.isArray(x.contacts) ? x.contacts : [];
const inqLastTalk = x => inqContacts(x).filter(c => c.by !== 'Automatic').map(c => c.d).filter(isIsoDate).sort().pop() || '';
const INQ_ALL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12l8.5 4.5 8.5-4.5"/><path d="M3.5 16l8.5 4.5 8.5-4.5"/></svg>';
const INQ_SOURCE_IC = { Website: 'globe', Voicemail: 'phone', 'Missed call': 'phone', Call: 'phone' };
const inqSlug = st => String(st || '').toLowerCase().replace(/[^a-z]+/g, '-');
const inqDate = iso => isIsoDate(iso) ? parseIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const RELOAD = '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>';
// calls: the Inquiries page (calls.html, Nick's phone shortcut): a search box, a big "Add a call",
// and a Calls / All switch (Calls = phone calls and voicemails, not the website forms).
function adminInquiryBox({ calls = false } = {}) {
  if (!S.inq && !S.inqAt) S.inq = keepCopy('inq'); // the last list at once; the fresh one replaces it
  if (!S.inqAt && !S.inqErr && !S.inqBusy) setTimeout(() => loadInquiries(), 0);
  else if (S.inqAt && Date.now() - S.inqAt > 5 * 60e3 && !S.inqBusy) setTimeout(() => loadInquiries(), 0); // fresh every 5 minutes while open
  const q = S.inq, open = S.inqOpen || {};
  const items = (q ? q.items : []).filter(x => !calls || !S.inqCallsOnly || x.source !== 'Website');
  const term = calls ? String(S.drafts['inq-search'] || '').trim().toLowerCase() : '', digits = term.replace(/\D/g, '');
  const found = term ? items.filter(x => [x.name, x.email, x.notes, x.message, x.cohort].some(v => String(v || '').toLowerCase().includes(term))
    || (digits.length >= 3 && String(x.phone || '').replace(/\D/g, '').includes(digits))) : null;
  const of = st => items.filter(x => inqStatus(x) === st);
  const waiting = items.filter(x => x.reply === 'Waiting').length;
  const row = x => `<li class="inq-row" data-act="inqOpen" data-id="${esc(x.id)}">
      <span class="inq-ic" title="${esc(x.source)}">${LINK_ICONS[INQ_SOURCE_IC[x.source] || 'globe']}</span>
      <span class="inq-main"><span class="inq-name">${esc(x.name || x.phone || x.email || 'No name')}</span>
        <span class="inq-sub">${[term ? inqStatus(x) : '', inqLastTalk(x) ? 'last talked ' + inqDate(inqLastTalk(x)) : inqDate(x.received), x.cohort, x.reply === 'Waiting' ? 'reply waiting' : /^Drafted/.test(x.reply) && x.status === 'Needs follow-up' ? 'reply drafted' : '', x.notes || x.message].filter(Boolean).map(esc).join(' · ')}</span></span></li>`;
  // Missed calls (only when there are some) and Needs follow-up are always open, Plans to enroll too when there are some;
  // Responded and Enrolled open with a click; Close Out hides behind a link.
  const section = (st, always) => {
    const list = of(st), isOpen = always || open[st];
    return `<p class="mini-head inq-sec ${always ? '' : 'toggle'}" ${always ? '' : `data-act="inqSec" data-s="${esc(st)}"`}>
        <span>${always ? '' : `<span class="inq-caret">${isOpen ? '▾' : '▸'}</span>`}${INQ_SECTION[st] || st}</span><span class="count">${list.length}</span></p>
      ${isOpen ? `<ul class="checks inq-list">${list.map(row).join('') || `<li class="empty">${st === 'Needs follow-up' ? 'All inquiries answered.' : 'None.'}</li>`}</ul>` : ''}`;
  };
  const ni = of('Close Out').length;
  const lists = found ? `<p class="mini-head inq-sec"><span>Search</span><span class="count">${found.length}</span></p>
      <ul class="checks inq-list">${found.map(row).join('') || '<li class="empty">Nobody matches.</li>'}</ul>`
    : (of('Missed call').length ? section('Missed call', true) : '') + section('Needs follow-up', true)
      + (of('Plans to enroll').length ? section('Plans to enroll', true) : '') + section('Responded') + section('Enrolled')
      + (open['Close Out'] ? section('Close Out') : '')
      + (ni ? `<button class="link inq-ni" data-act="inqSec" data-s="Close Out">${open['Close Out'] ? 'Hide' : ni} closed out</button>` : '');
  const tools = calls && q ? `<div class="calls-tools">
      <button class="btn primary calls-add" data-act="inqNew">+ Add a call</button>
      <input id="inq-search" class="calls-search" type="search" data-draft="inq-search" value="${esc(S.drafts['inq-search'] || '')}" placeholder="Search name or phone" autocomplete="off" aria-label="Search name or phone">
    </div>` : '';
  return `<section class="box admin-inq ${calls ? 'calls-box' : ''}">
    ${adminHead('Info Requests', (q && calls ? `<button class="eye inq-filter ${S.inqCallsOnly ? 'on' : ''}" data-act="inqCallsOnly" data-v="${S.inqCallsOnly ? 0 : 1}"
        title="${S.inqCallsOnly ? 'Showing calls and voicemails · tap for all' : 'Showing all · tap for calls and voicemails only'}" aria-label="${S.inqCallsOnly ? 'Show all' : 'Show calls only'}">${S.inqCallsOnly ? LINK_ICONS.phone : INQ_ALL_ICON}</button>`
      : q ? `<button class="eye" data-act="inqSetOpen" title="Reply settings: tuition, textbook, months" aria-label="Reply settings">${ICONS.pencil}</button>` : '')
      + `<button class="eye inq-reload ${S.inqBusy ? 'spin' : ''}" data-act="inqCheck" title="Check for new requests now" aria-label="Check for new requests now" ${S.inqBusy ? 'disabled' : ''}>${RELOAD}</button>`
      + (q ? '<button class="add-plus small-plus" data-act="inqNew" title="Add an inquiry" aria-label="Add an inquiry">+</button>' : ''))}
    ${S.inqErr ? `<p class="em-note">${esc(S.inqErr)}</p>` : ''}
    ${q && !q.timerOn ? '<p class="em-note">The hourly check is off. In the Admin Apps Script, run <b>setupInquiryCheck</b> once.</p>' : ''}
    ${waiting && q.waitingReason ? `<p class="em-note">${waiting} reply draft${waiting === 1 ? '' : 's'} waiting: ${esc(q.waitingReason)}</p>` : ''}
    ${!q && !S.inqErr ? '<p class="empty">Loading…</p>' : ''}
    ${tools}${q ? lists : ''}
  </section>`;
}
// The whole Inquiries page (calls.html): just Info Requests, sized for a phone.
function callsShell() {
  if (S.inqCallsOnly === undefined) S.inqCallsOnly = pref('inqCallsOnly') === '1'; // this device's last choice (All until switched)
  return `<header class="calls-top"><img src="logo.png" alt=""><h1>Inquiries</h1></header>
  <main class="calls-wrap">${adminInquiryBox({ calls: true })}
    <p class="calls-foot"><a href="./" class="link">Open the full app</a> · <button class="link" data-act="signout">Sign out</button></p></main>
  ${adminModals()}${S.dueEd ? dueModal() : ''}`;
}
// Calling someone back goes through Google Voice (on gbrown@), with their number ready to call.
// On a computer that's the Google Voice site; on an iPhone the link should open the Voice app.
const GV_ACCOUNT = 'gbrown@elevateemsacademy.com';
function gvUrl(phone) {
  const d = String(phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `https://voice.google.com/calls?a=nc,%2B1${d}&authuser=${encodeURIComponent(GV_ACCOUNT)}` : '';
}
// Contact history in a request's window: every time you talked (newest first), and + Log a contact.
function inqHistory(it, e) {
  const list = [...inqContacts(it)].reverse();
  return `<div class="inq-hist"><p class="mini-head with-plus">Contact history
      ${e.log ? '' : '<button class="add-plus small-plus" data-act="inqLogOpen" title="Log a contact" aria-label="Log a contact">+</button>'}</p>
    ${e.log ? `<div class="inq-log">
        <div class="field">When<span class="ai-date">${datePicker('ie2-cdate', { title: 'Date you talked' })}</span></div>
        <label class="field">What happened<input id="ie2-cnote" data-draft="ie2-cnote" value="${esc(S.drafts['ie2-cnote'] || '')}" placeholder="e.g. Called back, wants Spring 2027 dates" autocomplete="off"></label>
        <p class="muted small">Logged when you Save.${S.drafts['ie2-status'] === 'Missed call' ? ' This moves them from Missed calls to Responded.' : ' Change the status above too if it changed.'}</p></div>` : ''}
    <ul class="inq-hist-list">${list.map(c => `<li><b>${esc(inqDate(c.d))}</b> · ${esc(c.by || '')}${c.note ? ' · ' + esc(c.note) : ''}</li>`).join('') || '<li class="muted">Nothing logged yet.</li>'}</ul></div>`;
}
// One request: status, who, cohort, notes (and what they wrote or said). New = a call you're adding.
function inqEdModal() {
  const e = S.inqEd, it = e.item || {}, v = k => esc(S.drafts['ie2-' + k] ?? '');
  const cohorts = [...new Set([...(S.inq ? S.inq.cohorts : []), it.cohort].filter(Boolean))];
  return `<div class="overlay" data-act="inqEdClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>${e.isNew ? `Add an Inquiry <span class="inq-src">${NEW_INQ_SOURCES.map(x => `<button class="eye ${S.drafts['ie2-source'] === x ? 'on' : ''}" data-act="inqSource" data-s="${x}" title="${x}" aria-label="${x}" aria-pressed="${S.drafts['ie2-source'] === x}">${SOURCE_ICONS[x]()}</button>`).join('')}</span>` : esc(it.name || it.phone || it.email || 'Info Request')}${!e.isNew && gvUrl(it.phone)
      ? ` <a class="eye inq-gv" href="${gvUrl(it.phone)}" target="_blank" rel="noopener" data-chrome title="Call ${esc(it.phone)} with Google Voice" aria-label="Call ${esc(it.phone)} with Google Voice">${LINK_ICONS.phone}</a>` : ''}</h2>
      <button class="x big" data-act="inqEdClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      ${e.isNew ? '' : `<p class="muted small">${esc(it.source)} · ${esc(inqDate(it.received))}${it.reply ? ' · reply ' + esc(it.reply.toLowerCase()) : ''}</p>`}
      ${it.message ? `<p class="inq-msg">${esc(it.message)}</p>` : ''}
      ${e.isNew ? `<div class="inq-status two">${NEW_CALL_STATUSES.filter(st => st !== 'Missed call' || S.drafts['ie2-source'] === 'Call').map(st => `<button class="chip ${S.drafts['ie2-status'] === st ? 'on' : ''}" data-act="inqStatus" data-s="${esc(st)}">${st}</button>`).join('')}</div>`
        : `<label class="field inq-status-pick">Status<select id="ie2-status" data-draft="ie2-status">${INQ_STATUSES.map(st => `<option ${S.drafts['ie2-status'] === st ? 'selected' : ''}>${st}</option>`).join('')}</select></label>`}
      <div class="inq-fields two">
        <label class="field">Name<input id="ie2-name" data-draft="ie2-name" value="${v('name')}" autocomplete="off"></label>
        <label class="field">Phone<input id="ie2-phone" data-draft="ie2-phone" value="${v('phone')}" autocomplete="off" inputmode="tel"></label>
        <label class="field">Email<input id="ie2-email" data-draft="ie2-email" value="${v('email')}" autocomplete="off"></label>
        <label class="field">Interested in<select id="ie2-cohort" data-draft="ie2-cohort"><option value="">Not sure yet</option>${cohorts.map(c => `<option ${S.drafts['ie2-cohort'] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      </div>
      ${e.isNew ? `<div class="field">Date of the ${(S.drafts['ie2-source'] || 'Call').toLowerCase()}<span class="ai-date">${datePicker('ie2-received', { title: 'Date of the ' + (S.drafts['ie2-source'] || 'Call').toLowerCase() })}</span></div>` : ''}
      ${e.isNew && S.drafts['ie2-source'] === 'Email' ? `<label class="field">What they wrote<textarea id="ie2-message" data-draft="ie2-message" rows="4" placeholder="Paste their email (optional)">${v('message')}</textarea></label>` : ''}
      <label class="field">Notes<textarea id="ie2-notes" data-draft="ie2-notes" rows="4" placeholder="What they asked, when to call back…">${v('notes')}</textarea></label>
      ${e.isNew ? '' : inqHistory(it, e)}
    </div>
    <div class="modal-foot">${e.isNew ? '' : '<button class="link" data-act="inqDelete">Delete</button>'}
      <button class="btn primary" data-act="inqSave" ${e.busy ? 'disabled' : ''}>${e.busy ? 'Saving…' : e.isNew ? 'Add ' + (S.drafts['ie2-source'] || 'Call').toLowerCase() : 'Save'}</button></div>
  </div></div>`;
}
function inqSetModal() {
  const v = k => esc(S.drafts['iq-' + k] ?? '');
  const sel = (k, cur) => `<select id="iq-${k}" data-draft="iq-${k}">${MONTH_NAMES.map(m => `<option ${m === cur ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
  return `<div class="overlay" data-act="inqSetClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Info Request Replies</h2><button class="x big" data-act="inqSetClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      <p class="muted small">What the reply drafts say. Dates come from the cohorts’ Course Details.</p>
      <div class="inq-fields">
        <label class="field">Tuition<input id="iq-tuition" data-draft="iq-tuition" value="${v('tuition')}"></label>
        <label class="field">Textbook (about)<input id="iq-textbook" data-draft="iq-textbook" value="${v('textbook')}"></label>
        <label class="field">Late orientation fee<input id="iq-lateFee" data-draft="iq-lateFee" value="${v('lateFee')}"></label>
      </div>
      <p class="mini-head">Usual months <span class="count">for a next cohort that isn’t added yet</span></p>
      <div class="inq-months"><span></span><b>Orientation</b><b>Academy Week</b>
        ${SEASONS_INQ.map(([k, label]) => `<span>${label}</span>${sel(k + '-0', S.drafts['iq-' + k + '-0'])}${sel(k + '-1', S.drafts['iq-' + k + '-1'])}`).join('')}</div>
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="inqSetSave" ${S.inqSaving ? 'disabled' : ''}>${S.inqSaving ? 'Saving…' : 'Save'}</button></div>
  </div></div>`;
}

/* ---------- Sticky Notes ---------- */
// Sticky Notes' order: dragged ones keep `order`; ones never moved go newest first (and a new one goes first).
const noteKey = n => n.order != null ? n.order : -(n.created || 0);
function adminNotesBox() {
  const notes = [...S.adminNotes].sort((a, b) => noteKey(a) - noteKey(b));
  return `<section class="box shaded admin-notes">
    ${adminHead('Sticky Notes', '<button class="add-plus small-plus" data-act="adminNoteAdd" title="New sticky note" aria-label="New sticky note">+</button>')}
    <div class="stickies">${notes.map(n => {
      const id = 'an-' + n.id;
      return `<div class="sticky c-${NOTE_COLORS.includes(n.color) ? n.color : 'yellow'}" data-nid="${n.id}">
        <textarea id="${id}" data-draft="${id}" data-anote="${n.id}" data-grow rows="3" placeholder="Type a note">${esc(S.drafts[id] ?? n.text ?? '')}</textarea>
        <div class="sticky-foot"><span class="sticky-tools"><span class="ai-grip sticky-grip" data-ngrip title="Drag to move" aria-label="Drag to move">${ICONS.grip}</span>
          <button class="dot" data-act="adminNoteColor" data-id="${n.id}" title="Change color" aria-label="Change color"></button></span>
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
  return (S.ql && !window.QUICKLOG_ONLY ? qlModal() : '') + (S.adminInfoEd ? adminInfoModal() : '') + (S.adminPanel ? adminPanel() : '') + (S.inqSet ? inqSetModal() : '')
    + (S.inqEd ? inqEdModal() : '') + (S.linksDraft ? linksEdModal() : '');
}
function adminInput(t) {
  if (t.id === 'ql-file' && t.files && t.files[0]) { // Quick Log receipt (input or change, whichever comes first)
    if (t.dataset.read) return true;
    t.dataset.read = '1';
    const f = t.files[0];
    qlReadFile(f).then(r => { if (S.ql) { S.ql.photo = { data: r.url.split(',')[1], type: r.type, name: f.name, preview: r.preview }; render(); } })
      .catch(() => toast('Couldn’t read that photo.'));
    return true;
  }
  if (t.id === 'inq-search') { S.drafts['inq-search'] = t.value; render(); return true; } // Inquiries page: filter as you type
  if (t.dataset.lk && S.linksDraft) { const [i, k] = t.dataset.lk.split(':'); S.linksDraft[Number(i)][k] = t.value; return true; }
  if (!t.dataset.anote) return false;
  S.drafts[t.id] = t.value; grow(t);
  saveStickySoon(t.dataset.anote, t.id);
  return true;
}
function adminEscape() {
  if (S.inqEd) { if (S.inqEd.busy) return true; S.inqEd = null; }
  else if (S.linksDraft) { S.linksDraft = null; S.lkPick = null; }
  else if (S.inqSet) { if (S.inqSaving) return true; S.inqSet = false; }
  else if (S.adminPanel) S.adminPanel = null;
  else if (S.adminInfoEd) S.adminInfoEd = false;
  else if (S.adminTodoAdd) { S.adminTodoAdd = false; delete S.drafts['ad-todo']; }
  else if (S.adminDateAdd) { S.adminDateAdd = false; delete S.drafts['ad-text']; delete S.drafts['ad-date']; }
  else return false;
  return true;
}
// Enter in one of the Admin page's add lines.
function adminEnter(t) {
  const a = { adminTodo: 'adminTodoAdd', adminDate: 'adminDateAdd', adminNext: 'adminNextAdd' }[t.dataset.add];
  if (!a) return false;
  adminAct(a, t);
  return true;
}
async function adminAct(a, el = {}) {
  if (a === 'qlOpen') { qlStart(); render(); return true; }
  if (a === 'qlClose') { if (S.ql && !S.ql.busy) { S.ql = null; render(); } return true; }
  if (a === 'qlPhotoClear') { S.ql.photo = null; render(); return true; }
  if (a === 'qlKind') { // Expense / Income: that tab's categories
    if (!S.ql || qlKind() === el.dataset.k) return true;
    S.drafts['ql-kind'] = el.dataset.k; S.drafts['ql-cat'] = '';
    Object.assign(S.ql, { cats: keepCopy('qlCats-' + qlKind()) || [], tab: '', err: '', done: '' });
    render(); qlLoad(); return true;
  }
  if (a === 'qlSave') {
    const q = S.ql; if (!q || q.busy) return true;
    const g = k => String(S.drafts['ql-' + k] ?? '').trim();
    const item = { kind: qlKind(), date: g('date') || todayIso(), category: g('cat'), amount: g('amount'), notes: g('notes'),
      photo: q.photo ? { data: q.photo.data, type: q.photo.type, name: q.photo.name } : null };
    if (!(Number(item.amount.replace(/[$,\s]/g, '')) > 0)) { toast('Type the amount.'); return true; }
    if (!item.category) { toast('Pick a category.'); return true; }
    q.busy = true; q.done = ''; render();
    try {
      const r = await Sheets.logExpense(item);
      const msg = `$${Number(item.amount.replace(/[$,\s]/g, '')).toFixed(2)} · ${item.category} added to ${r.tab}${r.receipt ? ' (with the receipt)' : ''}.`;
      if (window.QUICKLOG_ONLY) { // the phone page stays open for the next one
        Object.assign(q, { busy: false, photo: null, done: msg, err: '' }); S.drafts['ql-amount'] = ''; S.drafts['ql-notes'] = ''; S.drafts['ql-cat'] = '';
      } else { S.ql = null; toast(msg); }
    } catch (e) { q.busy = false; q.err = 'Couldn’t add it: ' + e.message + (/unknown request/i.test(e.message) ? ' (the Admin Apps Script needs its new version deployed)' : ''); }
    render(); return true;
  }
  const d = el.dataset || {};
  switch (a) {
    case 'adminOpen': { const l = adminLinks().find(x => x.id === d.id); if (l) openPanel(l.name, fullUrl(l.url)); return true; }
    case 'adminOpenUrl': openPanel(d.name, d.url); return true;
    case 'inqCallsOnly': S.inqCallsOnly = d.v === '1'; pref('inqCallsOnly', d.v === '1' ? '1' : '0'); render(); return true; // remembered on this device
    case 'adminSide': await Store.set('meta/settings', { adminSide: d.v === 'todo' ? 'todo' : 'notes' }); return true;
    case 'adminNextAdd': {
      const k = 'add-anext-' + SETUP, text = String(S.drafts[k] || '').trim(), src = changesHome().src;
      if (!text || !src) return true;
      S.drafts[k] = ''; render();
      await Store.add('cohorts/' + src + '/todos', { text, done: false, day: SETUP, kind: 'next', order: Date.now(), created: Date.now() });
      return true;
    }
    case 'adminNextDone': {
      const x = (S.adminNext || []).find(i => i.id === d.id);
      if (x && nextFor) await Store.set('cohorts/' + nextFor + '/todos/' + d.id, { done: !x.done });
      return true;
    }
    case 'adminNextDel': if (nextFor) await Store.del('cohorts/' + nextFor + '/todos/' + d.id); return true;
    case 'inqCheck': await loadInquiries(true); return true;
    case 'inqSetOpen': {
      const st = (S.inq && S.inq.settings) || {};
      ['tuition', 'textbook', 'lateFee'].forEach(k => { S.drafts['iq-' + k] = st[k] || ''; });
      SEASONS_INQ.forEach(([k]) => [0, 1].forEach(i => { S.drafts['iq-' + k + '-' + i] = ((st.months || {})[k] || [])[i] || ''; }));
      S.inqSet = true; render(); return true;
    }
    case 'inqSetClose': if (!S.inqSaving) { S.inqSet = false; render(); } return true;
    case 'inqSetSave': {
      const g = k => String(S.drafts['iq-' + k] || '').trim();
      const settings = { tuition: g('tuition'), textbook: g('textbook'), lateFee: g('lateFee'), months: {} };
      SEASONS_INQ.forEach(([k]) => { settings.months[k] = [g(k + '-0'), g(k + '-1')]; });
      S.inqSaving = true; render();
      try { const saved = await Sheets.saveInquirySettings(settings); if (S.inq) S.inq.settings = saved; S.inqSet = false; toast('Reply settings saved.'); }
      catch (e) { alert('Couldn’t save: ' + e.message); }
      S.inqSaving = false; render(); return true;
    }
    case 'adminPanelClose': S.adminPanel = null; render(); return true;
    case 'adminInfoOpen': {
      const i = adminInfo();
      Object.keys(INFO_FIELDS).forEach(k => { S.drafts['ai-' + k] = i[k] || ''; });
      infoCustom().forEach(c => { S.drafts['aic-label-' + c.id] = c.label || ''; S.drafts['aic-value-' + c.id] = c.value || ''; });
      S.adminOrderDraft = infoOrder(); S.adminInfoEd = true; render(); return true;
    }
    case 'aiCustomAdd': {
      const id = Store.newId();
      S.drafts['aic-label-' + id] = ''; S.drafts['aic-value-' + id] = '';
      S.adminOrderDraft = [...S.adminOrderDraft, 'c:' + id]; render();
      setTimeout(() => { const el = document.getElementById('aic-label-' + id); if (el) el.focus(); }, 0); return true;
    }
    case 'aiCustomDel': S.adminOrderDraft = S.adminOrderDraft.filter(k => k !== 'c:' + d.id); render(); return true;
    case 'adminInfoClose': S.adminInfoEd = false; render(); return true;
    case 'adminInfoSave': {
      const info = Object.fromEntries(Object.keys(INFO_FIELDS).map(k => [k, String(S.drafts['ai-' + k] || '').trim()]));
      info.portal = fullUrl(info.portal); info.website = fullUrl(info.website);
      // Fields you added: a blank one (no name, nothing in it) is dropped; one with only a value is called "Other".
      const custom = S.adminOrderDraft.filter(k => k.startsWith('c:')).map(k => { const id = k.slice(2);
        return { id, label: String(S.drafts['aic-label-' + id] || '').trim(), value: String(S.drafts['aic-value-' + id] || '').trim() }; })
        .filter(c => c.label || c.value).map(c => ({ ...c, label: c.label || 'Other' }));
      const keep = new Set(custom.map(c => 'c:' + c.id));
      const order = S.adminOrderDraft.filter(k => !k.startsWith('c:') || keep.has(k));
      await Store.set('meta/admin', { info, custom, infoOrder: order });
      Object.keys(S.drafts).filter(k => k.startsWith('ai-') || k.startsWith('aic-')).forEach(k => delete S.drafts[k]);
      S.adminInfoEd = false; toast('Business info saved.'); render(); return true;
    }
    case 'linksEdOpen': S.menuOpen = false; S.linksDraft = adminLinks().map(l => ({ ...l, icon: l.icon ?? DEFAULT_LINK_ICON[l.id] ?? '' })); S.lkPick = null; render(); return true;
    case 'linksEdClose': S.linksDraft = null; S.lkPick = null; render(); return true;
    case 'lkPick': S.lkPick = S.lkPick === Number(d.i) ? null : Number(d.i); render(); return true;
    case 'lkIcon': S.linksDraft[Number(d.i)].icon = d.k; S.lkPick = null; render(); return true;
    case 'lkDel': S.linksDraft.splice(Number(d.i), 1); S.lkPick = null; render(); return true;
    case 'lkAdd': S.linksDraft.push({ id: Store.newId(), name: '', url: '', icon: '' }); render();
      setTimeout(() => { const i = document.getElementById('lk-' + (S.linksDraft.length - 1) + '-name'); if (i) i.focus(); }, 0); return true;
    case 'lkSave': {
      const links = S.linksDraft.map(l => ({ id: l.id, name: String(l.name || '').trim(), url: fullUrl(l.url), icon: l.icon || '' }));
      if (links.some(l => !l.name || !l.url)) { toast('Each link needs a name and a link (or remove it).'); return true; }
      await Store.set('meta/admin', { links }); S.linksDraft = null; S.lkPick = null; toast('Links saved.'); render(); return true;
    }
    case 'inqSec': S.inqOpen = { ...(S.inqOpen || {}), [d.s]: !(S.inqOpen || {})[d.s] }; render(); return true;
    case 'inqOpen': case 'inqNew': {
      const it = a === 'inqNew' ? {} : (S.inq.items.find(x => x.id === d.id) || {});
      ['name', 'phone', 'email', 'notes', 'cohort'].forEach(k => { S.drafts['ie2-' + k] = it[k] || ''; });
      S.drafts['ie2-status'] = (it.status && inqStatus(it)) || 'Needs follow-up'; S.drafts['ie2-received'] = todayIso();
      S.drafts['ie2-cdate'] = todayIso(); S.drafts['ie2-cnote'] = ''; S.drafts['ie2-source'] = 'Call'; S.drafts['ie2-message'] = '';
      S.inqEd = { item: it, isNew: a === 'inqNew', busy: false, log: false }; render(); return true;
    }
    case 'inqLogOpen': S.inqEd.log = true; render(); setTimeout(() => { const el = document.getElementById('ie2-cnote'); if (el) el.focus(); }, 0); return true;
    case 'inqStatus': S.drafts['ie2-status'] = d.s; render(); return true;
    case 'inqSource': // (Missed call only fits a call)
      S.drafts['ie2-source'] = d.s;
      if (d.s !== 'Call' && S.drafts['ie2-status'] === 'Missed call') S.drafts['ie2-status'] = 'Needs follow-up';
      render(); return true;
    case 'inqEdClose': if (!S.inqEd.busy) { S.inqEd = null; render(); } return true;
    case 'inqSave': {
      const e = S.inqEd, g = k => String(S.drafts['ie2-' + k] ?? '').trim();
      const item = { name: g('name'), phone: g('phone'), email: g('email'), notes: g('notes'), cohort: g('cohort'), status: g('status') };
      if (e.isNew) {
        item.received = g('received') || todayIso(); item.source = g('source') || 'Call';
        if (item.source === 'Email') item.message = g('message');
        if (!item.name && !item.phone && !item.email) { toast('Add a name, phone number or email.'); return true; }
      }
      else {
        item.id = e.item.id;
        if (e.log) item.contact = { d: g('cdate') || todayIso(), note: g('cnote') };
      }
      e.busy = true; render();
      try {
        const saved = await Sheets.saveInquiry(item);
        const list = S.inq.items, i = list.findIndex(x => x.id === saved.id);
        if (i >= 0) list[i] = saved; else list.unshift(saved);
        keepCopy('inq', S.inq);
        S.inqEd = null; toast(e.isNew ? (item.source || 'Call') + ' added.' : 'Saved.');
      } catch (err) { e.busy = false; alert('Couldn’t save: ' + err.message); }
      render(); return true;
    }
    case 'inqDelete': {
      const it = S.inqEd.item;
      if (!confirm(`Delete ${it.name || it.phone || it.email || 'this request'} from Info Requests?`)) return true;
      S.inqEd.busy = true; render();
      try { await Sheets.deleteInquiry(it.id); S.inq.items = S.inq.items.filter(x => x.id !== it.id); keepCopy('inq', S.inq); S.inqEd = null; }
      catch (err) { S.inqEd.busy = false; alert('Couldn’t delete: ' + err.message); }
      render(); return true;
    }
    case 'adminTodoOpen': S.adminTodoAdd = true; render(); setTimeout(() => { const i = document.getElementById('ad-todo'); if (i) i.focus(); }, 0); return true;
    case 'adminDateOpen': S.adminDateAdd = true; render(); setTimeout(() => { const i = document.getElementById('ad-text'); if (i) i.focus(); }, 0); return true;
    case 'adminDateCancel': S.adminDateAdd = false; delete S.drafts['ad-text']; delete S.drafts['ad-date']; render(); return true;
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
      delete S.drafts['ad-text']; delete S.drafts['ad-date']; S.adminDateAdd = false;
      await Store.add('adminDates', { date, text, created: Date.now() }); render(); return true;
    }
    case 'adminDateDel': await Store.del('adminDates/' + d.id); return true;
    case 'adminPastToggle': S.adminShowPast = !S.adminShowPast; render(); return true;
    case 'adminNoteAdd': {
      const first = Math.min(0, ...S.adminNotes.map(noteKey));
      const id = await Store.add('adminNotes', { text: '', color: 'yellow', created: Date.now(), order: first - 1000 });
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

// The To Do add line closes again when you click away and it's empty (it stays open after Enter for the next one).
document.addEventListener('focusout', e => {
  const t = e.target;
  if (!t.dataset || t.dataset.aclose !== 'todo' || S.rendering || t.value.trim()) return;
  setTimeout(() => { if (S.adminTodoAdd && !String(S.drafts['ad-todo'] || '').trim() && document.activeElement !== document.getElementById('ad-todo')) { S.adminTodoAdd = false; render(); } }, 150);
});

// Business Info edit window: drag a field by its grip to move it (works with a mouse or a finger).
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest && e.target.closest('[data-aigrip]');
  if (!grip) return;
  e.preventDefault();
  const row = grip.closest('.ai-row'), list = row.parentElement;
  S.dragging = { type: 'aiorder' }; // (no redraws mid-drag)
  row.classList.add('moving');
  const move = ev => {
    const after = [...list.children].find(c => c !== row && ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (after) { if (after !== row.nextSibling) list.insertBefore(row, after); } else if (list.lastElementChild !== row) list.appendChild(row);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    row.classList.remove('moving');
    S.adminOrderDraft = [...list.children].map(c => c.dataset.k);
    S.dragging = null; render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

// Sticky Notes: drag one by its grip to move it among the others (mouse or finger); the order is saved.
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest && e.target.closest('[data-ngrip]');
  if (!grip) return;
  e.preventDefault();
  const note = grip.closest('.sticky'), list = note.parentElement;
  S.dragging = { type: 'notes' }; // (no redraws mid-drag)
  note.classList.add('moving');
  const move = ev => {
    const over = [...list.children].find(c => c !== note && c.classList.contains('sticky') && (r => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom)(c.getBoundingClientRect()));
    if (!over) return;
    const r = over.getBoundingClientRect(), after = ev.clientX > r.left + r.width / 2;
    const ref = after ? over.nextSibling : over;
    if (ref !== note && note.nextSibling !== ref) list.insertBefore(note, ref);
  };
  const up = async () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    note.classList.remove('moving');
    const ids = [...list.querySelectorAll('.sticky')].map(c => c.dataset.nid);
    S.dragging = null;
    const was = [...S.adminNotes].sort((a, b) => noteKey(a) - noteKey(b)).map(n => n.id);
    if (ids.join() !== was.join()) {
      S.adminNotes = S.adminNotes.map(n => ({ ...n, order: ids.indexOf(n.id) * 1000 }));
      render();
      await Promise.all(ids.map((nid, i) => Store.set('adminNotes/' + nid, { order: i * 1000 })));
    } else render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

// Links window: drag a link by its grip to move it (mouse or finger).
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest && e.target.closest('[data-lkgrip]');
  if (!grip || !S.linksDraft) return;
  e.preventDefault();
  const row = grip.closest('.lk-row'), list = row.parentElement;
  S.dragging = { type: 'lkorder' }; S.lkPick = null; // (no redraws mid-drag)
  row.classList.add('moving');
  const move = ev => {
    const after = [...list.children].find(c => c !== row && ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (after) { if (after !== row.nextSibling) list.insertBefore(row, after); } else if (list.lastElementChild !== row) list.appendChild(row);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    row.classList.remove('moving');
    const order = [...list.children].map(c => Number(c.dataset.i));
    S.linksDraft = order.map(i => S.linksDraft[i]);
    S.dragging = null; render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

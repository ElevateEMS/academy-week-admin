/* Shipping file (Course To-Do → "Ship student shirts" → Shipping file): a Pirate Ship import file made
   from the cohort's "<cohort> Ride Along Agreements - Shirt Info" sheet (read through the Apps Script's
   shirtSheet; nothing is written back — you tick Shipped yourself after the UPS drop-off).
   Cleaned up for Pirate Ship: headers in row 1, Printed Name, 2-letter states, ZIPs keep their leading 0,
   the shirt size (and "x2") as the Rubber Stamp, the bubble mailer's weight and size on every row.
   Left out: rows ticked Shipped, and rows whose note says they don't need one (or XXX).
   A duplicate student keeps the newest row; older ones (and rows missing part of the address) start unchecked.
   The file is made in the browser; the addresses aren't saved anywhere. */

const PIRATE_SHIP_URL = 'https://ship.pirateship.com/';
const MAILER = { oz: 18, length: 13, width: 10.5 }; // 13 × 10.5 bubble mailer, 1 lb 2 oz
const STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN',
  iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'puerto rico': 'PR', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
const STATE_CODES = new Set(Object.values(STATES));

const shipState = s => { const t = String(s || '').trim().replace(/\./g, ''); return STATE_CODES.has(t.toUpperCase()) ? t.toUpperCase() : STATES[t.toLowerCase()] || ''; };
// 7869 → 07869 (the sheet drops the leading 0); 238385144 → 23838-5144
function shipZip(z) {
  const d = String(z || '').replace(/\D/g, '');
  if (d.length >= 3 && d.length <= 5) return d.padStart(5, '0');
  if (d.length >= 7 && d.length <= 9) { const f = d.padStart(9, '0'); return f.slice(0, 5) + '-' + f.slice(5); }
  return '';
}
// "2643 red lane rd" → "2643 Red Lane Rd" (only when it was typed all lowercase)
const shipCase = s => { s = String(s || '').trim().replace(/\s+/g, ' '); return s && s === s.toLowerCase() ? s.replace(/\b[a-z]/g, c => c.toUpperCase()) : s; };
// "Evans, Isabel (Milo)" → "Isabel Evans" (only when there's no Printed Name)
const shipName = (printed, full) => {
  if (String(printed || '').trim()) return String(printed).trim().replace(/\s+/g, ' ');
  const f = String(full || '').replace(/\(.*?\)/g, '').trim(), m = f.match(/^([^,.]+)[,.]\s*(.+)$/);
  return (m ? m[2] + ' ' + m[1] : f).replace(/\s+/g, ' ').trim();
};

// The sheet's rows → what goes in the file, what's flagged, and what's left out (and why).
function shipRows(raw) {
  const out = [], skipped = [];
  raw.forEach(r => {
    const name = shipName(r.printed, r.full);
    if (r.shipped) return skipped.push({ name, why: 'Already shipped' });
    if (/don.?t need|doesn.?t need|no shirt/i.test(r.note + ' ' + r.unit)) return skipped.push({ name, why: 'Doesn’t need a shirt' });
    if (/^x+$/i.test(r.note.trim())) return skipped.push({ name, why: 'Marked XXX' });
    const flags = [];
    let unit = r.unit.trim();
    if (unit && (/[()]/.test(unit) || unit.split(/\s+/).length > 3 || unit.length > 18)) { flags.push(`Apt/Unit box says “${unit}” (left off)`); unit = ''; }
    else if (/^\d+[a-z]?$/i.test(unit)) unit = '#' + unit;
    const state = shipState(r.state), zip = shipZip(r.zip);
    const street = shipCase(r.street), city = shipCase(r.city);
    if (!street || !city || !state || !zip) flags.push('Missing ' + [!street && 'street', !city && 'city', !state && 'state', !zip && 'ZIP'].filter(Boolean).join(', '));
    const many = (r.note.match(/(\d+)\s*shirts?/i) || [])[1];
    const stamp = [r.size, many && Number(many) > 1 ? 'x' + many : ''].filter(Boolean).join(' ');
    if (r.note && !many) flags.push(`Note: ${r.note}`);
    out.push({ row: r.row, key: (r.email || name).toLowerCase(), name, email: r.email, street, unit, city, state, zip, stamp,
      flags, bad: !street || !city || !state || !zip, on: true });
  });
  // The same student twice: the newest row (lowest in the sheet) is the one that's checked.
  const last = {};
  out.forEach((x, i) => { last[x.key] = i; });
  out.forEach((x, i) => { if (last[x.key] !== i) { x.flags.push('Older submission (a newer one is below)'); x.on = false; } else if (out.some((y, j) => j !== i && y.key === x.key)) x.flags.push('Newest of their submissions'); });
  out.forEach(x => { if (x.bad) x.on = false; });
  return { rows: out, skipped };
}

const csvCell = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function shipCsv(rows) {
  const head = ['Name', 'Address', 'Address Line 2', 'City', 'State', 'Zipcode', 'Country', 'Email', 'Weight (oz)', 'Length (in)', 'Width (in)', 'Height (in)', 'Shirt'];
  const lines = rows.map(x => [x.name, x.street, x.unit, x.city, x.state, x.zip, 'US', x.email, MAILER.oz, MAILER.length, MAILER.width, '', x.stamp]);
  return [head, ...lines].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

async function shipLoad() {
  S.ship = { busy: true, err: '', rows: [], skipped: [] }; render();
  try {
    const res = await Sheets.shirtSheet(S.cohortKey);
    const { rows, skipped } = shipRows(res.rows || []);
    S.ship = { busy: false, err: '', rows, skipped, name: res.name, url: res.url };
  } catch (e) {
    S.ship = { busy: false, err: /unknown request/i.test(e.message) ? 'The Admin Apps Script needs its new version deployed.' : e.message, rows: [], skipped: [] };
  }
  render();
}

function shipModal() {
  const p = S.ship, on = p.rows.filter(x => x.on).length;
  const row = (x, i) => `<li class="${x.on ? '' : 'ship-off'}">
      <label>${circle(x.on, `data-act="shipToggle" data-i="${i}"`)}<span class="ship-main">
        <span class="ship-name">${esc(x.name)}${x.stamp ? ` <span class="ship-size">${esc(x.stamp)}</span>` : ''}</span>
        <span class="ship-addr">${esc([x.street, x.unit].filter(Boolean).join(' '))}, ${esc(x.city)}, ${esc(x.state)} ${esc(x.zip)}</span>
        ${x.flags.map(f => `<span class="ship-flag">${esc(f)}</span>`).join('')}</span></label></li>`;
  return `<div class="overlay" data-act="shipClose"><div class="modal ship-modal" data-stop>
    <div class="modal-head"><h2>Shipping File</h2><button class="x big" data-act="shipClose" aria-label="Close">×</button></div>
    <div class="modal-body pad-top">
      ${p.busy ? '<p class="loading">Reading the shirt sheet…</p>' : ''}
      ${p.err ? `<div class="alert">${esc(p.err)}</div>` : ''}
      ${!p.busy && !p.err ? `<p class="muted small">From <a href="${esc(p.url)}" target="_blank" rel="noopener" data-name="${esc(p.name)}">${esc(p.name)}</a>.
          Uncheck anyone you don’t want. To change an address, fix it in the sheet, then <button class="link" data-act="shipReload">read it again</button>.</p>
        <ul class="checks ship-list">${p.rows.map(row).join('') || '<li class="empty">Nobody left to ship to.</li>'}</ul>
        ${p.skipped.length ? `<details class="ship-skipped"><summary>${p.skipped.length} left out</summary>
          <ul>${p.skipped.map(x => `<li>${esc(x.name)} <span class="muted small">· ${esc(x.why)}</span></li>`).join('')}</ul></details>` : ''}
        <p class="muted small ship-how">In Pirate Ship: Import Spreadsheet → choose this file. Every row comes in as the 13 × 10.5 bubble mailer, 1 lb 2 oz; the shirt size prints in the label’s corner if you match <b>Shirt</b> to Rubber Stamp the first time.</p>` : ''}
    </div>
    <div class="modal-foot"><a class="btn small" href="${PIRATE_SHIP_URL}" target="_blank" rel="noopener" data-chrome>Pirate Ship ↗</a>
      <button class="btn primary" data-act="shipDownload" ${on && !p.busy ? '' : 'disabled'}>Download file · ${on} label${on === 1 ? '' : 's'}</button></div>
  </div></div>`;
}

async function shipAct(a, el = {}) {
  const d = el.dataset || {};
  switch (a) {
    case 'shipOpen': case 'shipReload': await shipLoad(); return true;
    case 'shipClose': S.ship = null; render(); return true;
    case 'shipToggle': { const x = S.ship.rows[Number(d.i)]; if (x) x.on = !x.on; render(); return true; }
    case 'shipDownload': {
      const rows = S.ship.rows.filter(x => x.on);
      if (!rows.length) return true;
      const url = URL.createObjectURL(new Blob([shipCsv(rows)], { type: 'text/csv' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: S.cohortKey + ' Pirate Ship.csv' });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Downloaded ${rows.length} label${rows.length === 1 ? '' : 's'} for Pirate Ship.`); return true;
    }
  }
  return false;
}

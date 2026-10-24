/* Print packet (Course To-Do → "Ship student shirts" → Print packet): one PDF to print and ship with
   the students' shirts. For each student, in order (DEFAULTS.printPacket): the Ride Along & Academy
   Week Guide and the Patient Contact Instructions (Google Docs, pulled fresh each time through the
   Apps Script's docPdf), the Clinical Training Record, and 10 Patient Contact Forms (PDFs kept with
   the app). Put together in the browser with pdf-lib, loaded the first time it's needed. */

const PRINTER_SMALL = '<svg class="btn-ic" viewBox="0 0 24 24"><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>';
const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

let pdfLibLoading = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!pdfLibLoading) pdfLibLoading = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = PDF_LIB_URL; s.onload = () => ok(window.PDFLib);
    s.onerror = () => { pdfLibLoading = null; fail(new Error('Couldn’t load the PDF tool. Check the internet connection and try again.')); };
    document.head.appendChild(s);
  });
  return pdfLibLoading;
}
const b64Bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

function packetModal() {
  const p = S.packet, list = DEFAULTS.printPacket;
  if (p.url) {
    return `<div class="overlay" data-act="packetClose"><div class="modal pdf packet-view" data-stop>
      <div class="modal-head"><h2>Print Packet <span class="muted small">${p.count} student${p.count === 1 ? '' : 's'} · ${p.pages} pages</span></h2>
        <span class="panel-actions"><a class="btn small" href="${p.url}" target="_blank" rel="noopener">Open in new tab ↗</a>
        <button class="btn small primary" data-act="packetPrint">${PRINTER_SMALL} Print</button>
        <button class="x big" data-act="packetClose" aria-label="Close">×</button></span></div>
      <iframe id="packetFrame" src="${p.url}" title="Print packet"></iframe>
    </div></div>`;
  }
  return `<div class="overlay" data-act="packetClose"><div class="modal small-modal" data-stop>
    <div class="modal-head"><h2>Print Packet</h2>${p.busy ? '' : '<button class="x big" data-act="packetClose" aria-label="Close">×</button>'}</div>
    <div class="modal-body pad-top">
      <p class="muted small">One PDF, already in order, one packet per student. The two Google Docs are pulled fresh, so your latest edits are in it.</p>
      <ol class="packet-list">${list.map(x => `<li>${x.copies > 1 ? `<b>${x.copies}×</b> ` : ''}${esc(x.name)}${x.doc ? ' <span class="muted small">(Google Doc)</span>' : ''}</li>`).join('')}</ol>
      <div class="packet-count"><span>Students</span>
        <button class="btn tiny" data-act="packetCount" data-by="-1" ${p.busy || p.count <= 1 ? 'disabled' : ''} aria-label="One fewer">−</button>
        <b>${p.count}</b>
        <button class="btn tiny" data-act="packetCount" data-by="1" ${p.busy ? 'disabled' : ''} aria-label="One more">+</button>
        <span class="muted small">${students().length} enrolled</span></div>
      ${p.err ? `<div class="alert">${esc(p.err)}</div>` : ''}
    </div>
    <div class="modal-foot">${p.busy ? '<span class="muted small">Putting it together…</span>' : ''}
      <button class="btn primary" data-act="packetMake" ${p.busy ? 'disabled' : ''}>${p.busy ? 'Working…' : 'Make the PDF'}</button></div>
  </div></div>`;
}
function packetClose() {
  if (S.packet && S.packet.url) URL.revokeObjectURL(S.packet.url);
  S.packet = null; render();
}

// One source file as a PDF document: a Google Doc (base64 from the Apps Script) or a PDF kept with the app.
// In sample mode a Google Doc comes back empty, so a stand-in page says what goes there.
async function packetSource(PDFLib, item) {
  if (item.pdf) {
    const res = await fetch(item.pdf);
    if (!res.ok) throw new Error(`Couldn’t open ${item.name} (${item.pdf}).`);
    return PDFLib.PDFDocument.load(await res.arrayBuffer());
  }
  let b64;
  try { b64 = await Sheets.docPdf(item.doc); } catch (e) {
    throw new Error(`Couldn’t get “${item.name}” from Google Docs: ${e.message}${/unknown request/i.test(e.message) ? ' (the Admin Apps Script needs its new version deployed)' : ''}`);
  }
  if (b64) return PDFLib.PDFDocument.load(b64Bytes(b64));
  const doc = await PDFLib.PDFDocument.create(), page = doc.addPage([612, 792]);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  page.drawText(item.name, { x: 72, y: 700, size: 20, font });
  page.drawText('(Sample mode: the real app puts the Google Doc here.)', { x: 72, y: 670, size: 12, font });
  return doc;
}
async function packetMake() {
  const p = S.packet; p.busy = true; p.err = ''; render();
  try {
    const PDFLib = await loadPdfLib();
    const list = DEFAULTS.printPacket;
    const sources = await Promise.all(list.map(item => packetSource(PDFLib, item)));
    const out = await PDFLib.PDFDocument.create();
    for (let s = 0; s < p.count; s++) {
      for (let i = 0; i < list.length; i++) {
        for (let c = 0; c < (list[i].copies || 1); c++) {
          const pages = await out.copyPages(sources[i], sources[i].getPageIndices());
          pages.forEach(pg => out.addPage(pg));
        }
      }
    }
    const bytes = await out.save();
    p.url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    p.pages = out.getPageCount();
  } catch (e) { p.err = e.message; }
  p.busy = false; render();
}
async function packetAct(a, el = {}) {
  const d = el.dataset || {};
  switch (a) {
    case 'packetOpen': S.packet = { count: Math.max(1, students().length), busy: false, err: '' }; render(); return true;
    case 'packetClose': if (S.packet && S.packet.busy) return true; packetClose(); return true;
    case 'packetCount': S.packet.count = Math.max(1, S.packet.count + Number(d.by)); render(); return true;
    case 'packetMake': await packetMake(); return true;
    case 'packetPrint': {
      const f = document.getElementById('packetFrame');
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(S.packet.url, '_blank'); }
      return true;
    }
  }
  return false;
}

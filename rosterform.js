/* Your "EMS Course Roster" form, filled in. Shared by the admin app (roster.js: the finished roster)
   and the student signing page (sign.html: the roster as the student sees it, then their own copy).

   RosterForm.fill(PDFLib, {
     date: 'MM/DD/YYYY', courseNo, topic: 'Orientation',
     people: [{ name, times, png }],            // png (base64 or data URL) only where a signature goes
     inst: { nick: png, bella: png },          // the Instructors lines
     ec: { name, png, date: 'MM/DD/YYYY' },     // the bottom line (Instructor, Printed Name / Signature / Date)
   }) → PDF bytes. Up to 15 people: orientation-roster-1.pdf; 16-30: orientation-roster-2.pdf.
   RosterForm.slot(i, count) → where person i's row is ({ page, top, bottom } in points from the top of the page). */
const RosterForm = (() => {
  // Measured from the two forms (points from the top of the page; pdf-lib counts from the bottom).
  const FORMS = {
    one: { file: 'orientation-roster-1.pdf', info: 138, inst: [[159.4, 187.9], [187.9, 216.4]],
      rows: [[0, [265.1, 292.1, 319.1, 346.1, 373.9, 400.9, 427.9, 454.9, 482.6, 509.6, 536.6, 563.6, 590.6, 618.4, 645.4, 672.4]]], bottom: { page: 0, base: 728 } },
    two: { file: 'orientation-roster-2.pdf', info: 147, inst: [[168.5, 197.5], [197.5, 225.5]],
      rows: [[0, [283.5, 311.5, 338.5, 365.5, 392.5, 419.5, 446.5, 473.5, 501.5, 528.5, 555.5, 582.5, 609.5, 636.5, 664.5, 691.5]],
        [1, [154.5, 181.5, 208.5, 236.5, 263.5, 290.5, 317.5, 344.5, 371.5, 399.5, 426.5, 453.5, 480.5, 507.5, 534.5, 562.5]]], bottom: { page: 1, base: 715 } },
  };
  const COLS = { name: [74, 210], times: [331, 429], sig: [429.5, 577], instSig: [374, 573], courseNo: [233, 374], topic: [374, 573],
    bName: [36.5, 242], bSig: [242, 431], bDate: [431, 581] };
  const MAX = 30, H = 792, W = 612;
  const formFor = n => n > 15 ? FORMS.two : FORMS.one;
  const slots = form => form.rows.flatMap(([page, lines]) => lines.slice(0, -1).map((top, i) => ({ page, top, bottom: lines[i + 1] })));
  const bytesOf = png => { const b64 = String(png).startsWith('data:') ? String(png).split(',')[1] : String(png); return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); };

  async function fill(PDFLib, d) {
    const people = d.people || [], form = formFor(people.length);
    const res = await fetch(form.file);
    if (!res.ok) throw new Error('Couldn’t open the roster form (' + form.file + ').');
    const pdf = await PDFLib.PDFDocument.load(await res.arrayBuffer()), pages = pdf.getPages();
    const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), ink = PDFLib.rgb(0.05, 0.12, 0.23);
    const fit = (s, w, size) => { while (size > 6 && font.widthOfTextAtSize(s, size) > w) size -= 0.5; return size; };
    const text = (pg, s, x, top, size) => pg.drawText(s, { x, y: H - top, size, font, color: ink });
    const center = (pg, s, [x0, x1], top) => { s = String(s || ''); if (!s) return; const z = fit(s, x1 - x0 - 6, 10); text(pg, s, (x0 + x1) / 2 - font.widthOfTextAtSize(s, z) / 2, top, z); };
    const left = (pg, s, [x0, x1], top) => { s = String(s || ''); if (s) text(pg, s, x0 + 5, top, fit(s, x1 - x0 - 8, 10)); };
    const imgs = {};
    // A signature centered in its box (top/bottom from the top of the page).
    const sig = async (pg, png, [x0, x1], top, bottom, pad = 3) => {
      const img = imgs[png] || (imgs[png] = await pdf.embedPng(bytesOf(png)));
      const bw = x1 - x0 - pad * 2, bh = bottom - top - pad * 2, k = Math.min(bw / img.width, bh / img.height), w = img.width * k, h = img.height * k;
      pg.drawImage(img, { x: x0 + (x1 - x0 - w) / 2, y: H - bottom + (bottom - top - h) / 2, width: w, height: h });
    };

    if (d.date) pages.forEach(pg => text(pg, d.date, 68, 63.5, 10)); // Date: ____ (each page)
    center(pages[0], d.courseNo, COLS.courseNo, form.info);
    center(pages[0], d.topic || 'Orientation', COLS.topic, form.info);
    const inst = d.inst || {};
    for (const [i, key] of ['nick', 'bella'].entries()) if (inst[key]) await sig(pages[0], inst[key], COLS.instSig, form.inst[i][0], form.inst[i][1]);
    const rows = slots(form);
    for (const [i, p] of people.slice(0, MAX).entries()) {
      const s = rows[i], pg = pages[s.page], mid = (s.top + s.bottom) / 2 + 3.5;
      left(pg, p.name, COLS.name, mid);
      center(pg, p.times, COLS.times, mid);
      if (p.png) await sig(pg, p.png, COLS.sig, s.top, s.bottom, 2.5);
    }
    const ec = d.ec || {};
    if (ec.name && ec.png) {
      const pg = pages[form.bottom.page], base = form.bottom.base;
      center(pg, ec.name, COLS.bName, base - 1);
      await sig(pg, ec.png, COLS.bSig, base - 30, base + 1, 1);
      center(pg, ec.date || d.date, COLS.bDate, base - 1);
    }
    if (d.title) pdf.setTitle(d.title);
    return pdf.save();
  }

  return { fill, MAX, W, H, COLS, slot: (i, count) => slots(formFor(count))[i] };
})();

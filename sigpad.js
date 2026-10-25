/* Signature pad: draw with a finger, Apple Pencil, mouse or trackpad (the same smooth strokes as the
   Student Hub's Ride Along signature). Used by the student signing page (sign.html) and the
   instructor signatures on an orientation roster (roster.js).

   const pad = SigPad(canvas);  pad.clear();  pad.hasInk();  pad.png()  → a PNG (data URL) cropped to the ink,
   or '' when nothing is drawn. */
function SigPad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, ink = false, points = [], box = null;

  function size() {
    const ratio = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width === w && canvas.height === h) return; // (resizing wipes the drawing, so only when it really changed)
    canvas.width = w; canvas.height = h;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = '#0b1f3a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ink = false; box = null;
  }
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const grow = p => { box = box ? { x0: Math.min(box.x0, p.x), y0: Math.min(box.y0, p.y), x1: Math.max(box.x1, p.x), y1: Math.max(box.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; };

  canvas.style.touchAction = 'none'; // so a finger draws instead of scrolling the page
  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    size(); drawing = true; ink = true;
    const p = pos(e); points = [p]; grow(p);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.01, p.y + 0.01); ctx.stroke(); // a dot shows on a tap
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (list.length ? list : [e]).forEach(ev => {
      const p = pos(ev); points.push(p); grow(p);
      if (points.length > 2) {
        const prev = points[points.length - 2], mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y); ctx.stroke();
      }
    });
    e.preventDefault();
  });
  const end = () => { drawing = false; points = []; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (!ink) size(); });
  size();

  return {
    clear() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); ink = false; box = null; },
    hasInk: () => ink,
    resize: size,
    // Cropped to the signature (plus a little room), so it fits a roster line nicely.
    png() {
      if (!ink || !box) return '';
      const ratio = canvas.width / canvas.getBoundingClientRect().width || 1, padPx = 6;
      const x = Math.max(0, Math.floor((box.x0 - padPx) * ratio)), y = Math.max(0, Math.floor((box.y0 - padPx) * ratio));
      const w = Math.min(canvas.width - x, Math.ceil((box.x1 - box.x0 + padPx * 2) * ratio));
      const h = Math.min(canvas.height - y, Math.ceil((box.y1 - box.y0 + padPx * 2) * ratio));
      const out = document.createElement('canvas');
      const scale = Math.min(1, 900 / w); // keep the file small
      out.width = Math.max(1, Math.round(w * scale)); out.height = Math.max(1, Math.round(h * scale));
      out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
}

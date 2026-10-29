/* Offline copy of the app (registered by app.js).
   The app's own files: fetched fresh when there's internet (and the copy updated), the saved copy when there isn't.
   Firebase's scripts and the fonts: the saved copy first (they never change at the same address).
   The Google Sheets (Apps Script), Firebase data and sign-in are never touched here: Firebase keeps its own
   offline copy, and changes for the Sheets wait in the outbox (sheets.js). */
const CACHE = 'aw-offline-v1'; // (a new name here clears the old copy)
const PAGES = ['./', 'index.html', 'calls.html', 'quicklog.html'];
// Files the app loads by itself (not listed in the pages): the logos and the PDFs for the print packets.
const EXTRA = ['logo.png', 'logo-full.png', 'logo-laptop.png', 'skills-tracking.pdf', 'clinical-training-record.pdf', 'patient-contact-form.pdf',
  'skills-assessment.pdf', 'skills-airway.pdf', 'skills-bleeding.pdf', 'skills-spinal.pdf', 'skills-splinting.pdf', 'skills-traction.pdf',
  'skills-scenario-eval.pdf', 'vitals-academy-week.pdf', 'orientation-roster-1.pdf', 'orientation-roster-2.pdf'];
const CDN = /^https:\/\/(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;

// On install: the pages, plus every script, stylesheet and icon they load.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE), urls = new Set([...PAGES, ...EXTRA]);
    for (const page of PAGES.slice(1)) {
      try {
        const html = await (await fetch(page, { cache: 'no-cache' })).text();
        for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^(#|mailto:|data:)/.test(m[1])) urls.add(m[1]);
      } catch { /* (offline while installing: the next visit fills it in) */ }
    }
    await Promise.all([...urls].map(async u => {
      const cross = /^https?:/.test(u);
      if (cross && !CDN.test(u)) return;
      try { // (cache.add won't take another site's script, so it's fetched and put in by hand)
        const req = new Request(u, cross ? { mode: 'no-cors' } : { cache: 'no-cache' }), res = await fetch(req);
        if (res.ok || res.type === 'opaque') await cache.put(cross ? u : req, res);
      } catch { /* skipped: filled in on the next visit */ }
    }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(fresh(req)); return; }
  if (CDN.test(req.url)) e.respondWith(saved(req));
});
// Same site: the network first (so an upload shows up right away), the saved copy when offline.
// (?v= numbers change with each upload, so the saved copy is matched without them.)
async function fresh(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html', { ignoreSearch: true }) : null);
    return hit || new Response('Offline, and this isn’t saved on this device yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
async function saved(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }
  catch { return new Response('', { status: 503 }); }
}

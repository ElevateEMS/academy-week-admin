/* New cohort documents: "<cohort> Hybrid EMT Syllabus" (dates filled in), "<cohort> Suggested Schedule",
   and an "Admin - <cohort>" folder with "<cohort> Dropped Students Record", made in the cohort's Drive
   folder by the Admin Apps Script (makeCohortDocs). Made right after "+ New cohort"; for any other
   cohort, Course Details has a "Make syllabus & schedule" button. Links are kept as cohorts/{key}.docs.
   The dates come from Course Details, written the way the syllabus writes them. Blank ones say TBD. */

const SYL_WD = ['Sun.', 'Mon.', 'Tues.', 'Wed.', 'Thurs.', 'Fri.', 'Sat.'];
const sylMonth = d => d.toLocaleDateString('en-US', { month: 'long' });
// "May 23rd, 2026" / "May 23rd" / "Sat., May 23rd" / "Sunday, September 13th, 2026"
const sylDate = (iso, { year = true } = {}) => { if (!isIsoDate(iso)) return ''; const d = parseIso(iso); return sylMonth(d) + ' ' + ordinal(d.getDate()) + (year ? ', ' + d.getFullYear() : ''); };
const sylDay = iso => isIsoDate(iso) ? SYL_WD[parseIso(iso).getDay()] + ', ' + sylDate(iso, { year: false }) : '';
const sylLong = iso => isIsoDate(iso) ? parseIso(iso).toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + sylDate(iso) : '';
// "August 8-12, 2026", "May 30-June 3, 2026", "December 30, 2026-January 3, 2027"
function sylRange(a, b) {
  if (!isIsoDate(a) || !isIsoDate(b)) return '';
  const x = parseIso(a), y = parseIso(b);
  if (x.getFullYear() !== y.getFullYear()) return sylMonth(x) + ' ' + x.getDate() + ', ' + x.getFullYear() + '-' + sylMonth(y) + ' ' + y.getDate() + ', ' + y.getFullYear();
  if (x.getMonth() !== y.getMonth()) return sylMonth(x) + ' ' + x.getDate() + '-' + sylMonth(y) + ' ' + y.getDate() + ', ' + y.getFullYear();
  return sylMonth(x) + ' ' + x.getDate() + '-' + y.getDate() + ', ' + y.getFullYear();
}
function syllabusFills() {
  const i = cohortInfo(), c = emCohortPerson(), aw = (S.sheet && S.sheet.academyStart) || '';
  const days = [1, 2, 3, 4, 5].map(dayDate);
  const f = {
    term: S.cohortKey || '',
    'orientation date': sylDate(c.orient), 'orientation day': sylDay(c.orient),
    'academy week dates': sylRange(days[0], days[4]),
    'cpr date': sylLong(i.cpr),
    'coursework deadline': isIsoDate(aw) ? sylDate(addDays(aw, -1)) + ' at 8:00 AM' : '',
    'next due': sylDate(c.next, { year: false }), 'final due': sylDate(c.final, { year: false }),
  };
  days.forEach((iso, n) => { f['day ' + (n + 1)] = sylDay(iso); });
  return f;
}
const cohortDocs = () => (S.cohortDoc && S.cohortDoc.docs) || null;

// The links (or the button) under Course Details.
function cohortDocLinks() {
  const d = cohortDocs();
  if (S.docsBusy === S.cohortKey) return '<span class="muted small">Making the syllabus and schedule…</span>';
  if (!d) return `<button class="btn small" data-act="makeDocs" title="Copies the syllabus (with this cohort’s dates), the suggested schedule and an Admin folder into the cohort folder">Make syllabus & schedule</button>`;
  return `<a class="btn small" href="${esc(d.syllabus)}" target="_blank" rel="noopener">Syllabus ↗</a>
    <a class="btn small" href="${esc(d.schedule)}" target="_blank" rel="noopener">Schedule ↗</a>
    <a class="btn small" href="${esc(d.adminFolder)}" target="_blank" rel="noopener">Admin folder ↗</a>`;
}
async function makeCohortDocs({ quiet = false } = {}) {
  const key = S.cohortKey;
  if (!key || !S.sheet || S.docsBusy === key) return;
  S.docsBusy = key; render();
  try {
    const res = await Sheets.makeCohortDocs(key, syllabusFills());
    await Store.set('cohorts/' + key, { docs: res.docs });
    const tbd = Object.entries(syllabusFills()).filter(([, v]) => !v).map(([k]) => k);
    if (!quiet || tbd.length) toast(`${res.made.length ? 'Made ' + res.made.join(', ') : 'They were already there'}.${tbd.length ? ' Some dates say TBD in the syllabus (' + tbd.join(', ') + ').' : ''}`);
  } catch (e) {
    alert(`Couldn’t make ${key}’s syllabus and schedule:\n\n${e.message}`);
  } finally { if (S.docsBusy === key) S.docsBusy = null; render(); }
}

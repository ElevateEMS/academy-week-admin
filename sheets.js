/* Talks to the "Elevate EMS Admin" Apps Script (was "Academy Week Admin Backend"), which reads the Google Sheets:
     listCohorts                 -> Student Cohort Config, "Cohorts" tab
     loadCohort(key)             -> that cohort's Student Roster tab (names, column P, Academy Week Start)
                                    and its Staffing tab (who works which day)
     changeContacts(key, s, by)  -> adds/subtracts from that student's column P
     listScenarios               -> the scenario Docs in the Medical and Trauma folders (names, links)
     createCohort(key, info)     -> adds a cohort to the config sheet; the Student Hub script makes its folder + sheets,
                                    then any course details typed in go into its settings box
     setStatus(key, status)      -> Upcoming / Active / Former in the config sheet (column F); Former moves the
                                    cohort folder into "Former Cohorts" (and back to My Drive if made current again)
     saveSettings(key, info)     -> writes course details (only the fields sent) into the settings box
     createDrafts(drafts)        -> puts emails in gbrown@'s Gmail Drafts ({ to, cc, bcc, subject, html, text }); never sends
     docPdf(id)                  -> a Google Doc as a PDF (base64), for the shirt-shipping print packet
     makeCohortDocs(key, fills)  -> the cohort's syllabus (dates filled in), suggested schedule and Admin folder
     cohortDates                 -> each Upcoming/Active cohort's Orientation, Full CPR and Academy Week start
                                    (for Key Dates on the Admin page)
     listInquiries / checkInquiries / saveInquiry / deleteInquiry / saveInquirySettings
                                 -> the Info Requests tracker on the Admin page (the config sheet's Info Requests tab)
     signLinks(key, roster, names) -> each student's private orientation roster signing link code (Test cohorts until December)
     rosterSigs(key, date)       -> the signatures on one orientation roster so far (app database), with the images
     saveRosterList(key, date, list) -> who's on that roster (names, times), for the student signing page
     clearRosterSig(key, date, name) -> takes one off and unticks their Orientation Roster box (H)
     saveRosterPdf(key, name, pdf) -> the finished roster PDF (base64) into the cohort's Admin folder (replaces one of the same name)
     rosterPdfFile(url)          -> a saved roster PDF back out of Drive ({ pdf (base64), name }), for Download
     resetTestCohort(key, typed) -> a Test cohort back to brand new (app data, its sheet's rows, its folder's files to the trash)

   Each student comes with their email (C), Textbook (D), Next (E) and Final (F) installment checkboxes, and
   their first class assignments: First Class Paperwork (G) as fcp, Orientation Roster (H) as orientRoster,
   Ride Along Agreement (L) as rideAgreement.
   loadCohort also brings the cohort's settings box (AF/AG: JBL code, dates, Meet link,
   review dates, and the VAOEMS course # in AF4 / late course # in AG4) as `info`, plus its status and links
   to its sheet and folder.

   In sample mode it answers with pretend data instead. */
const Sheets = (() => {
  if (!Store.configured) return sampleSheets();

  async function call(action, params = {}) {
    const token = await Store.idToken();
    // Sent as plain text on purpose: Apps Script can't answer the extra "preflight"
    // check browsers make for JSON requests.
    const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action, token, ...params }) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'The Google Sheet didn’t answer.');
    return out;
  }

  return {
    listCohorts: () => call('listCohorts').then(o => o.cohorts),
    loadCohort: key => call('loadCohort', { cohort: key }),
    changeContacts: (key, student, by) =>
      call('changeContacts', { cohort: key, row: student.row, name: student.name, by }).then(o => o.count),
    listScenarios: () => call('listScenarios').then(o => o.scenarios),
    createCohort: (key, info) => call('createCohort', { cohort: key, info }),
    setStatus: (key, status) => call('setStatus', { cohort: key, status }),
    saveSettings: (key, info) => call('saveSettings', { cohort: key, info }).then(o => o.info),
    createDrafts: drafts => call('createDrafts', { drafts }), // { count, warning } (warning: made without your signature)
    docPdf: id => call('docPdf', { id }).then(o => o.pdf), // a Google Doc as a PDF (base64), for the print packet
    makeCohortDocs: (key, fills) => call('makeCohortDocs', { cohort: key, fills }), // { made, found, docs: { syllabus, schedule, adminFolder, dropped } }
    listInquiries: () => call('listInquiries'),     // website info requests: { items, settings, waitingReason, lastCheck, timerOn }
    checkInquiries: () => call('checkInquiries'),   // check now (makes any drafts), then the same as listInquiries
    saveInquirySettings: settings => call('saveInquirySettings', { settings }).then(o => o.settings),
    saveInquiry: item => call('saveInquiry', { item }).then(o => o.item),   // a call you add, or changes to a row
    deleteInquiry: id => call('deleteInquiry', { id }),
    cohortDates: () => call('cohortDates').then(o => o.cohorts), // [{ key, status, firstDay, cpr, academyStart }]
    shirtSheet: key => call('shirtSheet', { cohort: key }), // { name, url, rows: [{ row, printed, full, email, size, street, unit, city, state, zip, shipped, note }] }
    signLinks: (key, roster, names) => call('signLinks', { cohort: key, roster, names }).then(o => o.links), // { name: code }
    rosterSigs: (key, date) => call('rosterSigs', { cohort: key, date }).then(o => o.sigs), // [{ name, signedAt, late, png (base64) }]
    saveRosterList: (key, date, list) => call('saveRosterList', { cohort: key, date, list }), // who's on it, for the signing page
    clearRosterSig: (key, date, name) => call('clearRosterSig', { cohort: key, date, name }),
    saveRosterPdf: (key, name, pdf) => call('saveRosterPdf', { cohort: key, name, pdf }), // { url, name, replaced }
    rosterPdfFile: url => call('rosterPdfFile', { url }), // { pdf (base64), name }
    resetTestCohort: (key, typed) => call('resetTestCohort', { cohort: key, confirm: typed }), // { docs, trashed, sheetsCleared }
  };
})();

const sampleInquiries = {
  items: [
    { id: 'a', received: '2026-10-24', source: 'Website', name: 'Daya Bugg', email: 'daya@example.com', phone: '(686) 202-1935', message: 'Looking for more info', cohort: 'Spring 2027', status: 'Needs follow-up', notes: '', reply: 'Drafted 2026-10-24' },
    { id: 'b', received: '2026-10-20', source: 'Voicemail', name: 'Katie Rich', email: '', phone: '(276) 439-9044', message: 'hi my name is Katie rich I was calling to speak to someone about the program if someone could call me back', cohort: 'Spring 2027', status: 'Needs follow-up', notes: '', reply: '' },
    { id: 'c', received: '2026-10-02', source: 'Website', name: 'Sam Rivera', email: 'sam@example.com', phone: '', message: 'Can you tell me more about the program?', cohort: 'Spring 2027', status: 'Responded', notes: 'Asked about payment plan', reply: 'Drafted 2026-10-02' },
    { id: 'd', received: '2026-09-12', source: 'Call', name: 'Jordan Lee', email: 'jordan@example.com', phone: '(804) 555-0182', message: '', cohort: 'Fall 2026', status: 'Enrolled', notes: '', reply: '' },
  ],
  cohorts: ['Fall 2026', 'Spring 2027'],
  settings: { tuition: '$1,500', textbook: '$250', lateFee: '$100', months: { spring: ['January', 'May'], summer: ['May', 'August'], fall: ['August', 'December'] } },
  waitingReason: 'No upcoming cohort yet. Add the next one with + New cohort (with its dates).', lastCheck: new Date().toISOString(), timerOn: true,
};
function sampleSheets() {
  const names = ['Alvarez, Marco', 'Bennett, Kayla', 'Chen, Olivia', 'Dawson, Tyler (TJ)', 'Ellis, Jordan',
    'Foster, Amara', 'Grant, Elijah', 'Hughes, Sophie', 'Iverson, Caleb', 'Jackson, Nia', 'Keller, Ryan',
    'Lopez, Isabella', 'Morgan, Avery', 'Nguyen, Daniel', 'Owens, Harper', 'Patel, Riya', 'Test Student'];
  const KEY = 'academy-week-sample-pc';
  const sampleSigs = {}; // sample mode: no student signs (Copy signing link opens nothing real)
  const counts = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const start = new Date(); start.setDate(start.getDate() - 1); // "today" is Day 2 in sample mode
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const wait = v => new Promise(r => setTimeout(() => r(v), 150));

  const staff = [
    { name: 'Nick', role: 'Instructor', days: [1, 2, 3, 4, 5] },
    { name: 'Bella', role: 'Instructor', days: [5] },
    { name: 'Jo', role: 'Instructor', days: [1, 2, 3, 4, 5] },
    { name: 'Mark', role: 'Instructor', days: [1, 2] },
    { name: 'Dana', role: 'Instructor', days: [2, 3, 4] },
    { name: 'Sam', role: 'Assistant', days: [5] },
    { name: 'Riley', role: 'Patient', days: [5] },
  ];
  const subs = ['Skills', 'Scenarios', 'Review', 'Final Review', 'Psychomotor'];
  const labels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

  const cohorts = [
    { key: 'Spring 2026', status: 'Former' },
    { key: 'Fall 2026', status: 'Active' },
    { key: 'Test 2026', status: 'Active' },
  ];
  const orient = new Date(start); orient.setDate(orient.getDate() - 119);
  const reviews = [7, 14, 28, 42].map(n => { const d = new Date(orient); d.setDate(d.getDate() + n); return iso(d); });

  const blank = { jbl: '', firstDay: '', cpr: '', academyStart: '', meet: '', reviews: [], courseNo: '', lateCourseNo: '', courseNos: '' };
  const saved = {}; // course details "written to the sheet" in sample mode
  const fresh = key => (cohorts.find(c => c.key === key) || {}).status === 'Upcoming' && !saved[key];
  const infoFor = key => saved[key] || (fresh(key) ? { ...blank }
    : { jbl: '6B37F3', firstDay: iso(orient), cpr: '', academyStart: iso(start), meet: 'meet.google.com/abc-defg-hij', reviews });

  return {
    listCohorts: () => wait(cohorts.map(c => ({ ...c }))),
    async createCohort(key, info) {
      if (cohorts.some(c => c.key === key)) throw new Error(key + ' is already in the config sheet.');
      cohorts.push({ key, status: 'Upcoming' });
      if (info && Object.keys(info).length) saved[key] = { ...blank, ...info };
      return wait({ cohort: key, info: saved[key] || null });
    },
    async saveSettings(key, info) {
      const next = { ...infoFor(key), ...info };
      if ('courseNos' in info) { const [a = '', b = ''] = String(info.courseNos || '').split('/').map(x => x.trim()); Object.assign(next, { courseNo: a, lateCourseNo: b, courseNos: [a, b].filter(Boolean).join(' / ') }); }
      saved[key] = next;
      return wait(saved[key]);
    },
    async setStatus(key, status) {
      const c = cohorts.find(x => x.key === key); if (c) c.status = status;
      return wait({ cohort: key, status });
    },
    loadCohort: key => { const info = infoFor(key); return wait({
      cohort: key,
      status: (cohorts.find(c => c.key === key) || {}).status || '',
      sheetUrl: 'https://docs.google.com/spreadsheets/', folderUrl: 'https://drive.google.com/drive/',
      info,
      academyStart: info.academyStart,
      students: names.map((name, i) => ({ row: i + 5, name, status: 'Active', contacts: counts[name] ?? (i % 4 === 0 ? 3 : 5),
        email: i === 6 ? '' : slug(name).replace(/-/g, '.') + '@example.com', textbook: i % 3 === 0, paidNext: i % 4 !== 1, paidFinal: i % 5 === 0,
        fcp: i % 3 !== 1, orientRoster: !!sampleSigs[name], rideAgreement: i % 4 !== 2 })),
      days: labels.map((label, i) => ({ n: i + 1, label, sub: subs[i] })),
      staff,
    }); },
    async createDrafts(drafts) { console.log('Sample mode: these would be Gmail drafts', drafts); return wait({ count: drafts.length }); },
    async docPdf() { return wait(null); }, // (the packet shows a stand-in page for each Google Doc)
    async listInquiries() { return wait(sampleInquiries); },
    async checkInquiries() { return wait(Object.assign({ drafted: 0, waiting: 0 }, sampleInquiries)); },
    async saveInquirySettings(st) { sampleInquiries.settings = st; return wait(st); },
    async saveInquiry(item) {
      const list = sampleInquiries.items, o = item.id ? list.find(x => x.id === item.id) : null;
      const row = o || { id: 'call-' + Date.now(), received: item.received, source: 'Call', message: '', reply: '', status: 'Needs follow-up' };
      const { contact, ...rest } = item;
      Object.assign(row, rest);
      row.contacts = [...(row.contacts || []), ...(o ? [] : [{ d: row.received, by: 'Bella', note: 'Call' }]), ...(contact ? [{ ...contact, by: 'Bella' }] : [])];
      if (!o) list.unshift(row);
      return wait({ ...row });
    },
    async shirtSheet(key) {
      const r = (printed, size, street, unit, city, state, zip, shipped = false, note = '') =>
        ({ row: 0, full: '', printed, email: slug(printed).replace(/-/g, '.') + '@example.com', size, street, unit, city, state, zip, shipped, note });
      return wait({ name: key + ' Ride Along Agreements - Shirt Info', url: 'https://docs.google.com/spreadsheets/', rows: [
        r('Jordan Lee', 'M', '12 oak st', '', 'richmond', 'Virginia', '23220'),
        r('Sam Rivera', 'L', '400 Pine Ave', '110', 'Randolph', 'NJ', '7869', false, '2 shirts'),
        r('Alex Kim', 'S', '9 Elm Ct', '(already have one)', 'Chester', 'VA', '23831', false, 'Doesn’t need'),
        r('Casey Moore', 'XL', '3 Birch Rd', '', 'Midlothian', 'VA', '23112', true),
        r('Taylor Reed', 'L', '50 Old Rd', '', 'Clemson', 'SC', '29631'),
        r('Taylor Reed', 'L', '77 New Rd', '', 'Midlothian', 'VA', '23112'),
        r('Morgan Hale', 'M', '', '', 'Henrico', 'VA', '23228'),
      ] });
    },
    async cohortDates() {
      return wait(cohorts.filter(c => /^(active|upcoming)$/i.test(c.status)).map(c => { const i = infoFor(c.key);
        return { key: c.key, status: c.status, firstDay: i.firstDay, cpr: i.cpr, academyStart: i.academyStart }; }));
    },
    async signLinks(key, roster, names) { return wait(Object.fromEntries(names.map(n => [n, 'sample.' + btoa(JSON.stringify({ c: key, d: roster.date, n }))]))); },
    async saveRosterList(key, date, list) { return wait({ saved: true }); },
    async rosterSigs(key, date) { return wait(Object.entries(sampleSigs).filter(([, v]) => v.date === date).map(([name, v]) => ({ name, signedAt: v.at, late: false, png: v.png }))); },
    async clearRosterSig(key, date, name) { delete sampleSigs[name]; return wait({ cleared: true }); },
    async rosterPdfFile() { throw new Error('Sample mode has no Drive file.'); },
    async resetTestCohort() { throw new Error('Sample mode has nothing to reset.'); },
    async saveRosterPdf(key, name) { console.log('Sample mode: the roster PDF would be saved as', name); return wait({ url: 'https://drive.google.com/', name, replaced: false }); },
    async deleteInquiry(id) { sampleInquiries.items = sampleInquiries.items.filter(x => x.id !== id); return wait({ deleted: true }); },
    async makeCohortDocs(key, fills) { console.log('Sample mode: syllabus fill-ins', fills); const u = 'https://drive.google.com/'; return wait({ made: [key + ' Hybrid EMT Syllabus', key + ' Suggested Schedule', key + ' Dropped Students Record'], found: [], docs: { syllabus: u, schedule: u, adminFolder: u, dropped: u } }); },
    listScenarios: () => wait(SCEN.SEED.map(x => ({ id: x.id, title: x.title, cat: x.cat, url: 'https://docs.google.com/document/d/' + x.id + '/edit' }))),
    async changeContacts(key, student, by) {
      const now = Math.max(0, (counts[student.name] ?? student.contacts ?? 0) + by);
      counts[student.name] = now;
      try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch {}
      return wait(now);
    },
  };
}

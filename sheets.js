/* Talks to the "Academy Week Admin Backend" Apps Script, which reads the Google Sheets:
     listCohorts                 -> Student Cohort Config, "Cohorts" tab
     loadCohort(key)             -> that cohort's Student Roster tab (names, column P, Academy Week Start)
                                    and its Staffing tab (who works which day)
     changeContacts(key, s, by)  -> adds/subtracts from that student's column P
     listScenarios               -> the scenario Docs in the Medical and Trauma folders (names, links)
     createCohort(key)           -> adds a cohort to the config sheet; the Student Hub script makes its folder + sheets
     setStatus(key, status)      -> Upcoming / Active / Former in the config sheet (column F)

   loadCohort also brings the cohort's settings box (AF/AG: JBL code, dates, Meet link,
   review dates) as `info`, plus its status and links to its sheet and folder.

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
    createCohort: key => call('createCohort', { cohort: key }),
    setStatus: (key, status) => call('setStatus', { cohort: key, status }),
  };
})();

function sampleSheets() {
  const names = ['Alvarez, Marco', 'Bennett, Kayla', 'Chen, Olivia', 'Dawson, Tyler (TJ)', 'Ellis, Jordan',
    'Foster, Amara', 'Grant, Elijah', 'Hughes, Sophie', 'Iverson, Caleb', 'Jackson, Nia', 'Keller, Ryan',
    'Lopez, Isabella', 'Morgan, Avery', 'Nguyen, Daniel', 'Owens, Harper', 'Patel, Riya', 'Test Student'];
  const KEY = 'academy-week-sample-pc';
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

  return {
    listCohorts: () => wait(cohorts.map(c => ({ ...c }))),
    async createCohort(key) {
      if (cohorts.some(c => c.key === key)) throw new Error(key + ' is already in the config sheet.');
      cohorts.push({ key, status: 'Upcoming' });
      return wait({ cohort: key });
    },
    async setStatus(key, status) {
      const c = cohorts.find(x => x.key === key); if (c) c.status = status;
      return wait({ cohort: key, status });
    },
    loadCohort: key => { const fresh = (cohorts.find(c => c.key === key) || {}).status === 'Upcoming'; return wait({
      cohort: key,
      status: (cohorts.find(c => c.key === key) || {}).status || '',
      sheetUrl: 'https://docs.google.com/spreadsheets/', folderUrl: 'https://drive.google.com/drive/',
      info: fresh
        ? { jbl: '', firstDay: '', cpr: '', academyStart: '', meet: '', reviews: [] }
        : { jbl: '6B37F3', firstDay: iso(orient), cpr: '', academyStart: iso(start), meet: 'meet.google.com/abc-defg-hij', reviews },
      academyStart: fresh ? '' : iso(start),
      students: names.map((name, i) => ({ row: i + 5, name, status: 'Active', contacts: counts[name] ?? (i % 4 === 0 ? 3 : 5) })),
      days: labels.map((label, i) => ({ n: i + 1, label, sub: subs[i] })),
      staff,
    }); },
    listScenarios: () => wait(SCEN.SEED.map(x => ({ id: x.id, title: x.title, cat: x.cat, url: 'https://docs.google.com/document/d/' + x.id + '/edit' }))),
    async changeContacts(key, student, by) {
      const now = Math.max(0, (counts[student.name] ?? student.contacts ?? 0) + by);
      counts[student.name] = now;
      try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch {}
      return wait(now);
    },
  };
}

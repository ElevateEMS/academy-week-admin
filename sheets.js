/* Talks to the "Academy Week Admin Backend" Apps Script, which reads the Google Sheets:
     listCohorts                 -> Student Cohort Config, "Cohorts" tab
     loadCohort(key)             -> that cohort's Student Roster tab (names, column P, Academy Week Start)
                                    and its Staffing tab (who works which day)
     changeContacts(key, s, by)  -> adds/subtracts from that student's column P
     listScenarios               -> the scenario Docs in the Medical and Trauma folders (names, links)

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

  return {
    listCohorts: () => wait([
      { key: 'Fall 2026', status: 'Active' },
      { key: 'Test 2026', status: 'Active' },
      { key: 'Spring 2026', status: 'Former' },
    ]),
    loadCohort: key => wait({
      cohort: key,
      academyStart: iso(start),
      students: names.map((name, i) => ({ row: i + 5, name, status: 'Active', contacts: counts[name] ?? (i % 4 === 0 ? 3 : 5) })),
      days: labels.map((label, i) => ({ n: i + 1, label, sub: subs[i] })),
      staff,
    }),
    listScenarios: () => wait(SCEN.SEED.map(x => ({ id: x.id, title: x.title, cat: x.cat, url: 'https://docs.google.com/document/d/' + x.id + '/edit' }))),
    async changeContacts(key, student, by) {
      const now = Math.max(0, (counts[student.name] ?? student.contacts ?? 0) + by);
      counts[student.name] = now;
      try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch {}
      return wait(now);
    },
  };
}

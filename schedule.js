/* Draws one day of the schedule as two pages, the same way the old Google Doc looked:
     page 1: Class Schedule + Station Content
     page 2: Instructor Notes/Reminders + Squad Assignments + Notes for tomorrow
   Used by the app's Print button and by view.html (the instructors' QR link).

   A day looks like:
   { n, heading: 'Day 1 - Saturday', date: '12/12', blocks: [{time, activity}], stations: [{topic, content}],
     stationNote, notes, squads: { count, s: { 1: { A: [names], B: [names] } } } } */
const Sched = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Station content: one paragraph per line; lines starting with "Note:" in italics.
  const contentHtml = text => String(text || '').split('\n').filter(l => l.trim())
    .map(l => /^note:/i.test(l.trim()) ? `<p class="p-note">${esc(l.trim())}</p>` : `<p>${esc(l.trim())}</p>`).join('');

  // Instructor notes: plain lines are headings/sentences (no bullet), "- " lines are
  // bullets under them, "***" is a divider.
  function notesHtml(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '<p class="p-empty">No notes.</p>';
    let out = '', inList = false;
    const close = () => { if (inList) { out += '</ul>'; inList = false; } };
    lines.forEach(l => {
      if (/^\*{3,}$/.test(l)) { close(); out += '<hr class="p-divider">'; }
      else if (/^[-–•]\s*/.test(l)) {
        if (!inList) { out += '<ul class="p-bullets">'; inList = true; }
        out += `<li>${esc(l.replace(/^[-–•]\s*/, ''))}</li>`;
      } else { close(); out += `<p class="p-line">${esc(l)}</p>`; }
    });
    close();
    return '<div class="p-notes">' + out + '</div>';
  }

  function squadsHtml(sq) {
    const count = (sq && sq.count) || 0;
    if (!count) return '';
    const nums = Array.from({ length: count }, (_, i) => i + 1);
    const team = (s, t) => ((sq.s && sq.s[s] && sq.s[s][t]) || []);
    const total = nums.reduce((a, s) => a + team(s, 'A').length + team(s, 'B').length, 0);
    // The table is for paper; on a phone the same squads show as a stacked list instead.
    const list = `<div class="p-squad-list">${nums.map(s => `<div><b>Squad ${s}</b>${['A', 'B'].map(t =>
      `<p><span>Team ${t}:</span> ${team(s, t).map(esc).join(' · ') || '–'}</p>`).join('')}</div>`).join('')}</div>`;
    return `<p class="p-squad-line"><b>SQUAD ASSIGNMENTS:</b> ${total} students · ${count} squads · Teams of 2–3 form within each squad for scenarios.</p>
      ${list}
      <table class="p-squads"><thead><tr><th></th>${nums.map(s => `<th>Squad ${s}</th>`).join('')}</tr></thead>
      <tbody>${['A', 'B'].map(t => `<tr><th>Team ${t}</th>${nums.map(s => `<td>${team(s, t).map(esc).join('<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function pages(d, { qr = false } = {}) {
    const blocks = d.blocks || [], stations = d.stations || [];
    return `
    <section class="p-page">
      <header class="p-head"><h1>${esc(d.heading)}</h1>${d.date ? `<span class="p-date">${esc(d.date)}</span>` : ''}${qr ? '<div class="p-qr" aria-label="Scan for the live schedule"></div>' : ''}</header>
      <h2>Class Schedule</h2>
      <table class="p-table p-blocks"><thead><tr><th>Time</th><th>Activity</th></tr></thead>
        <tbody>${blocks.map(b => `<tr class="${/lunch/i.test(b.activity) ? 'p-lunch' : ''}"><td>${esc(b.time)}</td><td>${esc(b.activity)}</td></tr>`).join('')}</tbody></table>
      ${stations.length ? `<h2>Station Content</h2>
      <table class="p-table p-stations"><thead><tr><th>Topic</th><th>Content &amp; Instructor Notes</th></tr></thead>
        <tbody>${stations.map(s => `<tr><td>${esc(s.topic)}</td><td>${contentHtml(s.content)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${d.stationNote ? `<p class="p-note">${esc(d.stationNote)}</p>` : ''}
    </section>
    <section class="p-page">
      <h2>Instructor Notes/Reminders</h2>
      ${notesHtml(d.notes)}
      ${squadsHtml(d.squads)}
      <h2 class="p-tomorrow">Notes for tomorrow:</h2>
      <div class="p-lines">${'<span></span>'.repeat(8)}</div>
    </section>`;
  }

  return { pages, notesHtml, squadsHtml, esc };
})();

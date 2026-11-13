/* Settings → FAQ - How it works: short answers to "how does this work?" questions, grouped by page, with a search.
   Keep these in step with the app: when how something works changes, change its answer here in the same update.
   Answers are HTML (b, i only). */
const FAQ = [
  ['Staff & Pay', [
    ['How do I pay someone differently from their Staffing slot for one day ("Pay as")?',
      'Staff → <b>Academy Week Pay</b> → tap their name. On a day without times yet, change that day’s role (for example an EC working an Assistant slot, set to <b>EC &amp; Equivalent</b>). It saves right away, a small tag shows their real slot, and their Staff Portal shows the new pay. They stay in their slot on Scheduling, so station counts don’t change. A day that already has times: change the role, then <b>Save</b>.'],
    ['When can I open someone’s pay window?',
      'Any time from the <b>Academy Week Pay</b> card on the Staff page (tap their name): every day of the week shows, including future ones. It also opens from the <b>💵 Pay</b> item on their last day on the Academy Week page, and from <b>Also owed</b> for anyone still unpaid from an earlier cohort.'],
    ['What does "about $" mean on Academy Week Pay?',
      'It’s an estimate: days without times count as about 8 hours at that day’s pay rate, plus any extra pay and flat-rate jobs. It becomes the exact amount once every day has times.'],
    ['What do the statuses on Academy Week Pay mean?',
      '<b>Scheduled</b> before the week, <b>Working today</b> / <b>Worked</b> during it, <b>Last day today · payment due</b> on their last day, <b>Payment due · since …</b> after it until they’re paid (both in red), and <b>Paid ✓</b>. Volunteers aren’t listed (they’re never paid). The card always shows the next Academy Week.'],
    ['How do I add patients or assistants to a day other than the exam?',
      'On the cohort’s <b>Staffing tab</b>, type <b>OPEN</b> in a Patient (or Assistant) slot on that day. After ↻ on Scheduling it shows on that day as an OPEN slot to fill, and sending to the Staffing tab keeps it. To remove it, change it back to “—”. The exam day always has one per station.'],
    ['How do flat-rate jobs (admin help, photographer) get paid?',
      'Put them in an <b>Other</b> slot on Scheduling, with what it’s for and the amount. It counts in their “+” estimate and on Academy Week Pay right away, and goes on the Payroll tab on the day itself.'],
    ['Where do I mark a paper W-9?',
      'Click their row in the Staff Directory → tick <b>W-9 received on paper</b> → Save. Their W-9 column shows ✓ and the Staff Portal stops reminding them. Someone who sent their W-9 from the Staff Portal doesn’t get the box (it’s already on file).'],
    ['Who gets a 1099?',
      'Anyone paid $2,000 or more in a calendar year (the federal threshold as of 2026). The Staff Portal’s W-9 pop-up tells staff they won’t be issued a 1099 under that. Reimbursements don’t count toward it.'],
    ['What do the yearly pay limit alerts do?',
      'You and Nick get one email when someone’s pay for the year reaches $1,500, and one at $2,000 (the 1099 line on the Staff Directory’s bar). Reimbursements don’t count toward it.'],
    ['When does availability lock?',
      'Two weeks before that Academy Week starts. After that staff can’t change it in the Staff Portal; they reach out to you. If someone marks <b>Unavailable</b> on a day they’re already on the Staffing tab, you both get an email.'],
    ['Why doesn’t a change typed straight into the Staffing sheet show in the Staff Portal right away?',
      'The portal keeps a copy of each Staffing tab for up to 10 minutes so it opens faster. Changes made from the app’s Scheduling page show right away; changes typed into the sheet by hand show within 10 minutes.'],
    ['How do I reset someone’s Staff Portal password?',
      'Click their row in the Staff Directory → <b>Reset their Staff Portal password</b> at the bottom. They set up their account again with their name and phone number.'],
    ['Where are staff shirt sizes and the shirt links?',
      'Sizes (and the <b>Quarter zip</b> box for the regulars) are in each person’s edit window. The <b>shirt icon</b> on the left of the Staff Directory title lists who needs which shirt, the count by size for ordering, a Made ✓ for each person, the Amazon links (tap the pencil to paste one), and a printer icon for Ninja Transfers.'],
    ['What’s the Additional Role box for?',
      'Just a label after their role in the Staff Directory, like “Patient · Admin assist”. It doesn’t change pay: flat-rate pay is set on Scheduling.'],
  ]],
  ['Feedback & Forms', [
    ['When do the feedback PDFs save, and where do they go?',
      'On their own at 7 PM on any day new answers came in (and later that night if more arrive), into the cohort’s <b>Admin - &lt;cohort&gt;</b> Drive folder: “Peer Evaluations” and “Instructor &amp; Course Feedback”. The old copies go to the Drive trash. To save them sooner, use <b>Save PDFs</b> under the feedback on the Students page.'],
    ['How do I keep test answers out of the real numbers?',
      'Use a cohort whose name starts with “Test”. Its answers never count on the Bulletin or in Staff totals; an instructor with only test feedback shows “test only”. Ask Claude to delete test answers when you’re done.'],
    ['Who’s listed on the Instructor & Course Feedback form?',
      'Nick and Bella first, then everyone who has worked an <b>Instructor or EC slot</b> on Staffing from Day 1 through that day (volunteers in those slots too). Assistant and Patient slots aren’t listed.'],
    ['How do I change an instructor’s name on the feedback form?',
      'Click their row in the Staff Directory → <b>Name on the Instructor &amp; Course Feedback forms</b> (like “Captain Lugo”). Blank uses their first name.'],
    ['How do I get the QR codes onto the projector?',
      'Open the form’s QR (the QR button on its to-do) → <b>Download QR</b>. It saves a projector-sized picture to put in Drive or your slides. The link never changes for a cohort, so one download lasts the week.'],
  ]],
  ['Emails', [
    ['When does the "book codes left" warning show?',
      'When you’d have 1 or 0 unused codes left once every student who’s waiting gets one (bought the book, no code yet, Book code email not sent). The Emails box and the Morning Email use the same rule. Add codes in <b>Settings → Book Codes</b>.'],
    ['What does the "Emails start" date mean?',
      'Each cohort’s Emails box started on a certain day. Emails that were due before then were handled by hand, so they don’t show up as due.'],
    ['What does the × on an email row do?',
      'Marks that email <b>not needed for this cohort</b>, so it stops showing. Only some emails have it.'],
    ['When does the Morning Email come, and what’s in it?',
      'Between 8 and 9 AM, only on days something’s due: emails to draft (grouped by cohort), to-dos that are due, Bulletin reminders, info-request follow-ups, book codes running low, and who to pay. Nick gets his own copy without the email drafts. Quiet days: no email.'],
  ]],
  ['Bulletin & Admin', [
    ['How do "Remind me" sticky notes work?',
      'Tap the bell on a sticky note and pick a date. From that day it’s in the Morning Email every morning, and the note is highlighted, until you clear it or pick a new date.'],
    ['How do repeating and snoozed to-dos work?',
      'A repeating to-do never goes to the done list: checking it moves it to its next date. <b>Snooze</b> moves it just once, to the snooze date, and keeps its usual schedule after that.'],
    ['How do Inquiry reply drafts work?',
      'New inquiries are checked every hour. <b>Make reply draft</b> writes a reply into your Gmail Drafts (gbrown@), where you review and send it yourself.'],
  ]],
  ['Course & Academy Week', [
    ['What do I do when someone enrolls?',
      'Add them to the cohort’s Student Roster: their name as <b>Last, First (Nickname)</b>, their email, and their phone number. The rest is automatic within the hour: they show up in the app, their payments get ticked on the roster, their <b>Welcome email</b> shows up in the Emails box to draft, and so on.<br><br><b>Joining after the cohort’s orientation?</b> Set their own orientation date in the Emails box → <b>Student Emails</b>, so their payment dates and emails follow it.'],
    ['What puts the bag check on a day’s To Do?',
      '<b>Settings → Templates → Every day</b>: everything on that list goes on Day 1–5’s To Do (not Prep or Finalize), and “Bag check” is one of them. Any to-do with “bag check”, “check bags”, “verify bags” or “put together bags” in it opens the bag pop-up, and checks itself off once every bag in use that day is checked. To have it only on some days, move it from Every day to those days’ lists.'],
    ['Where’s the Reset test cohort button?',
      'Open the Test cohort → Course page → <b>Course Details</b> box → the status pill (Upcoming / Active / Former) → <b>Reset test cohort</b>, at the bottom of that menu. It only shows on Test cohorts, and you type the cohort’s name to confirm.'],
    ['What does Reset do on a Test cohort?',
      'Puts it back to brand new: clears its app data, its sheet’s rows and Course Details, and sends its folder’s files to the Drive trash. There’s no undo.'],
    ['What goes in "Do before next cohort", and when does it show up?',
      'Changes for Future Classes on the Admin page. Each one shows on the next cohort’s <b>Setup Checklist</b> (and its Course To-Do once the rest of the checklist is done). With no Upcoming cohort yet, they land on the next one you add.'],
    ['How do Ride Along requests get onto the Course To-Do?',
      'Every hour, new rows from the Ride Along Request form become a “Schedule ride alongs: name” to-do, linked to their Clinical Tracking row. Checking off the to-do ticks <b>Confirmed</b> in the sheet, and ticking Confirmed in the sheet checks off the to-do.'],
    ['What happens when a cohort becomes Former?',
      'Its students only see the Resources tab in the Student Hub, and its folder moves to Former/Test Cohorts. Roster signatures and roster lists come out of the app’s database (can’t be undone; the finished roster PDFs stay in Drive). The automatic checks stop for it (Ride Along requests, overdue payments, Tally sign-ups, 7 PM feedback PDFs), the Morning Email stops listing it, and its Academy Week comes off the Staff Portal and pay estimates (anyone unpaid shows under Also owed). A pop-up lists all of this before you confirm.'],
    ['What happens when a cohort becomes Active?',
      'Students on its roster can log in to the Student Hub. Its emails, Morning Email, automatic checks and staff schedule keep running as they did while Upcoming. Making a Former cohort Active again moves its folder back and restarts the checks.'],
    ['When does orientation roster signing go live for real cohorts?',
      'In December, once the Student Hub has its card. Until then it only works on Test cohorts.'],
  ]],
  ['General', [
    ['Why doesn’t a change show up right away after an upload?',
      'Reload the app (or close and reopen it). GitHub can take up to 10 minutes to serve the new files. A Home Screen app: swipe it away in the app switcher and open it again.'],
    ['What works offline?',
      'Notes, to-dos and sticky notes save offline and sync when you’re back. Inquiry and partner saves, Course Details, Quick Log expenses and Ride Along confirmations wait in an outbox and send once you’re online. Anything that needs the sheets right away (like pay) needs a connection.'],
  ]],
];

// Opens on the categories (tiles); tap one for its questions (← All categories goes back). Searching looks in every category.
function faqModal() {
  const q = String(S.faqQ || '').trim().toLowerCase();
  const plain = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const item = ([qq, a], open) => `<details class="faq-item" ${open ? 'open' : ''}><summary>${esc(qq)}</summary><p>${a}</p></details>`;
  let body;
  if (q) {
    const groups = FAQ.map(([g, items]) => [g, items.filter(([qq, a]) => (g + ' ' + qq + ' ' + plain(a)).toLowerCase().includes(q))]).filter(([, l]) => l.length);
    body = groups.length ? groups.map(([g, items]) => `<h3 class="faq-group">${esc(g)}</h3>${items.map(x => item(x, true)).join('')}`).join('')
      : '<p class="empty">Nothing matches that. Try another word.</p>';
  } else if (S.faqCat != null && FAQ[S.faqCat]) {
    const [g, items] = FAQ[S.faqCat];
    body = `<button class="link faq-back" data-act="faqBack">← All categories</button><h3 class="faq-group">${esc(g)}</h3>${items.map(x => item(x, false)).join('')}`;
  } else {
    body = `<div class="faq-cats">${FAQ.map(([g, items], i) => `<button class="faq-cat" data-act="faqCat" data-c="${i}"><b>${esc(g)}</b><span>${items.length} question${items.length === 1 ? '' : 's'}</span></button>`).join('')}</div>`;
  }
  return `<div class="overlay" data-act="faqClose"><div class="modal faq-modal" data-stop>
    <div class="modal-head"><h2>FAQ - How it works</h2><button class="x big" data-act="faqClose" aria-label="Close">×</button></div>
    <div class="faq-search"><input id="faq-q" type="search" placeholder="Search" value="${esc(S.faqQ || '')}" autocomplete="off"></div>
    <div class="modal-body">${body}</div>
  </div></div>`;
}
// The search box filters as you type (render keeps the cursor in it).
document.addEventListener('input', e => { if (e.target && e.target.id === 'faq-q') { S.faqQ = e.target.value; render(); } });

/* Starting lists. Everything here can be changed in the app's Setup page;
   these are only used until something is saved there. */
const DEFAULTS = {
  // Same skills, same order as the paper Skills Tracking sheet.
  skills: [
    { group: 'Vital Signs & Misc.', items: ['Pulse Oximetry', 'Manual RR', 'Manual HR', 'Manual BP', 'Lung Sounds', 'BG Monitoring', 'Patient Transport'] },
    { group: 'Pharmacology', items: ['Oral Glucose', 'Oral (ASA)', 'Sublingual (Nitro)', 'Assisted Inhaler', 'Nebulized', 'IM (Epi-Pen)', 'IN (Narcan)'] },
    { group: 'Airway', items: ['NC', 'NRB', 'BVM', 'CPAP', 'Head Tilt', 'Jaw-Thrust', 'NPA', 'OPA', 'Suctioning', 'SGA (iGel)'] },
    { group: 'Cardiology', items: ['12 Lead ECG', 'CPR', 'Defibrillation'] },
    { group: 'Trauma', items: ['Direct Pressure', 'Tourniquet', 'Wound Packing', 'Manual C-Spine', 'C-Collar', 'Long Spine Board', 'Extremity Stabilization', 'Extremity Splinting', 'Traction Splint'] },
    { group: 'OB', items: ['Assisted Delivery', 'Complicated Delivery'] },
  ],

  warningTypes: ['Tardy', 'Left early', 'Absent', 'Verbal warning', 'Written warning', 'Other'],

  // Daily checklist. "Bag check" is the one that opens the bag pop-up.
  checklist: {
    everyDay: ['Scan the sign-in roster', 'Save the roster to the course files', 'Bag check'],
    days: {
      1: ['Collect patient contact folders to review', 'Review binders & skills tracking sheets', 'Assign squads'],
      2: ['Students fill out peer evals at end of day'],
      3: ['Remind students: patient contact paperwork due tomorrow morning'],
      4: ['Collect all patient contact paperwork at start of day', 'All skills tracking sheets completed by end of day',
          'Remind students to bring laptop/iPad tomorrow', 'Pack for tomorrow: snacks & drinks, EMT patches with notes, scanner'],
      5: ['Give EMT patches after passing', 'Read last night paperwork & collect signatures', 'NREMT sign-up',
          'Tell students about the $50 first-attempt incentive', 'Scan all patient contacts & skills sheets',
          'Scan all instructor hours', 'Mark students passed with VAOEMS'],
    },
  },

  // Jump Bag Equipment Checklist. A *** at the end means only some bags carry it
  // (which bags is set in Settings).
  bag: [
    { name: 'Top/Front Pocket (Vitals & Meds)', items: ['BP cuff', 'Stethoscope', 'Pulse ox', 'Penlight', 'Thermometer', 'Trauma shears', 'Masks', 'Alcohol pads', 'Sharps container', 'Notepad and pen'] },
    { name: 'Med Bag (Red Zipper Pouch)', items: ['Oral glucose', 'ASA', 'Nitro', 'Albuterol liquid bullet', 'Atrovent liquid bullet', 'Inhaler', 'Epi-Pen', 'Narcan'] },
    { name: 'Left Pocket (O2)', items: ['NC', 'NRB', 'Nebulizer'] },
    { name: 'Right Pocket (Quick Access Bleeding Control)', items: ['Tourniquet', 'Kravats x2', '4x4s', 'ABD pad', 'Roller gauze'] },
    { name: 'Main Pocket: Airway', items: ['NPAs', 'OPAs', 'i-Gel ***', 'BVM & face mask ***'] },
    { name: 'Main Pocket: Red Pouch (Bleeding/Wounds)', items: ['Pressure dressing', 'Occlusive dressing', 'Wound packing', 'Tourniquet'] },
    { name: 'Main Pocket: Orange Pouch (Bandaging)', items: ['2x2s or 3x3s (multiple)', '4x4s (multiple)', 'Kravats x2', 'Roller gauze x2', 'Tape'] },
    { name: 'Additional Equipment', items: ['Pressure dressing (if not in orange)', 'SAM splint', 'OB kit ***'] },
  ],
  bagCount: 5,

  // Course page → Setup Checklist, copied into each new cohort (from "KEY - Update with each
  // cohort checklist.pdf", page 1). A line starting with # is a heading.
  setupList: [
    '# Documents', 'Syllabus', 'Suggested schedule', 'Google Meet link/calendar & add to google sheet',
    '# JB Learning', 'Copy course', 'Upload schedule', 'Input course code into email draft', 'Quiz/Exam dates',
    '# Prep Student Portal - Google Drive', 'Add cohort to config sheet',
    'Add the following to the cohort sheet: dates, google meet link, JBL course code',
    'Upload syllabus and schedule to cohort folder', 'Add student information to cohort sheet as they enroll (verify emails)',
    '# ODEMSA', 'Verify dates availability with ODEMSA (including CPR class day)',
    'Register course with VAOEMS (course #)', // its button types the course # into Course Details (AF4)
    '# Once previous cohort is over & this one is about to start',
    'Flip previous cohort to “former” in config sheet', 'Flip upcoming cohort to “active” in config sheet',
    'Create gmail group for emails for students', 'Orientation morning: send Student Portal link and JBL access code to students',
  ],

  // What goes in each binder (the list icon on a "Prepare binders" to-do).
  binderList: ['Student cover page', 'Student Skills Tracker', 'Vital Sign practice assignment', '1 Scenario Eval',
    '10 Medical/Trauma Assessments', '3 Airway', '3 Bleeding', '2 Backboarding', '7 Splinting', '2 Traction Splints'],

  // Staffing names that never get paperwork/pay reminders (the two of you).
  skipStaff: ['Bella', 'Nick'],

  // Documentation Checklist on the Finalize page (from "KEY - Documentation Checklist.pdf").
  docChecklist: {
    class: ['VAOEMS Course Approval pdf', 'Course syllabus', 'Course schedule', 'Academy Week daily schedule',
      'Ride along agreement excel sheet', 'Orientation roster', 'Academy Week rosters', 'MCIM roster',
      'Exported JBL grade reports for all students', 'Exported excel sheet with student tracking and pass results',
      'Dropped students doc and records (activity logs if applicable)', 'Copy of student disposition report (VAOEMS portal)'],
    student: ['VAOEMS First class signatures (& parental permission forms)', 'Syllabus signatures', 'CPR copies',
      'MCI student registrations', 'Ride Along paperwork', 'Skills Tracking sheet', 'Patient contacts'],
    skills: ['Any Assessment Sheets', '3 - airway', '3 - bleeding', '5 - splinting', '2 - traction splints', '2 - backboarding'],
    final: ['Scan instructor CEUs', 'Submit MCI rosters', 'Student final course status (mark passed with VAOEMS)', 'Download copy of CSDR',
      'Transfer all records to external drive', 'All physical copies remain in binder', 'Delete google drive/desktop copies',
      'Submit CPR paperwork for CPR cards'],
  },
};

/* Daily schedule template: the Summer 2026 schedule. A new cohort starts from this
   (or from whatever you save with "Save as template" in the app). Squads always start empty. */
const PC_NOTE = 'Goal to complete as many assessment sheets as possible\nNote: these can count as patient contacts - they must write down scenario information to complete a patient contact form at home tonight.';
const H2T_NOTE = 'Some scenarios require a head-to-toe assessment and others a focused exam. Complete as many assessment sheets as possible.\nNote: these can count as patient contacts - they must write down scenario information to complete a patient contact form at home tonight.';
const SPLIT_NOTE = 'Stations with two topics to cover: plan to split station into 30 minute segments.';
const B = (time, activity) => ({ time, activity });
const ST = (topic, content) => ({ topic, content });

DEFAULTS.schedule = {
  1: {
    blocks: [B('0800 – 0830', 'Introductions & Overview'), B('0830 – 1030', 'FINAL EXAM'), B('1030 – 1130', 'Rotation 1'), B('1130 – 1230', 'Rotation 2'),
      B('1230 – 1330', 'LUNCH'), B('1330 – 1430', 'Rotation 3'), B('1430 – 1530', 'Rotation 4'), B('1530 – 1630', 'Rotation 5'), B('1630 – 1700', 'Closing Comments')],
    stations: [
      ST('Vital Signs Practice & Bleeding Control Intro', 'Vital Signs: RR, HR, BP (use dual stethoscope to assist), lung sounds, pupils, pulse ox, blood glucose instruction/practice (as a group).\nNote: Keep students to 5–10 min per V/S set; obtain 3 signature sets each.\nBleeding Control Intro: Dressings (4x4, ABD pad, vaseline gauze), direct pressure indications, bandaging, tourniquets, wound packing.'),
      ST('Airway', 'NC, NRB, BVM, CPAP, NPA, OPA, i-Gel airway, head-tilt, jaw-thrust, O2, suctioning.'),
      ST('Spinal Immobilization', 'Indications, manual c-spine stabilization, cervical collar, long spine board.'),
      ST('Lifting/Moving & Traction Splint Intro', 'Lifting/Moving: safe body mechanics, reeves sleeve, stretcher, loading / unloading, moving patient to/from stretcher/bed\nTraction splint: stabilization, manual/mechanical traction'),
      ST('Pharmacology', 'Oral glucose, ASA, nitro, nebulizers (albuterol / atrovent), inhalers, epi-pen, IN narcan.'),
    ],
    stationNote: SPLIT_NOTE,
    notes: 'Introductions & Overview\n- Introduce sign in rosters\n- MCI rosters\n- Collect patient contacts folders to review\n- Review binders & skills tracking sheets\n- Vitals assignment (remember must be even numbers)\n- Assign squads\nOpen Review Content Suggestion: SAMPLE, OPQRST, basic anatomy, directional terms, etc',
  },
  2: {
    blocks: [B('0800 – 0815', 'Overview'), B('0815 – 0900', 'Group review of patient assessment flow'), B('0900 – 0930', 'OB Delivery Overview'), B('0930 – 1100', 'Rotation 1'),
      B('1100 – 1230', 'Rotation 2'), B('1230 – 1330', 'LUNCH'), B('1330 – 1500', 'Rotation 3'), B('1500 – 1630', 'Rotation 4'), B('1630 – 1700', 'Closing Comments')],
    stations: [
      ST('12 Leads & Bleeding Practice', 'Indications, placement demo, practice'),
      ST('Splinting', 'Manual stabilization, sling/swath, long-bone splinting, joint splinting, pelvic binder'),
      ST('OB & Delivery Scenario', 'Signs of delivery, OB questions, uncomplicated vaginal delivery, breech, cord prolapse, fundal massage\nNote: 2 scenarios per rotation (1 per team)'),
      ST('Medical Scenarios', 'Overview of assessment sheet then practice scenarios, use classmates as assistants'),
      ST('Trauma Scenarios', 'Indication for head-to-toe vs focused exam. Demonstrate head-to-toe assessment then have students practice one. Remaining time spent on practicing scenarios.'),
    ],
    stationNote: SPLIT_NOTE,
    notes: 'Students to fill out peer evals at the end of the day\nSplinting group should rotate to trauma scenario station\nTrauma\n- Group simple sports fx (A gets credit and B gets credit - 1 sheet per team)\n- Team B: GSW (add an extremity GSW that needs tourniquet)\n- Team A: instructor’s choice if time for more\nMedical\n- Group OB (A gets credit and B gets credit - 1 sheet per team)\n- Team A - hypoglycemia\n- Team B - anaphylaxis\n- Team A - asthma/COPD',
  },
  3: {
    blocks: [B('0800 – 0830', 'Overview, V/S practice, paperwork'), B('0830 – 0945', 'Rotation 1'), B('0945 – 1100', 'Rotation 2'), B('1100 – 1215', 'Rotation 3'),
      B('1215 – 1315', 'LUNCH'), B('1315 – 1430', 'Rotation 4'), B('1430 – 1545', 'Rotation 5'), B('1545 – 1645', 'Group scenario'), B('1645 – 1700', 'Closing Comments')],
    stations: [
      ST('Airway Sign Offs & Bleeding Sign Offs', 'Each student needs 3 sign off sheets for airway and 3 for bleeding (including from previous days).'),
      ST('Splinting Sign Offs', 'Each student needs 5 total sign off sheets for splinting (including from previous days).'),
      ST('Medical Scenarios', PC_NOTE),
      ST('Medical Scenarios', PC_NOTE),
      ST('Trauma Scenarios', H2T_NOTE),
    ],
    stationNote: '',
    notes: 'Attempt to finish skills tracking sheets today.\nObtain multiple sign offs for each skills sheet and then spend the rest of the day practicing scenarios.\nStudents to work on any simulated patient contacts today.\nPatient contact paperwork due tomorrow morning!',
  },
  4: {
    blocks: [B('0800 – 0815', 'Overview'), B('0815 – 0930', 'Rotation 1'), B('0930 – 1045', 'Rotation 2'), B('1045 – 1200', 'Rotation 3'),
      B('1200 – 1300', 'LUNCH'), B('1300 – 1415', 'Rotation 4'), B('1415 – 1530', 'Rotation 5'), B('1530 – 1630', 'Practice Psychomotor Exam'), B('1630 – 1700', 'Closing Comments')],
    stations: [
      ST('CPR Scenario', 'Chest pain, 12 lead, leads to cardiac arrest\nSummative skills to sign off: 12-lead, CPR, AED, Head-Tilt, OPA, BVM, SGA'),
      ST('Medical Scenarios 1', PC_NOTE),
      ST('Medical Scenarios 2', H2T_NOTE),
      ST('Trauma Scenarios 1', PC_NOTE),
      ST('Trauma Scenarios 2', H2T_NOTE),
    ],
    stationNote: '',
    notes: 'Make sure all skills tracking sheets are completed by the end of today!\nAny rote skills that need signed off, those students are to come find Bella to get them signed off when in a station that their team is not actively going.\n- Complete final sign offs: airway, bleeding, splinting, backboarding.\nMake sure all patient contact paperwork is turned in at the start of the day!\nReview any weak/insecure topics with the students at the start of the day and then incorporate in scenarios throughout the day.\nHold a practice psychomotor exam at the end of the day - staging area, dispatch to testing room, have actors for patients and assistants if possible. Thorough debrief afterwards. This is both a learning opportunity and a way to ease testing anxiety.\nEnd the day with education about anxiety relief strategies - go home and get sleep, don’t study tonight, bring breakfast if you want to eat in class.\nRemind students to bring laptop/ipad tomorrow!\nInstructors to bring tomorrow: snacks and drinks, EMT patch with note on the back for each student, scanner for paperwork',
  },
  5: {
    blocks: [B('0800 – 0830', 'Overview'), B('0830 – 1130', 'Psychomotor Exam'), B('1130 – 1230', 'Lunch'), B('1230 – 1430', 'Additional Re-Testing (if needed)'),
      B('1430 – 1500', 'Last Night Paperwork'), B('1500 – 1530', 'NREMT Sign-Up'), B('1530 – 1630', 'Open Review Time'), B('1630 – 1700', 'Closing Comments')],
    stations: [],
    stationNote: '',
    notes: 'Staging/dispatch area with EC as dispatcher and tracking student completion. Actors for patients and assistants.\nThis is also paperwork day! - Scan all pt contacts and skills sheets.\nBe sure to give students their EMT patches after passing.\nRead students last night paperwork, collect signatures, and then sign up for NREMT.\nNotify students of $50 incentive to pass their first attempt within 30 days.\nEncourage students not to wait to test!\nThank them for being with the program and good luck on NREMT\n***\nAfter everyone leaves, scan all instructor hours.\nMark students as passed with VAOEMS!',
  },
};

/* ---------- Emails (Course page → Emails box; Setup → Email Templates) ----------
   The app only makes Gmail drafts in gbrown@'s Drafts; nothing is sent by the app.
   Written the way they're typed in the template editor:
     {first name} etc.        filled in from the cohort sheet (blank course details say TBD)
     {if late}…{else}…{end}   only for some students (see the help in the template editor)
     **bold**  *italic*  [words](link)  "- " at the start of a line = a bullet
     [[like this]]            something you type in before the draft can be made
   Your Gmail signature (with "Best regards,") is added under every draft by the Apps Script.
   when.from: enroll (as each student enrolls), orientation / next / final (that student's
   orientation or payment due date), academy (Academy Week start), manual (only when you pick it).
   when.days: days after that date (−1 = the day before). when.hour: shows up at that hour (19 = 7 PM);
   when.lateDays / lateHour: late enrollees' own timing. who: all, textbook, unpaid-next,
   unpaid-final, firstclass (missing a first class assignment), pick. send: bcc (one email To: Nick, everyone in BCC) or each (one per student). */
DEFAULTS.email = {
  nick: 'nbrown@elevateemsacademy.com',
  orientationTime: '11:00 AM', // every cohort's orientation (late enrollees get their own)
  lowCodes: 5,                 // the Emails box warns when fewer unused book codes than this are left
};
const JBL_STEPS = `- [Redeeming an access code with a NEW account](https://www.jblearning.com/faq-standalone/lists/student/redeem-an-access-code-as-a-new-user)
- [Redeeming an access code with an EXISTING account](https://www.jblearning.com/blog/pdfs/2022/06/01/video-redeem-an-access-code-as-an-existing-user)
- When prompted, enter our course ID code: **{JBL code}**`;
DEFAULTS.emailTemplates = [
  { id: 'welcome', name: 'Welcome', subject: '{cohort} Hybrid EMT Course Enrollment',
    when: { from: 'enroll', days: 0 }, who: 'all', send: 'each', body: `Welcome {first name}!

Thank you for enrolling in the {cohort} Hybrid EMT course. **Please read this email in its entirety, as it includes important information about the program.**

**Please reply to this email to confirm that you have received it.** We just want to ensure our communications are reaching your inbox. If we don't hear from you, we will reach out via phone to verify your contact information before the course begins.

At this time, your access is limited to the **Student Resources Page** of our website, which includes {if owes tuition and needs book}a checklist of what to do before the course starts, links to important materials, and where you can make your remaining tuition payments, as well as buy your book.{end}{if owes tuition and has book}a checklist of what to do before the course starts, links to important materials, and where you can make your remaining tuition payments.{end}{if paid in full and needs book}a checklist of what to do before the course starts, links to important materials, and where you can buy your book.{end}{if paid in full and has book}a checklist of what to do before the course starts and links to important materials.{end}

https://elevateemsacademy.com/student-resources
**Access Code:** ElevateEMSaccess!

{if needs book}Please be sure to purchase your book before orientation, as you will not be able to begin any coursework until you've done so. Make sure you are buying the [13th Edition with Advantage Access](https://tally.so/r/gDQJQJ), since that is what gives you access to the course materials.

{end}Your digital textbook (if purchased through us), course access code for JB Learning, and orientation meeting link will all be provided before orientation.

{if owes tuition}**Tuition Payment Plan Deadlines**
{if owes next}- **Next Installment ($500):** due {next due} at 11:59pm
{end}{if owes final}- **Final Installment (remaining $500):** due {final due} at 11:59pm
{end}
Payments can be made on the Student Resources page linked above.

{end}**Orientation**

We're excited to see you at the mandatory virtual orientation on **{orientation date} at {orientation time} Eastern Time**. Please note that your **camera must be on for the duration of orientation** to verify your attendance and participation, per state guidelines.

During orientation, we will:
- Walk you through setting up and using JB Learning and our Student Portal (LMS)
- Review the course syllabus and state required paperwork
- Review the ride-along process for patient contacts
- Set up VAOEMS accounts (you will need to know your Social Security Number in order to set this up)
- **Note:** If you already have a VAOEMS account (from a prior EMT class or agency affiliation), verify your login details *before* orientation
- Answer any questions you may have

**CPR**

As mentioned on our website, CPR is a required component to obtain your EMT certification and we offer two CPR classes during the course for students who need it. Any student is welcome to attend either CPR course. You will have the opportunity to sign up for one once the course begins.
- **Full in-person CPR Course:** Held on {CPR date} in Richmond, VA. Because this is a full CPR class, no prior online training needs to be completed or purchased (this is fully covered with your tuition). If your ride-alongs will be scheduled with the assistance of ElevateEMS, you will need to utilize this option (or obtain your CPR elsewhere) before you begin scheduling ride alongs.
- **Skills Check-Off:** CPR check off during Academy Week. This is a condensed CPR class where you'll have to complete online training modules with the AHA beforehand ($37 paid directly to the AHA).

Lastly, we've created a personal referral code just for you: **{referral code}**. If anyone you refer enrolls using your code, you'll receive 10% of their tuition back as a thank-you (paid out after the drop-period has passed for their course)!

Please don't hesitate to reach out to me if you need anything throughout this process. We look forward to having a great course!` },

  { id: 'bookcode', name: 'Book access code', subject: 'Digital EMT Book Access',
    when: { from: 'orientation', days: -1 }, who: 'textbook', send: 'each', body: `{first name},

Here is your Navigate Advantage Access for Emergency Care and Transportation of the Sick and Injured, Thirteenth Edition.

Access code: **{book code}**

Activate your textbook using your access code above using the following JB Learning instructions:
${JBL_STEPS}

Please reach out if you need anything else or have any questions!` },

  { id: 'access', name: 'Orientation access', subject: 'EMT Course - Orientation & JB Learning Access',
    when: { from: 'orientation', days: -1 }, who: 'all', send: 'bcc', body: `{if group}Hi everyone!{else}Hi {first name}!{end}

We're looking forward to meeting you at orientation **tomorrow, {orientation date} at {orientation time} Eastern Time** and getting started with the course. Please review the information below to help ensure everything goes smoothly, including the requirement that your **camera must be on for the duration of orientation** to verify your attendance and participation, per state guidelines.

**Orientation**
Here is the Google Meet link for orientation: {meet link}

**Student Portal & JB Learning**
Our Student Portal (https://student.elevateemsacademy.com/) is where our course materials live, including assignments, lectures, study resources, and patient contact paperwork. JB Learning is where you'll access your textbook and take quizzes/exams. We'll go over both in detail at orientation.

**Textbook Access**
If you have not already done so, please remember that you cannot begin coursework until your book is purchased. You can buy the [13th Edition with Advantage Access](https://tally.so/r/gDQJQJ) [here](https://tally.so/r/gDQJQJ). After purchase, activate your textbook with your access code using the following JB Learning instructions:
${JBL_STEPS}

**VAOEMS Account Information**
We will be enrolling you in your VAOEMS account during orientation. Please do **NOT** attempt to enroll on your own ahead of time. You will need to know your **Social Security Number** to set up your account.

If you already have a VAOEMS account (from a prior EMT class or agency affiliation), please confirm your login information before orientation.

To access the VAOEMS portal, you must use one of the following browsers: Google Chrome, Safari, or Microsoft Edge. Firefox and Internet Explorer are *not* supported and the portal will not open correctly using those browsers.

{if group}We look forward to officially meeting you all tomorrow and getting this course started!{else}We look forward to officially meeting you tomorrow and getting you started with the course!{end}` },

  // Orientation night, to anyone still missing a first class assignment (only the ones they're missing).
  // Late enrollees get theirs the next day at noon. {sign link}: their orientation roster signing link (Test cohorts until December).
  { id: 'firstclass-due', name: 'First class assignments due', subject: 'Reminder: First Class Assignments Due {if late}Within 24 Hours{else}Tonight{end}',
    when: { from: 'orientation', days: 0, hour: 19, lateDays: 1, lateHour: 12 }, who: 'firstclass', send: 'each', since: '2026-10-25', body: `Hi {first name},

Just a reminder that your first class {if one missing}assignment{else}assignments{end} ({missing items}) {if one missing}is{else}are all{end} due **{if late}within 24 hours of your orientation{else}by 11:59pm tonight{end}** to remain compliant with the course.

{if signing}You can sign the orientation roster here: [Orientation Roster]({sign link})

{end}Please reach out if you have any questions!` },

  { id: 'next-early', name: 'Next installment · 5 days before', subject: 'EMT Tuition Payment Reminder',
    when: { from: 'next', days: -5 }, who: 'unpaid-next', send: 'bcc', body: `{if group}Hi everyone!{else}Hi {first name}!{end}

{if group}If you are receiving this email, you have not made your next tuition payment yet. {end}This is a reminder that your next tuition installment of $500 for the EMT course is due by **{next due} at 11:59pm**. To remain enrolled and in good standing, payment must be submitted by the deadline.

The payment link can be found on the Student Resources page, but here is a direct link as well: [Student Payment Portal](https://tally.so/r/RGZ8A9).

If you have any questions or experience issues submitting payment, please contact us as soon as possible.` },

  { id: 'next-day', name: 'Next installment · due tonight', subject: 'IMPORTANT: EMT Tuition Payment Due Tonight',
    when: { from: 'next', days: 0 }, who: 'unpaid-next', send: 'bcc', body: `{if group}Good morning everyone,{else}Good morning {first name},{end}

This is a reminder that your next tuition installment of $500 is **due by 11:59pm tonight**.{if not late} This must be paid before the course start date of {orientation date}.{end}

Direct link to the payment portal can be found here: [Payment Portal](https://tally.so/r/RGZ8A9)

{if not late}We look forward to meeting you at orientation!

{end}` },

  { id: 'final-early', name: 'Final installment · 5 days before', subject: 'IMPORTANT: Final Tuition Payment Reminder',
    when: { from: 'final', days: -5 }, who: 'unpaid-final', send: 'bcc', body: `{if group}Hi everyone!{else}Hi {first name}!{end}

{if group}If you are receiving this email, you have not made your final tuition payment yet. {end}This is a reminder that the final tuition payment of $500 for the EMT course is due by **{final due} at 11:59pm**. To remain enrolled and in good standing, payment must be submitted by the deadline.

The payment link can be found on the Student Resources page, but here is a direct link as well: [Student Payment Portal](https://tally.so/r/RGZ8A9).

If you have any questions or experience issues submitting payment, please contact us as soon as possible.` },

  { id: 'final-day', name: 'Final installment · due tonight', subject: 'IMPORTANT: Final Tuition Payment Reminder',
    when: { from: 'final', days: 0 }, who: 'unpaid-final', send: 'bcc', body: `{if group}Good morning everyone,{else}Good morning {first name},{end}

This is a reminder that your final tuition payment is **due by 11:59pm tonight**.

Direct link to the payment portal can be found here: [Payment Portal](https://tally.so/r/RGZ8A9)` },

  { id: 'six-weeks', name: '1.5 months out', subject: 'Academy Week is 6 Weeks Away: Upcoming Deadlines',
    when: { from: 'academy', days: -42 }, who: 'all', send: 'bcc', body: `Hi everyone!

Academy Week is officially 6 weeks away! **Please read this email in its entirety, as it includes important upcoming deadlines.**

**Fingerprinting Deadline**
Your fingerprinting (background check) must be completed by **{fingerprinting deadline}**.

**Stay on Track**
Please keep up with your coursework and be studying the course content, the skills videos, and the Patient Assessment skills sheet found in the Student Portal.

**Coursework Deadline**
All coursework is due **{coursework deadline}**, including uploading your BLS CPR card to the Student Portal assignments (unless you are scheduled to attend the CPR skills check-off at Academy Week). If you do not complete your coursework by the deadline, you will not be permitted to attend Academy Week.

Keep up the great work you guys, you're almost there!` },

  { id: 'aw-instructions', name: 'Academy Week instructions', subject: 'IMPORTANT: Academy Week Instructions & Reminders',
    when: { from: 'academy', days: -14 }, who: 'all', send: 'bcc', body: `Hello to all of our {cohort} EMT students,

Please read this email in its entirety, as it contains important information regarding Academy Week in just 2 weeks!

**Reminders & Requirements**
- All coursework, quizzes/exams, the final exam, and a minimum of 5 patient contacts must be completed by **{coursework deadline}** (per your syllabus) to allow time for paperwork review.
- If you do not complete your coursework by the deadline, you will not be permitted to attend Academy Week and will be marked as failed for the course.
- Be sure to complete the **Academy Week Readiness & Compliance Attestation**
- **All skills videos must be reviewed prior to Academy Week.** Do not expect to pass the psychomotor exam without thoroughly studying your Patient Assessment sheet (both are found in the Student Portal)
- Your BLS CPR card must be uploaded (unless signed up for a skills session with us at Academy Week)
- The shirt mailed to you is your required student uniform and must be worn during Academy Week. Refer to the syllabus for full uniform requirements (long pants, closed-toe shoes, watch, etc.).
- There will be a shared fridge with the ODEMSA staff for packed lunches, and we also have slotted a 1 hour lunch period each day to allow time to run out.
- Bring a laptop or tablet on the last day of Academy Week for NREMT registration following the psychomotor exam.
- 100% attendance is required. **You must arrive on time each day.**

**Academy Week Address & Schedule**

**Old Dominion Emergency Medical Services Alliance (ODEMSA) address:** 7818 E Parham Rd Suite 911, Henrico, VA 23294

Walk into the building through the main entrance, check in with security, take the elevators down to the basement, and follow the signs for ODEMSA (suite 911).
- **{day 1}** (0800-1700) - Final Exam and Skills
- **{day 2}** (0800-1700) - Scenarios
- **{day 3}** (0800-1700) - Review/Sign off skills
- **{day 4}** (0800-1700) - Final Practice
- **{day 5}** (0800-DONE) - Psychomotor Exam & NREMT Registration (remember to bring laptop/ipad for this)

Don't hesitate to reach out if you have any questions or need anything as we approach the end of our class. Good luck everyone as you wrap up your coursework, you're almost there!` },

  { id: 'coursework-ontrack', name: 'Coursework reminders (on track)', subject: 'EMT Coursework Reminders',
    when: { from: 'academy', days: -7 }, who: 'pick', send: 'each', body: `Good afternoon,

As we approach Academy Week in just 1 week, I wanted to send out a to-do list for you to make sure nothing gets missed. You've been keeping a steady pace on your coursework and are doing a great job so far, so this is just a quick reminder of what's still outstanding on your end:
- [[item]]

As a reminder, all coursework is due **{coursework deadline}**, and you need to finish the course with an 80% average as well as score 80% or higher on the final exam, which we'll take in person during Academy Week. This email is just a courtesy reminder and isn't something required by the syllabus, so if there's an item you still owe that isn't listed here, you're still responsible for completing it per the syllabus and course requirements.

We look forward to seeing you at Academy Week, keep up the good work!` },

  { id: 'coursework-behind', name: 'Coursework reminders (behind)', subject: 'EMT Course Deadline Notice',
    when: { from: 'academy', days: -7 }, who: 'pick', send: 'each', body: `Good afternoon,

This is a reminder notice that you have 1 week left to complete all of your coursework before the **{coursework deadline}** deadline, and right now you still have the following outstanding:
- [[item]]

You also need to finish the course with an 80% average and score 80% or higher on the final exam (which we'll take in person during Academy Week) in order to be successful in the course and be eligible to sit for the NREMT exam. If you don't think you'll be able to get everything done in time and with the minimum grade requirements, please reach out to staff to discuss your options.

This email is just a courtesy reminder and isn't something required by the syllabus, so if there's an item you still owe that isn't listed here, you're still responsible for completing it per the syllabus and course requirements.

We hope to see you at Academy Week, and wish you luck with the coursework!` },

  { id: 'congrats', name: 'Congratulations (cleared for Academy Week)', subject: 'Congratulations, You\'re Cleared for Academy Week!',
    when: { from: 'academy', days: -1 }, who: 'pick', send: 'each', body: `Hi {first name},

I wanted to congratulate you on completing all of the required coursework to attend Academy Week! Your current course grade is a **[[grade]]%** and your final course grade will be determined after you take the final exam on {academy week start} at Academy Week. Be sure to bring your physical copies of your patient contact paperwork (including the Clinical Training Record) to turn in on that day as well.

Please let us know if you have any other questions and we look forward to seeing you at Academy Week!` },

  { id: 'incomplete', name: 'Incomplete', subject: 'EMT Course Incompletion',
    when: { from: 'manual', days: 0 }, who: 'pick', send: 'each', ccNick: true, body: `{first name},

I am notifying you that you have not completed the {cohort} Hybrid EMT course due to the following reasons:
- [[reason]]

Unfortunately, due to your failure to abide by the deadlines and expectations set forth in the syllabus and reviewed at orientation and via email, your attempt for this EMT class is being submitted to the state as a failed attempt.` },

  { id: 'cohort-congrats', name: 'Congratulations to the cohort', subject: 'Congratulations to the {cohort} Cohort',
    when: { from: 'academy', days: 5 }, who: 'check', send: 'bcc', body: `Students,

I know it was a long week (and long course) but I just wanted to say one more time that I'm proud of all of you and all the work you put in to be here. You all did an amazing job at Academy Week with your skills and patient assessments, and we can tell that you came prepared with the knowledge to be successful and the mindset to learn and improve. You are all going to pass your NREMT exam and become wonderful EMTs, I am confident of this! (Please please please utilize Test Prep...) And be confident in yourselves, while also giving yourselves grace as you enter the world of medicine. Remember to always keep learning, allow yourself to make mistakes and learn from them, and push yourselves to be the providers I know you can be. Go forth and do great things!

Bella & Nick` },
];

/* ---------- Admin page (header → Admin) ----------
   Quick Links start as these until you add or remove one on the Admin page.
   Business Info starts with the portal and website filled in. */
DEFAULTS.adminLinks = [
  { id: 'certkeeper', name: 'CertKeeper', url: 'https://glaynebrown.github.io/certkeeper/' },
  { id: 'finances', name: 'Finances', url: 'https://docs.google.com/spreadsheets/d/1RndW9t7N04G9RWRbkXRst-FXoY9NFePo5xiXJqBEf3Y/edit' },
  { id: 'payroll', name: 'Payroll', url: 'https://docs.google.com/spreadsheets/d/1OHXZrBqAfqAfkyB3tsH9g5VRt0qeuHeDnzRXX1pyriI/edit' },
];
DEFAULTS.adminInfo = { portal: 'https://student.elevateemsacademy.com/', website: 'https://www.elevateemsacademy.com/' };

/* ---------- Course To-Do (Course page, once the Setup Checklist is done) ----------
   Copied into each cohort. Anything with "ship" and "shirt" gets the Print packet button. */
DEFAULTS.courseTodoList = ['Ship student shirts'];

/* The print packet that ships with the shirts, in order, for each student.
   doc = a Google Doc (pulled fresh as a PDF each time); pdf = a file kept with the app. */
// Student binder packet (Prep → "Prepare student binders" → Print): for each attending student, in this order.
// cover: their name page (drawn by the app). A 1-page sheet gets a blank back so the whole thing prints double-sided.
DEFAULTS.binderPacket = [
  { name: 'Cover page', cover: true, copies: 1 },
  { name: 'Skills Tracking', pdf: 'skills-tracking.pdf', copies: 1 },
  { name: 'Vital Signs Practice Assignment', pdf: 'vitals-academy-week.pdf', copies: 1 },
  { name: 'Scenario Evaluation', pdf: 'skills-scenario-eval.pdf', copies: 1 },
  { name: 'Assessment Skill Sheet', pdf: 'skills-assessment.pdf', copies: 10 },
  { name: 'Airway', pdf: 'skills-airway.pdf', copies: 3 },
  { name: 'Bleeding', pdf: 'skills-bleeding.pdf', copies: 3 },
  { name: 'Spinal Immobilization', pdf: 'skills-spinal.pdf', copies: 2 },
  { name: 'Splinting (Long Bone / Joint)', pdf: 'skills-splinting.pdf', copies: 7 },
  { name: 'Traction Splint', pdf: 'skills-traction.pdf', copies: 2 },
];
DEFAULTS.printPacket = [
  { name: 'Ride Along & Academy Week Readiness Guide', doc: '1mOaVm0DU1w76LU_Uu3NRmkW6FiWPpwzVfIbztawgz2s', copies: 1 },
  { name: 'Patient Contact Instructions', doc: '1KaQtsY9coYLENbxguCd-pXEYs9s91qBRCnPDAR-rfJI', copies: 1 },
  { name: 'Clinical Training Record', pdf: 'clinical-training-record.pdf', copies: 1 },
  { name: 'Patient Contact Form', pdf: 'patient-contact-form.pdf', copies: 10 },
];

/* Starting lists. Everything here can be changed in the app's Settings page;
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

  // Staffing names that never get paperwork/pay reminders (the two of you).
  skipStaff: ['Bella', 'Nick'],
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

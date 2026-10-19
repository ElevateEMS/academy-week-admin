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

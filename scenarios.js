/* Scenario Library starting data (Phase 3).

   SEED: the scenario Docs in My Drive → Course Docs → Patient Scenarios → Medical / Trauma,
   with the summative skills Claude suggested from each Doc's Interventions (Oct 20, 2026).
   They show as "Suggested" in the app until checked; anything you change is saved in
   Firebase (scenarios/{driveId}) and wins over what's here. Vital signs and patient
   transport happen in every scenario, so they're never tagged. OB skills are rote only.
   Counting rule (from Nick's list): a tourniquet or wound packing also counts as Direct Pressure.

   TARGETS: summative sign-offs each student needs, from the "MINIMUM - Skill Tracking
   Rote/Summative" sheet. Editable in the app (Scenario Library → Requirements).

   ADDONS: twists you can add to a scenario to cover a skill it doesn't have, some only on certain
   scenarios (needs) and some swapping one skill for another (minus). Editable.

   NICK: Nick's 12 mandatory scenarios (Summer 2026), matched to the closest Doc. */
const SCEN = (() => {
  const M = 'medical', T = 'trauma';
  const s = (id, title, cat, skills, note = '') => ({ id, title, cat, skills, note });

  const SEED = [
    s('1zbJ4zsbQNNCLN4nrfcqeT0KfhCBAnYA4cX-QF3vBXIY', 'Medical - Pediatric Febrile Seizure', M, {}, 'Blow-by O2, cooling only'),
    s('1ASwF6YgRj2Z5xkMOFlOQbMc9c3e1N1p3jq6eNxK9unw', 'Medical - Hypoglycemia', M, { 'BG Monitoring': 1, 'Oral Glucose': 1 }),
    s('1vBa5IYdAlBJsc8FrKJ3lv0LxB1OyzhpedXGLp8mq64Y', 'Medical - cardiac arrest unstable', M, { 'CPR': 1, 'Defibrillation': 1, 'BVM': 1, 'OPA': 1, 'Head Tilt': 1 }, 'Has ROSC after shock'),
    s('1wcXp8V33WJo0PVXWmYtJQTpbd0Xd2mtQMfUvYtrbmGo', 'Medical - Hypoglycemia unstable', M, { 'BG Monitoring': 1, 'Head Tilt': 1, 'NPA': 1, 'NRB': 1 }, 'Unresponsive, so no oral glucose'),
    s('1DCy8Vw-n27236TvG6XplXC8yn8Mx-fF-u_ZS1Un9yRo', 'Medical - Pediatric Measles unstable', M, { 'NRB': 1 }),
    s('1XsVIgajs2yM5Bk8dm4WqwLRvJU04ZL6OIlobv1JHL9k', 'Medical - Hyperglycemia unstable', M, { 'BG Monitoring': 1 }),
    s('1FDDI5QVkBtALW3Ouu0D5UtHw_1k-BWqe5CpQee0QSz0', 'Medical - Anxiety Attack', M, {}, 'Coaching + refusal'),
    s('17CH-0dPdUQyAKmOj3-A_UGNt8lXQtf1_KWpBk8jlzUQ', 'Medical - Angina', M, { 'NC': 1, 'Sublingual (Nitro)': 1, 'Oral (ASA)': 1, '12 Lead ECG': 1 }),
    s('1rW6nm5ZXi7TJdFn08ZgijzsQdCIbKLTOCVPRiA0dkVI', 'Medical - Appendicitis', M, {}),
    s('1wL0Cfwuu1ea719WubB52ML0I07-gX69kk3q2E7bclFk', 'Medical - COPD unstable', M, { 'NRB': 1, 'CPAP': 1 }),
    s('1pBAWkfoqI7R0j7mlGhzU4qAFnoanMbPDeKZNtyFvg3Q', 'Medical - Asthma unstable', M, { 'NRB': 1, 'Nebulized': 1 }, 'Says “CPAP if appropriate”'),
    s('19kVyoqtcJFOJGJGtNzmQU-82yCRFbAIR1l9oMsoUTEI', 'Medical - Pneumonia pediatric', M, { 'NC': 1, '12 Lead ECG': 1 }),
    s('1zP1yksYd5UN3tkTAyh42AkeSqJvH4Y-v4_r-gbMlyco', 'Medical - Drowning pediatric unstable', M, { 'BVM': 1 }),
    s('1UFV7jCdRgwzJKMXP-8EV2fN0MVtBGyP1cqThL1g7MWY', 'Medical - Pediatric Pertussis', M, {}, 'Blow-by O2 only'),
    s('1GEAwnBLyzE4QHqDGJ0kP5e4mZx19PZG23-0GGbNHk3o', 'Medical - Pediatric Croup unstable', M, {}, 'Blow-by O2 only'),
    s('1bGYCCb2SOHPUaaQbmYMk6c3VRVzyx-4AQGZ8eb0SZcI', 'Medical - Sexual Assault', M, {}),
    s('1tEE2NHHRSSXUfn-YHDTmCSkAkMSIvkwUFI6DZoevfpg', 'Medical - OB Delivery', M, {}, 'OB delivery is a rote sign-off'),
    s('1512LStGycE_Hl7qb9O5bE36Lf8UOTPpiclVtk0kwLxY', 'Medical - OB Abruption', M, {}),
    s('1i6VDU7BvXKr-4wCrf3r5SnsVGlps9VgtwTPzuatiY_0', 'Medical - OB ROM', M, {}),
    s('1iMzeTp0Ba9kqHhYY5_3-2gZOGwZWh_0xl4f8MQdkWsc', 'Medical - Stroke Hemorrhagic unstable', M, { 'Head Tilt': 1, 'Suctioning': 1, 'NPA': 1, 'BVM': 1 }),
    s('1nN5bgR7OrG3RBQVB3Ugnhe47dTAkdwOqRbZhnvf-kvw', 'Medical - Stroke Ischemic unstable', M, { 'Suctioning': 1, 'NRB': 1 }),
    s('1CKkdbXHVHgxCxrYyJO8l3lvXl8E9t2x7f9wvF1TZTs8', 'Medical - TIA', M, {}),
    s('1dxLFxNXmtPFUUFZdsb2yRaK1c4taDT8R8NFp59d71us', 'Medical - Seizures unstable', M, { 'Manual C-Spine': 1, 'Jaw-Thrust': 1, 'Suctioning': 1, 'NPA': 1, 'NRB': 1 }),
    s('1yyEDzUAXywnDAt9kJmoZJLv0KsYj_dz88NdrRfRKByQ', 'Medical - Asthma', M, { 'NC': 1, 'Assisted Inhaler': 1 }),
    s('1XLnHN3Xf0ZAYVrNXPAb1cslWMQ7za4YXM44MtvfGD-I', 'Medical - Sepsis/UTI unstable', M, { 'NRB': 1 }),
    s('1Zxhf5i1GaIiZ3Q3I1JMHabPZgIMne9k19wrDKCu8azE', 'Medical - PE unstable', M, { 'NRB': 1 }),
    s('1gxhXTZUlI6Qz1XiMn67NysagFpyGTo6M2ibbM0TKiDM', 'Medical - Pancreatitis', M, {}, 'Vital signs are blank in the Doc'),
    s('1u_4ARId2cuS9cz2hkmkrgyMQN85kUfb61GjJDKX8-J0', 'Medical - OD unstable', M, { 'Head Tilt': 1, 'BVM': 1, 'IN (Narcan)': 1 }),
    s('1DEAycgZekILPL7ipqEv0EHA_i3fB9_n9riW7hAv7A7s', 'Medical - OD (non-opioid) pediatric unstable', M, { 'Head Tilt': 1, 'BVM': 1 }),
    s('1GT0meEBoe7ruPPFAHzKSMxcDSpvJS9p4d5020PmwRz4', 'Medical - N/V/D', M, {}),
    s('1Spo0rt2WrfLmYK8kcgBc1JQbHe04UE_7AJ8jutCMk1g', 'Medical - Hallucinations', M, {}),
    s('1NNhb4XI2NRWJfgcRhtOnyavcyf26tZWU2F1z57TbUP4', 'Medical - MI unstable', M, { 'NRB': 1, 'Oral (ASA)': 1, '12 Lead ECG': 1 }),
    s('1d9fiOYpZqZWunFshK0Je_9dgFJhPV5y2QDCXotg42V4', 'Medical - Local allergic reaction', M, {}),
    s('1LiBPNZrf847x-QwspaxrjpGw0qEnwsXUIuMLE1Ebbac', 'Medical - Kidney Stones', M, {}),
    s('1t8Scl3VrI4er20BqX9RM8jmZ2MLj_7sUnqglNUxf75Y', 'Medical - heart failure', M, { 'NC': 1 }, 'Mild as written: no CPAP (Nick’s CHF rewrite would add it)'),
    s('1gu6k4uI4HtNI06mVmiswNnzZoBp4MaKzqZh_YPEVpLU', 'Medical - GI bleed unstable', M, { 'NRB': 1, 'BVM': 1, 'NPA': 1 }),
    s('1oF28_fKTsQufD2HP1MucAMWPP5swMp2x7wCyqU_74mQ', 'Medical - Anaphylaxis unstable', M, { 'NRB': 1, 'IM (Epi-Pen)': 1 }),

    s('1W7Zp8ZI5Ki-eIsMR0YjYfdnhzgMJ5Uu4oz_bz2c2XDc', 'Trauma - animal bite', T, { 'Direct Pressure': 1 }),
    s('1fX7xBa0RS-pG53tJyeKrZBgDSJFTOGN1AQbIerjeBaA', 'Trauma - Geriatric hip fx', T, { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('16-S5kXUc_xJZYVyMnMRtAas5pCAiIFSMeI_apCFjGcs', 'Trauma - MVA unstable', T, { 'Manual C-Spine': 1, 'BVM': 1, 'Direct Pressure': 1, 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1Tcoy75fIslkSjuhwcdoaWdT01_K4DRTr9UImcoL19KA', 'Trauma - burns', T, {}),
    s('1f7OovmOBF5Yd8sL_QNhr49bwgOJfT1NCw3j6Hp8AIGo', 'Trauma - fall unstable', T, { 'Manual C-Spine': 1, 'BVM': 1, 'Direct Pressure': 1, 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('10LGRNheZBb3cJXkkqQkBm0QvijlTVQtUgdZ8LYQxq4Y', 'Trauma - MVA', T, {}, 'Transport only'),
    s('1x7TL2CI0BPkY9TcvdniVKCaxBPZ8bM8D8xb6tA8faDc', 'Trauma - GSW unstable', T, { 'Wound Packing': 1, 'Direct Pressure': 1, 'NRB': 1 }),
    s('1q-yfBXJtgArE363KqeEpg3NK71b7FGqXLQ6_rT8zBVc', 'Trauma - Pediatric Assault', T, { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1JvoJUjrjJ8Mr2V9PNbrjVxAO70lFJ8ler4o6gPZRrNY', 'Trauma - Blast Injury unstable', T, { 'Manual C-Spine': 1, 'Direct Pressure': 1, 'BVM': 1 }),
    s('1tX1TGMaILPzPe9Fu9x7VXx0UPnnHSd3Q5rFiSUBzYus', 'Trauma - Motorcycle Collision unstable', T, { 'Manual C-Spine': 1, 'Direct Pressure': 1, 'BVM': 1, 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1PoH5SGe1_SWUodqdACEslbkzUcBjEhUgmqHB0MIRsOA', 'Trauma - crush injury unstable', T, { 'Manual C-Spine': 1, 'NRB': 1, 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1qewMXGT3g1IvNXFC4BgxTPJ6pMlMuiOVoJ87H6jOyxU', 'Trauma - Diving injury', T, { 'Manual C-Spine': 1, 'C-Collar': 1, 'Long Spine Board': 1 }),
    s('1ZAxKeBzyDf2nKGMDW9ohcEzjGmHGH-B7WDWXpuoXj4k', 'Trauma - pediatric amputation', T, { 'Direct Pressure': 1 }),
    s('1x3xk-mbmC0jzkgB8BDMRc4_liqrbDuRQdwXj0iKV5lI', 'Trauma - pedestrian struck unstable', T, { 'Tourniquet': 1, 'Direct Pressure': 2, 'Manual C-Spine': 1, 'C-Collar': 1, 'Long Spine Board': 1, 'NRB': 1 }),
    s('1PS6sCoZ79rrq-4vNtyGqmRxBYJgk4tH1loMNklFWvk0', 'Trauma - Penetrating injury unstable', T, { 'NPA': 1, 'BVM': 1 }),
    s('1tUM56qIC2IK9blFdhHVA0Qt3m87GxomHzOo59VXh89s', 'Trauma - Dislocation', T, { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1R5miCxaY4Drl48opXvPudt1ZtqCIqzclBdn4nUKIC9E', 'Trauma - Hemorrhage unstable', T, { 'Direct Pressure': 1, 'Tourniquet': 1, 'NPA': 1, 'BVM': 1 }),
    s('1axezNWv6SYbCf1VHRPLe4kSCDLkwOit1UQz5Ne8XlTY', 'Trauma - Sports Fx', T, { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1Ca6Z5qXVqh4CH6LCzLg-BGbbs8eLGI0TGINw73mXu0A', 'Trauma - Burns pediatric', T, {}),
    s('1Vgq_VFhzGbc1JW2aUR84oi8XBZR5185oGraWzSSvUNo', 'Trauma - Blunt trauma', T, { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    s('1CSO7pCP0pvs874MS-BQWPj7mIF1D6C5SCFWHc6byZBw', 'Medical - Suicide Attempt', T, { 'Tourniquet': 1, 'Direct Pressure': 1 }, 'Saved in the Trauma folder'),
  ];

  const TARGETS = {
    'Pulse Oximetry': 5, 'Manual RR': 5, 'Manual HR': 5, 'Manual BP': 5, 'Lung Sounds': 5, 'BG Monitoring': 1, 'Patient Transport': 5,
    'Oral Glucose': 1, 'Oral (ASA)': 1, 'Sublingual (Nitro)': 1, 'Assisted Inhaler': 1, 'Nebulized': 1, 'IM (Epi-Pen)': 1, 'IN (Narcan)': 1,
    'NC': 2, 'NRB': 2, 'BVM': 2, 'CPAP': 1, 'Head Tilt': 1, 'Jaw-Thrust': 1, 'NPA': 2, 'OPA': 2, 'Suctioning': 2, 'SGA (iGel)': 1,
    '12 Lead ECG': 2, 'CPR': 1, 'Defibrillation': 1,
    'Direct Pressure': 2, 'Tourniquet': 2, 'Wound Packing': 1, 'Manual C-Spine': 2, 'C-Collar': 2, 'Long Spine Board': 1,
    'Extremity Stabilization': 2, 'Extremity Splinting': 1, 'Traction Splint': 1,
    'Assisted Delivery': 0, 'Complicated Delivery': 0,
  };

  // Add-ons, from Bella's rules (Oct 20). cat: which kind of scenario ('any', 'medical', 'trauma').
  // needs: it only goes on a scenario that has ANY of these (a skill, or 'trait:chest' / 'trait:breathing' / 'trait:alert').
  // minus: a swap; the scenario loses this skill (jaw thrust instead of head tilt).
  const A = (text, cat, skills, needs = [], minus = null) => ({ text, cat, skills, needs, ...(minus ? { minus } : {}) });
  const ADDONS = [
    A('Patient is dizzy with a diabetic history: check a blood glucose', 'any', { 'BG Monitoring': 1 }),
    A('Patient becomes hypoxic: NRB', 'any', { 'NRB': 1 }),
    A('Patient vomits (gastric distension or gagging on an OPA): suction', 'any', { 'Suctioning': 1 }),
    A('Add a second wound that needs packing', 'any', { 'Wound Packing': 1, 'Direct Pressure': 1 }, ['Tourniquet']),
    A('Start with an OPA; patient gags, switch to an NPA', 'any', { 'OPA': 1, 'NPA': 1 }, ['BVM']),
    A('Place an i-Gel', 'any', { 'SGA (iGel)': 1 }, ['BVM']),
    A('Patient gags on the OPA: switch to an NPA', 'any', { 'NPA': 1 }, ['OPA']),
    A('Try an OPA first; patient gags, switch to the NPA', 'any', { 'OPA': 1 }, ['NPA']),
    A('Patient is hypoglycemic: oral glucose', 'any', { 'Oral Glucose': 1, 'BG Monitoring': 1 }, ['trait:alert']),
    A('Patient has prescribed nitro for angina: assist with nitro', 'any', { 'Sublingual (Nitro)': 1 }, ['trait:chest']),
    A('Patient has a prescribed inhaler: assist with it', 'any', { 'Assisted Inhaler': 1 }, ['trait:breathing']),
    A('Breathing gets worse: CPAP', 'any', { 'CPAP': 1 }, ['trait:breathing']),
    A('Add a mid-shaft femur fracture (traction splint)', 'trauma', { 'Traction Splint': 1, 'Extremity Stabilization': 1 }),
    A('Add a deformed extremity to splint', 'trauma', { 'Extremity Stabilization': 1, 'Extremity Splinting': 1 }),
    A('Add a significant MOI: full spinal motion restriction', 'trauma', { 'Manual C-Spine': 1, 'C-Collar': 1, 'Long Spine Board': 1 }),
    A('Add an extremity bleed that needs a tourniquet', 'trauma', { 'Tourniquet': 1, 'Direct Pressure': 1 }),
    A('Possible spinal injury: jaw thrust instead of head tilt', 'any', { 'Jaw-Thrust': 1 }, ['Head Tilt'], { 'Head Tilt': 1 }),
    A('Head tilt instead of jaw thrust (no spinal concern)', 'any', { 'Head Tilt': 1 }, ['Jaw-Thrust'], { 'Jaw-Thrust': 1 }),
  ];

  // Patient types, for add-ons like "nitro on any chest pain" (Claude's first pass; checked in the Library).
  const TRAIT_SEED = {
    chest: ['Medical - Angina', 'Medical - Pneumonia pediatric', 'Medical - PE unstable', 'Medical - MI unstable'],
    breathing: ['Medical - Pediatric Measles unstable', 'Medical - Anxiety Attack', 'Medical - COPD unstable', 'Medical - Asthma unstable',
      'Medical - Pneumonia pediatric', 'Medical - Pediatric Pertussis', 'Medical - Pediatric Croup unstable', 'Medical - Asthma',
      'Medical - PE unstable', 'Medical - MI unstable', 'Medical - heart failure', 'Medical - Anaphylaxis unstable'],
    alert: ['Medical - Hypoglycemia', 'Medical - Stroke Ischemic unstable', 'Medical - TIA', 'Medical - Hallucinations'],
  };
  SEED.forEach(x => {
    x.traits = Object.fromEntries(Object.keys(TRAIT_SEED).filter(t => TRAIT_SEED[t].includes(x.title)).map(t => [t, true]));
  });
  // In every week, on that day: Nick's cardiac arrest station (its own station every cohort).
  SEED.find(x => x.title === 'Medical - cardiac arrest unstable').every = 4;

  // Nick's twelve, in his order. His notes say which ones still need changes.
  const NICK = [
    '1x3xk-mbmC0jzkgB8BDMRc4_liqrbDuRQdwXj0iKV5lI', // 1 Pedestrian Struck (Nick wrote a new version)
    '1vBa5IYdAlBJsc8FrKJ3lv0LxB1OyzhpedXGLp8mq64Y', // 2 Chest Pain → Cardiac Arrest (Nick wrote a new version)
    '1pBAWkfoqI7R0j7mlGhzU4qAFnoanMbPDeKZNtyFvg3Q', // 3 Asthma / COPD
    '1NNhb4XI2NRWJfgcRhtOnyavcyf26tZWU2F1z57TbUP4', // 4 Chest Pain / MI
    '1dxLFxNXmtPFUUFZdsb2yRaK1c4taDT8R8NFp59d71us', // 5 Seizure w/ Fall
    '1ASwF6YgRj2Z5xkMOFlOQbMc9c3e1N1p3jq6eNxK9unw', // 6 Hypoglycemia
    '1u_4ARId2cuS9cz2hkmkrgyMQN85kUfb61GjJDKX8-J0', // 7 Opioid Overdose
    '1f7OovmOBF5Yd8sL_QNhr49bwgOJfT1NCw3j6Hp8AIGo', // 8 Fall From Ladder (Nick wrote a new version)
    '1oF28_fKTsQufD2HP1MucAMWPP5swMp2x7wCyqU_74mQ', // 9 Anaphylaxis
    '1t8Scl3VrI4er20BqX9RM8jmZ2MLj_7sUnqglNUxf75Y', // 10 CHF (needs Nick's CPAP rewrite)
    '1nN5bgR7OrG3RBQVB3Ugnhe47dTAkdwOqRbZhnvf-kvw', // 11 Stroke (Ischemic)
    '1axezNWv6SYbCf1VHRPLe4kSCDLkwOit1UQz5Ne8XlTY', // 12 Sports Injury
  ];

  const TRAITS = [['chest', 'Chest pain'], ['breathing', 'Difficulty breathing'], ['alert', 'Altered but alert']];

  return { SEED, TARGETS, ADDONS, NICK, TRAITS };
})();

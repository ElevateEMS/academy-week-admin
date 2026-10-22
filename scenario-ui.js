/* Phase 3: Scenario Library, Academy Week Scenarios (the week plan) and Additional Scenarios (the matcher).

   Loaded before app.js; everything here runs only when app.js calls it, so it can use
   app.js's S, Store, esc, render, schedFor, saveSched and so on.

   Saved in Firebase:
     scenarios/{driveDocId}   { title, cat, skills: { skill: count }, extras: { skill: count } (could also include),
                              star (always in every plan, any day),
                              traits: { chest, breathing, alert },
                              every: day it's in every week (0 = no), note, checked, removed }  (your edits)
     meta/settings            scenTargets, scenAddons, planSize, lastPlan { cohort, ids }
     cohorts/{key}.weekPlan   { items: [{ id, addons: [text], day }], how, updated }
     schedule stations        { topic, content, scen: [docIds] }  (scenarios added to that station)

   The library itself is the Docs in the Medical / Trauma folders (listed by the Apps Script);
   scenarios.js has Claude's first tagging pass, used until you save your own. */

/* ---------- The library ---------- */
const SKILL_ORDER = () => DEFAULTS.skills.flatMap(g => g.items);
const OB_SKILLS = () => (DEFAULTS.skills.find(g => g.group === 'OB') || { items: [] }).items;
// Skills a scenario can be tagged with: not vital signs/transport (every scenario has those), not OB (rote only).
const TAG_GROUPS = () => DEFAULTS.skills.filter(g => g.group !== 'OB')
  .map(g => ({ group: g.group, items: g.items.filter(k => !Match.isEvery(k)) })).filter(g => g.items.length);
const TRAIT_NAME = Object.fromEntries(SCEN.TRAITS);
const scenTargets = () => ({ ...SCEN.TARGETS, ...((S.settings && S.settings.scenTargets) || {}) });
const scenAddons = () => (S.settings && S.settings.scenAddons) || SCEN.ADDONS;
const planSize = () => (S.settings && S.settings.planSize) || 12;
const docUrl = id => 'https://docs.google.com/document/d/' + id + '/edit';

// "Medical - Asthma unstable" → "Asthma (unstable)"
function niceTitle(t) {
  let s = String(t || '').replace(/^\s*(medical|trauma)\s*[-–:]\s*/i, '').trim();
  s = s.replace(/\s+unstable$/i, ' (unstable)');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let libCache = null, libKey = '';
function scenLib() {
  // Rebuilt only when something it's made from changes.
  const key = [S.scenLiveAt || 0, S.scenDocsAt || 0, planItems().map(x => x.id).join()].join('|');
  if (libCache && key === libKey) return libCache;
  const seed = Object.fromEntries(SCEN.SEED.map(s => [s.id, s]));
  const live = S.scenLive ? Object.fromEntries(S.scenLive.map(s => [s.id, s])) : null;
  const ids = new Set([...Object.keys(seed), ...(live ? Object.keys(live) : []), ...Object.keys(S.scenDocs)]);
  const list = [...ids].map(id => {
    const d = S.scenDocs[id] || {}, sd = seed[id], lv = live && live[id];
    const title = (lv && lv.title) || d.title || (sd && sd.title) || 'Untitled Doc';
    const skills = d.skills || (sd ? sd.skills : null);
    return {
      id, title, name: niceTitle(title), url: (lv && lv.url) || docUrl(id),
      cat: d.cat || (sd && sd.cat) || (lv && lv.cat) || 'medical',
      skills, note: d.note ?? (sd ? sd.note : ''), removed: !!d.removed,
      traits: d.traits || (sd && sd.traits) || {}, every: d.every ?? (sd && sd.every) ?? 0,
      extras: d.extras || (sd && sd.extras) || {}, star: !!d.star,
      status: d.checked ? 'checked' : skills ? 'suggested' : 'new',
      gone: !!live && !lv, // in the library but not in the folders anymore
      fresh: !!lv && !sd && !d.skills, // a Doc added to the folders since the tagging pass
    };
  }).filter(s => !s.removed && !(s.gone && !S.scenDocs[s.id] && !planItems().some(x => x.id === s.id)))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  libCache = list; libKey = key;
  return list;
}
const libById = () => Object.fromEntries(scenLib().map(s => [s.id, s]));
const usableScen = () => scenLib().filter(s => s.skills && !s.gone);
// Each scenario's optional extras work like add-ons that only go on that scenario (and are tried first).
function extraAddons() {
  const by = {};
  usableScen().forEach(s => Object.entries(s.extras || {}).forEach(([k, n]) => {
    if (!n) return;
    const text = k + (n > 1 ? ' ×' + n : '') + ' (optional extra)';
    (by[text] = by[text] || { text, cat: 'any', skills: { [k]: n }, only: [], pref: true }).only.push(s.id);
  }));
  return Object.values(by);
}
const allAddons = () => [...extraAddons(), ...scenAddons()];
const addonsByText = () => Object.fromEntries(allAddons().map(a => [a.text, a]));
// "Only on: Tourniquet or Chest pain"
const needsText = a => (a.needs || []).map(n => n.startsWith('trait:') ? TRAIT_NAME[n.slice(6)] || n : n).join(' or ');

// "Tourniquet, Direct Pressure ×2" in Skills Tracking order.
function skillText(skills) {
  const order = SKILL_ORDER();
  const list = Object.entries(skills || {}).filter(([, n]) => n > 0).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return list.length ? list.map(([k, n]) => k + (n > 1 ? ' ×' + n : '')).join(', ') : 'vital signs & transport only';
}

// Asks the Apps Script which Docs are in the folders now (new ones show up as "New").
async function loadScenarios() {
  try {
    S.scenLive = await Sheets.listScenarios(); S.scenLiveAt = Date.now(); S.scenErr = null;
  } catch (e) {
    S.scenErr = /unknown request/i.test(e.message) ? 'The Apps Script needs the new version (see the setup steps).' : e.message;
  }
  render();
}

/* ---------- Where scenarios are on the schedule ---------- */
function stationsWith(id) {
  const out = [];
  [1, 2, 3, 4, 5].forEach(n => schedFor(n).stations.forEach((st, i) => {
    if ((st.scen || []).includes(id)) out.push({ day: n, i, topic: st.topic });
  }));
  return out;
}

// Which stations take scenarios: "Medical Scenarios", "Trauma Scenarios 2", … and the CPR station.
const stationKind = topic => /\bcpr\b/i.test(topic || '') ? 'cpr'
  : /\bmedical\b.*\bscenarios?\b/i.test(topic || '') ? 'medical'
  : /\btrauma\b.*\bscenarios?\b/i.test(topic || '') ? 'trauma' : null;
const PER_STATION = 3; // no more than 3 scenarios expected per rotation
const PRACTICE = 'Practice / makeups (dealer’s choice)';
const scenLine = (sc, addons = []) => sc.name + ': ' + skillText(sc.skills) + addons.map(t => ' + ' + t).join('');
// A placed scenario's add-ons changed: rewrite its line on every station it's on.
async function refreshScenLines(id, addons) {
  const sc = libById()[id];
  if (!sc) return;
  for (const n of new Set(stationsWith(id).map(a => a.day))) {
    const list = schedFor(n).stations.map(x => ({ ...x }));
    list.forEach(st => {
      if (!(st.scen || []).includes(id)) return;
      st.content = String(st.content || '').split('\n').map(l => l.startsWith(sc.name + ':') ? scenLine(sc, addons) : l).join('\n');
    });
    dropSchDrafts(n);
    await saveSched(n, { stations: list });
  }
}

/* Days for a plan from the schedule itself: day by day, each Medical / Trauma Scenarios
   station takes up to 3 of that kind (front-loaded, so the last day is free for makeups),
   every-week scenarios keep their day, and trauma starts with the simplest splinting one. */
function planDaysFromSchedule(items) {
  const lib = libById();
  const slots = [];
  [1, 2, 3, 4, 5].forEach(d => schedFor(d).stations.forEach(st => {
    const k = stationKind(st.topic);
    if (k === 'medical' || k === 'trauma') slots.push({ day: d, kind: k, room: PER_STATION });
  }));
  if (!slots.length) return Match.suggestDays(items, lib); // no scenario stations yet: the simple spread
  const size = x => Object.values((lib[x.id] || {}).skills || {}).reduce((a, b) => a + b, 0);
  const free = items.filter(x => !x.fixed);
  const tra = free.filter(x => (lib[x.id] || {}).cat === 'trauma');
  const opener = tra.filter(x => ((lib[x.id] || {}).skills || {})['Extremity Splinting']).sort((a, b) => size(a) - size(b))[0];
  const queue = { medical: free.filter(x => (lib[x.id] || {}).cat !== 'trauma'), trauma: opener ? [opener, ...tra.filter(x => x !== opener)] : tra };
  slots.forEach(sl => { while (sl.room > 0 && queue[sl.kind].length) { queue[sl.kind].shift().day = sl.day; sl.room--; } });
  // More scenarios than room: they go on the last day that has that kind of station.
  ['medical', 'trauma'].forEach(k => { const last = slots.filter(x => x.kind === k).pop(); queue[k].forEach(x => { x.day = last ? last.day : 4; }); });
  return [...items].sort((a, b) => (a.day || 1) - (b.day || 1));
}

/* Put the plan on the schedule: each scenario goes on its day's matching station with room
   (CPR station for every-week ones), skipping ones already on the schedule. Then empty
   Medical / Trauma Scenarios stations get the practice / makeups note. */
async function placePlan() {
  const lib = libById(), items = planItems();
  const days = {}; // day → its stations (copied), saved once per day
  const dayOf = n => days[n] || (days[n] = schedFor(n).stations.map(x => ({ ...x, scen: [...(x.scen || [])] })));
  const onSchedule = new Set([1, 2, 3, 4, 5].flatMap(n => schedFor(n).stations.flatMap(st => st.scen || [])));
  let placed = 0, already = 0;
  const noRoom = [];
  for (const it of items) {
    const sc = lib[it.id];
    if (!sc) continue;
    if (onSchedule.has(it.id)) { already++; continue; }
    const n = it.day || 1, list = dayOf(n);
    const want = it.fixed ? ['cpr', sc.cat] : [sc.cat];
    const st = want.map(k => list.filter(x => stationKind(x.topic) === k && (k === 'cpr' || x.scen.length < PER_STATION))
      .sort((a, b) => a.scen.length - b.scen.length)[0]).find(Boolean);
    if (!st) { noRoom.push(`${sc.name} (Day ${n})`); continue; }
    st.content = String(st.content || '').split('\n').filter(l => l.trim() !== PRACTICE).join('\n').replace(/\s+$/, '');
    st.content = (st.content ? st.content + '\n' : '') + scenLine(sc, it.addons);
    st.scen.push(it.id); placed++;
  }
  // Scenario stations left empty are for practice and makeups.
  [1, 2, 3, 4, 5].forEach(n => {
    if (!schedFor(n).stations.some(st => ['medical', 'trauma'].includes(stationKind(st.topic)))) return;
    dayOf(n).forEach(st => {
      if (!['medical', 'trauma'].includes(stationKind(st.topic)) || st.scen.length || String(st.content || '').includes(PRACTICE)) return;
      st.content = (String(st.content || '').replace(/\s+$/, '') + '\n' + PRACTICE).replace(/^\n/, '');
    });
  });
  for (const [n, stations] of Object.entries(days)) { dropSchDrafts(Number(n)); await saveSched(Number(n), { stations }); }
  toast([`${placed} scenario${placed === 1 ? '' : 's'} put on the schedule`, already && `${already} already there`,
    noRoom.length && `No room for ${noRoom.join(', ')}: add a station that day or change its day`].filter(Boolean).join(' · ') + '.');
}

// Adds a scenario's line to a station's content (and remembers it, for the Doc link).
// i = -1 makes a new station for it.
async function addToStation(n, i, id, addons = []) {
  const sc = libById()[id];
  if (!sc) return;
  const list = schedFor(n).stations.map(x => ({ ...x }));
  if (i < 0) { list.push({ topic: (sc.cat === 'trauma' ? 'Trauma' : 'Medical') + ' Scenarios', content: '' }); i = list.length - 1; }
  const st = list[i];
  if ((st.scen || []).includes(id)) { toast('It’s already at that station.'); return false; }
  const line = scenLine(sc, addons);
  st.content = String(st.content || '').split('\n').filter(l => l.trim() !== PRACTICE).join('\n').replace(/\s+$/, '');
  st.content = (st.content ? st.content + '\n' : '') + line;
  st.scen = [...(st.scen || []), id];
  dropSchDrafts(n);
  await saveSched(n, { stations: list });
  toast(`Added to Day ${n} · ${st.topic || 'station'}.`);
  return true;
}
// Take several scenarios off every station on one day (one save).
async function removeManyFromStations(n, ids) {
  const lib = libById(), list = schedFor(n).stations.map(x => ({ ...x }));
  list.forEach(st => ids.forEach(id => {
    if (!(st.scen || []).includes(id)) return;
    st.scen = st.scen.filter(x => x !== id);
    const sc = lib[id]; if (sc) st.content = String(st.content || '').split('\n').filter(l => !l.startsWith(sc.name + ':')).join('\n');
  }));
  dropSchDrafts(n);
  await saveSched(n, { stations: list });
}
// i = one station, or null = every station that day it's on.
async function removeFromStation(n, i, id) {
  const sc = libById()[id];
  const list = schedFor(n).stations.map(x => ({ ...x }));
  const hits = i == null ? list.filter(st => (st.scen || []).includes(id)) : [list[i]].filter(Boolean);
  if (!hits.length) return;
  hits.forEach(st => {
    st.scen = (st.scen || []).filter(x => x !== id);
    if (sc) st.content = (st.content || '').split('\n').filter(l => !l.startsWith(sc.name + ':')).join('\n');
  });
  dropSchDrafts(n);
  await saveSched(n, { stations: list });
}

// The chips under a station on the Schedule page.
function stationScen(n, i, st) {
  const lib = libById();
  const chips = (st.scen || []).map(id => {
    const sc = lib[id];
    return `<span class="scen-chip"><a href="${esc(sc ? sc.url : docUrl(id))}" target="_blank" rel="noopener" title="Open the Doc">${esc(sc ? sc.name : 'Scenario')}</a><button class="x" data-act="stScenDel" data-i="${i}" data-id="${id}" title="Take it off this station" aria-label="Remove">×</button></span>`;
  }).join('');
  // "+ Additional Scenarios" only on Medical / Trauma Scenarios stations (not skills, OB or CPR ones).
  const find = ['medical', 'trauma'].includes(stationKind(st.topic));
  if (!chips && !find) return '';
  return `<div class="st-scen">${chips}${find ? `<button class="link" data-act="matchOpen" data-i="${i}">+ Additional Scenarios</button>` : ''}</div>`;
}

/* ---------- The week plan (Prep page) ---------- */
const planItems = () => (S.cohortDoc && S.cohortDoc.weekPlan && S.cohortDoc.weekPlan.items) || [];
function planStatus(items = planItems()) {
  const have = Match.coverage(items, libById(), addonsByText());
  return { have, miss: Match.missing(have, scenTargets(), SKILL_ORDER()) };
}
const missText = miss => miss.map(m => m.short + ' ' + m.skill).join(', ');
// "Suggested layout" until scenarios are put on stations, then "N of M on the schedule", then "On the schedule".
function planState(items = planItems()) {
  const placed = items.filter(x => stationsWith(x.id).length).length;
  return !placed ? 'Suggested layout' : placed < items.length ? `${placed} of ${items.length} on the schedule` : 'On the schedule';
}
function coverLine(miss, state = '') {
  const note = state ? ` <span class="cover-state">· ${esc(state)}</span>` : '';
  return miss.length
    ? `<p class="cover-line short"><b>Missing:</b> ${esc(missText(miss))}${note}</p>`
    : `<p class="cover-line ok">✓ Every summative skill is covered${note}</p>`;
}
async function savePlan(items, extra = {}) {
  await Store.set('cohorts/' + S.cohortKey, { weekPlan: { items: items.map(x => ({ id: x.id, addons: x.addons || [], day: x.day || 1, ...(x.fixed ? { fixed: true } : {}) })), updated: Date.now(), ...extra } });
}
async function buildPlan(how) {
  // Every-week scenarios go in first on their own day; starred ones go in on whatever day has room.
  const pinned = usableScen().filter(s => s.every || s.star).map(s => ({ id: s.id, day: s.every || 0 }));
  const last = S.settings && S.settings.lastPlan;
  const avoid = last && last.cohort !== S.cohortKey ? last.ids || [] : planItems().map(x => x.id);
  const items = planDaysFromSchedule(Match.build({ lib: usableScen(), addons: allAddons(), targets: scenTargets(), size: planSize(), avoid, pinned }));
  await Store.set('meta/settings', { lastPlan: { cohort: S.cohortKey, ids: items.map(x => x.id) } });
  await savePlan(items, { how });
  const { miss } = planStatus(items);
  toast(`${items.length} scenarios. ` + (miss.length ? 'Still missing: ' + missText(miss) : 'Every skill is covered.'));
}

function scenBox() {
  const items = planItems();
  if (!items.length) return `<p class="muted small">Let the app pick about ${planSize()} scenarios from your library that cover every summative skill on the Skills Tracking sheet. Each build is a different mix, always with your ★ scenarios.</p>
    <div class="plan-btns one-row right"><button class="btn primary small" data-act="planBuild">Build a new mix</button></div>`;
  const lib = libById(), { miss } = planStatus(items);
  const byDay = [1, 2, 3, 4, 5].map(d => [d, items.filter(x => (x.day || 1) === d)]).filter(([, l]) => l.length);
  return `${coverLine(miss, planState(items))}
    <ul class="plan-mini">${byDay.map(([d, l]) => `<li><span class="d">Day ${d}</span><span>${l.map(x => {
      const sc = lib[x.id];
      return `<span class="${sc && sc.cat === 'trauma' ? 'tr' : ''}">${esc(sc ? sc.name : 'Missing Doc')}${x.addons.length ? ' +' : ''}</span>`;
    }).join(' · ')}</span></li>`).join('')}</ul>
    <div class="plan-btns one-row right"><button class="btn primary small" data-act="planOpen">Open the plan</button></div>`;
}

function planModal() {
  const items = planItems(), lib = libById(), addons = allAddons(), targets = scenTargets();
  const { have, miss } = planStatus(items);
  const med = items.filter(x => (lib[x.id] || {}).cat !== 'trauma').length;

  const row = (x, idx) => {
    const sc = lib[x.id] || { name: 'A Doc that’s gone from the folders', cat: '', skills: {}, url: docUrl(x.id), gone: true };
    const at = stationsWith(x.id);
    const more = addons.filter(a => Match.canAdd(a, sc, x.addons, addonsByText()));
    return `<li class="plan-item">
      <div class="pi-top">
        <div><a class="pi-name" href="${esc(sc.url)}" target="_blank" rel="noopener" title="Open the Doc">${esc(sc.name)}</a>
          ${sc.cat ? `<span class="tag ${sc.cat}">${sc.cat}</span>` : ''}${sc.every ? ' <span class="tag ok">Every week</span>' : sc.star ? ' <span class="star-on" title="Always included">★</span>' : ''}${sc.gone ? ' <span class="tag red">Doc missing</span>' : ''}</div>
        <div class="pi-tools">
          <button class="btn tiny" data-act="placeOpen" data-i="${idx}">Add to a station</button>
          <button class="trash-btn" data-act="planDelAsk" data-i="${idx}" title="Remove from plan" aria-label="Remove from plan">${ICONS.trash}</button>
        </div>
      </div>
      <div class="pi-skills">${esc(skillText(sc.skills))}</div>
      ${x.addons.map((t, j) => `<div class="pi-addon">+ ${esc(t)} <button class="x" data-act="planAddonDel" data-i="${idx}" data-j="${j}" aria-label="Remove add-on">×</button></div>`).join('')}
      ${more.length ? `<select class="pi-add" data-change="planAddon" data-i="${idx}"><option value="">+ add-on</option>${more.map(a => `<option>${esc(a.text)}</option>`).join('')}</select>` : ''}
      ${at.length ? `<div class="pi-at">✓ On ${at.map(a => `<span class="pi-st">Day ${a.day} · ${esc(a.topic || 'a station')}<button class="x" data-act="stScenDel" data-n="${a.day}" data-i="${a.i}" data-id="${x.id}" title="Take it off this station (it stays in the plan)" aria-label="Take off station">×</button></span>`).join(', ')}</div>` : ''}
    </li>`;
  };

  const days = [1, 2, 3, 4, 5].map(d => [d, items.map((x, i) => [x, i]).filter(([x]) => (x.day || 1) === d)]).filter(([, l]) => l.length);
  const cell = k => { const h = have[k] || 0, t = targets[k] || 0; return `<span class="cov ${h < t ? 'short' : ''}">${esc(k)} <b>${h}/${t}</b></span>`; };

  return `<div class="overlay" data-act="planClose"><div class="modal plan" data-stop>
    <div class="modal-head"><h2>Academy Week Scenarios</h2><button class="x big" data-act="planClose" aria-label="Close">×</button></div>
    <div class="modal-body" data-keep-scroll="plan">
      <div class="plan-grid">
        <div>
          <div class="plan-top">
            ${items.length ? coverLine(miss, planState(items)) : '<p class="muted">No scenarios picked yet.</p>'}
            <p class="muted small">${items.length} scenarios · ${med} medical · ${items.length - med} trauma</p>
            <div class="plan-btns">
              <button class="btn small" data-act="planBuild">Build a new mix</button>
              ${items.length ? '<button class="link quiet" data-act="planClearAsk">Clear plan</button>' : ''}
              ${items.length ? '<button class="btn primary small push-right" data-act="planPlace">Put the plan on the schedule</button>' : ''}
            </div>
          </div>
          ${days.map(([d, l]) => `<p class="mini-head">Day ${d}</p><ul class="plan-list">${l.map(([x, i]) => row(x, i)).join('')}</ul>`).join('')}
          <div class="plan-add"><button class="btn small" data-act="libAddOpen">+ Add a scenario</button></div>
        </div>
        <aside class="plan-cov">
          <p class="mini-head">Sign-offs this plan gives each student</p>
          ${DEFAULTS.skills.filter(g => g.group !== 'OB').map(g => `<p class="cov-group">${esc(g.group)}</p><div class="cov-list">${g.items.map(cell).join('')}</div>`).join('')}
        </aside>
      </div>
    </div>
  </div></div>`;
}

// Picking the station for a scenario from the plan (or from Additional Scenarios without a station).
// "Clear the whole plan?" (and, if any are placed, take them off the schedule too).
function planClearModal() {
  const placed = planItems().filter(x => stationsWith(x.id).length).length;
  return `<div class="overlay" data-act="planClearClose"><div class="modal confirm" data-stop>
    <div class="modal-head"><h2>Clear Plan</h2><button class="x big" data-act="planClearClose" aria-label="Close">×</button></div>
    <div class="modal-body"><p>Clear all ${planItems().length} scenarios from ${esc(S.cohortKey)}’s plan?</p>
      ${placed ? `<p class="muted small">${placed} of them ${placed === 1 ? 'is' : 'are'} on the schedule. Anything you typed on a station yourself stays.</p>` : ''}</div>
    <div class="modal-foot"><button class="btn" data-act="planClearClose">Cancel</button>
      ${placed ? `<button class="btn" data-act="planClear">Clear plan only</button><button class="btn primary danger" data-act="planClear" data-sched="1">Clear plan and schedule</button>`
        : '<button class="btn primary danger" data-act="planClear">Clear plan</button>'}</div>
  </div></div>`;
}
// "Remove from plan?" (and, if it's placed, from the schedule too).
function planDelModal() {
  const x = planItems()[S.planDelAsk];
  if (!x) return '';
  const name = (libById()[x.id] || {}).name || 'this scenario', at = stationsWith(x.id);
  return `<div class="overlay" data-act="planDelClose"><div class="modal confirm" data-stop>
    <div class="modal-head"><h2>Remove Scenario</h2><button class="x big" data-act="planDelClose" aria-label="Close">×</button></div>
    <div class="modal-body"><p>Remove <b>${esc(name)}</b> from the plan?</p>
      ${at.length ? `<p class="muted small">It’s on ${at.map(a => 'Day ' + a.day + ' · ' + esc(a.topic || 'a station')).join(', ')}.</p>` : ''}</div>
    <div class="modal-foot"><button class="btn" data-act="planDelClose">Cancel</button>
      ${at.length ? `<button class="btn" data-act="planDel">Plan only</button><button class="btn primary danger" data-act="planDel" data-sched="1">Remove from plan and schedule</button>`
        : '<button class="btn primary danger" data-act="planDel">Remove</button>'}</div>
  </div></div>`;
}

function placeModal() {
  const p = S.place, lib = libById();
  const n = p.day, stations = schedFor(n).stations;
  const names = p.ids.map(id => (lib[id] || {}).name || 'Scenario').join(' + ');
  return `<div class="overlay" data-act="placeClose"><div class="modal place" data-stop>
    <div class="modal-head"><h2>Add to a Station</h2><button class="x big" data-act="placeClose" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p><b>${esc(names)}</b>${p.addons.length ? `<br><span class="muted small">+ ${esc(p.addons.join(' + '))}</span>` : ''}</p>
      <div class="place-days">${[1, 2, 3, 4, 5].map(d => `<button class="chip small ${d === n ? 'on' : ''}" data-act="placeDay" data-n="${d}">Day ${d}</button>`).join('')}</div>
      <div class="place-list">
        ${stations.map((st, i) => {
          // How many scenarios are on it already (no limit), and which ones.
          const on = st.scen || [], here = p.ids.some(id => on.includes(id));
          const count = here ? 'Already here' : on.length ? on.length + (on.length === 1 ? ' scenario' : ' scenarios') : '';
          return `<button class="place-st" data-act="placeTo" data-i="${i}"><div class="ps-top"><b>${esc(st.topic || 'Station ' + (i + 1))}</b>${count ? `<em class="${here ? 'here' : ''}">${count}</em>` : ''}</div>
            <span>${esc((st.content || '').split('\n')[0] || '')}</span>
            ${on.length ? `<span class="ps-on">${esc(on.map(id => (lib[id] || {}).name || 'Scenario').join(' · '))}</span>` : ''}</button>`;
        }).join('')}
        <button class="place-st new" data-act="placeTo" data-i="-1"><b>+ New station</b><span>“${(lib[p.ids[0]] || {}).cat === 'trauma' ? 'Trauma' : 'Medical'} Scenarios” on Day ${n}</span></button>
      </div>
    </div>
  </div></div>`;
}

/* ---------- Additional Scenarios (the matcher) ---------- */
// Who's behind on what (attending students; one squad if picked): { skill: how many students }.
function behindCounts(m) {
  const sq = squadsFor(m.n);
  const inSquad = m.squad ? new Set([...((sq.s[m.squad] || {}).A || []), ...((sq.s[m.squad] || {}).B || [])]) : null;
  const out = {};
  attending().filter(s => s.skill === 'behind' && (!inSquad || inSquad.has(s.name)))
    .forEach(s => s.behind.forEach(k => { out[k] = (out[k] || 0) + 1; }));
  return out;
}
function matchWant(m) {
  const counts = behindCounts(m);
  const tagged = new Set(TAG_GROUPS().flatMap(g => g.items));
  if (m.picked) return Object.fromEntries(Object.keys(m.picked).filter(k => tagged.has(k)).map(k => [k, counts[k] || 1]));
  return Object.fromEntries(Object.entries(counts).filter(([k]) => tagged.has(k)));
}

function matchModal() {
  const m = S.match, lib = libById(), counts = behindCounts(m), want = matchWant(m);
  const st = m.i != null ? schedFor(m.n).stations[m.i] : null;
  const sq = squadsFor(m.n);
  const everyBehind = Object.keys(counts).filter(k => Match.isEvery(k));
  const obBehind = Object.keys(counts).filter(k => OB_SKILLS().includes(k));
  const r = Object.keys(want).length ? Match.find({ lib: usableScen(), addons: allAddons(), want, cat: m.cat }) : null;
  const planned = Object.fromEntries(planItems().map(x => [x.id, x.day || 1]));

  const card = res => {
    const where = res.ids.flatMap(id => stationsWith(id).map(a => `${(lib[id] || {}).name}: on Day ${a.day}`));
    const plan = res.ids.filter(id => planned[id] && !stationsWith(id).length).map(id => `${(lib[id] || {}).name}: in the week plan for Day ${planned[id]}`);
    return `<div class="match-card">
      <div class="mc-names">${res.ids.map(id => { const sc = lib[id] || {}; return `<a href="${esc(sc.url)}" target="_blank" rel="noopener">${esc(sc.name)}</a> <span class="tag ${sc.cat}">${sc.cat}</span>`; }).join('<span class="plus">+</span>')}</div>
      ${res.addons.length ? `<div class="pi-addon">+ ${esc(res.addons.join(' + '))}</div>` : ''}
      <div class="mc-cover">Covers ${res.covers.map(esc).join(', ') || 'none of them'}${res.misses.length ? ` · <span class="short">not ${res.misses.map(esc).join(', ')}</span>` : ''}</div>
      ${[...where, ...plan].map(t => `<div class="pi-at">${esc(t)}</div>`).join('')}
      <button class="btn tiny" data-act="matchAdd" data-ids="${res.ids.join(',')}" data-addons="${esc(JSON.stringify(res.addons))}">${st ? 'Add to this station' : 'Add to a station'}</button>
    </div>`;
  };
  const section = (title, list) => list.length ? `<p class="mini-head">${title}</p><div class="match-cards">${list.map(card).join('')}</div>` : '';

  return `<div class="overlay" data-act="matchClose"><div class="modal match" data-stop>
    <div class="modal-head"><h2>Additional Scenarios</h2><button class="x big" data-act="matchClose" aria-label="Close">×</button></div>
    <div class="modal-body" data-keep-scroll="match">
      <p class="muted small">${st ? `Day ${m.n} · <b>${esc(st.topic || 'Station')}</b>` : 'Pick skills, then add the scenario to a station.'}</p>
      ${st && (st.scen || []).length ? `<div class="st-scen at">At this station: ${(st.scen || []).map(id => `<span class="scen-chip">${esc((lib[id] || {}).name || 'Scenario')}<button class="x" data-act="stScenDel" data-i="${m.i}" data-id="${id}" data-n="${m.n}" title="Take it off (to swap it for another)" aria-label="Remove">×</button></span>`).join('')}</div>` : ''}
      ${sq.count ? `<div class="match-row"><span class="lbl">Behind in</span>${[0, ...Array.from({ length: sq.count }, (_, i) => i + 1)].map(s => `<button class="chip small ${(m.squad || 0) === s ? 'on' : ''}" data-act="matchSquad" data-s="${s}">${s ? 'Squad ' + s : 'All squads'}</button>`).join('')}</div>` : ''}
      <div class="match-row"><span class="lbl">Kind</span><div class="seg">${[['medical', 'Medical'], ['trauma', 'Trauma'], ['both', 'Both']].map(([k, l]) => `<button class="${m.cat === k ? 'on' : ''}" data-act="matchCat" data-c="${k}">${l}</button>`).join('')}</div></div>
      <p class="mini-head">Skills to cover <span class="count">${Object.keys(counts).length ? 'numbers = students behind on it' : 'nobody is marked behind, so pick any'}</span></p>
      ${TAG_GROUPS().map(g => `<div class="skill-group"><span>${esc(g.group)}</span><div>${g.items.map(k =>
        `<button class="chip small ${want[k] ? 'on' : ''} ${counts[k] ? 'warn' : ''}" data-act="matchSkill" data-k="${esc(k)}">${esc(k)}${counts[k] ? ` <b>${counts[k]}</b>` : ''}</button>`).join('')}</div></div>`).join('')}
      ${everyBehind.length ? `<p class="muted small">${esc(everyBehind.join(', '))}: every scenario has these, so any one works.</p>` : ''}
      ${obBehind.length ? `<p class="muted small">${esc(obBehind.join(', '))}: rote only, so that’s a skill station, not a scenario.</p>` : ''}
      ${m.picked ? '<button class="link" data-act="matchReset">Back to who’s behind</button>' : ''}
      <div class="match-results">
        ${!r ? '<p class="empty">Pick the skills to cover.</p>'
          : section('One scenario covers them all', r.singles) + section('Best pair (the two scenarios a team runs)', r.pairs)
            + section(r.singles.length || r.pairs.length ? 'Or the closest one + an add-on' : 'Closest + an add-on', r.addon)
            + section('Closest (no add-on fills the rest)', r.close)
            + (!r.singles.length && !r.pairs.length && !r.addon.length && !r.close.length ? `<p class="empty">Nothing in the ${m.cat === 'both' ? '' : m.cat + ' '}library has these.${m.cat !== 'both' ? ' Try Both.' : ''}</p>` : '')}
      </div>
    </div>
  </div></div>`;
}

/* ---------- Scenario Library pop-up ---------- */
// Library opened from the plan's "+ Add a scenario": a right-aligned Add / In plan on each row.
function addCell(s) {
  if (planItems().some(x => x.id === s.id)) return '<span class="lib-add in">In plan</span>';
  if (!s.skills || s.gone) return '';
  return `<button class="btn tiny lib-add" data-act="planAddId" data-id="${s.id}">+ Add to plan</button>`;
}
// Opening the Add-ons / Requirements tab makes a working copy; only warn on close
// if it's actually different from what's saved.
function libUnsaved() {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const addonsNow = list => list.map(x => ({ text: x.text.trim(), cat: x.cat || 'any', skills: x.skills, needs: x.needs || [], ...(x.minus ? { minus: x.minus } : {}) })).filter(x => x.text);
  if (S.addonDraft && !same(addonsNow(S.addonDraft), addonsNow(JSON.parse(JSON.stringify(scenAddons()))))) return true;
  if (S.reqDraft) { const t = { ...scenTargets(), _size: planSize() }; if (Object.keys({ ...t, ...S.reqDraft }).some(k => (S.reqDraft[k] || 0) !== (t[k] || 0))) return true; }
  return false;
}
function libModal() {
  const tab = S.libTab;
  const tabBtn = (t, label) => `<button class="bag-tab ${tab === t ? 'on' : ''}" data-act="libTab" data-t="${t}">${label}</button>`;
  const body = tab === 'addons' ? libAddons() : tab === 'req' ? libReq() : libScenarios();
  const foot = tab === 'addons' ? '<span class="muted small">Add-ons are twists you add to a scenario for a skill it doesn’t have. The builder and Additional Scenarios use them.</span><button class="btn primary" data-act="addonSave">Save add-ons</button>'
    : tab === 'req' ? '<button class="btn primary" data-act="reqSave">Save</button>'
    : '';
  return `<div class="overlay" data-act="libClose"><div class="modal lib" data-stop>
    <div class="modal-head"><h2>Scenario Library</h2><button class="x big" data-act="libClose" aria-label="Close">×</button></div>
    <div class="bag-tabs">${tabBtn('scen', 'Scenarios')}${tabBtn('addons', 'Add-ons')}${tabBtn('req', 'Requirements')}</div>
    <div class="modal-body" data-keep-scroll="lib">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div></div>`;
}

function libScenarios() {
  const all = scenLib();
  const f = S.libFilter, q = (S.drafts.libSearch || '').trim().toLowerCase();
  const counts = {
    all: all.length, medical: all.filter(s => s.cat === 'medical').length, trauma: all.filter(s => s.cat === 'trauma').length,
    check: all.filter(s => s.status !== 'checked').length, new: all.filter(s => s.status === 'new').length,
    star: all.filter(s => s.star || s.every).length,
  };
  const shown = all.filter(s => (f === 'all' || s.cat === f || (f === 'check' && s.status !== 'checked') || (f === 'new' && s.status === 'new') || (f === 'star' && (s.star || s.every)))
    && (!q || s.name.toLowerCase().includes(q) || skillText(s.skills).toLowerCase().includes(q)));
  const chip = (k, l) => `<button class="chip small ${f === k ? 'on' : ''}" data-act="libFilter" data-f="${k}">${l} <b>${counts[k]}</b></button>`;
  const statusTag = s => s.gone ? '<span class="tag red">Doc missing</span>'
    : s.status === 'checked' ? '' // once you've saved it, the "Suggested" tag just goes away
    : s.status === 'suggested' ? '<span class="tag">Suggested</span>' : '<span class="tag warn">New: needs tags</span>';

  return `
    ${S.scenErr ? `<div class="alert small">Couldn’t list the scenario folders: ${esc(S.scenErr)} Showing the scenarios known on Oct 20 instead.</div>` : !S.scenLive ? '<p class="muted small">Checking the Drive folders for new Docs…</p>' : ''}
    <div class="lib-top"><div class="chips">${chip('all', 'All')}${chip('medical', 'Medical')}${chip('trauma', 'Trauma')}${chip('star', '★ Always')}${chip('check', 'Not checked yet')}${counts.new ? chip('new', 'New') : ''}</div>
      <input id="libSearchIn" class="search" data-draft="libSearch" placeholder="Find a scenario or skill" value="${esc(S.drafts.libSearch || '')}"></div>
    <ul class="lib-list">${shown.map(s => `<li class="${S.libSel === s.id ? 'open' : ''}">
      <div class="lib-line">${s.every ? `<span class="star-btn on" title="In every week (Day ${s.every})">★</span>`
        : `<button class="star-btn ${s.star ? 'on' : ''}" data-act="libStar" data-id="${s.id}" title="${s.star ? 'Always included: click to undo' : 'Always include this in every plan'}">${s.star ? '★' : '☆'}</button>`}
      <button class="lib-row" data-act="libSel" data-id="${s.id}">
        <span class="lr-name">${esc(s.name)}</span><span class="tag ${s.cat}">${s.cat}</span>${statusTag(s)}${s.every ? `<span class="tag ok">Every week · Day ${s.every}</span>` : ''}${Object.keys(s.extras).length ? `<span class="trait">+${Object.keys(s.extras).length} optional</span>` : ''}${Object.keys(s.traits).filter(t => s.traits[t]).map(t => `<span class="trait">${esc(TRAIT_NAME[t])}</span>`).join('')}
        <span class="lr-skills">${s.skills ? esc(skillText(s.skills)) : '<em>no tags yet</em>'}</span></button>${S.libAdd ? addCell(s) : ''}</div>
      ${S.libSel === s.id ? libEditor(s) : ''}</li>`).join('') || '<li class="empty">No scenarios match.</li>'}</ul>`;
}

function libEditor(s) {
  const dr = S.libDraft;
  return `<div class="lib-edit">
    <div class="le-top"><div class="seg">${['medical', 'trauma'].map(c => `<button class="${dr.cat === c ? 'on' : ''}" data-act="libCat" data-c="${c}">${c === 'medical' ? 'Medical' : 'Trauma'}</button>`).join('')}</div>
      <a class="btn small" href="${esc(s.url)}" target="_blank" rel="noopener">Open the Doc</a></div>
    <p class="muted small">Tap the skills a student can get signed off in this scenario. Tap again for ×2, again to clear.</p>
    ${skillPicker(dr.skills, 'libSkill')}
    <button class="link extras-toggle" data-act="libExtrasToggle">${S.libExtrasOpen ? '▾' : '▸'} Could also include (optional)${Object.keys(dr.extras).length ? ': ' + esc(skillText(dr.extras)) : ''}</button>
    ${S.libExtrasOpen ? `<div class="extras"><p class="muted small">Skills that could be worked into this scenario if needed. The builder and Additional Scenarios use these before the general add-ons.</p>${skillPicker(dr.extras, 'libExtra')}</div>` : ''}
    <div class="skill-group"><span>Patient</span><div>${SCEN.TRAITS.map(([t, l]) => `<button class="chip small ${dr.traits[t] ? 'on' : ''}" data-act="libTrait" data-t="${t}">${l}</button>`).join('')}
      <span class="muted small">for add-ons like “nitro on any chest pain”</span></div></div>
    <div class="skill-group"><span>Every week</span><div><select data-change="libEvery">${[0, 1, 2, 3, 4, 5].map(d => `<option value="${d}" ${dr.every === d ? 'selected' : ''}>${d ? 'Yes, on Day ' + d : 'No'}</option>`).join('')}</select>
      <span class="muted small">its own station every cohort, so every plan includes it</span></div></div>
    <label class="field">Note <input id="libNoteIn" data-draft="libNote" value="${esc(S.drafts.libNote ?? dr.note ?? '')}" placeholder="Optional: Note"></label>
    <div class="le-btns">
      <button class="btn primary small" data-act="libSave" data-id="${s.id}">Save</button>
      ${S.scenDocs[s.id] && SCEN.SEED.some(x => x.id === s.id) ? `<button class="link" data-act="libReset" data-id="${s.id}">Go back to the suggested tags</button>` : ''}
      ${s.gone ? `<button class="link" data-act="libRemove" data-id="${s.id}">Remove from the library</button>` : ''}
    </div>
  </div>`;
}
function skillPicker(skills, act, extra = '') {
  return TAG_GROUPS().map(g => `<div class="skill-group"><span>${esc(g.group)}</span><div>${g.items.map(k => {
    const n = (skills || {})[k] || 0;
    return `<button class="chip small ${n ? 'on' : ''}" data-act="${act}" data-k="${esc(k)}" ${extra}>${esc(k)}${n > 1 ? ' ×' + n : ''}</button>`;
  }).join('')}</div></div>`).join('');
}

function libAddons() {
  const list = S.addonDraft || (S.addonDraft = JSON.parse(JSON.stringify(scenAddons())).map(a => ({ needs: [], ...a })));
  const allSkills = TAG_GROUPS().flatMap(g => g.items);
  const label = n => n.startsWith('trait:') ? TRAIT_NAME[n.slice(6)] || n : n;
  return `<ul class="addon-list">${list.map((a, i) => `<li>
      <div class="ad-top"><input data-addon="${i}" value="${esc(a.text)}" placeholder="e.g. Add an extremity GSW that needs a tourniquet">
        <div class="seg">${[['any', 'Any'], ['medical', 'Medical'], ['trauma', 'Trauma']].map(([c, l]) => `<button class="${(a.cat || 'any') === c ? 'on' : ''}" data-act="addonCat" data-i="${i}" data-c="${c}">${l}</button>`).join('')}</div>
        <button class="x" data-act="addonDel" data-i="${i}" aria-label="Delete">×</button></div>
      <div class="ad-rule"><span class="lbl">Only on scenarios with</span>
        ${(a.needs || []).map((n, j) => `<span class="scen-chip">${esc(label(n))}<button class="x" data-act="addonNeedDel" data-i="${i}" data-j="${j}" aria-label="Remove">×</button></span>`).join('<span class="muted small">or</span>')}
        <select data-change="addonNeed" data-i="${i}"><option value="">${(a.needs || []).length ? '+ or…' : 'any scenario (pick to limit it)'}</option>
          <optgroup label="Patient">${SCEN.TRAITS.map(([t, l]) => `<option value="trait:${t}">${l}</option>`).join('')}</optgroup>
          <optgroup label="Skill">${allSkills.map(k => `<option>${esc(k)}</option>`).join('')}</optgroup></select></div>
      <div class="ad-rule"><span class="lbl">Swap: takes away</span>
        <select data-change="addonMinus" data-i="${i}"><option value="">nothing (adds only)</option>${allSkills.map(k => `<option ${(a.minus || {})[k] ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      ${skillPicker(a.skills, 'addonSkill', `data-i="${i}"`)}
    </li>`).join('')}</ul>
    <button class="btn small" data-act="addonAdd">+ Add an add-on</button>`;
}

function libReq() {
  const t = S.reqDraft || (S.reqDraft = { ...scenTargets(), _size: planSize() });
  return `<label class="req-size"><b>Scenarios per week:</b> about <input type="number" min="5" max="25" data-req="_size" value="${t._size}"></label>
    <p class="muted small">MINIMUM - SUMMATIVE skills. The week builder plans for these.</p>
    ${DEFAULTS.skills.filter(g => g.group !== 'OB').map(g => `<p class="cov-group">${esc(g.group)}</p><div class="req-grid">${g.items.map(k =>
      `<label>${esc(k)}<input type="number" min="0" max="20" data-req="${esc(k)}" value="${t[k] ?? 0}"></label>`).join('')}</div>`).join('')}`;
}

/* ---------- Clicks for all of the above (app.js's act() hands them over) ---------- */
const cycle = n => (n >= 2 ? 0 : n + 1);
const libDraftOf = s => ({ skills: { ...(s.skills || {}) }, extras: { ...(s.extras || {}) }, cat: s.cat, note: s.note || '', traits: { ...(s.traits || {}) }, every: s.every || 0 });
async function scenAct(a, el, e) {
  const d = el.dataset || {};
  switch (a) {
    case 'libAddOpen': S.libAdd = true; S.libSel = null; S.libFilter = 'all'; // then the same as libOpen
    // falls through
    case 'libOpen': S.libOpen = true; S.libTab = 'scen'; S.menuOpen = false; S.schMenu = false; if (!S.scenLive) loadScenarios(); render(); return true;
    case 'libClose':
      if (libUnsaved() && !confirm('Close without saving your changes?')) return true;
      S.libOpen = false; S.libAdd = false; S.libSel = null; S.addonDraft = null; S.reqDraft = null; render(); return true;
    case 'libTab': S.libTab = d.t; render(); return true;
    case 'libFilter': S.libFilter = d.f; render(); return true;
    case 'libSel': {
      if (S.libSel === d.id) { S.libSel = null; render(); return true; }
      const s = libById()[d.id];
      S.libSel = d.id; S.libDraft = libDraftOf(s); S.libExtrasOpen = false; delete S.drafts.libNote;
      render(); return true;
    }
    case 'libCat': S.libDraft.cat = d.c; render(); return true;
    case 'libExtrasToggle': S.libExtrasOpen = !S.libExtrasOpen; render(); return true;
    case 'libExtra': { const sk = S.libDraft.extras; const n = cycle(sk[d.k] || 0); if (n) sk[d.k] = n; else delete sk[d.k]; render(); return true; }
    case 'libTrait': { const t = S.libDraft.traits; if (t[d.t]) delete t[d.t]; else t[d.t] = true; render(); return true; }
    case 'addonNeedDel': S.addonDraft[Number(d.i)].needs.splice(Number(d.j), 1); render(); return true;
    case 'libSkill': { const sk = S.libDraft.skills; const n = cycle(sk[d.k] || 0); if (n) sk[d.k] = n; else delete sk[d.k]; render(); return true; }
    case 'libSave': {
      const s = libById()[d.id];
      const dr = S.libDraft;
      await Store.set('scenarios/' + d.id, { title: s.title, cat: dr.cat, skills: dr.skills, extras: dr.extras, traits: dr.traits, every: dr.every || 0,
        note: (S.drafts.libNote ?? dr.note ?? '').trim(), checked: true, saved: Date.now() }, false);
      delete S.drafts.libNote;
      // On to the next one that hasn't been checked, so you can go down the list.
      const list = scenLib(), i = list.findIndex(x => x.id === d.id);
      const next = list.slice(i + 1).find(x => x.status !== 'checked' && x.id !== d.id);
      S.libSel = null;
      if (next && S.libFilter === 'check') { S.libSel = next.id; S.libDraft = libDraftOf(next); S.libExtrasOpen = false; }
      toast('Saved.'); render(); return true;
    }
    case 'libReset':
      if (!confirm('Go back to the suggested tags for this scenario?')) return true;
      await Store.del('scenarios/' + d.id); S.libSel = null; render(); return true;
    case 'libRemove': await Store.set('scenarios/' + d.id, { removed: true }); S.libSel = null; render(); return true;

    case 'addonCat': S.addonDraft[Number(d.i)].cat = d.c; render(); return true;
    case 'addonSkill': { const sk = S.addonDraft[Number(d.i)].skills; const n = cycle(sk[d.k] || 0); if (n) sk[d.k] = n; else delete sk[d.k]; render(); return true; }
    case 'addonDel': S.addonDraft.splice(Number(d.i), 1); render(); return true;
    case 'addonAdd': S.addonDraft.push({ text: '', cat: 'any', skills: {}, needs: [] }); render(); return true;
    case 'addonSave': {
      const list = (S.addonDraft || scenAddons()).map(x => ({ text: x.text.trim(), cat: x.cat || 'any', skills: x.skills, needs: x.needs || [], ...(x.minus ? { minus: x.minus } : {}) })).filter(x => x.text);
      await Store.set('meta/settings', { scenAddons: list }); S.addonDraft = null; toast('Add-ons saved.'); render(); return true;
    }
    case 'reqSave': {
      const { _size, ...targets } = S.reqDraft || { ...scenTargets(), _size: planSize() };
      await Store.set('meta/settings', { scenTargets: targets, planSize: Math.max(5, Math.min(25, Number(_size) || 12)) });
      S.reqDraft = null; toast('Saved.'); render(); return true;
    }

    case 'planBuild':
      if (planItems().length && !confirm('Replace this plan with a new mix?')) return true;
      { // The old plan's scenarios that are on the schedule: offer to take them off too.
        const placed = planItems().filter(x => stationsWith(x.id).length);
        if (placed.length && confirm(`${placed.length} scenario${placed.length === 1 ? ' from this plan is' : 's from this plan are'} on the schedule. Take ${placed.length === 1 ? 'it' : 'them'} off the schedule too?`)) {
          const byDay = {};
          placed.forEach(x => stationsWith(x.id).forEach(a => { (byDay[a.day] = byDay[a.day] || new Set()).add(x.id); }));
          for (const [n, ids] of Object.entries(byDay)) await removeManyFromStations(Number(n), [...ids]);
        }
      }
      await buildPlan('mix'); return true;
    case 'libStar': { const s = libById()[d.id]; await Store.set('scenarios/' + d.id, { star: !s.star }); return true; }
    case 'planOpen': S.planOpen = true; render(); return true;
    case 'planPlace':
      if (!confirm('Put each scenario on its day’s Medical / Trauma Scenarios station (up to 3 each)? Ones already on the schedule are left where they are.')) return true;
      await placePlan(); return true;
    case 'planClose': S.planOpen = false; render(); return true;
    case 'planAddId': {
      const sc = libById()[d.id];
      if (!sc || planItems().some(x => x.id === d.id)) return true;
      await savePlan([...planItems(), { id: d.id, addons: [], day: sc.every || (sc.cat === 'trauma' ? 3 : 2), ...(sc.every ? { fixed: true } : {}) }]);
      toast('Added ' + sc.name + ' to the plan.'); return true;
    }
    case 'planClearAsk': S.planClearAsk = true; render(); return true;
    case 'planClearClose': S.planClearAsk = false; render(); return true;
    case 'planClear': {
      S.planClearAsk = false;
      if (d.sched) {
        const byDay = {};
        planItems().forEach(x => stationsWith(x.id).forEach(a => { (byDay[a.day] = byDay[a.day] || new Set()).add(x.id); }));
        for (const [n, ids] of Object.entries(byDay)) await removeManyFromStations(Number(n), [...ids]);
      }
      await savePlan([]);
      toast(d.sched ? 'Plan cleared, and taken off the schedule.' : 'Plan cleared.');
      render(); return true;
    }
    case 'planDelAsk': S.planDelAsk = Number(d.i); render(); return true;
    case 'planDelClose': S.planDelAsk = null; render(); return true;
    case 'planDel': { // from the confirm pop-up; data-sched = also take it off the schedule
      const idx = S.planDelAsk; S.planDelAsk = null;
      const x = planItems()[idx];
      if (!x) { render(); return true; }
      const at = stationsWith(x.id);
      await savePlan(planItems().filter((_, i) => i !== idx));
      if (d.sched) for (const n of new Set(at.map(a => a.day))) await removeFromStation(n, null, x.id);
      toast('Removed ' + ((libById()[x.id] || {}).name || 'it') + (d.sched ? ' from the plan and schedule.' : ' from the plan.'));
      render(); return true;
    }
    case 'planAddonDel': {
      const items = planItems().map(x => ({ ...x, addons: [...(x.addons || [])] }));
      const it = items[Number(d.i)];
      it.addons.splice(Number(d.j), 1); await savePlan(items); await refreshScenLines(it.id, it.addons); return true;
    }
    case 'placeOpen': { const x = planItems()[Number(d.i)]; S.place = { ids: [x.id], addons: x.addons || [], day: x.day || 1, planId: x.id }; render(); return true; }
    case 'placeClose': S.place = null; render(); return true;
    case 'placeDay': S.place.day = Number(d.n); render(); return true;
    case 'placeTo': {
      const p = S.place; S.place = null;
      let i = Number(d.i);
      for (const [j, id] of p.ids.entries()) {
        const before = schedFor(p.day).stations.length;
        await addToStation(p.day, i, id, j === 0 ? p.addons : []);
        if (i < 0) i = before; // the second scenario of a pair goes on the station just made
      }
      if (S.match) S.match = null;
      // Placed from the plan: it now belongs under that day in the plan too.
      if (p.planId) {
        const items = planItems().map(x => ({ ...x }));
        const it = items.find(x => x.id === p.planId);
        if (it && (it.day || 1) !== p.day && !it.fixed) { it.day = p.day; await savePlan(items); }
      }
      render(); return true;
    }

    case 'matchOpen': {
      const today = currentWeekDay();
      const n = d.i != null ? schedDay() : Math.min(5, today ? today + 1 : schedDay());
      S.match = { n, i: d.i != null ? Number(d.i) : null, picked: null, cat: 'both', squad: 0 };
      render(); return true;
    }
    case 'matchClose': S.match = null; render(); return true;
    case 'matchSquad': S.match.squad = Number(d.s); S.match.picked = null; render(); return true;
    case 'matchCat': S.match.cat = d.c; render(); return true;
    case 'matchSkill': {
      const cur = matchWant(S.match);
      const picked = Object.fromEntries(Object.keys(cur).map(k => [k, true]));
      if (picked[d.k]) delete picked[d.k]; else picked[d.k] = true;
      S.match.picked = picked; render(); return true;
    }
    case 'matchReset': S.match.picked = null; render(); return true;
    case 'matchAdd': {
      const ids = d.ids.split(','), addons = JSON.parse(d.addons || '[]'), m = S.match;
      if (m.i == null) { S.place = { ids, addons, day: m.n }; render(); return true; }
      for (const [j, id] of ids.entries()) await addToStation(m.n, m.i, id, j === 0 ? addons : []);
      S.match = null; render(); return true;
    }
    case 'stScenDel': await removeFromStation(d.n ? Number(d.n) : schedDay(), Number(d.i), d.id); return true;
  }
  return false;
}

// Dropdowns and number boxes (app.js's change listener hands these over).
async function scenChange(t) {
  const c = t.dataset.change;
  if (c === 'libEvery') { S.libDraft.every = Number(t.value); render(); return true; }
  if (c === 'addonNeed') { const a = S.addonDraft[Number(t.dataset.i)]; if (t.value && !(a.needs || []).includes(t.value)) a.needs = [...(a.needs || []), t.value]; render(); return true; }
  if (c === 'addonMinus') { const a = S.addonDraft[Number(t.dataset.i)]; if (t.value) a.minus = { [t.value]: 1 }; else delete a.minus; render(); return true; }
  if (c === 'planAddon') {
    const items = planItems().map(x => ({ ...x, addons: [...(x.addons || [])] }));
    const it = items[Number(t.dataset.i)];
    if (!t.value) return true;
    it.addons.push(t.value);
    await savePlan(items); await refreshScenLines(it.id, it.addons); return true;
  }
  return false;
}

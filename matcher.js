/* Scenario math for Phase 3 (no screen code here, so it can be tested on its own).

   A scenario is { id, cat: 'medical'|'trauma', skills: { 'NRB': 1, 'Direct Pressure': 2 },
                   traits: { chest, breathing, alert }, every: day it's in every week (or 0) }.
   An add-on is   { text, cat: 'any'|'medical'|'trauma', skills: {...},
                   needs: ['Tourniquet', 'trait:chest', ...] (only on a scenario with ANY of these),
                   minus: {...} (a swap: the scenario loses these),
                   only: [scenario ids] + pref: true (a scenario's own optional extras, used before general add-ons) }.
   A week plan is a list of items { id, addons: [addon text], day, fixed (an every-week one) }.

   Vital signs and patient transport happen in every scenario, so each scenario in a plan
   counts once for each of them. Skills with a target of 0 (OB) are rote only. */
const Match = (() => {
  const EVERY = ['Pulse Oximetry', 'Manual RR', 'Manual HR', 'Manual BP', 'Lung Sounds', 'Patient Transport'];
  const isEvery = k => EVERY.includes(k);

  const addSkills = (have, skills, times = 1) => {
    for (const [k, n] of Object.entries(skills || {})) have[k] = (have[k] || 0) + n * times;
  };

  // What a plan delivers: { skill: count }.
  function coverage(items, byId, addonsByText) {
    const have = {};
    items.forEach(it => {
      const sc = byId[it.id];
      if (sc) addSkills(have, sc.skills);
      (it.addons || []).forEach(t => { const a = addonsByText[t]; if (a) { addSkills(have, a.skills); addSkills(have, a.minus, -1); } });
      EVERY.forEach(k => { have[k] = (have[k] || 0) + 1; });
    });
    return have;
  }

  // [{ skill, short }] in the order of `order` (the Skills Tracking sheet order).
  function missing(have, targets, order) {
    return order.filter(k => (targets[k] || 0) > (have[k] || 0)).map(k => ({ skill: k, short: targets[k] - (have[k] || 0) }));
  }

  // A seeded random number generator, so a build can be repeated in tests.
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // Can this add-on go on this scenario? Right kind, and it has one of the things the add-on needs.
  function fits(addon, sc) {
    if (!sc) return false;
    if (addon.only && !addon.only.includes(sc.id)) return false;
    if (addon.cat && addon.cat !== 'any' && addon.cat !== sc.cat) return false;
    const needs = addon.needs || [];
    return !needs.length || needs.some(n => n.startsWith('trait:') ? !!(sc.traits || {})[n.slice(6)] : !!(sc.skills || {})[n]);
  }

  /* Build a week: about `size` scenarios that together meet every target.
     Tries many shuffled builds and keeps the best one:
       1. Pick scenarios for the skills still needed (rare skills count most).
       2. Anything no scenario covers gets an add-on on a scenario of the right kind.
       3. Drop scenarios that turned out not to be needed.
       4. Fill up to `size` with other scenarios (about 2 medical for each trauma).
     `avoid` = ids used last time, so the mix changes from cohort to cohort.
     `pinned` = [{ id, day }] scenarios that are in every week (always in, on that day). */
  function build({ lib, addons, targets, size = 12, avoid = [], pinned = [], seed = Date.now(), tries = 250 }) {
    const rand = rng(seed);
    const pool = lib.filter(s => s.skills);
    const byId = Object.fromEntries(pool.map(s => [s.id, s]));
    const addonsByText = Object.fromEntries(addons.map(a => [a.text, a]));
    const avoidSet = new Set(avoid);
    const need0 = Object.fromEntries(Object.entries(targets).filter(([k, n]) => n > 0 && !isEvery(k)));
    const floor = Math.max(0, ...EVERY.map(k => targets[k] || 0)); // every scenario gives one of each vital sign
    // A skill few scenarios have is worth more when picking.
    const haveCount = {};
    pool.forEach(s => Object.keys(s.skills).forEach(k => { haveCount[k] = (haveCount[k] || 0) + 1; }));
    const weight = k => 1 + 4 / Math.max(1, haveCount[k] || 0);

    let best = null;
    for (let t = 0; t < tries; t++) {
      const need = { ...need0 };
      const items = [];
      const used = new Set();
      const gainOf = skills => Object.entries(skills).reduce((g, [k, n]) => g + Math.min(n, Math.max(0, need[k] || 0)) * weight(k), 0);
      const take = (skills, times = 1) => Object.entries(skills || {}).forEach(([k, n]) => { if (k in need) need[k] -= n * times; });
      // A swap that would take away something still needed isn't worth anything.
      const addonGain = a => Object.keys(a.minus || {}).some(k => need[k] > 0) ? 0 : gainOf(a.skills) * (a.pref ? 1.4 : 1);
      const useAddon = (host, a) => { host.addons.push(a.text); take(a.skills); take(a.minus, -1); };
      pinned.forEach(p => { if (byId[p.id] && !used.has(p.id)) { items.push({ id: p.id, addons: [], day: p.day, fixed: true }); used.add(p.id); take(byId[p.id].skills); } });

      // 1. Scenarios for what's still needed. Once the week is getting full, an add-on on a
      //    scenario that's already in it often beats adding another whole scenario.
      const addonLean = 0.3 + rand() * 0.9; // some tries lean on add-ons more than others
      const hostFor = a => items.filter(it => fits(a, byId[it.id]) && !it.addons.includes(a.text) && it.addons.length < 2)
        .sort((x, y) => x.addons.length - y.addons.length || rand() - 0.5)[0];
      for (;;) {
        let pick = null, pickScore = 0;
        for (const s of pool) {
          if (used.has(s.id)) continue;
          const g = gainOf(s.skills);
          if (g <= 0) continue;
          const score = g * (0.55 + rand()) * (avoidSet.has(s.id) ? 0.6 : 1);
          if (score > pickScore) { pick = s; pickScore = score; }
        }
        let addPick = null, addScore = 0;
        const full = items.length >= size - 2 ? 2.5 : 1;
        if (items.length && items.reduce((n, x) => n + x.addons.length, 0) < 6) {
          for (const a of addons) {
            const g = addonGain(a);
            if (g <= 0 || !hostFor(a)) continue;
            const score = g * addonLean * full * (0.55 + rand());
            if (score > addScore) { addPick = a; addScore = score; }
          }
        }
        if (addPick && addScore > pickScore) { useAddon(hostFor(addPick), addPick); continue; }
        if (!pick) break;
        items.push({ id: pick.id, addons: [] }); used.add(pick.id); take(pick.skills);
      }

      // 2. Add-ons for anything left.
      for (;;) {
        const left = Object.keys(need).filter(k => need[k] > 0);
        if (!left.length) break;
        // Only add-ons that have somewhere to go: a scenario in the week, or one that could be added.
        const hostIn = a => items.filter(it => fits(a, byId[it.id]) && !it.addons.includes(a.text))
          .sort((x, y) => x.addons.length - y.addons.length || rand() - 0.5)[0];
        const hostOut = a => pool.filter(s => !used.has(s.id) && fits(a, s)).sort(() => rand() - 0.5)[0];
        let pick = null, pickG = 0;
        for (const a of addons) {
          const g = addonGain(a) * (0.8 + rand() * 0.4);
          if (g > pickG && (hostIn(a) || hostOut(a))) { pick = a; pickG = g; }
        }
        if (!pick) break;
        // Put it on the scenario with the fewest add-ons (adding a scenario if none fits).
        let host = hostIn(pick);
        if (!host) {
          const extra = hostOut(pick);
          host = { id: extra.id, addons: [] }; items.push(host); used.add(extra.id); take(extra.skills);
        }
        useAddon(host, pick);
      }

      // 3. Drop scenarios nothing depends on (never one carrying an add-on).
      const order = items.map((_, i) => i).sort(() => rand() - 0.5);
      let kept = items;
      for (const i of order) {
        const it = items[i];
        if (it.addons.length || it.fixed || !kept.includes(it)) continue;
        const without = kept.filter(x => x !== it);
        const have = coverage(without, byId, addonsByText);
        if (Object.keys(need0).every(k => (have[k] || 0) >= need0[k])) kept = without;
      }

      // 4. Fill up to the size (and to the vital-sign floor) with other scenarios.
      const goal = Math.max(size, floor);
      const keptIds = new Set(kept.map(x => x.id));
      while (kept.length < goal) {
        const med = kept.filter(x => byId[x.id].cat === 'medical').length;
        const wantCat = med < Math.round(kept.length * 2 / 3 + 0.5) ? 'medical' : 'trauma';
        const left = pool.filter(s => !keptIds.has(s.id));
        if (!left.length) break;
        const ranked = left.map(s => ({ s, score: (s.cat === wantCat ? 2 : 0) + Object.keys(s.skills).length * 0.25 + rand() * 1.5 - (avoidSet.has(s.id) ? 1 : 0) }))
          .sort((x, y) => y.score - x.score);
        kept.push({ id: ranked[0].s.id, addons: [] }); keptIds.add(ranked[0].s.id);
      }

      const have = coverage(kept, byId, addonsByText);
      const short = Object.keys(targets).reduce((n, k) => n + Math.max(0, (targets[k] || 0) - (have[k] || 0)), 0);
      const addonCount = kept.reduce((n, x) => n + x.addons.length, 0);
      const repeats = kept.filter(x => avoidSet.has(x.id)).length;
      const score = short * 20 + Math.abs(kept.length - size) * 3 + addonCount * 1.2 + repeats * 0.6 + rand();
      if (!best || score < best.score) best = { score, items: kept.map(x => ({ id: x.id, addons: [...x.addons], ...(x.fixed ? { day: x.day, fixed: true } : {}) })) };
    }
    return suggestDays(best ? best.items : [], byId);
  }

  /* Days for a plan: medical first (Day 1), trauma starting Day 2 with the simplest
     splinting scenario as each squad's first trauma one, the rest spread over Days 3-4.
     Every-week scenarios (fixed) keep their own day and don't take a spot. */
  function suggestDays(items, byId) {
    const free = items.filter(x => !x.fixed);
    const n = free.length, cap = Math.max(1, Math.ceil(n / 4));
    const med = free.filter(x => (byId[x.id] || {}).cat !== 'trauma');
    const tra = free.filter(x => (byId[x.id] || {}).cat === 'trauma');
    const size = x => Object.values((byId[x.id] || {}).skills || {}).reduce((a, b) => a + b, 0);
    const opener = tra.filter(x => ((byId[x.id] || {}).skills || {})['Extremity Splinting']).sort((a, b) => size(a) - size(b))[0] || tra.slice().sort((a, b) => size(a) - size(b))[0];
    const days = { 1: [], 2: [], 3: [], 4: [] };
    const put = (x, d) => { x.day = d; days[d].push(x); };
    const medQ = med.slice(), traQ = tra.filter(x => x !== opener);
    while (days[1].length < cap && medQ.length) put(medQ.shift(), 1);
    if (opener) put(opener, 2);
    while (days[2].length < cap && medQ.length) put(medQ.shift(), 2);
    let flip = true;
    for (const d of [3, 4]) {
      while (days[d].length < cap && (medQ.length || traQ.length)) {
        const q = (flip && traQ.length) || !medQ.length ? traQ : medQ;
        put(q.shift(), d); flip = !flip;
      }
    }
    [...medQ, ...traQ].forEach(x => put(x, 4));
    const fixed = items.filter(x => x.fixed);
    return [1, 2, 3, 4, 5].flatMap(d => [...fixed.filter(x => x.day === d), ...(days[d] || [])]);
  }

  /* Scenarios for a list of wanted skills ({ skill: weight }, weight = how many students need it).
     Returns { singles, pairs, addon } — each a list of { ids, addons, covers, misses, extra }:
       singles: one scenario with every wanted skill
       pairs:   two scenarios that together have them all (only when no single does)
       addon:   the closest scenarios, with add-ons for what they're missing */
  function find({ lib, addons, want, cat = 'both', limit = 4 }) {
    const keys = Object.keys(want);
    const pool = lib.filter(s => s.skills && (cat === 'both' || s.cat === cat));
    const total = keys.reduce((a, k) => a + want[k], 0);
    const result = (ids, extraSkills = {}, addonList = []) => {
      const skills = {};
      ids.forEach(id => addSkills(skills, (pool.find(s => s.id === id) || {}).skills));
      addSkills(skills, extraSkills);
      const covers = keys.filter(k => skills[k] > 0), misses = keys.filter(k => !(skills[k] > 0));
      const got = covers.reduce((a, k) => a + want[k], 0);
      return { ids, addons: addonList, covers, misses, got, total, extra: Object.keys(skills).filter(k => !want[k] && skills[k] > 0).length };
    };
    const rank = (a, b) => b.got - a.got || a.ids.length - b.ids.length || a.addons.length - b.addons.length || a.extra - b.extra;

    const singles = pool.map(s => result([s.id])).filter(r => !r.misses.length).sort(rank).slice(0, limit);
    let pairs = [];
    if (!singles.length && keys.length > 1) {
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const r = result([pool[i].id, pool[j].id]);
          if (!r.misses.length) pairs.push(r);
        }
      }
      pairs = pairs.sort(rank).slice(0, limit);
    }
    // Every scenario that's missing something, with add-ons that fit it for what's missing
    // (a scenario with none of the skills can still be the best host: chest pain + nitro).
    const closest = pool.map(s => result([s.id])).filter(r => r.misses.length && r.got > 0).sort(rank).slice(0, limit * 2);
    const withAddons = [];
    for (const r of pool.map(s => result([s.id])).filter(r => r.misses.length)) {
      const sc = pool.find(s => s.id === r.ids[0]);
      let left = r.misses.slice(); const picked = [], extra = {};
      while (left.length && picked.length < 2) {
        const a = addons.filter(x => fits(x, sc) && !picked.includes(x.text) && !Object.keys(x.minus || {}).some(k => want[k]))
          .map(x => ({ x, g: left.filter(k => x.skills[k]).reduce((s, k) => s + want[k], 0) }))
          .filter(o => o.g > 0).sort((p, q) => q.g - p.g || !!q.x.pref - !!p.x.pref)[0];
        if (!a) break;
        picked.push(a.x.text); addSkills(extra, a.x.skills); addSkills(extra, a.x.minus, -1);
        left = left.filter(k => !a.x.skills[k]);
      }
      if (picked.length) withAddons.push(result(r.ids, extra, picked));
    }
    const addon = withAddons.sort((a, b) => a.misses.length - b.misses.length || a.addons.length - b.addons.length || rank(a, b)).slice(0, limit);
    // Nothing matches fully: still show the closest (no add-on helps).
    const close = !singles.length && !pairs.length && !addon.length ? closest.slice(0, limit) : [];
    return { singles, pairs, addon, close };
  }

  return { EVERY, isEvery, coverage, missing, build, suggestDays, find, fits };
})();

if (typeof module !== 'undefined') module.exports = Match;

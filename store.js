/* All Firebase saving lives here, so app.js only deals in plain objects.

   Firestore layout (shared by Bella and Nick):
     meta/settings                     checklist, bag contents, which bags carry *** items, skipped staff
     shopping/{id}                     { text, bought, auto, created }  (one list, not per cohort)
     cohorts/{key}                     { bagsInUse: [1,2,3] }
     cohorts/{key}/students/{sid}      { skill: on|behind|done, behind: [skills], note }
     cohorts/{key}/contacts/{id}       { sid, num, fix, fixed, date, created }
     cohorts/{key}/warnings/{id}       { sid, date, type, note, created }
     cohorts/{key}/days/{1-5}          { checks: {item: true}, bags: {bagNo: {itemId: ok|low|missing}} }
     cohorts/{key}/staff/{nameKey}     { name, days: {1: {roster, timesheet}}, paid }
     cohorts/{key}/todos/{id}          { text, done, created }

   Paths are written like 'cohorts/Fall 2026/students/frazier-jason'.
   In sample mode everything is kept in this browser (localStorage) instead. */
const Store = (() => {
  const configured = !/PASTE/.test(firebaseConfig.apiKey) && !/PASTE/.test(APPS_SCRIPT_URL);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isDocPath = p => p.split('/').length % 2 === 0;

  if (!configured) {
    // ---- Sample mode ----
    const KEY = 'academy-week-sample';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const save = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
    const listeners = new Set();
    const snapshot = (path, all) => {
      if (isDocPath(path)) return all[path] || null;
      const depth = path.split('/').length + 1;
      return Object.keys(all)
        .filter(k => k.startsWith(path + '/') && k.split('/').length === depth)
        .map(k => ({ id: k.split('/').pop(), ...all[k] }));
    };
    const emit = () => { const all = read(); listeners.forEach(l => l.cb(snapshot(l.path, all))); };
    return {
      configured: false,
      onUser(cb) { setTimeout(() => cb({ email: 'sample mode', sample: true }), 0); },
      async signIn() {}, async signOut() {},
      watch(path, cb) {
        const l = { path, cb }; listeners.add(l); cb(snapshot(path, read()));
        return () => listeners.delete(l);
      },
      async set(path, data, merge = true) {
        const all = read();
        all[path] = merge ? deepMerge(all[path] || {}, data) : data;
        save(all); emit();
      },
      async add(colPath, data) { const id = newId(); await this.set(colPath + '/' + id, data, false); return id; },
      async del(path) { const all = read(); delete all[path]; save(all); emit(); },
      newId,
    };
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('No offline cache:', err.code));

  // Offline, a save lands on this device at once and syncs later. Don't wait for it.
  const write = p => {
    if (navigator.onLine) return p;
    p.catch(e => console.error('Offline save failed to sync', e));
    return Promise.resolve();
  };

  return {
    configured: true,
    onUser: cb => auth.onAuthStateChanged(cb),
    async signIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
    },
    signOut: () => auth.signOut(),
    idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(''),
    watch(path, cb) {
      const onErr = err => console.error(path, err);
      if (isDocPath(path)) return db.doc(path).onSnapshot(s => cb(s.exists ? s.data() : null), onErr);
      return db.collection(path).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    set: (path, data, merge = true) => write(db.doc(path).set(data, { merge })),
    async add(colPath, data) { const ref = db.collection(colPath).doc(); await write(ref.set(data)); return ref.id; },
    del: path => write(db.doc(path).delete()),
    newId,
  };
})();

// Merge like Firestore's { merge: true } does: nested objects merge, everything else replaces.
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? deepMerge(a[k], v) : v;
  }
  return out;
}

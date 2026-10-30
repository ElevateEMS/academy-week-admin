/* Settings for this site.

   firebaseConfig: Firebase Console -> Project settings -> General -> "Your apps" -> Web app.
   It's meant to be public; firestore.rules is what keeps the data to Bella and Nick.

   APPS_SCRIPT_URL: the web app URL from the "Elevate EMS Admin" Apps Script (was "Academy Week Admin Backend")
   (Deploy -> Manage deployments -> Web app URL). That's what reads the cohort
   sheets and writes the patient contact counts back.

   While either one still says PASTE, the app runs in "sample mode": pretend
   students and staff, saved in this browser only. */
const firebaseConfig = {
  apiKey: 'AIzaSyC9c_eEtHzCsu0g591dV7nhzkLfGPL56aw',
  authDomain: 'academy-week-5k7tx.firebaseapp.com',
  projectId: 'academy-week-5k7tx',
  storageBucket: 'academy-week-5k7tx.firebasestorage.app',
  messagingSenderId: '21178344440',
  appId: '1:21178344440:web:25c6b8d42e80386b532c0d',
};

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwnyk9LG7P7xlzPYx53JKO0rICc5SHqFaR7oWVUFOeDnrQHxm5fGcl6B-Hz62VtLDaz/exec';

// Who can sign in. Keep this list the same as the one in firestore.rules and Code.gs.
const STAFF_EMAILS = ['gbrown@elevateemsacademy.com', 'nbrown@elevateemsacademy.com'];

// The web app URL from the separate "Elevate EMS Staff" Apps Script (the Staff page, the Pay window, and
// staff.elevateemsacademy.com all use it). While it says PASTE, the Staff page says it isn't connected.
const STAFF_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiwYoNdMrb-JNEJ4ZiYq3jKndti1XsdNqrnBitwK0mjlSsusfhCTXOTrCLIQKsFNhfhw/exec';

# Academy Week Admin

Bella's admin organizer for academy week: daily checklist + bag check, to-dos,
staff paperwork and pay days, shopping list, and per-student skills status,
patient contact notes and attendance/warnings.

- **Site:** GitHub Pages (plain HTML/CSS/JS), https://elevateems.github.io/academy-week-admin/ (the elevateems GitHub, same as the Student Hub)
- **Data:** Firebase project `academy-week-5k7tx` (Firestore + Google sign-in, free Spark plan).
  Only gbrown@ and nbrown@elevateemsacademy.com can sign in (firestore.rules).
- **Google Sheets:** the "Academy Week Admin Backend" Apps Script (`../Code.gs`, NOT uploaded to GitHub)
  reads the Student Cohort Config sheet, each cohort's Student Roster tab and Staffing tab,
  and writes patient contact counts to Roster column P.

If `config.js` still has `APPS_SCRIPT_URL = 'PASTE'`, the app runs in **sample mode**
(pretend students and staff, saved in this browser only).

## Files to upload to GitHub
index.html, styles.css, app.js, config.js, defaults.js, store.js, sheets.js, manifest.json,
logo.png, favicon-32.png, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png

Keep the CNAME file GitHub made (it's what makes admin.elevateemsacademy.com work).
After changing a .js or .css file, bump the ?v= number on it in index.html so browsers load the new one.
To swap the logo: replace logo.png and the icon PNGs (same names).

(firestore.rules, firebase.json, .firebaserc and README.md stay on the computer. The rules
are deployed with the Firebase CLI.)

## What the app reads from the sheets
| Where | What |
|---|---|
| Student Cohort Config → Cohorts | Cohort Key (A), Status (F), Code / roster sheet ID (G) → the cohort dropdown |
| Cohort sheet → Student Roster | names B5:B34, Patient Contacts P, Status AB (Blocked students are hidden), Academy Week Start AG8 |
| Cohort sheet → Staffing | the Role / Slot grid: every name that isn't OPEN or — is working that day |

The app never changes anything in the sheets except column P.

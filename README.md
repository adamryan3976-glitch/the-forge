# The Forge · Math Check-In

A grade-level math check-in for K–8 students at Winchester P.S. (DDSB), built to be shared with other schools.

- **Teachers** sign in with their @ddsb.ca Google account. They create classes, add students one at a time or from a CSV, set each student's **grade**, and share a class with other teachers (*View only* or *Can edit*).
- **Students** sign in with their `S#########@ddsbstudent.ca` account. The app reads their **student number** from the account, finds their class and grade, and gives them that grade's check-in. **Every answer saves the moment they tap it.** If the Wi-Fi drops or time runs out, they pick up where they left off next time.
- **Results are stored by student number**, so they follow a student from class to class and year to year.
- **Reports** for a class, a grade, or the whole school show:
  - strand strengths and gaps
  - question analysis, colour-coded green → red by how wrong each answer was (click a question to see who chose what)
  - "close calls" vs far-off answers for each student
  - trends across check-ins and school years
  - who hasn't finished yet
  - CSV export and print/PDF
- **Preview**: any teacher can pick a grade and go through its check-in exactly as a student sees it. Nothing is saved. They can flag problems on any question and email the notes at the end.
- **Admins** (principal/VP) see every class automatically. They also manage settings and the question bank.
- **Questions are edited in the Google Sheet** (see `apps-script/`) and imported with one click. Students never receive the answer key.

Same building blocks as the FDK Letter Tracker: React + Vite on **GitHub Pages**, with **Firebase** for Google sign-in and data.

---

## How it's secured

All access rules live in [`firestore.rules`](firestore.rules). They are enforced on Google's servers, so nothing done in a browser can get around them. [`test/rules/rules.test.js`](test/rules/rules.test.js) checks each rule below, and GitHub runs those checks before every publish.

| Who | Can | Can't |
|---|---|---|
| Student | Read the questions for the check-in. Start and save **their own** attempt for **their own grade and class**. | See the answer key, other students' work, class lists, or their attempt after it's handed in (it's locked). |
| Teacher | Manage **their** classes. See results for students currently in classes they own or that are shared with them. | See other teachers' classes or students. Take a student who is in another teacher's **active** class. |
| Admin | Everything above for every class. Settings and questions. | — |
| Any other Google account | Nothing. | — |

**One active class per student.** To move a student, their current teacher removes them, or archives the class at the end of the year. An admin can also move them.

**Scoring happens in the teacher's browser.** That's what keeps the answer key away from students, and it's why students don't see a score at the end.

---

## One-time setup (about 30 minutes)

### 1. Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (e.g. "the-forge"). Analytics can stay off. The free **Spark** plan is plenty.
2. On the project overview, click the **web** icon (`</>`) to register a web app. Skip Firebase Hosting.
3. Keep the `firebaseConfig` values it shows. You need them in step 5.

### 2. Turn on Google sign-in
**Build → Authentication → Get started → Sign-in method → Google → Enable** → choose a support email → **Save**.
Then **Authentication → Settings → Authorized domains → Add domain** → `wps-forge.winchesterps.ca` (the site's address; also `adamryan3976-glitch.github.io` if you ever use the GitHub address).

### 3. Create the database and paste in the security rules
1. **Build → Firestore Database → Create database** → **production mode** → region **northamerica-northeast2 (Toronto)** or **northamerica-northeast1 (Montréal)**.
2. **Rules** tab → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish**.
3. Check the line near the top: `function ownerEmails() { return ['adamryan3976@ddsb.ca']; }`. That account is always an admin. Change it if needed, here **and** in `src/lib/identity.js`.

> Whenever `firestore.rules` changes in this repo, paste it into the console again. GitHub tests the rules but doesn't publish them.

### 4. Turn on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 5. Add your Firebase settings to GitHub
Repo **Settings → Secrets and variables → Actions → New repository secret**. Add these six, using the values from step 1:

| Secret name | Firebase value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

These aren't passwords; Firebase expects them to be public. Keeping them as secrets just keeps the repo tidy.

### 6. Publish
Push to `main`, or **Actions → Test and deploy → Run workflow**. When it goes green, the site is at
**https://wps-forge.winchesterps.ca/**

**Custom domain:** the DNS for `winchesterps.ca` needs a CNAME record `wps-forge` → `adamryan3976-glitch.github.io`, and the repo's **Settings → Pages → Custom domain** must say `wps-forge.winchesterps.ca` with **Enforce HTTPS** ticked. The workflow builds with `VITE_BASE: /` for this; without a custom domain it would be `/the-forge/`.

### 7. First sign-in (you)
Sign in with your @ddsb.ca account. The app opens **Settings**: check the school name and the current check-in (e.g. *Fall 2026*), add your principal/VP as admins, and **Save**. Leave **Open to students** off until you're ready.

### 8. Bring your questions across
In the **Google Sheet**, update the script with `apps-script/Code.gs` (paste over your Code.gs). Then run **Math Assessment → 4. Export questions for the web app** and download the file. In the web app, go to **Questions → Import from the Sheet** and choose it.

### 9. Test sign-in with a student account ⚠️
Make a test class, add a test student's number, and turn **Open to students** on. Then sign in as that student in an Incognito window.
- ✅ "Hi …! This is your Grade … math check-in" means you're ready.
- ❌ "isn't allowed to sign in to this app" / *Access blocked* means DDSB restricts Google sign-in for students under 18. Ask DDSB IT to allow this app. It only asks for basic sign-in (name and email). They'll find it under the Google Admin console's **API controls → App access control** as the Firebase project's OAuth client.

---

## Each term
- **Settings → Current check-in**: change it (e.g. *Winter 2027*). Every attempt is labelled with it; old results are kept and show under **Trends**.
- **Open to students** on, then off when the window closes.
- At the end of the year, teachers **Archive** their classes. Students then become free to be added to next year's classes, and their history comes with them.

## Adding students by CSV
Any CSV with a student-number column (9 digits, or the full S-number email), a name (one column, or First + Last), and optionally a grade. See [`sample/students_template.csv`](sample/students_template.csv). If there's no grade column, pick one grade for everyone in the import box.

## Sharing with another school
The Forge is not open source. **Another school may use it only with written permission from both authors** (see [Copyright](#copyright)). With permission, they copy this repo and create their **own** Firebase project, so their data is separate from Winchester's. Then they change the domain and owner values at the top of `firestore.rules` and in `src/constants.js` / `src/lib/identity.js`, and follow the setup above.

---

## Development
```bash
cp .env.example .env    # fill in Firebase values
npm install
npm run dev             # local site
npm test                # scoring, reports, CSV and question-import tests
npm run test:rules      # security rules against the Firestore emulator (needs Java 21)
```

```
src/
  components/student/   the student check-in (one question per screen, read-aloud, autosave)
  components/teacher/   classes, roster, CSV import, sharing, reports, student history
  components/admin/     settings, question bank import
  lib/report.js         scoring and report maths (unit-tested)
  lib/data.js           all Firestore reads and writes
firestore.rules         the security model
test/                   unit tests + security rule tests
apps-script/            the Google Sheet tools (question editing, pictures, export)
tools/                  one-off converter for the original Forge workbook
```

---

## Copyright

**The Forge © 2026 Ryan Adams and Natasha Allen. All rights reserved.**

This repository is publicly viewable so the site can be published and reviewed, but no licence is granted. It may not be copied, modified, deployed or distributed, in whole or in part, without the prior written permission of both authors. See [`LICENSE`](LICENSE) and the in-app **Copyright & Terms of Use** page. Permission requests: ryan.adams@ddsb.ca.

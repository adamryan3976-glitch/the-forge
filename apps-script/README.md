> **Note (October 2026):** the student-facing app has moved to the web app in the main folder of this repo
> (GitHub Pages + Firebase). This Apps Script is still how you **edit questions and pictures** in the
> Google Sheet: use **Math Assessment → 4. Export questions for the web app**, then import the file on the
> web app's Questions page. You no longer need to deploy this script as a web app.
>
> To update the script: paste `Code.gs` (all `.gs` files combined) and the `.html` files into the Sheet's
> Apps Script editor, as before.

# Math Check-In

A secure, Google-sign-in math assessment for K–8 students, built for Winchester P.S. (DDSB) and designed to be shared with other schools.

- Students sign in with their school Google account and answer multiple-choice questions for their grade, one per screen, with a **Read to me** button.
- Answers are scored on the server. **The answer key never reaches the student's browser.**
- Staff see live reports by **school, grade, class and student**: strand strengths and gaps, question analysis colour-coded green → red by how wrong each answer is (click a question to see which students chose each answer), "close calls" vs far-off answers per student, score spread, trends across assessment windows, and who hasn't finished yet.
- Any report can be **exported to a Google Sheet** or printed / saved as PDF.
- All student data stays in **one Google Sheet in the school's own Google Workspace**. Nothing is stored in GitHub.

---

## How it fits together

```
GitHub repo (code only, no data)
      │  clasp push
      ▼
Google Sheet  ──  Apps Script (bound to the Sheet)  ──  Web app URL
  Questions         scoring, reports, rosters            students + staff
  Roster / Staff                                         sign in with Google
  Attempts / Responses
```

| Tab | What it holds | Who edits it |
|---|---|---|
| Settings | School name, allowed domains, current window, thresholds | You |
| Questions | Question, 4 options, correct letter, grade, strand | You |
| Staff | Staff emails allowed to see reports (`teacher` or `admin`) | You |
| Roster | Student email, name, grade, class, teacher | Teachers, through the web app |
| Attempts / Responses | One row per finished check-in / per answer | The app only |
| Audit Log | Exports, roster changes, deletions | The app only |

**Share the Sheet itself with as few people as possible** (you, and maybe your principal). Staff don't need access to the Sheet; they use the web app.

---

## Setup (about 20 minutes)

### 1. Create the Sheet and script
1. Signed in with your **DDSB** account, create a new Google Sheet, e.g. *Winchester Math Check-In*.
2. **Extensions → Apps Script**. In the script editor, open **Project Settings** (gear icon):
   - tick **Show "appsscript.json" manifest file in editor**
   - copy the **Script ID**

### 2. Put the code in
**Option A: from GitHub with clasp (recommended)**
```bash
npm install -g @google/clasp
clasp login                        # sign in with your DDSB account
cp .clasp.json.example .clasp.json # then paste your Script ID into it
clasp push
```
Also turn on the Apps Script API once at <https://script.google.com/home/usersettings>.
If DDSB blocks `clasp login`, use Option B.

**Option B: copy and paste.** In the script editor, create a file for each file in `src/` with the same name (`.gs` files as Script, `.html` files as HTML) and paste the contents in. Replace the contents of `appsscript.json` too.

### 3. Build the tabs
Reload the Sheet. A **Math Assessment** menu appears. Choose **1. Set up / repair sheets** and approve the permissions. It creates every tab, adds dropdowns, and adds you as an admin.

### 4. Add questions and staff
- Click the **Questions** tab, then **File → Import → Upload** your questions CSV and choose **Replace current sheet**. (Or paste rows in; see `sample/questions_template.csv` for the format. Leave `QuestionID` blank and it will be filled in for you.)
- Run **1. Set up / repair sheets** once more so the dropdowns and checkboxes come back.
- Run **Math Assessment → 2. Check questions for problems**.
- **Pictures:** run **Math Assessment → 3. Add question pictures…**
  1. Paste a Google Form's edit link and click **Import**. Picture blocks in the Form are saved to a private *Math Check-In Pictures* folder in your Drive, linked to the right question, and switched on. It also checks the Form's answer key against the Questions tab and lists any differences.
  2. Pictures attached *inside* a question can't be read by Apps Script, so they're listed below with a paste box: in the Form, right-click the picture → **Copy image**, click the box, press **Ctrl+V**. (Dropping a file or screenshot works too.)

  You can also paste any Drive share link into `ImageURL` yourself. Either way, pictures stay private: the app reads them from your Drive and sends them inside the page, so they never need to be shared with students.
- Add every Winchester staff member who should see reports to **Staff** (all staff can see all reports; `admin` can also edit any class list).

### 5. Deploy the web app
1. In the script editor: **Deploy → New deployment → Web app**.
2. **Execute as:** Me. **Who has access:** Anyone within Durham District School Board.
3. Copy the web app URL. This is the link students and staff use (post it in Google Classroom).

### 6. Test sign-in with a student account first
Open the URL in a browser signed in as a **test student account**:
- ✅ You see *"Almost there! Your account (…@ddsbstudent.ca) is not on a class list yet"* → sign-in works. Add the account to a class list and try the check-in.
- ❌ You see *"Please sign in"*, *"You need access"*, or a Google error → student accounts can't reach staff-owned web apps. Ask DDSB IT; there is a fallback sign-in approach we can switch to.

### 7. Teachers add class lists
Staff open the same URL → **Class lists** → paste `email, name, grade` lines. Split grades are fine.

---

## Question columns

| Column | Meaning |
|---|---|
| QuestionID | e.g. `G4-012`. Keep it the same once students have answered; reports use it. |
| Grade | K or 1–8 |
| Strand | Number, Algebra, Data, Spatial Sense or Financial Literacy |
| Expectation | Optional, e.g. `B1.2` |
| Question | Text shown to students (can be blank if the picture has the question) |
| ImageURL | Drive share link or any https picture link |
| OptionA–D | Answer choices |
| Correct | Letter of the right answer |
| WrongRank | The wrong letters from closest to furthest, e.g. `C,A,D` = C "less correct" (yellow), A "pretty wrong" (orange), D "wrongest" (red). Powers the colour bars and "close calls". |
| Active | Untick to hide a question without deleting it |
| Notes | Anything for staff; never shown to students |

**Keep the questions file out of GitHub** — it contains the answer key. `.gitignore` already skips `.csv` files.

`tools/convert_forge.py` rebuilds the Questions tab from a Forge-style workbook (the G#S tabs with green/yellow/orange/red rows).

## Running an assessment window
- Set **CurrentWindow** on the Settings tab (e.g. `Fall 2026`). Every attempt is labelled with it.
- `AssessmentOpen = FALSE` pauses the check-in; `TRUE` opens it.
- Next term, change the window to `Winter 2027`. Students can take it again and **Trends over time** compares the windows.
- Students can close the tab and come back. Their answers are saved as they go (for up to 6 hours).

## Updating the app
```bash
clasp push
```
Then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

---

## Security model

| Risk | How it's handled |
|---|---|
| Students seeing answers | The key stays in the Sheet. The browser only receives question text and options. Scoring happens on the server. |
| Someone pretending to be another student | Identity comes from Google sign-in (`Session.getActiveUser()`), not from anything the browser sends. |
| Students seeing other students' results | Report functions check the Staff tab on every call. |
| Staff outside Winchester | Staff must be on the Staff tab **and** use an allowed staff domain. |
| Tampered answers | Only this student's grade questions and the letters A–D are accepted. |
| Malicious text in the Sheet | The page inserts all text with `textContent` (never as HTML). Typed text starting with `= + - @` is stored as plain text so it can't run as a formula. |
| Hidden server functions | Only functions in `Api.gs` without a trailing `_` can be called from the page; menu functions refuse to run outside the Sheet. |
| Question tools | The picture importer and paste boxes only work for admins (you, or Staff rows marked `admin`). The app asks for Drive and Forms permission so it can read your Forms and save pictures to its own folder; it only ever opens the Form you paste and the files linked on the Questions tab. |
| Pictures | Stored in the owner's Drive and sent inside the page by the server. Only files linked on the Questions tab are ever read, never a file the browser asks for. |
| Data in GitHub | None. The repo holds code and a fake sample file only. `.clasp.json` is git-ignored. |
| Keeping data forever | **Math Assessment → Delete all data for one assessment window** removes a whole window when your retention period ends. |

See [PRIVACY.md](PRIVACY.md) for what is collected and a pre-launch checklist.

---

## Sharing with another school
1. Send them this repo link (it contains no Winchester data).
2. They follow **Setup** in their own school account and change **SchoolName**, **StudentDomains** and **StaffDomains** on the Settings tab.
3. To share your questions, make a copy of your Sheet, **delete the Roster, Attempts, Responses, Staff and Audit Log rows**, and share only that copy.

Each school gets its own Sheet, own data, and own URL. No school can see another's students.

---

## Development
```bash
node test/logic.test.js   # scoring, roster parsing and report math, with fake data
```

```
src/
  Api.gs        functions the web page can call (all check who is signed in)
  Logic.gs      pure scoring + report calculations (unit-tested)
  Util.gs       sheet access, settings, identity, audit
  Setup.gs      Sheet menu: setup, question checker, data deletion
  Export.gs     report → new Google Sheet
  Config.gs     tab names, columns, defaults
  Index.html + App*.html + Styles.html   the web page
test/           unit tests
sample/         fake example questions
```

# Privacy notes

This is a plain-language summary for conversations with your principal and DDSB IT. It is not legal advice. Ontario boards follow MFIPPA and their own policies on online tools, so **get board approval before using real student data.**

## What is stored
| Data | Why |
|---|---|
| Student number, name, grade, class | To give each student the right check-in and group results |
| Each answer chosen (A–D) and start/finish times | To find strengths and gaps by strand and question |
| Teacher email and name on classes they own or share | Access control |

**Not stored:** birth dates, OENs, addresses, IEP or other special-education information, photos, device or location data. No ads or trackers. The **Read to me** button uses the browser's built-in voice.

## Where it's stored
- **Google Firebase (Cloud Firestore)**, in the project the school creates. Choose a Canadian region (Toronto or Montréal) when you create the database.
- **The GitHub repo holds code only.** Never commit class lists or the questions export (the `.gitignore` blocks `.csv` and export files).
- On shared devices, the app keeps a small copy of the student's own in-progress answers (letters only) in the browser, in case the page closes while offline. It's deleted when they hand in.

## Who can see it
- **Students:** only their own attempt, never the answer key.
- **Teachers:** only students currently in classes they own or that are shared with them.
- **Admins** (listed in Settings, plus the owner account in `firestore.rules`): every class.
- These rules run on Google's servers and are tested automatically before every publish.

## How long it's kept
Results are kept by student number so progress can be tracked across years. Agree a retention period with your board. An admin can delete old attempts in the Firebase console (`students/{number}/attempts`). If you need a "delete everything older than X" button, ask for one to be added.

## Before launch checklist
- [ ] Principal approval
- [ ] DDSB IT: OK to store this data in Firebase (they may want a privacy impact assessment), and student Google sign-in allowed for this app
- [ ] Families informed in the usual way for classroom assessments, if the board requires it
- [ ] Firestore region set to Canada
- [ ] Admin list in Settings reviewed
- [ ] Test run with a test student account

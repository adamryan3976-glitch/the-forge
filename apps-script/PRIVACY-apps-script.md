# Privacy notes

This is a plain-language summary to help you talk with your principal and DDSB IT. It is not legal advice. Ontario school boards follow MFIPPA and their own policies on online tools, so **get board approval before using real student data.**

## What is collected
| Data | Why |
|---|---|
| Student school email and name | To know who took the check-in and match them to a class |
| Grade and class | For grade/class reports |
| Each answer chosen, right or wrong | To find strengths and gaps by strand and question |
| Start and finish time | To see completion and trends |
| Staff email on exports and roster changes | Audit trail |

Not collected: birth dates, OENs, addresses, IEP or other special-education information, photos, device or location data.

## Where it lives
- In **one Google Sheet owned by the school account that set it up**, inside the board's Google Workspace.
- Exported reports are new Google Sheets in the same account, shared only with the staff member who asked for them.
- **Nothing is stored in GitHub**, and the web page uses no outside services, trackers or ads. The **Read to me** feature uses the browser's built-in voice.

## Who can see it
- **Students** see only their own questions (and their score, if `ShowScoreToStudent` is TRUE).
- **Staff on the Staff tab** see reports for all Winchester classes through the web app.
- **People the Sheet is shared with** can see everything in it, so keep that list short.

## Retention
Use **Math Assessment → Delete all data for one assessment window** at the end of the period your board requires. Deleted rows can't be recovered through the app. Remember to also delete old exported report Sheets from Drive.

## Before launch checklist
- [ ] Principal approval
- [ ] DDSB IT confirms student accounts may use a staff-owned Apps Script web app, and the tool fits board policy (they may want a privacy review)
- [ ] Families informed in the usual way for classroom assessments, if the board requires it
- [ ] Sheet shared only with the owner (and principal if needed)
- [ ] Staff tab lists only current Winchester staff
- [ ] Test run with a test student account
- [ ] Retention date decided (e.g. delete each window at the end of the school year)

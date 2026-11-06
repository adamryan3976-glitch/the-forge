# The Forge: Apps Script edition

The same app, run as a **Google Apps Script web app inside DDSB's Google Workspace** instead of on Firebase. Use it while student Google sign-in for the web version is waiting for IT approval (or instead of it).

| | Web version (Firebase) | Apps Script edition |
|---|---|---|
| Student sign-in | "Sign in with Google" (needs IT to allow the app) | None: uses the account already signed in on the Chromebook |
| Where data is kept | Cloud Firestore (Toronto) | A private Google Sheet + Drive folder in the owner's DDSB Drive |
| Who checks permissions | `firestore.rules` on Google's servers | `Code.gs` on Google's servers (same rules) |
| Screens | GitHub Pages | The same screens, downloaded by the script from GitHub Pages and served by Google |

Students' Chromebooks only ever talk to Google. The two versions keep **separate data**.

## How it works
- `Code.gs` is the whole back end. It's deployed **Execute as: Me**, so it can read and write the private data spreadsheet. Students and teachers never get access to that spreadsheet.
- Each request checks the signed-in DDSB account (`Session.getActiveUser()`) and applies the same rules as `firestore.rules`: students see only their own check-in and never the answer key; teachers see only their classes; admins see everything. `test/server.test.cjs` checks each rule, and GitHub runs it before every publish.
- The app's screens are built by GitHub (`npm run build:gas`) into one file, `https://wps-forge.winchesterps.ca/gas/forge-app.html`. The script downloads it once an hour and keeps a copy in the private folder, so merging a change on GitHub updates the screens within the hour.
- Answers are saved in small batches (taps within about 1.5 seconds go together) and retried until they reach the script. The student's own answer letters are also kept on the device until they hand in.

## Set up (about 15 minutes)

1. **Merge the pull request** that adds this folder, and wait for the green tick under **Actions**. This publishes the app's screens.
2. Signed in with your **@ddsb.ca** account, go to **script.google.com → New project**. Name it **The Forge**.
3. Delete what's in `Code.gs`, paste in the whole of [`Code.gs`](Code.gs), and click **Save**.
4. In the toolbar, choose the function **setup** and click **Run**. Approve the permission prompt (if Google says the app isn't verified, click **Advanced → Go to The Forge**: it's your own script). The log should say **Setup complete**.
   This creates a folder in your Drive called **The Forge – Data (private, do not share)**. **Don't share it or the spreadsheet inside it.**
5. **Deploy → New deployment →** gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone within Durham District School Board**
   Click **Deploy** and copy the **Web app URL**. That's the link for students and staff.
6. Open the link yourself. The first time, it opens **Settings**: check the school name and the check-in (e.g. *Fall 2026*), add your principal/VP as admins, leave **Open to students** off, and **Save**.
7. **Questions → Import from the Sheet**: in the question Sheet run **Math Assessment → 4. Export questions for the web app** and choose the file it makes.
8. **Classes**: create your class and add students (one at a time or by CSV).
9. Turn **Open to students** on when you're ready, and share the link (e.g. in Google Classroom).

## Updating
- **Screens** (anything under `src/`): merge on GitHub. The script picks up the new version within an hour. To update straight away, open the script, choose **refreshApp** and click **Run**.
- **`Code.gs`** changes: paste the new `Code.gs` over the old one, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The link stays the same.

## Good to know
- The account that runs the script (the owner) is always an admin.
- Only `doGet`, `api`, `setup` and `refreshApp` can be called from a browser; `setup` and `refreshApp` refuse anyone but the owner. Keep it that way: every other function's name ends in `_`.
- Google lets about 30 requests run at once for one script. That's plenty for a few classes at a time. If many classes start at exactly the same moment, saves may take a little longer, and the app retries on its own.

import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';

/* =========================================================================
 * Legal pages: Privacy Policy and Copyright & Terms of Use.
 * Both open at #/privacy and #/terms, and anyone can read them without
 * signing in (parents, DDSB IT, the public).
 *
 * The privacy text below is the reviewed policy. If you change one, change
 * the other too, and update PRIVACY_UPDATED.
 * ========================================================================= */

export const AUTHORS = 'Ryan Adams and Natasha Allen';
export const COPYRIGHT_YEAR = '2026';
export const CONTACT_EMAIL = 'ryan.adams@ddsb.ca';
const PRIVACY_UPDATED = 'October 7, 2026';
const TERMS_UPDATED = 'October 9, 2026';

/** Which legal page the address bar points at: 'privacy' | 'terms' | null */
export function useLegalRoute() {
  const read = () => {
    const h = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    return h === 'privacy' || h === 'terms' ? h : null;
  };
  const [page, setPage] = useState(read);
  useEffect(() => {
    const on = () => { setPage(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

function closeLegal(e) {
  e.preventDefault();
  if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back();
  else window.location.hash = '';
}

/** Small footer on every screen. `dark` for the sign-in screen. */
export function Footer({ dark = false }) {
  const tone = dark ? 'text-stone-400' : 'text-stone-500';
  const link = dark ? 'text-stone-300 hover:text-gold-300' : 'text-stone-600 hover:text-brand-700';
  return (
    <footer className={'no-print text-xs text-center px-4 py-4 ' + tone}>
      <span>The Forge © {COPYRIGHT_YEAR} {AUTHORS}. All rights reserved.</span>
      <span className="mx-2" aria-hidden="true">·</span>
      <a href="#/privacy" className={'underline-offset-2 hover:underline ' + link}>Privacy Policy</a>
      <span className="mx-2" aria-hidden="true">·</span>
      <a href="#/terms" className={'underline-offset-2 hover:underline ' + link}>Copyright &amp; Terms of Use</a>
    </footer>
  );
}

export function LegalPage({ page }) {
  useEffect(() => {
    const prev = document.title;
    document.title = (page === 'privacy' ? 'Privacy Policy' : 'Copyright & Terms of Use') + ' · The Forge';
    return () => { document.title = prev; };
  }, [page]);

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="iron-bar text-stone-100 no-print">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="w-9 h-9" />
          <div className="font-display font-bold text-lg tracking-wider text-gold-300">The Forge</div>
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-200 hover:bg-white/10">
              <Printer className="w-4 h-4" /> Print
            </button>
            <a href="#" onClick={closeLegal} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-200 hover:bg-white/10">
              <ArrowLeft className="w-4 h-4" /> Back to The Forge
            </a>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <article className="legal bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 text-stone-700 leading-relaxed">
          {page === 'privacy' ? <Privacy /> : <Terms />}
        </article>
      </main>
      <Footer />
    </div>
  );
}

/* ---------------- Shared bits ---------------- */
const H1 = ({ children }) => <h1 className="font-display text-3xl font-bold text-stone-900 tracking-wide">{children}</h1>;
const H2 = ({ children }) => <h2 className="font-display text-xl font-bold text-stone-900 tracking-wide mt-8 mb-2">{children}</h2>;
const P = ({ children, className = '' }) => <p className={'my-3 ' + className}>{children}</p>;
const UL = ({ children }) => <ul className="list-disc pl-6 my-3 space-y-1.5">{children}</ul>;
const Updated = ({ children }) => <p className="text-sm text-stone-500 mt-1">Last updated: {children}</p>;

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col" className="text-left font-semibold text-stone-800 bg-stone-100 border border-stone-200 px-3 py-2 align-top">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="border border-stone-200 px-3 py-2 align-top">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Privacy Policy ---------------- */
function Privacy() {
  return (
    <>
      <H1>The Forge: Privacy Policy</H1>
      <Updated>{PRIVACY_UPDATED}</Updated>
      <P className="text-lg">The Forge is a math check-in for Winchester P.S. students. It collects only what a teacher needs to give each student the right grade-level questions and to see what they know: student number, name, grade, class and multiple-choice answers. It uses basic Google sign-in (name and email only), shows no ads, has no tracking or analytics, and never sells or shares student information.</P>

      <H2>1. Who this policy covers</H2>
      <P>This policy covers <strong>The Forge</strong> (Math Check-In), a website at https://wps-forge.winchesterps.ca/ used by Winchester Public School, Durham District School Board (DDSB).</P>
      <UL>
        <li><strong>Operated by:</strong> Ryan Adams, teacher, Winchester P.S., on behalf of the school.</li>
        <li><strong>Used by:</strong> Winchester P.S. students (Kindergarten to Grade 8) and staff.</li>
        <li><strong>Purpose:</strong> a short multiple-choice math check-in that shows teachers which grade-level math expectations each student has met and where they need support.</li>
        <li><strong>Authority:</strong> information is collected for instruction and assessment under the Ontario <em>Education Act</em>, and handled consistent with the <em>Municipal Freedom of Information and Protection of Privacy Act</em> (MFIPPA) and DDSB privacy procedures.</li>
      </UL>
      <P>The check-in is a classroom assessment tool. It is not a report card and does not replace teacher judgement.</P>

      <H2>2. Information collected</H2>
      <P>The Forge collects the items below and nothing else. It does not collect birth dates, Ontario Education Numbers (OENs), addresses, phone numbers, photos, health or IEP information, location, or device identifiers.</P>
      <Table
        head={['Information', 'About', 'Where it comes from', 'Why it is needed']}
        rows={[
          ['Google account email, display name, profile picture link, and sign-in times', 'Students and staff', 'Google sign-in (basic profile only)', 'To confirm who is signing in'],
          ['Student number (the 9 digits in S#########@ddsbstudent.ca)', 'Students', 'Read from the student’s school email at sign-in, or entered by the teacher', 'To link each student to their class and their results across years'],
          ['Student name and grade', 'Students', 'Entered by the teacher, one at a time or by CSV', 'To show the right grade’s questions and label results'],
          ['Class name, school year, teacher name and email', 'Classes and staff', 'Entered by the teacher', 'To organise students into classes'],
          ['Emails of staff a class is shared with', 'Staff', 'Entered by the class owner', 'To give co-teachers or administrators access'],
          ['Answers chosen (A, B, C or D) for each question, question order, and start, save and hand-in times', 'Students', 'Saved as the student answers', 'To score the check-in and find strengths and gaps'],
          ['Administrator email list and school settings', 'Staff', 'Entered by an administrator', 'To control who can manage the app'],
        ]}
      />
      <P>Scores, strengths and gaps are <strong>calculated on the teacher’s screen when a report is opened</strong>; they are not stored as separate records. The question bank (questions, answer keys and pictures) contains no personal information.</P>

      <H2>3. How information is used</H2>
      <P>Information is used only to run the check-in and to support teaching:</P>
      <UL>
        <li>give each student the check-in for their grade, and let them resume if they lose their connection;</li>
        <li>show teachers and administrators results by student, class, grade and school, including trends over time;</li>
        <li>let teachers export results to a spreadsheet (CSV) or print them for their own planning.</li>
      </UL>
      <P>Information is <strong>never</strong>:</P>
      <UL>
        <li>sold, rented or shared with anyone outside DDSB;</li>
        <li>used for advertising, marketing or building profiles;</li>
        <li>used to train artificial intelligence or machine-learning models;</li>
        <li>used to make automated decisions about a student; teachers interpret all results.</li>
      </UL>
      <P>CSV files and printouts a teacher creates leave the app and become that teacher’s responsibility under DDSB policy on handling student records.</P>

      <H2>4. Who can see information</H2>
      <P>Access is decided by the Google account that signs in. These limits are enforced on Google’s servers by the app’s security rules, not just hidden on screen, so they cannot be bypassed from a browser.</P>
      <Table
        head={['Who', 'Can see', 'Cannot see']}
        rows={[
          ['Student (S#########@ddsbstudent.ca)', 'Their own grade’s questions and their own answers while working', 'The answer key, their score, other students’ work, class lists. Their check-in is locked once handed in.'],
          ['Class teacher (@ddsb.ca)', 'Their own classes: student names, numbers, grades, answers and results, including earlier results for students currently in their class', 'Classes and students belonging to other teachers'],
          ['Staff a class is shared with', 'That class only, as View only or Can edit, as set by the class owner', 'Any class not shared with them'],
          ['School administrator (principal or vice-principal named in Settings)', 'All Winchester P.S. classes and results; app settings and question bank', '—'],
          ['Anyone else, including non-DDSB Google accounts', 'Nothing', 'Everything'],
        ]}
      />
      <P>A student can be in only one active class at a time. A teacher cannot add a student who is in another teacher’s active class, which prevents anyone from adding a student just to view their results.</P>

      <H2>5. Where information is stored and service providers</H2>
      <P>Student records (classes, rosters and answers) are stored in a Google Cloud Firestore database located in Canada. The services below are the only ones involved. Google provides Firebase as a service provider under its Firebase and Google Cloud data processing terms, and does not use this data for advertising.</P>
      <Table
        head={['Service', 'What it does', 'Information it handles', 'Location']}
        rows={[
          ['Cloud Firestore (Google Firebase)', 'Stores the app’s data', 'Everything in section 2 except the sign-in record', 'Canada, region northamerica-northeast2 (Toronto)'],
          ['Firebase Authentication (Google)', 'Handles Google sign-in', 'Sign-in record: email, display name, profile picture link, sign-in times, and sign-in event logs including IP address', 'Google data centres, which may be outside Canada (typically the United States)'],
          ['GitHub Pages (GitHub, Inc.)', 'Hosts the website’s files', 'No student information. Like any web host, it logs visitors’ IP addresses for security', 'United States'],
          ['DDSB Google Workspace (staff Google Sheet)', 'Where staff write and edit the question bank', 'Questions, answer keys and pictures only, no student information', 'Per DDSB’s Google Workspace agreement'],
          ['The browser’s built-in speech (“Read to me”)', 'Reads a question aloud when a student taps the button', 'Question text only. Some browsers, such as Chrome, may use an online voice service for this', 'Depends on the browser'],
        ]}
      />
      <P><strong>On the device:</strong> the browser keeps the student or teacher signed in until they sign out. While a student is working, a backup of their own answer letters is kept in the browser so nothing is lost if the connection drops; it is deleted when they hand in. Students on shared devices should sign out when finished.</P>
      <P>The app uses no cookies for tracking, no analytics, and no advertising or social-media code. Its fonts and images are served from the app’s own files, so browsers do not contact other websites for them. Its source code is published on GitHub; it contains no student information, passwords or private keys.</P>

      <H2>6. Security safeguards</H2>
      <UL>
        <li><strong>Sign-in through Google only.</strong> No separate passwords are created or stored. Only verified @ddsb.ca and S#########@ddsbstudent.ca accounts can see or save anything. Any other Google account that signs in is shown a “use your school account” message and is refused all data.</li>
        <li><strong>Server-enforced access rules.</strong> Every read and write is checked by Firestore security rules on Google’s servers (section 4).</li>
        <li><strong>Answer key withheld from students.</strong> Answer keys are readable by staff only, and scoring happens on staff screens, so the key never reaches a student’s device.</li>
        <li><strong>Locked submissions.</strong> A student’s check-in cannot be changed after it is handed in, and students can only start a check-in for their own grade and class, while the check-in is open.</li>
        <li><strong>Tested before every update.</strong> Automated tests confirm these rules (for example, that one student cannot read another’s work) before any change to the app is published. A change that fails is not published.</li>
        <li><strong>Encryption.</strong> All traffic uses HTTPS. Google encrypts stored data at rest.</li>
        <li><strong>Least privilege.</strong> Administrator access is limited to named staff. Classes cannot be deleted, only archived, so results keep their context.</li>
        <li><strong>Minimal sign-in access.</strong> The app asks Google for basic profile information only (name and email). It cannot read students’ Drive, Gmail, Classroom or other Google data.</li>
      </UL>

      <H2>7. Retention and deletion</H2>
      <P>Results are kept by student number so teachers can see a student’s progress from year to year while they attend Winchester P.S.</P>
      <UL>
        <li><strong>Check-in results</strong> are kept while the student attends the school, then deleted by a school administrator.</li>
        <li><strong>Students who leave the school</strong> have their results and roster entries deleted within 1 year of leaving.</li>
        <li><strong>Sign-in records</strong> for former students and staff are deleted at the same time.</li>
        <li><strong>Class lists</strong> are archived (read-only) at the end of each school year and deleted with the results they belong to.</li>
        <li><strong>On request:</strong> the school will delete a student’s information when DDSB policy allows, for example at a parent or guardian’s request (section 8).</li>
      </UL>
      <P>Deletion removes the records from the live database. Google removes deleted data from its backup systems on its own published schedule.</P>

      <H2>8. Access, correction and questions</H2>
      <P>Parents, guardians and students may ask to see the information The Forge holds about a student, ask for a correction, or ask questions about this policy.</P>
      <UL>
        <li><strong>First contact:</strong> the student’s classroom teacher, or Ryan Adams, Winchester P.S. (<a className="text-brand-700 underline" href="mailto:ryan.adams@ddsb.ca">ryan.adams@ddsb.ca</a>).</li>
        <li><strong>School:</strong> the principal of Winchester P.S. (Melissa Shields, <a className="text-brand-700 underline" href="mailto:melissa.shields@ddsb.ca">melissa.shields@ddsb.ca</a>).</li>
        <li><strong>Formal requests and privacy concerns:</strong> the DDSB Freedom of Information.</li>
      </UL>
      <P>If a privacy breach is suspected, the operator will stop using the affected part of the app, inform the principal and the DDSB privacy office right away, and follow DDSB’s privacy breach protocol.</P>

      <H2>9. Changes to this policy</H2>
      <P>This policy is reviewed at least once a year and whenever the app changes what it collects or where it stores information. The date at the top shows when it was last updated. Significant changes will be reviewed with DDSB before they take effect.</P>
    </>
  );
}

/* ---------------- Copyright & Terms of Use ---------------- */
function Terms() {
  return (
    <>
      <H1>Copyright &amp; Terms of Use</H1>
      <Updated>{TERMS_UPDATED}</Updated>
      <P className="text-lg font-semibold text-stone-800">The Forge © {COPYRIGHT_YEAR} {AUTHORS}. All rights reserved.</P>

      <H2>1. Ownership</H2>
      <P>The Forge, including its software and source code, user interface, visual design, name, logo, artwork and documentation (together, the “Work”), was created by <strong>Ryan Adams</strong> and <strong>Natasha Allen</strong> (the “Authors”). The Work is protected by the <em>Copyright Act</em> (Canada) and by international copyright treaties. All rights not expressly granted in these terms are reserved by the Authors.</P>

      <H2>2. Permitted use</H2>
      <P>Students, staff and administrators of Winchester Public School, Durham District School Board, may use The Forge through this website for its intended educational purpose. Teachers may export, print and share results within DDSB as described in the Privacy Policy. No other licence is granted.</P>

      <H2>3. Restrictions</H2>
      <P>Without the prior written permission of the Authors, no person or organisation may, in whole or in part:</P>
      <UL>
        <li>copy, reproduce, duplicate, fork, clone or mirror the Work;</li>
        <li>modify, adapt, translate or create derivative works based on the Work;</li>
        <li>host, deploy, publish or operate the Work, or a copy of it, at another school, board or organisation;</li>
        <li>distribute, sell, license, sublicense, rent or otherwise make the Work available to others; or</li>
        <li>remove or alter any copyright notice, authorship credit or these terms.</li>
      </UL>
      <P>The source code is stored in a publicly viewable repository so it can be published and reviewed. Being able to view it does <strong>not</strong> grant any right to copy, reuse or redistribute it.</P>

      <H2>4. Requesting permission</H2>
      <P>Schools, boards and educators who would like to use or adapt The Forge are welcome to ask. Please contact Ryan Adams at <a className="text-brand-700 underline" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Permission request: The Forge')}`}>{CONTACT_EMAIL}</a>. Permission is valid only if it is given in writing by both Authors and may include conditions.</P>

      <H2>5. Student information</H2>
      <P>These terms concern the software only. They give the Authors no ownership of, or rights to, any student or staff information entered into The Forge. That information is held for Winchester P.S. under the custody and control of the Durham District School Board and is handled as set out in the <a className="text-brand-700 underline" href="#/privacy">Privacy Policy</a>.</P>

      <H2>6. Third-party components</H2>
      <P>The Forge is built with open-source components, including React, Firebase, Tailwind CSS, Lucide icons and the Cinzel and Lexend typefaces. Each remains the property of its owners and is used under its own licence. The name “Winchester Knights” belongs to Winchester Public School.</P>

      <H2>7. No warranty</H2>
      <P>The Forge is a classroom tool provided “as is”, without warranty of any kind. Results support, but do not replace, a teacher’s professional judgement.</P>

      <H2>8. Changes</H2>
      <P>The Authors may update these terms. The date at the top shows when they were last changed.</P>
    </>
  );
}

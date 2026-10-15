# Internlytic Portal Setup

This update keeps the existing React/Vite site, public verification page, and `certificates` table. It adds email-link login, intern dashboard, task submissions, and an admin review dashboard.

## 1. Configure Supabase Auth

1. Open **Supabase → Authentication → URL Configuration**.
2. Add your deployed website URL to **Site URL**.
3. Add these redirect URLs:
   - `https://internlytic-technologies-final.vercel.app/portal`
   - `http://localhost:5173/portal` (for local testing)
4. In **Authentication → Providers → Email**, ensure email OTP / magic links are enabled.
5. Confirm your `certificates` table contains `student_email`, `student_name`, `program`, and `certificate_id`.

## 2. Create the portal tables and RLS policies

1. Open **Supabase → SQL Editor**.
2. Open `supabase/internlytic-portal-setup.sql` from this ZIP.
3. Review it, then run it once.
4. The script creates `intern_tasks` and `intern_task_submissions`, and adds authenticated policies. It does not drop your existing certificate or offer-letter policies.

The SQL uses `arslanfayyaz1997@gmail.com` as the admin email. If the admin Gmail is different, replace it in the SQL function `public.is_internlytic_admin()` before running the script, and set `INTERNLYTIC_ADMIN_EMAIL` in Vercel to the same email.

## 3. Configure Vercel environment variables for Google Drive uploads

The portal does not put service-role credentials in browser code. To enable PDF/Word uploads to Drive, add these **server-side** Vercel Environment Variables (Production and Preview as needed):

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key. Keep this secret; never use a `VITE_` prefix.
- `GOOGLE_DRIVE_FOLDER_ID` — ID of the Drive folder where task files should be stored.
- `GOOGLE_SERVICE_ACCOUNT_JSON` — complete JSON key for a Google Cloud service account, stored as one environment-variable value.
- `INTERNLYTIC_ADMIN_EMAIL` — admin Gmail, matching the SQL function.
- Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as they are.

Google Drive setup:
1. In Google Cloud Console, enable **Google Drive API**.
2. Create a service account and create a JSON key for it.
3. Create a folder in Google Drive and share that folder with the service account's `client_email` as **Editor**. Also ensure the admin Gmail can access the folder.
4. Copy the folder ID from the Drive URL. The upload API grants each uploaded file reader access to the verified intern and admin Gmail.
5. Add the JSON key and folder ID as the Vercel environment variables above. Do not paste the service-account JSON or service-role key into chat or commit them to GitHub.
6. Redeploy Vercel after saving environment variables.

For Vercel's request-size limit, portal file uploads are limited to PDF/DOC/DOCX files up to **3 MB each**. Interns can also submit GitHub, LinkedIn, live-demo, Figma, or Drive links.

## 4. How the workflow works

- **Apply Now** buttons use the official Google Form.
- Interns enter their Gmail on `/login` and receive a Supabase email sign-in link.
- After sign-in, the portal checks that Gmail against `certificates.student_email`. Unmatched users are signed out and shown a helpful message.
- `/portal` shows the authorized Supabase record, task announcements, submissions, and document buttons only when an issued status and a matching PDF URL field are available.
- `/admin` is for the admin Gmail. It lists records, supports search and track filtering, publishes tasks, and lets the admin approve/reject submissions.
- A task submission starts at 0% completion. Admin approval sets that submission to 100%; rejecting sets it to 0%. This **does not create or issue a certificate**.
- Offer letters and certificates remain part of your existing workflow. This update does not send them or write their issue dates.

## 5. Important notes

- Keep existing Supabase Auth / RLS policies that the public `/verify` page relies on. Test document verification after running SQL.
- The portal looks for document URL fields named `offer_letter_url`, `offer_letter_pdf_url`, `offer_letter_link`, `certificate_url`, `certificate_pdf_url`, or `certificate_link`. If your automation uses different URL column names, add those names to `docLink()` in `src/pages/InternPortalPage.jsx`.
- Track filtering is based on text in `program` / `internship_program`; adjust `TRACK_ALIASES` in `src/pages/AdminDashboardPage.jsx` if your stored program names use different labels.
- This is the first portal integration layer. Before public launch, test with one authorized intern email and one test task, then verify the existing offer-letter and certificate automation still works.

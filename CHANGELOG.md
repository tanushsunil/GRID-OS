# GRID OS — Changelog

The agency workspace for GRID media: projects, production, finance and data in one place.
Versions follow [semantic versioning](https://semver.org) (major.minor.patch); dates are 2026.
Database updates are listed per version — run them once, in order, in the Supabase SQL Editor
(files in `supabase/migrations/`).

---

## Next up (planned)
- **Estimate → project:** start the project builder from an accepted estimate, its line items pre-filled as deliverables ("8 × Reel" → 8 reel cards).
- **Roadmap on existing projects:** the same drag-and-drop timeline on every project, to reschedule after creation.
- **Retainer cycles:** monthly quotas per project (e.g. 12 posts, 4 reels, 1 shoot day) with a usage meter and carry-over.
- **Speed on the live site:** move the Vercel function region next to the Supabase region (currently Washington ↔ Asia).

---

## 1.5.1 — 12 Oct · Fixes for live projects
**Database:** `012_delete_project.sql`
- **Fixed:** projects with shoots, deliverables or tasks couldn't be deleted. Deleting a project now removes its shoots, deliverables, tasks, rentals, team assignments and monthly invoicing schedule in one step; the confirmation lists what will go. Projects with invoices are protected.
- **Fixed:** creating a project from the builder could stop after the project itself (when start dates weren't set up yet), leaving it empty. Items now save with their due dates, one failure no longer stops the rest, and anything that didn't save is listed on the project page.
- **Fixed:** importing large invoice files hit the database's time limit. Imports now run in batches of 25 with progress ("Importing 50 of 197…"), name the failing spreadsheet rows and the database's reason, and can be re-run safely.
- **Changed:** informational notes use a calm, dismissable style; red is kept for real errors, and error messages show a warning icon instead of a tick.

## 1.5.0 — 12 Oct · Project builder
**Database:** `011_start_dates.sql`
- **New project builder** replacing the template picker, in three steps:
  1. Details — name, client, owner, type, start date; blank or from a template.
  2. What's included — +/− counters for shoot days, reels, photo sets, films, posts and story sets, plus your own types.
  3. Roadmap — a day-by-day timeline with Shoots / Deliverables / Tasks lanes and a sensible first draft (prep → shoot → edits → delivery).
- **Drag-and-drop roadmap:** move cards; drag their edges to set start and due dates; click to edit name, dates, days, and shoot call/wrap times; keyboard support; add tasks; Auto-arrange; start and deadline markers; save the plan as a template.
- **Assign people** to deliverables and tasks in the builder (with "give all reels to…"), shown as initials on each card.
- **Reassign from any list:** the assignee name on task and deliverable rows is a one-click dropdown (logged in Activity).
- Tasks and deliverables now have a **start date** as well as a due date.

## 1.4.0 — 12 Oct · Invoicing automation
**Database:** `008_monthly_invoicing.sql`, `009_google_drive.sql`, `010_invoice_settings.sql`
- **Automatic monthly invoicing:** per project, a draft invoice is prepared on the 29th of every month (last day in shorter months), titled "Project — Month Year". Never duplicated; missed months caught up; pause, resume or stop. Runs nightly on Vercel and whenever a manager opens GRID OS.
- **Google Drive:** connect a Google account and pick a folder; every invoice is saved as a PDF in `Year / MM Month /`, updated when edited or paid, moved when its date changes, and binned when deleted. GRID OS only sees the chosen folder.
- **Invoice PDFs in Helvetica Neue,** measured against the studio's own TS-00207 invoice to within 0.1 pt (client name in capitals, light indented item details, spacing, watermark, footer logo). PDFs are now built on the server and are about 25 KB.
- **Invoice settings:** switch Subtotal, GST, Paid and Balance due on or off for every invoice PDF.
- Client address, GSTIN and phone now share the same size on invoices.

## 1.3.0 — 7 Oct · Sign in with GRID
**Database:** `007_login_codes.sql`
- Every person has a **permanent six-digit GRID number** (shown in Settings) to sign in with instead of email and password. Server-only lookup; attempts rate-limited.

## 1.2.0 — 7 Oct · Import & export
**Database:** `006_import.sql`
- **Export** clients, leads and invoices to Excel or CSV.
- **Import** from CSV or Excel with automatic column matching, a preview (ready / already in GRID OS / needs fixing, with row-level reasons) and templates.
- Older invoices import with their line items or totals; missing clients and projects are created; Paid or Amount paid records the payment; duplicates are skipped.

## 1.1.0 — 7 Oct · Speed, motion and polish
- **Instant page switching** (no server round trip per click), faster sign-in checks, parallel data loading, and saves that update the screen immediately.
- `/api/health` speed check (server region, live version, database round trip).
- Starts in **dark mode**; the glass cursor is **off** by default.
- Softer dark-mode background glow and glass edges.
- **Fluid motion everywhere:** one viscous ease-out curve (no bounce) for every animation; the glass cursor moves like liquid; the sidebar collapses as one continuous movement.
- **Performance pass with no visual change:** fonts 3× smaller (lossless WOFF2), smoother scrolling (background glow on its own layer), dead CSS removed.

## 1.0.0 — 6 Oct · Live
**Database:** `setup-existing-project.sql` (installs `001`–`005` on an existing Supabase project)
- On **GitHub**, deployed on **Vercel**, data in **Supabase**; every push to `main` deploys automatically.
- Sign in with **email and password**; new accounts are confirmed straight away (no email needed).
- Clear sign-in and sign-up messages instead of generic errors.
- **Fixed:** crash after a first sign-in before a workspace exists; workspace creation blocked by a missing rentals permission.

---

## 0.6.0 — 6 Oct · Sign-in and failsafes
**Database:** `005_usernames.sql`
- Redesigned **sign-in page** in the GRID OS style (account creation, password reset and strength meter, display toggles).
- Login IDs alongside email (later simplified to email sign-in in 1.0.0).
- **Failsafe pass:** a crash in one view no longer takes down the app; requests time out with clear messages and retry safely; rate limiting and request size limits; offline banner; demo backup and restore; protection against full browser storage; "discard unsaved changes?" on forms.

## 0.5.0 — 6 Oct · Invoices, cursor and controls
- **Invoice PDFs** download only (no printing), in the style of the studio's TS-002xx invoices.
- **Efficiency and robustness pass** across the app.
- Mobile top bar fixed; Production / Finance / Data cards in the sidebar.
- Liquid-glass notification panel.
- **Liquid-glass cursor:** a glass droplet that merges into buttons and cards, appears above dialogs, and leaves table links alone.
- **Control Center–style toggles** (icon-only glass tiles) for dark mode, liquid glass and the cursor.

## 0.4.0 — 6 Oct · Three workspaces
- The app split into **Production, Finance and Data**, each with its own home screen and colour (orange, green, blue).
- Home cards (with no data on them) whose hover glow tints the page in that card's colour.
- **Data studio:** Power BI–style reports, charts and an explorer for every dataset.

## 0.3.0 — 6 Oct · Rentals
**Database:** `002_project_cost.sql`, `003_rentals.sql`, `004_item_units.sql`
- **Rental gear** tied to projects and shoots, counted as shoot expenses in Finance.
- All-items and By-project views (compact sub-tables, click a project to expand, Expand / Collapse all).
- **Saved gear** presets with prices; only active projects are offered.
- Units on estimate and invoice lines (e.g. "2 Sessions").

## 0.2.0 — 5 Oct · Studio workflow
- Automatic **payment reminders**.
- **Shoot call sheets.**
- **Activity feed and notifications.**
- **Drag-and-drop** production board and calendar.
- **Revenue and profit insights.**
- **Project templates.**
- **Calendar sync** (.ics download and Google Calendar links).

## 0.1.0 — 5 Oct · Foundation
**Database:** `001_grid.sql`
- Core workspace: leads, clients, estimates, projects, shoots, deliverables, tasks, invoices and payments, with team roles (Admin, Manager, Editor).
- Runs locally in **demo mode** (data kept in the browser).
- GRID identity: **orange accent**, **true black dark mode**, **SF Pro** typeface, the GRID logo.
- **Liquid glass** design with an on/off switch.
- **Collapsible sidebar**, a red **"Needs attention"** panel and **universal search** (⌘K).

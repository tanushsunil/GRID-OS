# GRID OS — Changelog

The agency workspace for GRID media: projects, production, finance and data in one place.
Versions follow [semantic versioning](https://semver.org); dates are 2026. Each release lists the database
updates it needs — run them once, in order, in the Supabase SQL Editor (files in `supabase/migrations/`).

---

## Next up (planned)
- **Roadmap on existing projects:** the same drag-and-drop timeline on every project, to reschedule after creation.
- **Retainer cycles:** monthly quotas per project (e.g. 12 posts, 4 reels, 1 shoot day) with a usage meter and carry-over.
- **Speed on the live site:** move the Vercel function region next to the Supabase region.

---

## 1.4 — 12 Oct · Install as an app
- **Install GRID OS** like YouTube Music: its own window, icon and Dock / taskbar entry, opening straight into your workspace.
  - Chrome and Edge: the install icon in the address bar, or **Settings → Install GRID OS → Install app**.
  - Safari on Mac: File → Add to Dock. iPhone and iPad: Share → Add to Home Screen.
  - Right-click the app icon to jump straight to Projects, Invoices or Tasks.
- A GRID app icon, a black title bar to match dark mode, and a calm "You're offline" page that reloads by itself when the connection is back. Nothing else is stored offline, so every update arrives straight away.

## 1.3 — 12 Oct · Estimate to project
- **Convert to project** on an accepted estimate opens the project builder already filled in: client, name, brief and a deliverable for every line item ("8 × Instagram reels" → 8 reel cards).
  - Each line is matched by its wording (reels, posts, story sets, photo sets, films, shoot days); anything else becomes its own deliverable type, and hours, travel and fees are left out.
  - Change any match from the "From the estimate" list before creating; the roadmap, dates and assignees work as usual.
- The new project is linked to the estimate; once converted, the button becomes **Open project** so nothing is created twice.

## 1.2 — 12 Oct · Project builder
**Database:** `011_start_dates.sql`, `012_delete_project.sql`

**New project builder** (replaces the template picker)
- **Details:** name, client, owner, type and start date — blank or from a template.
- **What's included:** +/− counters for shoot days, reels, photo sets, films, posts and story sets, plus your own types.
- **Roadmap:** a day-by-day timeline with Shoots / Deliverables / Tasks lanes and a sensible first draft (prep → shoot → edits → delivery).
  - Drag cards to move them; drag their edges to set start and due dates.
  - Click a card to edit its name, dates and length, or a shoot's call and wrap times; full keyboard support.
  - Add tasks, Auto-arrange, start and deadline markers; save the plan as a template.
- **Assign people** to deliverables and tasks (with "give all reels to…"), shown as initials on each card.

**Elsewhere**
- **Reassign from any list:** the assignee on task and deliverable rows is a one-click dropdown (logged in Activity).
- Tasks and deliverables have a **start date** as well as a due date.
- **What's new** in Settings → About GRID OS: the current version and this changelog, newest release first.
- **Deleting a project** removes its shoots, deliverables, tasks, rentals, team assignments and monthly invoicing schedule in one step, and the confirmation lists what will go. Projects with invoices are protected.

**Fixes**
- Creating a project could stop after the project itself, leaving it empty; items now always save, and anything that didn't is listed on the project page.
- Large invoice imports hit the database's time limit; imports now run in batches of 25 with progress, name any failing rows with the database's reason, and can be re-run safely.
- Informational notes use a calm, dismissable style; red is kept for real errors, which now show a warning icon instead of a tick.

## 1.1 — 12 Oct · Invoicing automation
**Database:** `008_monthly_invoicing.sql`, `009_google_drive.sql`, `010_invoice_settings.sql`
- **Automatic monthly invoicing:** per project, a draft invoice is prepared on the 29th of every month (the last day in shorter months), titled "Project — Month Year".
  - Never duplicated; missed months are caught up; pause, resume or stop at any time.
  - Runs nightly on Vercel and whenever a manager opens GRID OS.
- **Google Drive:** connect a Google account and pick a folder; every invoice is saved there as a PDF in `Year / MM Month /`.
  - Updated when edited or paid, moved when its date changes, binned when deleted.
  - GRID OS only sees the folder you choose.
- **Invoice PDFs in Helvetica Neue,** measured against the studio's own TS-00207 invoice to within 0.1 pt; built on the server and about 25 KB each.
- **Invoice settings:** switch Subtotal, GST, Paid and Balance due on or off for every invoice PDF.

## 1.0 — 6–7 Oct · Live
**Database:** `setup-existing-project.sql` (installs `001`–`005`), `006_import.sql`, `007_login_codes.sql`

**Launch**
- On **GitHub**, deployed on **Vercel**, data in **Supabase**; every push to `main` deploys automatically.
- Sign in with **email and password**; new accounts are confirmed straight away (no email needed), with clear messages when something's wrong.
- **Sign in with GRID:** every person has a permanent six-digit GRID number (shown in Settings) to sign in with instead.

**Import & export**
- **Export** clients, leads and invoices to Excel or CSV.
- **Import** from CSV or Excel with automatic column matching, a preview (ready / already in GRID OS / needs fixing) and templates.
- Older invoices import with their line items or totals; missing clients and projects are created and payments recorded.

**Speed, motion and polish**
- **Instant page switching,** faster sign-in checks, parallel loading, and saves that update the screen immediately.
- Starts in **dark mode** with softer glow and glass edges; the glass cursor is off by default.
- **Fluid motion everywhere:** one smooth, no-bounce curve for every animation; a liquid glass cursor; a sidebar that collapses as one movement.
- **Performance pass with no visual change:** fonts 3× smaller, smoother scrolling, dead code removed.

**Fixes**
- Crash after a first sign-in before a workspace existed; workspace creation blocked by a missing permission.

---

## 0.2 — 6 Oct · Three workspaces
**Database:** `005_usernames.sql`
- The app split into **Production, Finance and Data**, each with its own home screen and colour (orange, green, blue); home-card hover tints the page.
- **Data studio:** Power BI–style reports, charts and an explorer for every dataset.
- **Invoice PDFs** (download only) in the style of the studio's TS-002xx invoices.
- **Liquid-glass design:** a glass cursor that merges into buttons and cards, a glass notification panel, and Control Center–style toggles for dark mode, glass and the cursor.
- Redesigned **sign-in page**, a mobile top bar fix, and the three workspaces in the sidebar.
- **Efficiency and failsafe pass:** one broken view can't take down the app; clear time-outs and retries; rate limits; offline banner; demo backup and restore; "discard unsaved changes?" on forms.

## 0.1 — 5–6 Oct · First build
**Database:** `001_grid.sql`, `002_project_cost.sql`, `003_rentals.sql`, `004_item_units.sql`
- **Core workspace:** leads, clients, estimates, projects, shoots, deliverables, tasks, invoices and payments, with team roles (Admin, Manager, Editor); runs locally in demo mode.
- **GRID identity:** orange accent, true black dark mode, SF Pro, the GRID logo, liquid glass with an on/off switch, a collapsible sidebar, a red "Needs attention" panel and universal search (⌘K).
- **Studio workflow:** payment reminders, shoot call sheets, activity feed and notifications, drag-and-drop board and calendar, revenue and profit insights, project templates, calendar sync.
- **Rentals:** gear tied to projects and shoots and counted as shoot expenses, all-items and by-project views, saved gear presets, and units on line items ("2 Sessions").

# CAR DOC — Service Center ERP — Handoff Notes

## What this is
A simple ERP for CAR DOC, a car service center in Dikwella, Sri Lanka. Covers appointments,
job cards, invoicing, inventory/parts, suppliers, expenses, service catalog, staff/permissions,
customer & vehicle records, and dashboard/reporting.

## About the design files
The files in `source/` are **HTML/JS design prototypes** built as Design Components (a
proprietary streaming-template format: `<x-dc>` markup + a `DCLogic` class + `support.js`
runtime). They are **references showing intended layout, copy, colors, and interaction
logic — not production code to copy verbatim**. The task is to **recreate this design in a
real app stack** (recommend: React + TypeScript + a real backend/DB — Node/Express or
similar, Postgres/MySQL) using the target codebase's own conventions, component library,
and state-management approach. If no codebase exists yet, standing up a conventional
React SPA (or Next.js) + REST/GraphQL API is a reasonable default.

Everything here is currently **client-side mock state** (in-memory JS, seeded arrays,
no real persistence, no auth backend, no real PDF/print backend beyond browser print).
All of that needs a real backend, real auth, and a real database.

## Fidelity
**High-fidelity.** Colors, spacing, typography, copy, empty/loading states, and almost all
interaction logic in this bundle are intended to be final — implement pixel-close using
whatever component library/design tokens the target codebase already has. Where this doc
says "seed data" or "mock," that specific data is illustrative only (not real business data).

## Brand
- Name: CAR DOC (Dikwella Service Center)
- Phone: 071 369 4923, Address: Dikwella 81200
- Currency: LKR (Sri Lankan Rupee), formatted as `LKR 1,234` (no decimals in list views;
  invoices use `LKR 1,234.00`)
- Logo: `source/assets/car-doc-logo.png` (circular red/black/gold badge, background removed)
- Primary color: `#d81f2a` (red) — buttons, active nav, highlights
- Dark surface (sidebar): `#111114`
- Accent gold: `#f2b705` (used on dark surfaces — icons, avatar chips)
- Neutral text: `#16181d` (headings), `#4b5563`/`#6b7280` (body/secondary), `#8a8f98` (muted)
- Borders/backgrounds: `#ececef` / `#f1f1f3` / `#f7f7f8`
- Status colors: Pending `#b45309`/`#fef3c7`, Confirmed `#1d4ed8`/`#dbeafe`,
  In Progress `#6d28d9`/`#ede9fe`, Completed `#15803d`/`#dcfce7`, Cancelled `#b91c1c`/`#fee2e2`
- Font: system default sans (no custom webfont loaded) — pick the codebase's standard sans
- No emoji in the UI except a couple of unicode glyphs used as plain icons in Notifications
  (⚠, 📅, 🔧, ✅) — fine to replace with a real icon set (Lucide/Heroicons match the outline
  style already used everywhere else via inline SVG paths)

## Roles & auth (mocked)
Two roles only: **Owner/Admin** (full access) and **Service Advisor** (front-desk).
The login screen is a fake picker (click a role card, any typed username/password works).
Admin-only nav items: Reports, Inventory, Suppliers, Expenses, Services, Staff & Permissions.
Real implementation needs real auth (email/password or SSO) + a proper roles/permissions
table — see Staff & Permissions below, which already has a granular per-user toggle grid
that should map directly to a permissions table (user_id, module, allowed boolean).

## Core business logic to preserve (this is the part that matters most)

### Appointments → Job Cards → Invoices pipeline (the central workflow)
1. **Create appointment**: customer name (autocomplete against existing customers by name
   or phone — selecting a match pre-fills the other field), vehicle via searchable
   Brand → Model dropdowns + free-text plate/vehicle-no (same brand/model master data used
   in Job Cards and Customers — see "Vehicle master data" below), service type, date/time.
   A toggle **"Create job card for this appointment"** defaults ON.
2. **Confirming an appointment** (status Pending → Confirmed) auto-creates a linked Job Card
   in `Pending` stage if one doesn't already exist for that appointment (`job.apptId ===
   appointment.id`). This linkage is the key relationship — a job card created this way
   carries `apptId` back-reference.
3. **Appointment status is a locked/derived field once a job progresses**: the appointment
   status dropdown only ever offers **Pending / Confirmed / Cancelled** — a user cannot set
   an appointment to "In Progress" or "Completed" directly. Once the linked job card's stage
   changes to In Progress or Completed, the update propagates *back* to the appointment
   (`updateJobCard` syncs `appointment.status = job.stage`), and the appointment's status
   badge becomes read-only (shows the badge, not the dropdown) until the job card leaves
   that state. This is intentional — job progress is the source of truth once work starts.
4. **Job Card kanban** has 3 stages: Pending → In Progress → Completed.
   - Pending: "Start Job" button → In Progress.
   - In Progress: "+ Add Item" (opens a picker — see below) and "Mark Complete" → Completed.
   - Completed: "Create Invoice" button → navigates to Invoices and opens the New Invoice
     modal pre-filled with the job's customer, vehicle, service line, and any added
     product/service line items.
5. **Add Item picker** (on an in-progress job card): single popup with a **Service/Product
   tab switcher** (not a 2-step wizard — this was explicitly simplified per user feedback),
   category filter pills (horizontally scrollable with left/right arrow buttons, native
   scrollbar hidden), search, a 2-col grid of small single-line cards (name + price), and a
   qty +/− stepper before confirming "Add to Job". Service items come from the Services
   master data (grouped by main service type); Product items come from Inventory (grouped
   by product category).
6. **Job cards track vehicle mileage**: current mileage (km) + a configurable service
   interval (default 5000 km, editable), and compute "Next service due at X km" — this
   logic should trigger a maintenance reminder/notification in the real system (not yet
   wired to notifications in this prototype, but the computation exists in JobCardsView).
7. **Invoices**: created manually or via the Job Card → Create Invoice flow. Invoice line
   items = one row per service + one row per added product, editable and extendable (can
   add more line items in the invoice modal). Statuses: Paid / Unpaid / Partial. Invoice
   print/PDF should show the CAR DOC letterhead (logo, name, address, phone) — this exists
   as a print-styled view; recreate with a real PDF generator (e.g. Puppeteer/wkhtmltopdf)
   server-side rather than relying on browser print in production.

### Vehicle master data (Brand → Model)
A shared `vehicleBrands` map (`{ [brand]: [model, model...] }`) lives in root state and is
passed down to **Job Cards, Appointments, and Customers** — all three forms use the *same*
searchable Brand dropdown → Model dropdown (filtered by chosen brand) → free-text Vehicle No.
field. Typing a brand/model not in the list surfaces a "+ Add '<value>' as new brand/model"
row that persists it into the shared master list for future use across all three forms.
**This must be a real `vehicle_brands` / `vehicle_models` table (or brand table + model table
with FK), not per-form state**, so a brand/model added from any screen is instantly available
on the others.

### Inventory / Products (master data)
- Products have: name, category, SKU (auto-generated as `PRD-####`, editable), cost price
  (purchasing price), sell price (selling price), current stock, reorder level, supplier.
- **Both product Category and Product Name are themselves searchable "type or pick, or add
  new" comboboxes** — same UX pattern as vehicle brand/model. Categories currently seeded:
  Lubricants, Oil Filters, Air Filters, Cabin Filters, Wiper Blades, Microfiber Cloths,
  Brake Parts, Batteries, Tyres, Electricals (deliberately split fine-grained rather than one
  generic "Filters" bucket — the user explicitly asked for this granularity).
- **Restock flow**: a "Restock" action per product opens a modal to add received quantity,
  optionally update unit price, and optionally update supplier — this increments stock
  rather than replacing it. Low stock is `stockNum <= reorderLevel`, shown with a red
  "(Low)" badge, and feeds the notification system (see below).
- Category filter pills row: horizontally scrollable, hidden scrollbar, with left/right
  arrow buttons for mouse/tablet use (no drag-to-scroll affordance otherwise).
- All destructive actions (delete product, delete supplier, delete staff, delete
  appointment, delete service, delete expense, delete job item) require a confirm dialog.

### Services master data
Two-level hierarchy: **main service category** (e.g. "Body Wash", "Scan", "Wax") containing
individual **services** (e.g. "Normal Wash", "Full Body Wash") each with its own SKU
(`SVC-###`, auto-generated + editable), price, and optional details text. Categories are
collapsible/expandable independently (each card's own disclosure state, not a shared
accordion) — clicking "+ Add Service" must NOT toggle the collapse (these are separate click
targets). No "delete category" button by design (categories collapse/expand only; only
individual services are deletable) — this was a deliberate UX simplification requested
mid-project.

### Suppliers & Expenses
- Suppliers: name, category/items supplied, contact person, phone, and an optional
  "Attach staff member" field (who manages that supplier relationship) — dropdown of staff
  names. Full edit/delete with confirm.
- **Expenses is its own top-level module** (was originally a tab under Suppliers, moved out
  per feedback — don't nest it back under Suppliers). Fields: expense type (searchable
  "type or pick, or add new" combobox — seeded suggestions: Electricity, Water Bill, Machine
  Repairs, Staff Salaries, Fuel, Rent, Cleaning Supplies, Internet & Phone), date, amount
  (LKR), optional note, optional "attach staff member". Summary cards show Total / Entries
  count / Top category by spend.

### Staff & Permissions
Three top-level tabs (not nested per-employee accordions — this was explicitly requested
as a restructure): **Employees**, **Permissions**, **Attendance**.
- Employees: name, role, phone, optional monthly salary (LKR), status (Active/On Leave —
  editable in the form and also directly toggleable by clicking the status badge in the
  list). Add/edit/delete with confirm.
- Permissions: per-employee card, **collapsed by default**, expand to reveal a per-module
  toggle grid (Dashboard, Appointments, Job Cards, Invoices, Inventory, Suppliers, Reports,
  Staff). This is the real permissions model — map directly to a `staff_permissions` table
  (staff_id, module, allowed).
- Attendance: per-employee 7-day strip of Present/Absent/Leave chips. Today's chip is
  visually marked and directly clickable to cycle Present → Absent → Leave (mistake
  correction), plus explicit "Present / Absent / Leave" quick-action buttons per employee.
  This needs a real `attendance` table (staff_id, date, status) with a uniqueness
  constraint per (staff_id, date) and update-if-exists-today semantics.

### Dashboard & Reports
- Dashboard: 4 KPI cards (Today's Appointments, Revenue this month, Jobs In Progress, Low
  Stock Items) + a 7-day revenue bar chart. All from aggregate queries in a real backend.
- Reports is **tab-per-report**, not one dashboard-shaped page (explicitly requested — each
  report tab should feel like its own designed view, not a repeat of the dashboard):
  Revenue, Jobs, Customers, Inventory, Expenses. Each has its own date-range control
  pattern: **Day / Week / Month segmented control, defaulting to Day, plus a Custom range
  via a date-picker popup**, and a Print button (should become a real PDF export
  server-side).

### Notifications
Bell icon in the top bar opens a panel with **All / Unread / Read tabs**. Notifications are
derived (not stored) from: low-stock inventory items, count of pending/confirmed
appointments awaiting service, count of in-progress job cards, count of completed jobs
awaiting invoicing. "Mark all read" and per-item click-to-read. In a real system these should
likely become real generated notification rows (so read-state persists per user, and so you
can push new ones), but the *derivation rules* (what counts as notification-worthy) should
carry over as-is.

### Responsive / tablet requirement
The whole app must work well on tablets (stated requirement — staff use tablets for daily
operations). Notable patterns already applied that should carry over: sidebar collapses to
icon-only under ~1024px; horizontally-scrollable data tables with a `min-width` + overflow
wrapper below ~900-1000px; toolbars that stack vertically and go full-width below ~700px;
44px minimum touch targets on primary actions (category pills, add-item picker, etc.);
category/tab pill rows get explicit prev/next arrow buttons since tablets often lack
mouse-wheel horizontal scroll.

### Skeleton loading & infinite scroll
List-heavy views (Appointments, Job Cards is kanban not paginated, Invoices, Customers,
Inventory) show skeleton placeholder rows on a short artificial delay, then load; long lists
(Customers, Invoices, Inventory) use a "visible count" that grows on scroll-to-bottom
(infinite scroll pattern) rather than pagination controls. Recreate with real
cursor/offset pagination + real loading states server-side.

## Non-goals / things NOT to over-build from this prototype
- Don't copy the in-memory JS state management pattern — use whatever the target app uses
  (Redux/Zustand/React Query/server components/etc.) backed by a real API.
- Don't ship the literal inline-style HTML — recreate visuals using the target codebase's
  styling system (Tailwind, CSS modules, styled-components, native platform styling, etc.),
  matching the colors/spacing/type documented above.
- The "print" and "PDF export" actions here are browser-print based; production should use
  a real server-side PDF pipeline.

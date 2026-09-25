# Architecture — CAR DOC ERP (design prototype)

This describes how the prototype is wired, so it can be mapped to a real front-end +
backend architecture. It is NOT a recommendation to keep this structure — it's a map of
what exists so nothing gets lost in translation.

## File / component map

```
Car Doc ERP.dc.html        Root shell: login screen, sidebar nav, topbar (search, bell/
                            notifications, export), footer, view router, ALL shared state.
                            This is the only file holding cross-screen state today.
  ├─ DashboardView.dc.html     KPI cards + 7-day revenue chart. No props (reads nothing
  │                            from root yet — pure mock data; should read real aggregates).
  ├─ AppointmentsView.dc.html  Props in: appointments, vehicleBrands.
  │                            Props out (callbacks): onAdd, onDelete, onStatusChange,
  │                            onAddBrand, onAddModel.
  ├─ JobCardsView.dc.html      Props in: jobCards, vehicleBrands, serviceCategories,
  │                            products (= root's inventory list).
  │                            Props out: onAdd, onUpdate, onCreateInvoice, onAddBrand,
  │                            onAddModel.
  ├─ InvoicesView.dc.html      Props in: draft (invoice draft object handed off from a
  │                            completed job card). Props out: onDraftConsumed.
  ├─ CustomersView.dc.html     Props in: vehicleBrands. Props out: onAddBrand, onAddModel.
  │                            (Customer list itself is still local mock state — should be
  │                            lifted to root / real API like everything else.)
  ├─ InventoryView.dc.html     Props in: items (inventory), categories (productCategories),
  │                            productNames. Props out: onAddCategory, onAddName, onAdd,
  │                            onUpdate, onDelete.
  ├─ SuppliersView.dc.html     Fully self-contained mock state today (suppliers list, staff
  │                            name list duplicated locally). Should receive staff list from
  │                            root instead of its own copy.
  ├─ ExpensesView.dc.html      Fully self-contained mock state (own expense list + own copy
  │                            of staff names). Same note as Suppliers.
  ├─ ServicesView.dc.html      Props in: categories (serviceCategories — {category: [service]}).
  │                            Props out: onAddCategory, onDeleteCategory, onRenameCategory,
  │                            onAddService, onUpdateService, onDeleteService.
  ├─ StaffView.dc.html         Fully self-contained mock state (staff list, permissions,
  │                            attendance all local). Should be lifted to root + real API —
  │                            other screens (Suppliers, Expenses, JobCards technician
  │                            picker) all need the *same* staff list and currently each
  │                            keeps its own copy. This duplication is the biggest thing to
  │                            fix when rebuilding: centralize staff/employees as one root-
  │                            level (or server) resource.
  └─ ReportsView.dc.html       Fully self-contained mock data per report tab. Should read
                               real aggregates per the date range control.
```

## Root state shape (Car Doc ERP.dc.html `state`)
```
loggedIn, loginRole                  — fake auth
view                                 — current route/screen key
globalSearch                         — topbar search (not yet wired to results)
notifPanelOpen, notifTab, notifReadIds — notification panel UI state (see below)

appointments: Appointment[]
jobCards: JobCard[]
nextApptId, nextJobNum, invoiceDraft

vehicleBrands: { [brand: string]: string[] }   — shared Brand→Model master data

serviceCategories: { [category: string]: Service[] }  — Services master data
productCategories: string[]                     — Inventory category master list
productNames: string[]                          — Inventory product-name master list
inventory: Product[]                            — the actual stock/product records
```

### Key shapes
```ts
Appointment {
  id: number
  customer: string
  vehicle: string          // "<Brand> <Model> - <PlateNo>"
  service: string
  datetime: string         // display-formatted, e.g. "Sep 20, 9:00 AM"
  advisor: string
  status: 'Pending' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled'
}

JobCard {
  id: string               // "JC-2401"
  apptId?: number          // back-reference to the appointment that spawned it, if any
  customer: string
  vehicle: string
  service: string
  technician: string
  cost: string             // display string today, e.g. "LKR 7,500" — should be numeric
  stage: 'Pending' | 'In Progress' | 'Completed'
  items?: { name: string, qty: number, price: number }[]   // added via the picker
  mileage?: number
  serviceInterval?: number // default 5000
}

Service {
  id: number
  sku: string              // "SVC-001", editable
  name: string
  price: number
  details: string
}

Product (= inventory row) {
  id: number
  name: string
  category: string
  sku: string               // "PRD-1000", editable
  stockNum: number
  reorder: number
  priceNum: number          // selling price
  costPriceNum: number      // purchasing price
  supplier: string
}
```

## Cross-screen logic that lives in root (must survive the rewrite)

1. **`addAppointment(fields, createJobCard)`** — if `createJobCard` is true, also pushes a
   new JobCard (stage Pending) tagged with `apptId`.
2. **`updateAppointmentStatus(id, status)`** — if the new status is `'Confirmed'` and no
   job card exists yet with `apptId === id`, auto-creates one (stage Pending).
3. **`updateJobCard(id, patch)`** — if `patch.stage` is present, looks up the job's
   `apptId` and, if set, also updates that appointment's `status` to the same value. This
   is the "job progress drives appointment status" rule — implement as either a DB trigger,
   a service-layer side effect, or an explicit two-write transaction, not left to the client.
4. **`createInvoiceFromJob(job)`** — builds an invoice draft (customer, vehicle, line items
   from `job.service` + `job.items`) and stores it in `invoiceDraft` + switches `view` to
   `'invoices'`; InvoicesView reads `draft` on mount, opens the New Invoice modal pre-filled,
   then calls `onDraftConsumed` to clear it. Recreate as: navigate to an invoice-create route
   with the job id, fetch the job server-side, pre-fill the form.
5. **Vehicle brand/model additions** (`addVehicleBrand`, `addVehicleModel`) mutate the single
   root `vehicleBrands` map and are shared live across Appointments, Job Cards, and
   Customers forms.
6. **Notification derivation** (`buildNotifications()` in root) — recomputed from current
   state every render: one item per low-stock product, one aggregate item for
   pending+confirmed appointment count, one for in-progress job count, one for
   completed-awaiting-invoice job count. `notifReadIds` is a client-side read-state list
   checked against derived notification `id`s (e.g. `'stock-<productId>'`,
   `'appts-pending'`, `'jobs-inprogress'`, `'jobs-completed'`). Real system: persist
   generated notifications with stable ids so read-state survives reload/other devices.

## Known duplication to fix in the real build
Staff/employee names are duplicated as literal arrays in **JobCardsView** (technician
picker), **SuppliersView** (staff-attach dropdown), **ExpensesView** (staff-attach
dropdown), and defined authoritatively in **StaffView**. In the real app this must be a
single `staff`/`employees` resource fetched once (or via shared client cache) and referenced
everywhere — do not re-introduce per-screen copies.

## Suggested real-world architecture
- **Frontend**: React + TypeScript SPA (or Next.js if SSR/SEO matters, which it likely
  doesn't for an internal tool). React Query or equivalent for server state; keep local UI
  state (modals open/closed, form drafts) local per component like this prototype does.
- **Backend**: REST or tRPC API over a relational DB (Postgres). Suggested tables:
  `staff`, `staff_permissions`, `attendance`, `customers`, `vehicles` (fk customer,
  brand, model, plate), `vehicle_brands`, `vehicle_models`, `appointments` (fk vehicle,
  customer, staff advisor), `job_cards` (fk appointment nullable, fk vehicle), `job_card_items`,
  `invoices`, `invoice_items`, `products`, `product_categories`, `services`,
  `service_categories`, `suppliers`, `expenses`, `notifications` (or derive them
  server-side on request, matching rule set above).
- **Auth**: real session/JWT auth with a `role` (admin/advisor) and the granular
  per-module permission table already modeled in Staff & Permissions.
- **PDF/print**: server-side rendering (e.g. a headless-Chrome/Puppeteer service or a PDF
  library) for invoices and reports, rather than relying on the browser's print dialog.

## Screenshots
See `screenshots/` for a full-page capture of every primary screen (as Admin), for visual
reference alongside this document. Reference `source/*.dc.html` for exact copy, layout
structure (grid columns, spacing values), and colors on any point this document doesn't
spell out.

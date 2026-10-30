# Hurmat Darbar — Progress Tracker

Last updated: 2026-10-30

## Latest work
- [x] Created a separate `customer-next/` Next.js App Router project without replacing the live static website.
- [x] Added a responsive cream/brown/gold customer landing page and live menu reads against the audited `menu_categories`, `menu_items`, and `menu_variants` tables.
- [x] Added `.env.example` with publishable-key-only configuration; no service-role key added.
- [ ] Next.js dependency install, production build, and deployment verification — GitHub Actions CI workflow added; awaiting its run result.
- [ ] Checkout remains intentionally disabled until the existing `create_order` workflow is safely connected and tested.

## Fixed architecture
- [x] Exactly three apps defined: Customer Next.js website, separate native Admin Android app, separate native Rider Android app.
- [x] Shared backend API + Supabase PostgreSQL defined.
- [x] No separate customer Android app.
- [x] No combining Admin and Rider Android projects.

## Phase 1 — Audit and architecture
- [x] Remote GitHub repository inspected.
- [x] Existing static customer website identified.
- [x] Existing separate Kotlin Admin and Rider projects identified.
- [x] Existing backend Edge Function contract reviewed from repository documentation.
- [x] Older draft migration identified as non-authoritative; not applied.
- [x] Architecture and safety constraints documented.
- [ ] Local Antigravity/Android Studio workspace reconciliation — blocked because local PC files are not accessible in this session.

## Phase 2 — Live database reconciliation (audit only so far)
- [x] Live Supabase public tables and column metadata inspected.
- [x] RLS policy inventory inspected.
- [x] Key SECURITY DEFINER RPC definitions inspected.
- [x] Supabase security advisors run; warnings recorded in DATABASE_AUDIT.md.
- [x] Multi-line create_order behavior confirmed: one RPC creates one order plus multiple order_items and decrements tracked stock.
- [x] Cancellation/rejection stock restoration behavior identified for idempotency testing.
- [x] Live schema differs from the old repository draft; no draft migration applied.
- [ ] Function EXECUTE grants and callers mapped across all three clients/backend.
- [ ] Inventory movement ledger design and safe migration.
- [ ] Reservation conflict constraints and abuse controls review.
- [ ] Safe additive migrations generated and tested.

## Existing implementation gaps (verified from repository review)
- [x] A separate Next.js customer application scaffold now exists; production build/deployment verification is still pending.
- [ ] Customer order/checkout flow is not fully persisted through the secure backend.
- [ ] Multi-item cart checkout must be connected as one transactional order with multiple order_items.
- [ ] Admin Android functionality is partial.
- [ ] Rider Android live GPS sharing and delivery OTP are incomplete.
- [ ] Razorpay production integration is not activated.
- [ ] Menu PDF import is blocked until owner supplies the actual PDF.
- [ ] Restaurant coordinates are unverified; delivery activation is blocked.
- [ ] GST/tax and other owner decisions remain pending.

## Phases
- [ ] Phase 3 — Backend auth, RBAC, and transactional workflows.
- [ ] Phase 4 — Customer Next.js website and reviewed menu import.
- [ ] Phase 5 — Admin Android completion.
- [ ] Phase 6 — Rider Android completion.
- [ ] Phase 7 — Razorpay test integration.
- [ ] Phase 8 — Reservations, support, loyalty, notifications.
- [ ] Phase 9 — Inventory, expenses, reports, exports.
- [ ] Phase 10 — Security, end-to-end tests, deployment, handover.

## Release gates
- [ ] No secrets in client bundles or APKs.
- [ ] RLS and role isolation verified.
- [ ] One cart checkout creates one order containing every cart line.
- [ ] Inventory changes are atomic and exactly once.
- [ ] Payment signatures/webhooks verified server-side.
- [ ] Reservation conflicts prevented transactionally.
- [ ] Rider assignment, location permissions, and OTP verified.
- [ ] Both Android apps build independently.
- [ ] Customer website builds and passes responsive checks (CI workflow now configured; not yet verified green).
- [ ] Backup/restore strategy verified against the active Supabase plan.
- [ ] Final test report contains PASS/FAIL/BLOCKED for every test.

## Operating rule
Do not mark a task complete until the code/configuration exists and the relevant check has actually run. Do not apply the old draft SQL to the live database.


## Customer Next.js menu bag phase — 2026-10-30
- Added a client-side menu bag with add buttons per priced variant, quantity increase/decrease, subtotal calculation, clear-bag control, and responsive bag panel.
- Items flagged `needs_verification` and variants without a confirmed price cannot be added.
- This is a session-only UI bag; it does not create an order, reserve stock, or change inventory.
- Checkout remains intentionally disabled: live `create_order` requires a verified delivery location, valid coordinates, supported payment method, and authenticated user context. Current restaurant settings and customer auth flow must be confirmed before enabling it.
- No production database writes or stock changes were made.
- Build/typecheck still awaits GitHub Actions result; no local build was run in this remote repository session.


## Customer authentication phase — 2026-10-30
- Added Supabase SSR browser and server clients using cookie-based sessions.
- Added Next.js root proxy to refresh sessions and validate JWT claims with `getClaims()`.
- Added customer phone OTP request/verification UI and signed-in state.
- No service-role key or server secret added to the customer app.
- OTP delivery is not yet verified: owner must configure an SMS provider, templates, rate limits and consent settings in Supabase Auth.
- Live restaurant settings rechecked: restaurant coordinates are NULL, `location_verified=false`, delivery radius 5,000m, delivery fee ₹30, COD disabled, UPI disabled, restaurant marked open. Therefore customer delivery checkout must remain disabled.
- No database schema/data writes were made in this phase.
- Build and end-to-end SMS verification still pending; no production deployment claimed.


## Admin Android API contract phase — 2026-10-30
- [x] Inspected the existing native Admin Kotlin activity, Android manifest and Gradle configuration.
- [x] Added `documentation/ADMIN_ANDROID_API_CONTRACT.md` to separate backend-documented actions from extra endpoint names referenced by the Android UI.
- [x] Recorded the confirmed API contract for order listing, order creation, rider assignment, order status updates and rider location.
- [x] Flagged menu, rider-list and reservation view/action names as unverified because they are absent from the backend README contract.
- [x] Documented role/RLS, stock-restoration, session-expiry, privacy and Android build release gates.
- [ ] Inspect deployed Edge Function source and live function behavior before enabling unverified Admin actions.
- [ ] Add/verify server-side menu, inventory, reservation, staff, cash and reporting endpoints.
- [ ] Run Admin Android Gradle build and real-device role tests; not run in this remote GitHub session.


## Live Edge Function v4 reconciliation — 2026-10-30
- [x] Read the Supabase Edge Function/Auth documentation for JWT-scoped requests and RLS context.
- [x] Confirmed deployed `restaurant-api` is ACTIVE, version 4, with platform JWT verification enabled.
- [x] Retrieved and reviewed deployed `index.ts` source.
- [x] Confirmed menu, rider and reservation list routes and their role gates are present in the deployed function; earlier docs understated this.
- [x] Confirmed menu item/variant and reservation status update action handlers exist in deployed version 4.
- [x] Reconciled `ADMIN_ANDROID_API_CONTRACT.md` with the actual deployed function.
- [x] Recorded concrete follow-up risks: reservation transitions/conflicts/audit, menu affected-row verification/audit, order RPC transition tests, rider assignment checks, PII minimization and error detail.
- [ ] Add transactional reservation state/conflict protection and audit after inspecting the live schema/RPC callers.
- [ ] Verify menu update row counts and audit trail.
- [ ] Run role-based API tests and Android Gradle/device tests.
- [ ] No Edge Function deployment or production database write was made in this phase.


## Reservation and menu write-path audit — 2026-10-30
- [x] Inspected live reservations columns and constraints.
- [x] Inspected live triggers on reservations, menu_items and menu_variants; no non-internal triggers found.
- [x] Re-read deployed Edge Function v4 handlers for reservation and menu updates.
- [x] Confirmed reservation updates allow direct status assignment without transition graph, conflict checks, affected-row verification or audit.
- [x] Confirmed menu updates do not verify affected-row count and do not create audit events.
- [x] Documented required owner decisions for capacity, duration, slot rules and cancellation cutoff.
- [ ] Implement audited menu update and reservation workflow after rules and migration plan are approved.
- [ ] Add automated authorization, nonexistent-row, duplicate and concurrency tests.
- [ ] No production DDL/data writes or Edge Function deployment performed.


## API affected-row verification fix — 2026-10-30
- [x] Updated repository Edge Function source so menu item, menu variant and reservation status updates request the updated row ID.
- [x] Return HTTP 404 when the target row is missing or not visible under caller RLS, rather than incorrectly returning ok:true.
- [x] Keep caller JWT/RLS context; no service-role key introduced.
- [ ] Add audit event writes through a reviewed, role-checked database function.
- [ ] Add Deno/API tests and run CI.
- [ ] Deploy updated Edge Function only after source review and explicit release approval; live deployed v4 remains unchanged.


## Android build automation phase — 2026-10-30
- [x] Added a separate Android CI matrix job for the native Admin and Rider projects.
- [x] CI uses JDK 17 and Gradle 8.9, matching the projects' Android Gradle Plugin 8.7.3 requirements.
- [x] Each app runs its own `assembleDebug` task and uploads a separately named debug APK artifact.
- [x] Push and pull-request path filters now include both Android project directories.
- [ ] Wait for GitHub Actions to run; neither APK build is marked passed until the workflow reports success.
- [ ] Device-level auth/role tests, location permission tests and delivery workflow tests remain pending.


## Admin Android menu controls — 2026-10-30
- [x] Added editable menu item name and description fields using the verified `update_menu_item` API fields and server-side length bounds.
- [x] Added menu item activate/deactivate control using the verified `active` field.
- [x] Added menu variant activate/deactivate control using the verified `active` field.
- [x] Kept existing availability and variant price controls; no stock/inventory field was invented because the verified menu API/schema contract does not expose a stock mutation here.
- [ ] Run Admin Android Gradle build and test each action against a non-production test account before release.
- [ ] Add safe inventory ledger endpoints only after live schema and RPC caller review.


## Inventory quantity controls — 2026-10-30
- [x] Confirmed live `menu_items.track_stock` (boolean) and `stock_qty` (nullable non-negative integer) columns.
- [x] Added validation for `track_stock` and `stock_qty` in the repository Edge Function `update_menu_item` handler.
- [x] Added Admin Android UI to enable/disable stock tracking and edit current stock quantity.
- [ ] Deploy the repository Edge Function change only after source review and release checks; live Edge Function remains unchanged.
- [ ] Add a proper inventory movement ledger with adjustment reasons, actor, timestamps, and transactional stock changes before production stock accounting.
- [ ] Verify stock decrement/restoration and concurrent updates using test orders before enabling inventory operations in production.

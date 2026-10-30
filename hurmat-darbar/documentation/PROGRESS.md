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

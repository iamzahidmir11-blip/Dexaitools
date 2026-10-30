# Hurmat Darbar — Progress Tracker

Last updated: 2026-10-30

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

## Existing implementation gaps (verified from repository review)
- [ ] Customer site is not yet the required Next.js application.
- [ ] Customer order/checkout flow is not fully persisted through the secure backend.
- [ ] Multi-item cart checkout must be connected as one transactional order with multiple order_items.
- [ ] Admin Android functionality is partial.
- [ ] Rider Android live GPS sharing and delivery OTP are incomplete.
- [ ] Razorpay production integration is not activated.
- [ ] Menu PDF import is blocked until owner supplies the actual PDF.
- [ ] Restaurant coordinates are unverified; delivery activation is blocked.
- [ ] GST/tax and other owner decisions remain pending.

## Phases
- [ ] Phase 2 — Database schema reconciliation and safe migrations.
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
- [ ] Customer website builds and passes responsive checks.
- [ ] Backup/restore strategy verified against the active Supabase plan.
- [ ] Final test report contains PASS/FAIL/BLOCKED for every test.

## Operating rule
Do not mark a task complete until the code/configuration exists and the relevant check has actually run. Do not apply the old draft SQL to the live database.

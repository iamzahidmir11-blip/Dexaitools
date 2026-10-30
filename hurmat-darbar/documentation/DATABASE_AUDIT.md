# Live Supabase Database Audit

Date: 2026-10-30
Project ref: `rvrboufrnkzuptfjopwd`
Scope: read-only inspection of the live public schema, RLS policies, key RPC definitions, and Supabase security advisors. No database writes or migrations were performed.

## Schema observed
The live project contains (among other tables) profiles, user_roles, restaurant_settings, menu_categories, menu_items, menu_variants, riders, orders, order_items, order_status_history, rider_locations, cash_collections, reservations, notifications, and audit_logs. RLS is enabled on the inspected public tables. This is materially different from the older repository draft migration; the draft must not be applied to production.

Notable live fields:
- `menu_items`: active/available, track_stock, stock_qty, needs_verification.
- `menu_variants`: item_id, label, price, active.
- `orders`: customer, address and coordinates, payment/status enums, subtotal/delivery_fee/total, rider_id, idempotency_key, tracking_token.
- `order_items`: order_id, item/variant references, item/variant name snapshots, unit_price, qty, line_total.
- `rider_locations`: order_id, rider_id, lat/lng, accuracy, created_at.
- `restaurant_settings`: single-row settings, nullable restaurant coordinates, location_verified flag, delivery radius/fee/minimum, COD/UPI flags.

## Current transactional order/cart behavior
The live `create_order(jsonb)` RPC:
1. Requires a non-empty items array (1–40 lines).
2. Resolves each line from an active menu variant and active/available item.
3. Validates quantity (1–50).
4. Creates one order and multiple order_items within one function transaction.
5. Uses a unique idempotency key when supplied.
6. Decrements stock_qty for tracked items during order creation.
7. Calculates subtotal and total server-side.

Therefore, the required multi-item cart can be implemented by sending all cart lines in one create_order request. Cart edits must remain local and must not change stock. The current RPC decrements stock at order creation; never add a second client/API decrement.

The current `update_order_status` RPC restores tracked stock when status changes to cancelled or rejected. There is no separate stock movement/restore ledger visible in the inspected schema. Restoration appears tied to status transition, but exactly-once behavior should be proven with concurrency/idempotency tests and preferably a dedicated inventory movement record before launch.

## Security advisor findings — action required
Supabase security advisors returned warnings for SECURITY DEFINER functions executable through the exposed public RPC surface:
- Anonymous role: `has_role(uid, roles)`, `track_order(p_token)`.
- Authenticated role: `assign_rider`, `create_order`, `handle_new_user`, `has_role`, `mark_cash_handed_over`, `mark_upi_paid`, `rider_post_location`, `rider_record_cash`, `track_order`, `update_order_status`.

These are warnings requiring function-by-function review, not proof that each function is exploitable. Several functions explicitly check `auth.uid()` and/or role/assignment in their bodies. However:
- `has_role(uid, roles)` accepts an arbitrary UID and returns a boolean. It should not be exposed as a general-purpose public role oracle; move internal authorization helpers to a non-exposed schema or restrict execution to the minimum required callers, then update dependencies safely.
- `track_order(p_token)` is a bearer-token endpoint and returns order details, item lines, customer/destination coordinates, rider name/phone and recent rider location. Review its exposure, token entropy/rate limits, returned personal data, and whether public tracking should return less data. Do not break customer tracking until a safer replacement is tested.
- SECURITY DEFINER functions must retain explicit authorization checks, a fixed safe search_path, and minimal EXECUTE grants. Do not blanket-revoke functions without mapping callers first.

## Other RLS observations
- RLS is enabled on inspected public tables.
- Orders have separate customer-owner, assigned-rider, and staff-read policies.
- Order item and status-history read policies depend on visibility of the parent order.
- Menu read policies expose active items/categories/variants; writes are role-gated.
- Reservation insert policy currently permits a pending reservation row without requiring a signed-in user; confirm that this matches the desired public booking flow and add abuse controls.
- Policy role targets are broadly recorded as `public`; predicates rely on `auth.uid()`/role checks. Review whether each policy should explicitly target `authenticated` or `anon` as appropriate.

## Configuration observations from current project review
- Restaurant coordinates are null and location_verified is false. Delivery must stay blocked until the owner verifies the pin.
- Existing project values observed previously include 5 km radius, ₹30 delivery fee, minimum order ₹0, delivery COD disabled, and UPI disabled. Confirm live values before changing them.
- Do not activate Razorpay, COD, UPI, tax, or delivery settings without owner authorization and verification.

## Required next work (no production changes made)
1. Export complete live schema and migration history; reconcile repository migrations against production.
2. Map all RPC callers in Edge Function, website, Admin Android, and Rider Android before changing grants.
3. Review/limit `has_role` and minimize public tracking payload while preserving tracking.
4. Add an inventory movement ledger with idempotent reserve/restore semantics, then test duplicate cancellation and concurrent orders.
5. Review reservation insert abuse controls and policy targets.
6. Re-run Supabase security/performance advisors after reviewed changes.

## Supabase platform note
The Supabase changelog reports that public tables are no longer automatically exposed through the Data API as of 2026-10-30; newly created tables need deliberate exposure/grants where required, with RLS enabled. Do not assume that adding a public table automatically makes it available through PostgREST.

## Verification status
- Live table/RLS metadata read: completed.
- Key RPC definitions read: completed.
- Security advisor scan: completed; warnings recorded above.
- Database writes/migrations: intentionally not performed.
- End-to-end tests: not run.


## Reservation and menu write-path audit — 2026-10-30

Scope: deployed Edge Function v4 source plus live reservation columns, constraints and triggers. Read-only; no production writes.

### Reservations
- Live columns: id, name, phone, party_size, reserve_at, notes, status, created_at.
- Status is constrained to pending, confirmed, rejected, cancelled.
- Checks constrain name (2–80), phone (10–20), party size (1–50), and notes (max 300).
- No non-internal triggers were found on reservations, menu_items or menu_variants in the live public schema.
- Deployed update_reservation_status handler permits owner/manager to set any of the four statuses directly by UUID. It does not enforce a transition graph, time-window conflict detection, affected-row verification, or audit logging.
- No visible capacity/slot-locking mechanism was found. Conflict prevention cannot be designed until the owner confirms seating capacity, reservation duration and operating-slot policy.
- Public reservation inserts remain a potential abuse surface; add rate limiting/abuse protection without assuming phone verification is configured.

### Menu writes
- Deployed update_menu_item and update_menu_variant handlers restrict callers to owner/manager and validate basic input types/ranges.
- They issue direct table updates and only inspect the returned error. They do not request a changed row, verify affected-row count, or write an audit log.
- No non-internal triggers were found on menu_items or menu_variants.
- RLS still applies through the caller JWT-scoped client. A zero-row update can currently return ok:true if PostgREST reports no error.
- Recommended: update with select(id), require exactly one returned row, and record a minimal audit event through a trusted role-checked database function or audited endpoint. Log changed field names and appropriate before/after values only; avoid unnecessary personal data.

### Safe next implementation gates
1. Owner confirms reservation capacity, duration, slot granularity, cancellation cutoff and overlap policy.
2. Define a transition matrix and audit requirements.
3. Design transactional capacity checks only after business rules are confirmed.
4. Update menu handlers to verify exactly one affected row and add audit logging.
5. Test missing IDs, wrong roles, nonexistent rows, invalid transitions, duplicate requests and concurrent bookings.
6. Keep production DDL and Edge Function deployment blocked until diffs are reviewed and explicitly authorized.

No production schema changes, data writes, Edge Function deployment, or live booking/menu mutations were performed.

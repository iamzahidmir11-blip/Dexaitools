# Admin Android — verified API contract and security review

Last reviewed: 2026-10-30

Live Supabase project inspection found the `restaurant-api` Edge Function ACTIVE at version 4 with platform JWT verification enabled. Its deployed source was retrieved and reviewed. The function creates a Supabase client using the caller's bearer token and publishable/anon key, calls `auth.getUser(token)`, reads active `user_roles`, and performs data queries with the caller's JWT context so RLS applies.

## Confirmed routes in deployed function v4

All requests require a valid Supabase user access token. The Edge Function uses a JWT-scoped client and publishable/anon key; never add a service-role key to this app.

| Operation | Route/action | Server role gate |
|---|---|---|
| List orders | `GET /functions/v1/restaurant-api` | owner, manager, kitchen, delivery_manager, rider |
| List menu | `GET ?view=menu` | owner, manager |
| List reservations | `GET ?view=reservations` | owner, manager |
| List riders | `GET ?view=riders` | owner, manager, delivery_manager |
| Update menu item | `POST { action: "update_menu_item", item_id, ...patch }` | owner, manager |
| Update menu variant | `POST { action: "update_menu_variant", variant_id, ...patch }` | owner, manager |
| Update reservation status | `POST { action: "update_reservation_status", reservation_id, status }` | owner, manager |
| Assign rider | `POST { action: "assign_rider", order_id, rider_id }` | owner, manager, delivery_manager |
| Change order status | `POST { action: "update_order_status", order_id, status, reason? }` | owner, manager, kitchen, rider; database RPC performs further checks |

Other deployed actions:
- `create_order` calls the `create_order` database RPC.
- `post_location` is rider-only and calls `rider_post_location`.
- `set_rider_availability` is rider-only and updates the rider's own online state.

## Current Admin app alignment

The current Kotlin activity calls the documented order, menu, rider and reservation views/actions. Its status controls and rider assignment use the documented action names. This is source-level alignment only; no Android build or device-level API test has been run in this session.

## Security observations requiring follow-up

1. **Reservation status transitions:** the deployed handler accepts `confirmed`, `rejected`, `cancelled`, and `pending` for any reservation UUID, then performs a direct table update. The handler does not itself enforce a transition matrix, conflict checks, or audit logging. Before treating reservation management as production-ready, enforce these rules transactionally in a database function or a tightly scoped server workflow.
2. **Menu edits:** the handler validates field types and bounds and relies on caller-context RLS for the table update. Verify affected-row counts and ensure menu changes are audited. Do not assume an `ok: true` response proves a row changed: the handler currently does not select/return the updated row.
3. **Order status:** the handler validates the status vocabulary and role gate, then delegates to `update_order_status`. The database RPC must remain the authoritative transition/assignment/stock guard. Test all role/status combinations and cancellation stock restoration before release.
4. **Rider assignment:** the handler validates UUIDs and delegates to `assign_rider`; verify the RPC checks approved/active rider, valid order state, and assignment audit trail.
5. **Rider data:** the `riders` view returns names, phone numbers, online state and last-seen timestamps to owner/manager/delivery_manager. Keep this view limited to those roles and avoid unnecessary display/logging of phone numbers.
6. **Error detail:** some RPC failures include the database error message in a `code` response field. Review whether those messages disclose internal schema details; prefer stable public error codes in production.
7. **CORS:** the function currently uses wildcard origin. This is not an authorization control; JWT and role checks remain mandatory. Consider a narrower browser-origin allowlist if browser clients are added.

## Required tests before release

- Owner, manager, kitchen, delivery-manager, rider and unauthorized customer accounts each tested.
- RLS prevents one restaurant's staff from reading another restaurant's records.
- Invalid and out-of-order status transitions are rejected.
- Cancellation/rejection restores tracked stock exactly once.
- Rider assignment rejects inactive/unapproved riders and invalid order states.
- Menu and reservation updates reject unauthorized roles and invalid input.
- Reservation double-booking and status transition behavior is tested transactionally.
- Expired token returns an authentication error and the app returns to sign-in.
- API errors are user-safe; no access token, phone/address data or secret is written to logs.
- Independent debug and release APK builds pass on Android Studio/Gradle.

## Current status

The deployed API supports more of the current Admin UI than the previous repository README described. Menu, rider and reservation list/action routes are present in live function version 4. However, the security observations above and all end-to-end tests remain open. No production function or database changes were made in this review.

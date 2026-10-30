# Admin Android — API integration contract

Last reviewed: 2026-10-30

This contract is based on the repository's documented deployed `restaurant-api` contract and the current Admin Android source. It is a gap-control document, not a claim that end-to-end tests have passed.

## Confirmed API actions in backend documentation

All requests require a valid Supabase user access token. The Edge Function uses a JWT-scoped client and the publishable/anon key; never add a service-role key to this app.

| Operation | Documented route/action | Required verification |
|---|---|---|
| List orders | `GET /functions/v1/restaurant-api` | Confirm response fields, pagination and RLS for owner/manager/staff |
| Create order | `POST { action: "create_order", order: {...} }` | Not an Admin UI requirement yet; verify server-side totals and stock behavior |
| Assign rider | `POST { action: "assign_rider", order_id, rider_id }` | Verify eligible roles, rider ownership and allowed order states |
| Change order status | `POST { action: "update_order_status", order_id, status, reason? }` | Verify transition matrix, cancellation reason and exactly-once stock restoration |
| Rider location | `POST { action: "post_location", order_id, lat, lng, accuracy? }` | Rider-only; Admin app must not impersonate this action |

## Admin app actions that are NOT documented as supported

The current Kotlin source references the following extra view/action names. They must not be treated as production-ready until the Edge Function implementation and database permissions are inspected and tested:

- GET query views: `menu`, `riders`, `reservations`
- POST actions: `update_menu_variant`, `update_menu_item`, `update_reservation_status`

Do not add optimistic success messages for these operations. Do not silently fall back to direct table writes from the APK. Add them only behind the authenticated shared API after server-side role checks, input validation, audit logging and RLS behavior are verified.

## Admin feature gates

1. **Orders:** show only fields actually returned by the API; handle empty, loading, expired-session and permission-denied states.
2. **Status workflow:** use only server-accepted transitions. A successful HTTP response is not a substitute for checking the returned order state.
3. **Rider assignment:** only offer riders returned by a verified owner/manager-scoped endpoint. Do not assume every rider row is assignable or online.
4. **Menu/inventory:** read and mutate through documented API endpoints only. Price and availability changes require audit records and server-side validation. Stock must not be edited by changing menu variant prices.
5. **Reservations:** status changes require a defined state machine and conflict/cancellation rules.
6. **Staff and reports:** require dedicated scoped endpoints; never expose broad profile, role, cash or audit tables to the client.
7. **Authentication:** use Supabase Auth access tokens; enforce role authorization on the server for every request. Hiding a button in Android is not authorization.

## Required tests before release

- Owner, manager, order-staff and unauthorized customer accounts each tested.
- RLS prevents one restaurant's staff from reading another restaurant's records.
- Invalid and out-of-order status transitions are rejected.
- Cancellation/rejection restores tracked stock exactly once.
- Rider assignment rejects inactive/unapproved riders and invalid order states.
- Expired token returns an authentication error and the app returns to sign-in.
- API errors are user-safe; no access token, phone/address data or secret is written to logs.
- Independent debug and release APK builds pass on Android Studio/Gradle.

## Current status

The Admin app is an early native Kotlin shell. Repository code exists for sign-in, order listing, status actions, rider assignment, menu and reservations screens. However, the extra menu/rider/reservation endpoints above are not in the backend's documented API contract, and no Android build or device test has been recorded in this session. Treat these capabilities as unverified until the Edge Function source and live role-scoped behavior are inspected.

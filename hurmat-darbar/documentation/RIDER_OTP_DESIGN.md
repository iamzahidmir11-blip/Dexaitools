# Rider Delivery OTP — implementation gate

## Current verified state
- The live `orders` table has no delivery OTP/hash, expiry, attempt counter, or verification timestamp columns.
- The current `update_order_status` RPC allows an assigned rider to transition an order to `delivered`; it does not require OTP verification.
- The current Rider app sends `update_order_status` directly through the authenticated Edge Function.
- The current `restaurant-api` Edge Function has no OTP issue or verify action.
- No verified customer SMS delivery provider/configuration is available in the project context.

## Required secure design before enabling delivery completion
1. Generate a cryptographically random, short-lived code on the server only. Never generate it in the Rider APK.
2. Store only a salted/hashed verifier, expiry, failed-attempt counter, verified timestamp and order binding. Never store or return the plaintext code in an API response, logs, or Rider app.
3. Deliver the code to the customer's verified phone using an owner-approved SMS provider. Do not use the rider's device as the delivery channel.
4. Verify through an authenticated server action with strict order/rider assignment checks, expiry, attempt limits, and one-time consumption.
5. Change the database transition workflow so `delivered` is rejected unless the same order has a valid, unused OTP verification. A UI-only check is not sufficient.
6. Add rate limits, audit events that exclude the code, resend cooldowns, and tests for wrong/expired/replayed codes and cross-order/cross-rider attempts.
7. Provide a safe exception workflow for customers who cannot receive SMS, with owner/manager authorization and an audit reason.

## Release blocker
Do not add a fake OTP field or accept a rider-entered code without server-side verification. Do not reveal OTPs in the Rider app, customer tracking page, API responses, or logs. Implementation is blocked until the owner selects/configures an SMS provider and approves the recovery policy. No production schema changes or live order mutations were made during this audit.

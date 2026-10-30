# Hurmat Darbar — Antigravity Requirements Gap Audit

Audit date: 2026-10-30
Repository: iamzahidmir11-blip/Dexaitools
Supabase project: hurmat-darbar (Mumbai)

## Source and scope
The exact original Google Antigravity master-prompt text was not recoverable from the available conversation record. This audit uses only the documented requirements from the prior project brief and the live repository/database inspection. It does not claim to be a word-for-word comparison with the missing prompt.

## Required architecture
- Customer-facing website: separate public website, not a customer Android app.
- Admin + Owner Android app: separate Android Studio project/APK.
- Delivery Rider Android app: separate Android Studio project/APK.
- One shared Supabase Auth/Postgres backend with role-based access and protected API.
- Never ship service-role keys, payment secrets, or privileged credentials in frontend code or APKs.

## Current status

### Customer website
- [x] Separate customer-facing website scaffold exists.
- [x] Live menu category/item read is connected to Supabase.
- [ ] Customer mobile OTP sign-in/verification is not implemented in the website.
- [ ] Customer cart, item quantity/customization, checkout, authenticated order creation, reorder and order history are not implemented.
- [ ] Reservation booking form is not implemented.
- [ ] Customer order tracking UI is not implemented, despite a database tracking RPC existing.
- [ ] Payment checkout and payment verification are not implemented.
- [ ] Customer notification preferences and support ticket flow are not implemented.
- [ ] Website deployment/live URL has not been verified.

### Admin + Owner Android app
- [x] Separate Android Studio project scaffold exists.
- [x] Email/password Supabase Auth request is implemented.
- [x] Orders screen and status-action UI are implemented in source.
- [x] Menu availability and variant-price edit UI are implemented in source.
- [x] Reservation list and pending confirm/reject UI are implemented in source.
- [x] Rider list and order assignment UI are implemented in source.
- [ ] Staff creation/role management/deactivation is not implemented.
- [ ] Owner-only finance, daily/weekly/monthly/yearly reports and exports are not implemented.
- [ ] Inventory/stock editing and low-stock alerts are not implemented.
- [ ] Support tickets, prep-time controls, opening hours/order limits, closures, reservations capacity/table allocation, attendance and maintenance mode are not implemented.
- [ ] App compilation, APK generation, device installation and real-account end-to-end testing have not been verified.

### Delivery Rider Android app
- [x] Separate Android Studio project scaffold exists.
- [ ] Rider authentication, assigned-order list, availability toggle, status actions, navigation, foreground location updates, delivery OTP/proof and delivery history are not implemented.
- [ ] Rider APK build and device testing are not verified.

### Shared backend and database
- [x] Supabase project is connected.
- [x] Live schema includes orders, order_items, user_roles, riders, order_status_history, rider_locations, notifications, audit_logs, menu tables, reservations, restaurant_settings and cash collections.
- [x] Existing database RPCs include create_order, assign_rider, update_order_status, rider_post_location and track_order.
- [x] Authenticated Edge Function restaurant-api is deployed and currently ACTIVE (version 3; JWT verification enabled).
- [ ] End-to-end tests with actual customer, owner, staff and rider accounts have not been run.
- [ ] SMS/WhatsApp provider, push notifications, realtime subscriptions and consent flows are not configured/verified.
- [ ] Daily backups, restore drill, retention policy and alerting are not verified.
- [ ] Payment gateway integration and webhook/signature verification are not implemented.

## Verified live data and configuration
- Menu categories: 18.
- Menu items: 159.
- Menu variants: 209.
- Current orders, reservations and rider rows: 0 at audit time.
- Restaurant coordinates are NULL and location_verified=false. This blocks the existing create_order RPC with delivery_area_unverified until the restaurant operator verifies coordinates.
- Configuration was aligned to the documented project requirements: delivery radius 5,000 m; delivery fee ₹30; COD disabled; UPI disabled pending a verified payment setup. Minimum order remains ₹0 because no approved minimum was supplied.
- Payment collection is not enabled. Do not enable UPI/live payments until the restaurant operator completes provider onboarding and tests.

## Important security findings
Supabase Security Advisor currently reports:
- One SECURITY DEFINER view finding: public.kitchen_queue.
- Two functions with mutable search_path: distance_m and can_transition.
- Three SECURITY DEFINER functions executable by anon: create_order, has_role and track_order.
- Ten SECURITY DEFINER functions executable by authenticated users, including order/payment/rider RPCs.
These require a careful least-privilege review against intended public customer tracking/order behavior before changing grants or function security. No broad privilege changes were made during this audit.

Performance Advisor reports unindexed foreign keys, RLS auth init-plan warnings and multiple permissive policy warnings. These should be handled in a dedicated reviewed database migration after correctness/security testing.

## Operational blockers before launch
1. Restaurant operator must verify exact map pin/coordinates; delivery ordering remains blocked until location_verified=true.
2. Confirm/configure customer phone OTP provider.
3. Confirm payment provider and complete test-mode integration before live payment activation.
4. Owner/authorized operator must create and assign the first owner/admin/rider accounts and verify roles.
5. Confirm actual restaurant menu/prices and clear needs_verification flags only after owner review.
6. Review privacy, terms, delivery, refund and cancellation policies with the restaurant operator.
7. Build and test all Android projects; run end-to-end test scenarios before production launch.

## Do not treat as complete
The repository contains working foundations and some admin/backend code, but this system is NOT production complete. A live menu read, Edge Function deployment or source-code commit is not proof that customer ordering, payments, rider operations or APKs work end-to-end.

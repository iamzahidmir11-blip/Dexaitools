# Hurmat Darbar — Target Architecture

## Product boundary (fixed)
This system contains exactly three client applications:
1. **Customer website** — responsive Next.js web application. There is no separate customer Android app.
2. **Owner/Admin Android app** — native Kotlin Android Studio project and independently installable APK.
3. **Delivery Rider Android app** — a separate native Kotlin Android Studio project and independently installable APK.

All three clients use one shared backend API and one Supabase PostgreSQL database. The Admin and Rider Android projects must remain separate. Do not add a fourth customer app.

## Existing repository baseline
The repository already contains a static customer site, separate Admin and Rider Kotlin projects, a backend README describing a Supabase Edge Function, and an older draft SQL migration. The draft migration is not the live schema and must not be applied to the production Supabase project without reconciliation. Existing code is to be preserved and incrementally improved; no wholesale replacement is authorized by this plan.

## Shared platform
- Supabase PostgreSQL is the system of record.
- Supabase Auth identifies customers, owners, staff, and riders.
- Row Level Security and server-side role checks enforce least privilege.
- A single versioned backend API/Edge Function is the trusted boundary for order creation, payment verification, assignment, status transitions, stock operations, and other privileged workflows.
- Realtime is used for order and operational updates, subject to authorization.
- Never ship a Supabase service-role key, Razorpay secret, webhook secret, or provider credential in a website or APK.
- Every sensitive admin action is attributable in an audit log.

## Application responsibilities

### 1. Customer website (Next.js target)
Pages and flows: Home, Menu, categories, item detail, multi-item cart, checkout, customer OTP sign-in, profile, saved addresses, order history, live order tracking, reorder, reservations, events, offers/coupons, loyalty, contact/support, and legal pages.

Cart rules:
- A cart contains multiple distinct menu lines, each with a quantity and selected valid variants/add-ons.
- Plus/minus changes quantity; zero removes the line. Clear-cart is explicit.
- Subtotal and item count recalculate from the cart.
- Checkout submits the complete cart once, creating one order with multiple order_items.
- Cart edits never alter stock.
- Stock reservation/deduction and cancellation restoration must be atomic and exactly-once. The current create_order RPC decrements stock at order creation; do not add a second deduction in another layer. Rework this only with a reviewed transaction/ledger design.

### 2. Owner/Admin Android app
Native Kotlin project, separate from Rider. Owner/Admin/staff access is role-scoped. Modules: dashboard, orders, menu, customers, rider assignment, reservations, events, coupons/offers, loyalty, staff/attendance, inventory, expenses, reports, payment reconciliation, support tickets, notifications, content/settings, maintenance mode, audit/security logs. Financial reports are restricted to Owner/Admin. Sensitive actions are logged.

### 3. Delivery Rider Android app
Native Kotlin project, separate from Admin. Rider sees only assigned orders; can go online/offline, view pickup and delivery details, navigate, update permitted statuses, share location only with permission, confirm delivery with OTP, and review delivery history. If no rider is available, the order remains awaiting assignment and Admin is alerted.

## Backend workflows
- Customer order creation validates authentication, address/location, service radius, menu item/variant availability, prices, and payment mode server-side.
- One checkout request creates one order and its order_items in a single database transaction.
- Admin assignment validates role, rider eligibility, and order state.
- Rider status/location updates validate that the authenticated rider is assigned to that order.
- Delivery OTP is generated and verified server-side; never trust a client-only success flag.
- Razorpay starts in test mode. Verify signatures and webhooks server-side; maintain reconciliation/refund records. Do not store card/CVV data.
- Reservations use a transaction/constraint strategy to prevent double booking. Duration and cancellation cutoff remain configurable only after owner confirmation.
- Ingredient deductions require verified recipes and quantities. Never infer recipes or stock quantities.

## Current known configuration and blocked activation
- Restaurant: Hurmat Darbar, Opposite Tehsil, Uri, Jammu and Kashmir 193123.
- Hours: daily 9:00 AM–11:00 PM.
- Delivery radius: 5 km; configured delivery fee: ₹30; current minimum order: ₹0.
- Current restaurant location is not verified (coordinates are null); delivery must remain safely blocked until owner verifies coordinates and delivery zones.
- COD for delivery and UPI are currently disabled in the existing settings. Do not enable payment modes without owner authorization and tested configuration.
- One rider is currently known. Do not create fictitious rider accounts.
- GST/tax status, minimum order, free-delivery threshold, delivery villages, takeaway cash policy, reservation duration/cutoff, WhatsApp enablement, and retention policy require owner/accountant confirmation.

## Menu data integrity
The owner-provided menu PDF is the source of truth for menu names, prices, descriptions, variants, add-ons, dietary labels, and ingredients. No menu PDF was available during this audit. Do not invent menu entries, prices, ingredients, or item-specific claims. Imported records must be reviewed by the owner before publication. Existing generic/category-shared image assignments are temporary and must not be presented as verified photos of the restaurant's dishes.

## Deployment shape
- Customer Next.js website: separate web deployment.
- Backend API: separate deployment/Edge Function surface.
- Admin Android: separately built APK.
- Rider Android: separately built APK.
- Supabase: shared database/auth/realtime.
Use placeholders in .env.example. Keep secrets only in managed server-side secret storage.

## Required verification before launch
Typecheck/lint/build for web; Android debug/release builds for both apps; auth and role isolation; multi-item cart and single-order checkout; inventory atomicity and exactly-once restoration; Razorpay test signature/webhook/reconciliation; reservation concurrency; rider assignment and OTP; location permissions; support/refund workflow; report accuracy; RLS/security review; backup/restore verification; mobile and accessibility checks. Report each test as PASS, FAIL, or BLOCKED. Never label unrun tests as passed.

## Phase plan
1. Audit existing code and document architecture (in progress).
2. Reconcile live database schema; write safe additive migrations.
3. Complete backend auth, RBAC, transactional order/payment/inventory workflows.
4. Build customer Next.js site and import reviewed menu data.
5. Complete Admin Android app.
6. Complete Rider Android app.
7. Integrate Razorpay test mode and reconciliation.
8. Reservations, support, loyalty, and notifications.
9. Inventory, expenses, reports, and exports.
10. Security, end-to-end testing, deployment, and handover.

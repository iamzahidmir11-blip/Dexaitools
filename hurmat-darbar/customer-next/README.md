# Hurmat Darbar Customer Website (Next.js)

This is the new customer-facing web application. The existing production static website remains untouched until this app passes build, data, checkout, and owner acceptance tests.

## Stack
- Next.js App Router 16.4.3 / React 19
- Supabase publishable key only in browser-safe environment variables
- Live menu reads from `menu_categories`, `menu_items`, and `menu_variants`

## Run locally
1. Copy `.env.example` to `.env.local`.
2. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the Supabase project settings.
3. Run `npm install`, then `npm run dev`.
4. Run `npm run build` before deployment.

Never add a Supabase service-role/secret key to this app. Menu visibility is still controlled by RLS and the active/available flags. The current page intentionally does not submit orders yet: checkout must be connected to the existing validated `create_order` RPC through the authenticated backend flow, not direct client-side inventory writes.

## Release blockers
- Verify all menu names, prices, descriptions, and photos with the owner's original menu source.
- Implement and test one-order/multi-line checkout, idempotency, address validation, tracking, and reservation submission.
- Confirm delivery coordinates/radius and payment policy before enabling delivery or online payment.

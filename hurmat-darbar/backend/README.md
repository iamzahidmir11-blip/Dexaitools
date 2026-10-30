# Backend integration

The project uses Supabase PostgreSQL as the shared source of truth for the customer website, Admin Android app and Delivery Android app.

## Setup
1. Create a Supabase project owned by the restaurant operator.
2. Apply `../database/migrations/001_initial_schema.sql` in the Supabase SQL editor.
3. Keep the service-role key server-side only. Never put it in the website or Android APK.
4. Configure authentication, server-side order/payment endpoints, Razorpay webhooks and notification providers before accepting live orders.

## Current status
Database schema foundation is committed. There is no live Supabase project connection or deployed API configured in this repository yet. Do not represent ordering, payments, OTP or live tracking as operational until configured and tested.

# Pending Database Migrations

The application requires the following database changes to function. Please apply these migrations in your Supabase SQL Editor.

## 1. Ledger System (Critical)
File: `supabase/migrations/20260124000000_add_ledger_tables.sql`
- Creates `ledger_accounts` and `ledger_entries` tables.
- Creates `deposit_addresses` table for TRON system.
- Adds `credit_deposit` and `lock_funds` RPC functions for atomic transactions.

## 2. Exchange & Payout System
File: `supabase/migrations/20260125000002_add_exchange_system.sql`
- Creates `exchange_orders` table for USDT->INR swaps.
- Creates `payout_logs` for bank transfer tracking.
- Adds RLS policies for security.

## 3. KYC & User Schema
File: `supabase/migrations/20260125000003_ensure_kyc_status.sql`
- Adds `kyc_status` column to `users` table.
- Adds Razorpay contact fields (`razorpay_contact_id`, `razorpay_fund_account_id`).
- Ensures `is_admin` column exists.

## Verification
After applying these migrations, run the audit script to verify the system:
```bash
cd server
node audit_verify.js
```

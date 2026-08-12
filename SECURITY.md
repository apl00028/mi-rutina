# GymOS v3.7.0 — Security checklist

This release adds the account and authentication foundation. It is not yet the
final Google Play production release.

## Required before public deployment

1. Create a Supabase project and run `database/supabase/schema.sql`.
2. Enable email/password authentication.
3. Configure Google OAuth only after setting the correct Android/web redirect URLs.
4. Use only the Supabase publishable or anon key in the client.
5. Never commit a secret key or service-role key.
6. Keep OpenAI credentials only in the backend environment.
7. Test Row Level Security using two separate test accounts.
8. Confirm that account A cannot select, update or delete account B data.
9. Add rate limiting and authenticated requests to the Coach backend before public launch.
10. Publish a privacy policy and a web account-deletion page before Google Play release.

## Isolation test

Create users A and B. Insert a different `gymos_sync` row for each account.
While authenticated as A, attempts to read or modify B's UUID must return no
rows or a permission error. Repeat in the opposite direction.

## Current architecture

The current cloud record is one encrypted-transport JSON payload per user.
RLS isolates rows by `auth.uid()`. A later database release can normalize
workouts, nutrition and health into separate tables without changing the
account identity model.

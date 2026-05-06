# Project Controls System

Connected to Supabase project: **ookeknlxwixpehsbguze**
URL: https://ookeknlxwixpehsbguze.supabase.co

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:3000
#    You will be redirected to /login
#    Sign in with a user you created in Supabase Dashboard → Auth → Users
```

## Before running — Supabase setup checklist

- [ ] Run `supabase/project_controls_schema.sql` in Supabase SQL Editor
- [ ] Run `storage-buckets.sql` in Supabase SQL Editor  
- [ ] Create at least one user in Supabase Dashboard → Authentication → Users
- [ ] Run this SQL to assign that user to the seed project:

```sql
INSERT INTO public.users (id, email, full_name, role)
SELECT id, email, email, 'Admin'
FROM auth.users
WHERE email = 'your@email.com'
ON CONFLICT (id) DO UPDATE SET role = 'Admin';

INSERT INTO public.project_users (project_id, user_id, role)
SELECT p.id, u.id, 'Admin'
FROM public.projects p, public.users u
WHERE p.project_code = 'GN' AND u.email = 'your@email.com'
ON CONFLICT (project_id, user_id) DO NOTHING;
```

## Deploy Edge Function

```bash
npx supabase login
npx supabase link --project-ref ookeknlxwixpehsbguze
npx supabase functions deploy generate-certificate
```

## Type check

```bash
npm run typecheck
```

## Project structure

```
src/
├── app/
│   ├── layout.tsx              Root layout (providers)
│   ├── page.tsx                Redirects to /dashboard
│   ├── login/page.tsx          Login page (password + magic link)
│   ├── dashboard/page.tsx      Main dashboard (live Supabase data)
│   └── auth/callback/route.ts  Email confirmation handler
├── hooks/
│   ├── useAuth.ts              Auth context + sign in/out
│   ├── useProject.ts           Active project context
│   └── queries/index.ts        All 10 data hooks
├── lib/
│   ├── query-keys.ts           React Query cache keys
│   ├── query-provider.tsx      React Query setup
│   └── supabase/
│       ├── client.ts           Browser client
│       ├── server.ts           Server client
│       ├── admin.ts            Service role client
│       ├── helpers.ts          unwrap / error helpers
│       └── storage.ts          File upload helpers
└── types/
    ├── database.ts             All table/view TypeScript types
    └── certificate-engine.ts   Subcontractor Invoice engine types

supabase/functions/
├── _shared/
│   ├── types.ts
│   ├── cors.ts
│   └── engine.ts               Pure calculation logic
└── generate-certificate/
    └── index.ts                Edge Function handler

middleware.ts                   Auth guard (project root)
.env.local                      Credentials (never commit)
```

## V138 Approval Matrix

V138 adds a full Approval Matrix + Assigned Reviewers / Approvers system. See `V138_APPROVAL_MATRIX.md` and run `database/SUPABASE_V138_APPROVAL_MATRIX.sql` in Supabase.

## SQL Fix 42P16 — View column type compatibility

If Supabase shows:

`ERROR: 42P16: cannot change data type of view column "total_contract_value" from numeric to numeric(18,2)`

use the updated `database/SUPABASE_SETUP_BUNDLE.sql` in this package. It now drops and recreates project views before defining them, which avoids PostgreSQL's `CREATE OR REPLACE VIEW` column type limitation.

Alternative: run `database/SQL_FIX_42P16_DROP_VIEWS_BEFORE_BUNDLE.sql` once, then rerun `database/SUPABASE_SETUP_BUNDLE.sql`.

## V139 — Certificate Release Workflow by Users / Emails

Run `database/SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql` after V138 to enable the subcontractor invoice release workflow with frozen user/email assignments, maker-checker protection, mandatory rejection/return reasons, and return-to-originator resubmission.

## V139 Release Subcontractor Invoice Fix

Run `database/SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql` after the V139 migration to fix Release Subcontractor Invoice, freeze approval users/emails, block non-draft deletion, and support CEO partial/held payment decisions. See `V139_RELEASE_SUBCONTRACTOR_INVOICE_FIX.md`.

# CashApply Frontend — Setup & Testing Guide

This is your original `ss2/` UI plus the missing Next.js project scaffold
(`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.js`,
`postcss.config.js`) and the wiring needed to actually exercise the
backend's new auth/RBAC/duplicate-detection features. It has been installed
and production-built successfully in a clean environment (`npm install &&
npm run build` — zero errors) as part of preparing this delivery.

## What changed vs. the original `ss2/` you gave me

- **`lib/api.ts`** — every request now sends the existing login cookie
  (`login_user_email_stub`, already set by `app/page.tsx`'s sign-in form) as
  an `X-Dev-User` header. This is what the backend's dev SSO bypass reads
  (see backend design doc §1.3) — the login screen was previously
  decorative (no backend auth existed); now it's a real, working local
  identity. A 401 response redirects back to `/`. Added `getMe()` and
  `getIngestStatus()`.
- **`app/layout.tsx`** — header now shows the role the backend actually
  resolved for the current user (fetched from `/api/auth/me`), so it's
  obvious during testing which permission set is in effect.
- **`app/page.tsx`** — comment update only, clarifying the cookie's real
  role now; no behavior change.
- **`app/home/page.tsx`** — upload flow now handles the two new backend
  response shapes: an actionable duplicate-file banner (§2.1) with a link
  to the existing run, and polling for `ingest_status` per file
  (Processing → Ready, with new/duplicate row counts) instead of assuming
  the file is immediately analyzable.
- **`app/analysis-history/page.tsx`, `app/shortage-review/page.tsx`** —
  unrelated pre-existing build bug fixed (`useSearchParams()` needs a
  `Suspense` boundary for static export in this Next.js version) — this was
  already broken in what you gave me, not something the backend work
  introduced; fixed it since it blocked `npm run build`.
- **New project scaffold files** (`package.json`, `tsconfig.json`,
  `next.config.js`, `tailwind.config.js`, `postcss.config.js`,
  `next-env.d.ts`) — the zip I received didn't include these, so the app
  couldn't `npm install`/build at all before.

## 1. Install & run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Requires the backend running at
`http://localhost:8000` (see the backend zip's own README) — `lib/api.ts`
hardcodes that base URL, same as your original.

## 2. Log in via the dev bypass

The login screen still just takes an email (no real password check — same
as before). Use one of the emails you seeded on the backend:

```bash
# on the backend, if you haven't already:
python3 -m scripts.seed_rbac --dev-user admin@example.com --dev-role Administrator
python3 -m scripts.seed_rbac --dev-user analyst@example.com --dev-role Analyst
```

Sign in with `admin@example.com` — the header should show a role badge
reading **ADMINISTRATOR** within a second (fetched live from `/api/auth/me`).
Sign out, sign back in with `analyst@example.com` — badge should read
**ANALYST**.

If the email you type isn't a seeded user, every API call will 401 and
you'll be bounced back to `/` — that's the interceptor in `lib/api.ts`
working as intended, not a bug.

## 3. Test duplicate-file detection in the UI

1. Sign in as `analyst@example.com`.
2. On the Home page, upload any bank statement file.
3. Upload the **exact same file again**. You should see an amber banner:
   *"... was already uploaded by analyst@example.com on ... — View existing
   run →"* — not a generic error toast.

## 4. Test the processing → ready flow

After a non-duplicate upload, the file row should show a blue **Processing**
badge, then flip to a green **Ready (N new)** badge within a few seconds
(this depends on the backend's procrastinate worker process actually
running — see the backend README §7). If you uploaded a statement with
overlapping rows from a prior file, the badge's tooltip / the success toast
will show how many duplicate rows were skipped.

## 5. Test role-gated actions

Sign in as `analyst@example.com` and try to approve a HITL row — the
Approve button calls `/api/hitl/approve/{id}`, which now requires
`oracle:post`. Analyst doesn't have it, so this should surface a 403 error
toast. Sign in as `admin@example.com` (has `*`) and the same action should
succeed.

## 6. What's NOT done here (being upfront)

- **No real Azure MSAL integration.** This wiring is the *local test path*
  only (X-Dev-User header). Production Azure Entra ID login (MSAL redirect
  flow, real bearer tokens, no password field) is a separate, not-yet-built
  piece — say the word and I'll build `app/page.tsx`'s real-SSO version next.
- **No hard gate on "Start Analysis" until ingest_status is ready.** The
  badge shows status, but the button isn't disabled while processing — the
  backend will just find zero unconsumed rows for a file still mid-ingest,
  which is safe but not the smoothest UX. Easy follow-up if you want it.
- **`version_conflict` (optimistic locking) isn't specifically surfaced in
  the UI yet** — it'll show as a generic error toast via the existing catch
  block, not a dedicated "someone else already acted on this row, refresh"
  message.
- **`app/activity-log/page.tsx` still isn't wired to the real
  `/api/activity-log` endpoint** — it was already on mock data before this
  change and I left it that way to keep this delivery scoped; the backend
  route is ready whenever you want that page wired up.

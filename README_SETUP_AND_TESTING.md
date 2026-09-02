# CashApply Frontend — Setup & Testing Guide

Next.js (App Router) frontend for CashApply. Talks to the backend over
`NEXT_PUBLIC_API_BASE_URL`, using either a local dev-bypass login (no real
Azure needed) or real Azure AD SSO via MSAL depending on
`NEXT_PUBLIC_APP_ENV`.

Follow this top to bottom on a clean checkout, with the backend already
running (see `cashapply_backend/README_SETUP_AND_TESTING.md`), and you'll
have a working local instance you can log into.

## Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node.js | **24** | `node -v`. Node 20+ should work (see `@types/node` in `package.json`), but 24 is what this checkout was verified against. |
| npm | **11** | `npm -v`. Ships with Node 24. |
| Backend | running first | See `cashapply_backend/README_SETUP_AND_TESTING.md` — the frontend has nothing to talk to without it. |

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

```bash
copy .env.example .env.local        # Windows
cp .env.example .env.local          # macOS/Linux
```

Then edit `.env.local`:

- **`NEXT_PUBLIC_API_BASE_URL`** — leave as `http://localhost:8000` if the
  backend is running locally on the default port.
- **`NEXT_PUBLIC_API_ENCRYPTION_KEY`** — **must exactly match** the
  backend's `API_ENCRYPTION_KEY` for the same environment (backend README
  §4). The example file ships a sample value that matches
  `backend.env.local.example`'s intended pairing — but that file doesn't
  actually define `API_ENCRYPTION_KEY`, so generate a real pair instead of
  relying on the sample:
  ```bash
  cd ../cashapply_backend
  python -m scripts.gen_api_key
  ```
  Copy the `API_ENCRYPTION_KEY=...` line into the backend's `.env` and the
  `NEXT_PUBLIC_API_ENCRYPTION_KEY=...` line into this file's `.env.local`.
  **This value is inlined at build time** — changing it means restarting
  `next dev` (dev server re-reads env on restart) or rebuilding for
  production. If you'd rather run plaintext locally, leave this blank
  **and** set `API_ENCRYPTION_ENABLED=false` on the backend — changing only
  one side breaks every request.
- **`NEXT_PUBLIC_APP_ENV`** — leave as `local`. This selects the
  `X-Dev-User` cookie bypass login screen instead of real MSAL Azure
  sign-in (see §5 for switching to real Azure SSO).
- Azure SSO variables (`NEXT_PUBLIC_AZURE_*`) — leave commented out/blank
  for local dev; only needed when `NEXT_PUBLIC_APP_ENV` is `uat` or `prod`.

## 3. Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 4. Log in via the dev bypass

The login screen takes an email (no password — this is the local test
path only). Use one of the users seeded on the backend
(`cashapply_backend/README_SETUP_AND_TESTING.md` §6), e.g.:

```bash
# on the backend, if you haven't already:
python -m scripts.seed_rbac --dev-user you@example.com --dev-role Administrator
```

Sign in with `you@example.com` — the header should show a role badge
(e.g. **ADMINISTRATOR**) within a second, fetched live from
`/api/auth/me`. If the email isn't a seeded user, every API call 401s and
you're bounced back to `/` — that's `lib/api.ts`'s interceptor working as
intended, not a bug.

## 5. Testing flows

**Duplicate-file detection:**
1. Sign in, go to Home, upload any bank statement file.
2. Upload the **exact same file again** — expect an amber banner: *"...
   was already uploaded by ... on ... — View existing run →"*, not a
   generic error toast.

**Processing → ready flow:**
After a non-duplicate upload, the file row should show a blue
**Processing** badge, then flip to a green **Ready (N new)** badge within
a few seconds — this needs the backend's worker process actually running
(backend README §8, terminal 2). If a prior statement had overlapping
rows, the badge/tooltip shows how many duplicate rows were skipped.

**Role-gated actions:**
Sign in as a user with only the Analyst role and try to approve a HITL
row — the Approve button calls `/api/hitl/approve/{id}`, which requires
`oracle:post` (Analyst doesn't have it) — expect a 403 error toast. Sign
in as an Administrator (`*`) and the same action should succeed. See
`RBAC_AND_LOGGING.md` (backend repo) for the full permission matrix.

**RBAC page guards:**
Every page calls a permission guard and shows a clean "access denied"
message instead of its content if the signed-in user's role(s) lack that
permission — try navigating directly to a page your test user shouldn't
have (e.g. Users tab as a non-Administrator).

## 6. Real Azure AD SSO (UAT/prod)

The dev-bypass login above is local-only. For real "Sign in with
Microsoft" via MSAL — environment variables, Azure App Registration
checklist, and how the pieces fit together — see `AZURE_SSO_SETUP.md` in
this repo.

## 7. Production build

```bash
npm run build
npm run start
```

`npm run build` should complete with zero errors on a clean checkout — if
it doesn't, that's a real regression, not an expected gap.

## 8. Lint / type-check

```bash
npm run lint
npx tsc --noEmit
```

## 9. Known gaps

- **`app/activity-log/page.tsx`** — confirm against the backend's
  `/api/activity-log` route before relying on it; historically this page
  lagged the real endpoint during earlier deliveries.
- **No automated frontend test suite** — testing today is the manual flow
  in §5 plus `npm run build` / `npm run lint` / `tsc --noEmit` as
  correctness gates.

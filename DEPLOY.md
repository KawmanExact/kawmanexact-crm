# Deploying Kawman ExAct

This app is now wired to a **real Postgres database (Neon)** and **real
authentication (better-auth)**. Every page that used to read from a
hardcoded mock array now reads from Prisma, scoped to your logged-in
organization. Here's how to get it live.

## 1. Create your database (Neon)

1. Go to https://neon.tech and create a free project.
2. Copy the **pooled** connection string it gives you → paste it into
   `DATABASE_URL` in `.env` (or your host's env var settings).
3. Copy the **direct** (non-pooled) connection string → paste it into
   `DIRECT_URL`. Prisma needs this one to run migrations.

## 2. Generate the Prisma Client & run migrations

These need real internet access to Prisma's CDN, which this build
sandbox didn't have — run them yourself locally or in your deploy
pipeline (Vercel/Railway/etc. do this automatically on `npm install`
if you add a `postinstall` script, or just run manually):

```bash
npm install
npm run db:generate     # generates the Prisma Client from schema.prisma
npm run db:migrate      # creates the tables in Neon (dev-friendly)
# or, for a production deploy pipeline:
npm run db:deploy       # applies existing migrations, no prompts
```

The first `db:migrate` will ask you to name the migration (e.g. `init`).

## 3. Seed some starter data (optional but recommended)

```bash
npm run db:seed
```

This creates one demo organization ("Kawman ExAct Ingredients Pvt.
Ltd.") with 4 users, 6 companies, contacts, 10 leads, 8 deals, a few
follow-ups, today's field visits, and a completed meeting with an AI
summary — enough for the dashboard to show real, non-zero numbers.

Login with any of:
- `admin@kawmanexact.com` (Super Admin)
- `manager@kawmanexact.com` (Sales Manager)
- `rahul@kawmanexact.com` / `sneha@kawmanexact.com` (Sales Executives)
- Password for all: `Password123!`

**Change these passwords (or delete these users) before going live.**
Real signups don't need seeding — anyone can create their own
workspace at `/signup`, which creates a fresh Organization + admin
user with no demo data.

## 4. Set the remaining env vars

- `BETTER_AUTH_SECRET` — a random 64-char hex string (`openssl rand -hex 32`). One is already filled in for local dev; **generate a new one for production**.
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — your deployed URL (e.g. `https://your-app.vercel.app`). For the Vercel deployment this MUST be
  `https://kawman-dashboard.vercel.app` (no trailing slash), otherwise
  password-reset links point back at `localhost` instead of the live app.
- `SMTP_HOST`, `SMTP_PORT` (default `465`), `SMTP_USER`, `SMTP_PASS`,
  `EMAIL_FROM` — Zoho Mail SMTP credentials. `EMAIL_FROM` must be the same
  mailbox as `SMTP_USER`; use an app-specific password if 2FA is on. Use
  `smtp.zoho.com` instead of `smtp.zoho.in` when the Zoho account is on the
  US data center. Without these, password-reset and invite emails fall back
  to server-console logging and are **not** delivered.

Everything else in `.env.example` (AI keys, Cloudinary, Mapbox, Redis)
is optional — those power modules (AI insights, file uploads, maps,
background jobs) that aren't built yet (see "What's not built" below).
Leave them blank and the app runs fine without them.

## 5. Deploy

Any Node host that supports Next.js works (Vercel is the path of
least resistance). Set the env vars above in your host's dashboard,
point it at this repo, and deploy. Add `prisma generate` to your
build/postinstall step if your host doesn't already run it.

> **Install on Vercel:** If the install step fails with `ERESOLVE`,
> set the **Install Command** in the Vercel project settings (Project
> Settings → General → Build & Deployment → Build Settings) to
> `npm install --legacy-peer-deps`. This is required because
> `samai-sdk@0.3.5` carries an optional peer dep on
> `@anthropic-ai/sdk@^0.30` while this project depends on `^0.128`.
> The `postinstall` script (`puppeteer browsers install chrome`) is
> also skipped by `--ignore-scripts`; you can keep the default install
> command if you prefer to pre-install Chrome separately.

---

## What's real now

- **Auth**: email/password via better-auth, sessions in Postgres, signup creates a new Organization + admin user.
- **Authorization**: every Server Action checks the caller's actual DB-resolved permissions (`lib/session.ts`, `services/permission.service.ts`) — never trusts the client.
- **Dashboard**: every KPI, the pipeline funnel, lead sources, follow-ups, recent activity, and field-activity counters are live aggregate queries against your data — no hardcoded numbers.
- **Leads / Companies / Contacts / Deals**: full create, read, update (leads), delete, all scoped to your organization. The deals kanban board writes stage changes to the DB when you drag a card.
- **Lead → Deal conversion**: a real workflow, not a mock button.
- **Notifications**: read from the DB, not hardcoded.
- **Admin panel** (`/admin/*`):
  - **Users** — add users (with a one-time temp password), edit role/department/team/status, remove users. Real audit trail on every change.
  - **Roles & Permissions** — the 9 system roles are fixed, but exactly which permissions each one grants is fully editable via a live permission matrix (toggling writes to the DB immediately, with optimistic UI + rollback on failure).
  - **Departments / Teams** — create, assign managers, delete.
  - **Organization** — edit your workspace's profile (name, industry, contact info, timezone, currency).
  - **Settings** — see and revoke your own active login sessions.
  - **Storage** — real usage numbers from the `File` table (will show data once the Files module below is built).
  - **Audit Logs** — every login, role change, permission change, and admin action is actually written to `AuditLog` and shown here — not sample data.
  - **Admin Dashboard** — live counts (users, departments, teams) and role breakdown.

## What's not built yet (still scaffolded UI / nav links only)

Per the original README, these were never implemented. Say the word
and I'll keep going module by module:

- Field sales live map with real map tiles + geofencing enforcement
- Meetings (recording upload, transcription, AI-generated MoM)
- File management (Cloudinary upload/sharing/permissions) — once this exists, the Storage admin page above will show real data
- AI chat / AI-generated reports (the dashboard's "AI insights" are
  real deterministic stats computed from your data today, not an LLM
  call — wiring an actual model in is the next step if you want it)

---

## Zoho Sign-In (optional SSO)

For company employees whose Zoho Mail account is on the same data center.
Only **existing** `@kawmanexact.com` users in the database can sign in —
no new users are created (the provider runs with `disableSignUp: true`).

### 1. Register the application in the Zoho API Console

1. Go to the API Console for your Zoho data center:
   - **IN** (India): https://api-console.zoho.in
   - **US**: https://api-console.zoho.com
2. Click **Add Client** → choose **Server-based Application**.
3. Fill in:
   - **Client Name**: `Kawman ExAct` (or any name you like)
   - **Homepage URL**: your app URL, e.g. `https://kawman-dashboard.vercel.app`
   - **Authorized Redirect URI**: `https://kawman-dashboard.vercel.app/api/auth/callback/zoho`
4. Leave **JavaScript Domain** empty, **JavaScript Key Type** unchecked.
5. Click **Save** and copy the generated **Client ID** and **Client Secret**.
6. In the Zoho app's **Scopes** tab, add: `openid`, `profile`, `email`.

### 2. Set the environment variables

| Variable | Value (IN data center) | Notes |
|---|---|---|
| `ZOHO_CLIENT_ID` | (from Zoho console) | Leave blank to hide the Zoho button |
| `ZOHO_CLIENT_SECRET` | (from Zoho console) | Treat as a secret — never commit |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zoho.in` | Use `https://accounts.zoho.com` for US DC |
| `ALLOWED_EMAIL_DOMAIN` | `kawmanexact.com` | Only this domain can sign in |
| `NEXT_PUBLIC_ZOHO_LOGIN_ENABLED` | `true` | Toggles the button client-side |

> **Data-center note:** The client only works on the data center where it
> was created. `ZOHO_ACCOUNTS_URL` must match, and the redirect URI
> registered with Zoho must use the same `BETTER_AUTH_URL` value.

> **Vercel redeploy:** `NEXT_PUBLIC_*` variables are baked in at build
> time. Changing `NEXT_PUBLIC_ZOHO_LOGIN_ENABLED`, `NEXT_PUBLIC_APP_URL`,
> or `BETTER_AUTH_URL` requires a new deployment.

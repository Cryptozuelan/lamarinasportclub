# Deploying La Marina Americanos on Dokploy (Postgres)

Deploys the app on our Dokploy server (`76.13.24.31`) using the existing Lyria Postgres (`sales_agent`) instead of Supabase. Staff log in with their PadelReserve (Lyria CRM) accounts.

- **URL:** `https://lamarina-americanos.appceso.cloud`
- **Image:** `Dockerfile` (Next.js standalone, Node 22, ~245 MB, non-root)
- **Data:** `americanos_eventos`, `americanos_club_config`, `americanos_torneos`, `americanos_torneos_marcadores`, `americanos_extras` (referee roster, photos) and `americanos_ranking_fvp` in `sales_agent`, all scoped by `tenant_id = la_marina_sport_club`
- **Upgrading an existing install:** re-run `db/postgres.sql` **without** `-v app_password` to add new tables; the password is left untouched

## Architecture

```mermaid
flowchart LR
  U[Players / Staff / TV] -->|HTTPS| T[Traefik + Let's Encrypt]
  T -->|lamarina-americanos.appceso.cloud| A[lamarina-americanos<br/>Next.js :3000]
  A -->|DATABASE_URL<br/>appceso-db-vx0gu1:5432<br/>role americanos_app| P[(appceso-db PG15<br/>sales_agent)]
  P --- E[americanos_eventos / club_config<br/>torneos / marcadores / extras / ranking_fvp]
  P --- L[users + tenant_members<br/>read-only columns, bcrypt]
  G[GitHub main] -->|auto-deploy| D[Dokploy Dockerfile build] --> A
```

## How the app picks its backend

| Env present | Mode (`GET /api/americanos` → `modo`) | Data | Staff login |
| --- | --- | --- | --- |
| `DATABASE_URL` | `POSTGRES` | Lyria Postgres | PIN (if `STAFF_PIN`) + Lyria users |
| Supabase vars only | `SUPABASE` | Supabase | PIN + Supabase Auth |
| nothing | `DEMO` | Process memory (lost on restart) | PIN `1234` |

Lyria staff rule: `tenant_members.role` ∈ `owner`, `admin`, `staff_admin` for `TENANT_ID`, or `users.role = super_admin`, or email in `STAFF_EMAILS`. `member` gets 403. Passwords are checked with bcrypt against `users.password_hash` (same hashes Lyria writes).

## Verified server facts (2026-10-24)

- DB service: `appceso-db-vx0gu1` (postgres 15.19), reachable on `dokploy-network` at port `5432`. Do **not** use `76.13.24.31:5433` or container names (they change on redeploy). `dokploy-postgres` is Dokploy's internal DB — never use it.
- `users`, `tenant_members`, `tenants` have no RLS → no `app.current_tenant` needed for the login query.
- La Marina members: 1 `admin`, 2 `staff_admin`, 5 `member`. All hashes are `$2b$`.
- Connections 32/200 used; the app pool is capped at 5 (role limit 10).
- VPS: 3.8 GiB RAM, ~1.6 GiB available → set a 512 MB memory limit.
- Domain convention: one flat label per app under `appceso.cloud` (`lyria-api`, `lyria-admin`, `padelreserve`, `guard`, ...). `lamarinasportclub.appceso.cloud` is **taken** (Lyria storefront for this tenant), hence `lamarina-americanos`. There is no wildcard DNS record.

---

## Step 1 — DNS

Add an `A` record: `lamarina-americanos.appceso.cloud` → `76.13.24.31`. Check:

```bash
dig +short lamarina-americanos.appceso.cloud   # 76.13.24.31
```

## Step 2 — Push the code

The repo now contains everything Dokploy needs: `Dockerfile`, `.dockerignore`, `output: "standalone"`, the Postgres adapter (`lib/server/db.ts`, `lib/server/repository.ts`), Lyria login (`lib/server/auth.ts`) and `db/postgres.sql`.

Push to a GitHub repo Dokploy can read (our fork of `Lfzv98/lamarinasportclub`, or ask for the Dokploy GitHub App on the original), branch `main`.

## Step 3 — Database migration (once)

Generate the app password and keep it in the password manager:

```bash
openssl rand -hex 24
```

Run the idempotent migration as the `appceso` superuser:

```bash
scp db/postgres.sql root@76.13.24.31:/tmp/americanos.sql
ssh root@76.13.24.31
DB=$(docker ps --format "{{.Names}}" | grep appceso-db | head -1)
docker exec -i $DB psql -U appceso -d sales_agent -v ON_ERROR_STOP=1 \
  -v app_password='<generated-password>' < /tmp/americanos.sql
rm /tmp/americanos.sql
```

Re-running the migration later (schema changes) is safe: **omit `-v app_password`** and the existing password is left untouched. Pass it only to set or rotate the password, and then update `DATABASE_URL` in Dokploy too. Never pass the password as an ssh positional argument (`ssh host 'cmd "$1"' -- pw` drops it); run psql on the server or pipe through stdin.

Verify:

```bash
docker exec $DB psql -U appceso -d sales_agent -c "\dt americanos_*" \
  -c "select grantee, table_name, privilege_type from information_schema.role_table_grants where grantee = 'americanos_app';"
```

## Step 4 — Create the app in Dokploy

Dokploy UI (`ssh -L 3000:localhost:3000 root@76.13.24.31` → http://localhost:3000):

1. Project (existing `appceso` or a new `la-marina`) → **Create Service → Application** → name `lamarina-americanos`.
2. **Provider:** GitHub → repo → branch `main`.
3. **Build type:** `Dockerfile`, path `Dockerfile`, context `.`.
4. **Environment:**

```env
DATABASE_URL=postgres://americanos_app:<generated-password>@appceso-db-vx0gu1:5432/sales_agent
TENANT_ID=la_marina_sport_club
DATABASE_POOL_MAX=5
APP_URL=https://lamarina-americanos.appceso.cloud
STAFF_SECRET=<openssl rand -hex 32>
STAFF_PIN=<4-8 digits, not 1234>
STAFF_EMAILS=
```

   - `STAFF_SECRET` must be ≥ 16 chars and is effectively mandatory (without it the session key is derived from `DATABASE_URL`, so a DB password rotation would log everyone out). Changing it logs out all staff.
   - `APP_URL` is baked in at **build** time for prerendered pages; the code default is already `https://lamarina-americanos.appceso.cloud`. For another domain, change the default in `app/layout.tsx` (or pass it as a Dokploy build arg).
   - Omit `STAFF_PIN` to allow only PadelReserve logins (stronger).
   - URL-encode the password if it ever contains `@ : / #` (hex doesn't).

5. **Domains:** host `lamarina-americanos.appceso.cloud`, path `/`, container port `3000`, HTTPS on, certificate **Let's Encrypt**. HTTPS is mandatory: the staff cookie is `Secure` in production.
6. **Advanced:** replicas `1` (the login rate limiter is in-memory), memory limit `512 MB`.
7. **Deploy**, then enable **Auto Deploy**.

## Step 5 — Verify

| # | Check | Expected |
| --- | --- | --- |
| 0 | `curl -s https://lamarina-americanos.appceso.cloud/api/health` | `{"ok":true}` (healthcheck, no DB) |
| 1 | `curl -s https://lamarina-americanos.appceso.cloud/api/americanos \| jq .modo` | `"POSTGRES"` |
| 2 | `curl -s .../api/staff/me \| jq .metodos` | `padelreserve: true`, `pin` per `STAFF_PIN` |
| 3 | Login as a La Marina `admin` / `staff_admin` | 200, badge "En línea", can create events |
| 4 | Login as a La Marina `member` / user of another tenant | 403 / 401 (other tenants get the same 401 as a wrong password) |
| 5 | Wrong password ×6 (same IP, or same email from different IPs) | 401 ×5, then 429 |
| 6 | Create an event | Row in `americanos_eventos` with `tenant_id = la_marina_sport_club` |
| 7 | Open it on another phone, no session | Read-only, updates within ~8 s |
| 8 | `/evento/:id/tv` + scan QR | QR opens the new domain |
| 9 | Redeploy | Events and staff session survive |

```bash
docker exec $DB psql -U appceso -d sales_agent \
  -c "select tenant_id, id, estado, actualizado_en from americanos_eventos order by actualizado_en desc limit 5;"
```

Browser e2e suite only against a non-production database:

```bash
APP_URL=https://<staging-host> STAFF_PIN=<pin> node tests/e2e/robustez.e2e.mjs
```

## Step 6 — Cutover and rollback

- Share the new URL with staff; replace TV bookmarks and printed QRs.
- Keep `lamarinasportclub.vercel.app` for a week and redirect it to the new domain.
- **App rollback:** Dokploy → Deployments → previous build. Data is in Postgres, so it's safe.
- **DB rollback** (removes only this app's objects):

```sql
drop table if exists public.americanos_torneos_marcadores, public.americanos_torneos, public.americanos_extras,
  public.americanos_ranking_fvp, public.americanos_eventos, public.americanos_club_config;
drop owned by americanos_app; drop role if exists americanos_app;
```

- **Backups:** make sure the `appceso-db` backup schedule in Dokploy covers `sales_agent` (it now holds these two tables).

## Local development against Postgres

```bash
docker run -d --name am-pg -e POSTGRES_USER=appceso -e POSTGRES_PASSWORD=x -e POSTGRES_DB=sales_agent -p 55432:5432 postgres:15
# create minimal tenants/users/tenant_members tables (or restore a Lyria dump), then:
docker exec -i am-pg psql -U appceso -d sales_agent -v app_password='apppw' < db/postgres.sql
DATABASE_URL=postgres://americanos_app:apppw@127.0.0.1:55432/sales_agent STAFF_SECRET=0123456789abcdef0123 npm run dev
```

## Follow-ups

- Realtime: replace the 8 s polling (`components/Providers.tsx`) with Postgres `LISTEN/NOTIFY` + SSE.
- Deeper integration: map players to Lyria `users` and block courts via bookings (`reservaIds`); La Marina court UUIDs live in `tenants.config -> playtomic.court_map`.
- API errors (5xx) include the raw DB message in `detalle` (pre-existing behavior in `lib/server/http.ts`); consider hiding it in production.

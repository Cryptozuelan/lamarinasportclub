-- La Marina Americanos on the Lyria Postgres (database `sales_agent`, Dokploy).
-- Idempotent. Run as the `appceso` superuser:
--
--   docker exec -i $DB psql -U appceso -d sales_agent -v ON_ERROR_STOP=1 \
--     -v app_password='<strong-password>' < db/postgres.sql
--
-- Creates two tenant-scoped JSONB tables and a least-privilege role
-- `americanos_app` that can only touch those tables and read the Lyria
-- login columns it needs. Existing Lyria tables are not modified.

begin;

create table if not exists public.americanos_eventos (
  tenant_id      text        not null references public.tenants (id) on delete cascade,
  id             text        not null,
  data           jsonb       not null,                 -- full EventoAmericano (types/americano.ts)
  estado         text        not null default 'BORRADOR',
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index if not exists americanos_eventos_tenant_actualizado_idx
  on public.americanos_eventos (tenant_id, actualizado_en desc);

create table if not exists public.americanos_club_config (
  tenant_id      text        primary key references public.tenants (id) on delete cascade,
  data           jsonb       not null,                 -- ConfigClub (courts, schedule, contact)
  actualizado_en timestamptz not null default now()
);

-- Least-privilege application role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'americanos_app') then
    create role americanos_app login;
  end if;
end
$$;
alter role americanos_app with login password :'app_password' connection limit 10;

grant connect on database sales_agent to americanos_app;
grant usage on schema public to americanos_app;
grant select, insert, update, delete on public.americanos_eventos, public.americanos_club_config to americanos_app;

-- Staff login: only the columns needed to verify a password and a tenant role.
grant select (id, email, full_name, password_hash, role, is_active) on public.users to americanos_app;
grant select (user_id, tenant_id, role) on public.tenant_members to americanos_app;

commit;

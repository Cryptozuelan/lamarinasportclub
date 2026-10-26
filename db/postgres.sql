-- La Marina Americanos on the Lyria Postgres (database `sales_agent`, Dokploy).
-- Idempotent. Run as the `appceso` superuser. First run (sets the password):
--
--   docker exec -i $DB psql -U appceso -d sales_agent -v ON_ERROR_STOP=1 \
--     -v app_password='<strong-password>' < db/postgres.sql
--
-- Later runs: omit `-v app_password` to keep the current password.
-- When running over ssh, pipe this file through stdin; never pass the
-- password as a positional argument (ssh flattens and drops it).
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

-- Tournaments (types/torneo.ts). Same JSONB pattern as americanos_eventos.
create table if not exists public.americanos_torneos (
  tenant_id      text        not null references public.tenants (id) on delete cascade,
  id             text        not null,
  club_id        text        not null default 'la-marina',
  data           jsonb       not null,                 -- full Torneo
  estado         text        not null default 'INSCRIPCION',
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index if not exists americanos_torneos_tenant_actualizado_idx
  on public.americanos_torneos (tenant_id, actualizado_en desc);

-- Point-by-point live score per match (MarcadorVivo). id = match id.
create table if not exists public.americanos_torneos_marcadores (
  tenant_id      text        not null,
  id             text        not null,
  torneo_id      text        not null,
  data           jsonb       not null,
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, torneo_id) references public.americanos_torneos (tenant_id, id) on delete cascade
);
create index if not exists americanos_torneos_marcadores_torneo_idx
  on public.americanos_torneos_marcadores (tenant_id, torneo_id);

-- Loose per-event data (evento_id = tournament or americano id): club referee
-- roster (id 'arbitros:club', tipo 'arbitros'), pair photos (tipo 'foto') and
-- player photos (tipo 'foto-jugador', base64 JPEG ~40-80 KB).
create table if not exists public.americanos_extras (
  tenant_id      text        not null references public.tenants (id) on delete cascade,
  id             text        not null,
  evento_id      text        not null,
  tipo           text        not null,
  data           jsonb       not null,
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index if not exists americanos_extras_evento_idx
  on public.americanos_extras (tenant_id, evento_id, tipo);

-- Current FVP ranking (types/ranking.ts): one row per tenant, id = 'fvp'.
create table if not exists public.americanos_ranking_fvp (
  tenant_id      text        not null references public.tenants (id) on delete cascade,
  id             text        not null,
  data           jsonb       not null,
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, id)
);

-- Least-privilege application role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'americanos_app') then
    create role americanos_app login;
  end if;
end
$$;
alter role americanos_app with login connection limit 10;

-- The password is only (re)set when a non-empty `-v app_password=...` is
-- passed, so re-running this file never clears or rotates it by accident.
\if :{?app_password}
  select length(:'app_password') > 0 as americanos_set_password \gset
\else
  \set americanos_set_password false
\endif
\if :americanos_set_password
  alter role americanos_app with password :'app_password';
\else
  \echo 'app_password not provided: americanos_app password left unchanged'
\endif

grant connect on database sales_agent to americanos_app;
grant usage on schema public to americanos_app;
grant select, insert, update, delete on
  public.americanos_eventos, public.americanos_club_config,
  public.americanos_torneos, public.americanos_torneos_marcadores,
  public.americanos_extras, public.americanos_ranking_fvp
  to americanos_app;

-- Staff login: only the columns needed to verify a password and a tenant role.
grant select (id, email, full_name, password_hash, role, is_active) on public.users to americanos_app;
grant select (user_id, tenant_id, role, accepted_at) on public.tenant_members to americanos_app;

commit;

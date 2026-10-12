-- =============================================================================
-- 0051_error_log_and_category_counts.sql
-- Dos cosas, las dos nacidas del mismo error: /admin/categorias moría con
-- "canceling statement due to statement timeout" y no quedaba rastro.
--
-- 1. Conteo por categoría de tienda desde la materializada.
--    El panel leía `v_catalog_category_facets`, que agrupa en vivo TODO
--    `store_products` (filas anchas: la galería va adentro desde 0026). Con
--    ~130 000 artículos pasó el límite de 8 s de Supabase, y encima el panel
--    la pedía en páginas de mil, repitiendo el trabajo entero en cada una.
--    `mv_catalog` ya tiene `store_category_id` y el mismo piso de oferta:
--    agrupar ahí, con índice, es cuestión de milisegundos.
--
-- 2. Bitácora de errores (`error_logs`): todo error del servidor (render,
--    route handlers, server actions, proxy), los que el código atrapa y
--    muestra con un aviso, y los que pasan en el navegador. Se ve en
--    /admin/errores.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Conteos por categoría de tienda
-- -----------------------------------------------------------------------------
create index if not exists mv_catalog_store_category_idx
  on find_your_prices.mv_catalog (store_category_id);

create or replace function find_your_prices.admin_store_category_counts()
returns table (store_category_id uuid, product_count bigint)
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  select m.store_category_id, count(*) as product_count
  from find_your_prices.mv_catalog m
  where m.store_category_id is not null
    and m.price > 0
    and m.availability not in ('out_of_stock', 'discontinued')
  group by m.store_category_id;
$$;

revoke all on function find_your_prices.admin_store_category_counts() from public;
grant execute on function find_your_prices.admin_store_category_counts() to service_role;

-- -----------------------------------------------------------------------------
-- 2. Bitácora de errores
--
-- `fingerprint` agrupa ocurrencias del mismo error (mismo origen, misma ruta,
-- mismo mensaje sin números ni ids): el panel muestra grupos con su cuenta,
-- no mil filas iguales. `resolved_at` se marca por grupo; si el error vuelve
-- a pasar, la fila nueva nace sin resolver y el grupo reaparece.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.error_logs (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  -- render | route | action | proxy | handled | client
  source       text not null,
  level        text not null default 'error',
  message      text not null,
  digest       text,
  fingerprint  text not null,
  path         text,
  route        text,
  method       text,
  stack        text,
  context      jsonb,
  user_agent   text,
  resolved_at  timestamptz,
  constraint error_logs_level check (level in ('error', 'warning')),
  constraint error_logs_lengths check (char_length(message) <= 2000 and (stack is null or char_length(stack) <= 8000))
);

create index if not exists error_logs_created_idx on find_your_prices.error_logs (created_at desc);
create index if not exists error_logs_fingerprint_idx on find_your_prices.error_logs (fingerprint, created_at desc);
create index if not exists error_logs_digest_idx on find_your_prices.error_logs (digest) where digest is not null;

alter table find_your_prices.error_logs enable row level security;
revoke all on find_your_prices.error_logs from anon, authenticated;
grant all on find_your_prices.error_logs to service_role;

-- Grupos para el panel: una fila por huella, con la última ocurrencia.
create or replace function find_your_prices.admin_error_groups(
  p_since timestamptz,
  p_include_resolved boolean default false,
  p_limit integer default 100
)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with recent as (
    select * from find_your_prices.error_logs
    where created_at >= p_since
      and (p_include_resolved or resolved_at is null)
  ),
  groups as (
    select fingerprint,
           count(*) as occurrences,
           min(created_at) as first_seen,
           max(created_at) as last_seen,
           count(distinct path) as paths,
           bool_and(resolved_at is not null) as resolved
    from recent
    group by fingerprint
  ),
  latest as (
    select distinct on (fingerprint) *
    from recent
    order by fingerprint, created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fingerprint', g.fingerprint,
    'occurrences', g.occurrences,
    'firstSeen', g.first_seen,
    'lastSeen', g.last_seen,
    'paths', g.paths,
    'resolved', g.resolved,
    'lastId', l.id,
    'source', l.source,
    'level', l.level,
    'message', l.message,
    'digest', l.digest,
    'path', l.path,
    'route', l.route,
    'method', l.method,
    'stack', l.stack,
    'context', l.context,
    'userAgent', l.user_agent
  ) order by g.last_seen desc), '[]'::jsonb)
  from (select * from groups order by last_seen desc limit p_limit) g
  join latest l on l.fingerprint = g.fingerprint;
$$;

revoke all on function find_your_prices.admin_error_groups(timestamptz, boolean, integer) from public;
grant execute on function find_your_prices.admin_error_groups(timestamptz, boolean, integer) to service_role;

-- Retención: 90 días. Con pg_cron se programa sola.
create or replace function find_your_prices.purge_old_errors()
returns void
language sql
set search_path = find_your_prices, pg_catalog
as $$
  delete from find_your_prices.error_logs where created_at < now() - interval '90 days';
$$;

revoke all on function find_your_prices.purge_old_errors() from public;
grant execute on function find_your_prices.purge_old_errors() to service_role;

do $$
begin
  perform cron.schedule('fyp-purge-errors', '23 9 * * *', 'select find_your_prices.purge_old_errors()');
exception when others then
  raise notice 'pg_cron no disponible (%): correr find_your_prices.purge_old_errors() a mano de vez en cuando.', sqlerrm;
end $$;

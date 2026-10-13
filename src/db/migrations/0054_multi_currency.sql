-- =============================================================================
-- 0054_multi_currency.sql
-- El catálogo pasa a ser multimoneda: cada artículo conserva su precio en su
-- moneda (L, USD, y lo que venga: EUR...), y además publica un precio de
-- REFERENCIA en lempiras para ordenar, filtrar y armar los rangos de precio.
--
-- Por qué. Hasta acá todas las tiendas cobraban en lempiras y `price` se
-- comparaba directo. Eneba (0055) publica en dólares: ordenar "menor precio"
-- por `price` pondría una clave de US$ 15 por delante de un juego de L 300,
-- y el filtro "hasta L 500" dejaría pasar una gift card de US$ 400. Convertir
-- el precio guardado sería inventar un precio que la tienda no cobra; por eso
-- se convierte solo la referencia.
--
-- Qué cambia.
--   1. `exchange_rates`: cuántos lempiras vale una unidad de cada moneda. Una
--      moneda nueva es una fila; no hay que tocar código ni migrar nada.
--   2. `mv_catalog.price_hnl`: `price × tasa`. Lo usan la búsqueda (orden y
--      filtro de precio) y las facetas (min/max). Sin tasa para la moneda
--      queda null: el artículo se ve, pero no entra a filtros por precio ni
--      se ordena por precio (va al final).
--   3. Las facetas y el resumen calculan min/max sobre `price_hnl`.
--   4. `refresh_catalog_if_stale()` también mira `exchange_rates`: cambiar
--      una tasa reordena el catálogo en el siguiente refresco.
--
-- Postgres no deja agregar columnas a una materializada: se reconstruye, con
-- sus índices y las vistas que dependen de ella. Antes de borrarla se
-- comprueba que no dependa nada más de lo conocido, para que el `cascade` no
-- se lleve algo que nadie anotó.
--
-- Actualizar una tasa:
--   update find_your_prices.exchange_rates
--      set rate_to_hnl = 26.40, source = 'BCH 2026-11-01'
--    where currency = 'USD';
--   select find_your_prices.refresh_catalog('tasa USD');
--
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tasas de cambio.
--
-- `rate_to_hnl`: lempiras por unidad. HNL vale 1 y no se debería tocar.
-- Las tasas sembradas son una referencia aproximada de octubre de 2026 y
-- deben confirmarse contra el BCH; `on conflict do nothing` hace que volver
-- a correr la migración no pise lo que se haya corregido a mano.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.exchange_rates (
  currency     char(3) primary key,
  rate_to_hnl  numeric(14, 6) not null,
  source       text,
  updated_at   timestamptz not null default now(),
  constraint exchange_rates_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint exchange_rates_positive check (rate_to_hnl > 0),
  constraint exchange_rates_hnl_is_one check (currency <> 'HNL' or rate_to_hnl = 1)
);

comment on table find_your_prices.exchange_rates is
  'Lempiras por unidad de cada moneda. Alimenta mv_catalog.price_hnl (orden y filtros de precio). Una moneda nueva = una fila.';

drop trigger if exists exchange_rates_set_updated_at on find_your_prices.exchange_rates;
create trigger exchange_rates_set_updated_at before update on find_your_prices.exchange_rates
  for each row execute function find_your_prices.set_updated_at();

insert into find_your_prices.exchange_rates (currency, rate_to_hnl, source)
values
  ('HNL', 1,     'base'),
  ('USD', 26.50, 'referencia aproximada 2026-10, confirmar con BCH'),
  ('EUR', 30.70, 'referencia aproximada 2026-10, confirmar con BCH')
on conflict (currency) do nothing;

-- Pública de lectura, como el catálogo (0012): no tiene nada privado y el
-- sitio puede querer mostrar "1 US$ ≈ L 26.50". Escribe solo service_role.
alter table find_your_prices.exchange_rates enable row level security;
drop policy if exists exchange_rates_public_read on find_your_prices.exchange_rates;
create policy exchange_rates_public_read on find_your_prices.exchange_rates
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on find_your_prices.exchange_rates from anon, authenticated;
grant select on find_your_prices.exchange_rates to anon, authenticated;
grant all on find_your_prices.exchange_rates to service_role;

-- -----------------------------------------------------------------------------
-- 2. Candado antes del cascade: solo pueden depender de mv_catalog las cuatro
-- vistas que esta migración vuelve a crear. Las funciones (0031, 0033, 0051)
-- no cuentan: Postgres no registra dependencias de cuerpos de función.
-- -----------------------------------------------------------------------------
do $$
declare
  v_unknown text;
begin
  select string_agg(distinct dependent.relname, ', ')
    into v_unknown
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class dependent on dependent.oid = r.ev_class
  join pg_class source on source.oid = d.refobjid
  join pg_namespace n on n.oid = source.relnamespace
  where n.nspname = 'find_your_prices'
    and source.relname = 'mv_catalog'
    and dependent.relname <> 'mv_catalog'
    and dependent.relname not in (
      'v_catalog_store_facets',
      'v_catalog_brand_facets',
      'v_catalog_summary',
      'v_catalog_store_category_facets'
    );

  if v_unknown is not null then
    raise exception 'mv_catalog tiene dependencias que esta migracion no conoce (%). Agregarlas a 0054 antes de correrla.', v_unknown;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. La materializada, con `price_hnl`.
--
-- Mismas columnas y en el mismo orden que 0030; `price_hnl` va al final.
-- HNL no pasa por la tasa (ni por el redondeo): su referencia es su precio.
-- -----------------------------------------------------------------------------
drop materialized view if exists find_your_prices.mv_catalog cascade;

create materialized view find_your_prices.mv_catalog as
select
  sp.id,
  sp.store_id,
  s.slug            as store_slug,
  s.name            as store_name,
  s.logo_url        as store_logo_url,
  sp.product_id,
  sp.external_id,
  sp.name,
  sp.url,
  sp.primary_image_url,
  coalesce(b.name, sp.brand_raw) as brand,
  sp.category_raw,
  sc.name           as store_category_name,
  c.slug            as category_slug,
  sp.currency,
  sp.price,
  sp.list_price,
  sp.discount_percent,
  sp.member_price,
  sp.availability,
  sp.in_stock,
  sp.stock_quantity,
  sp.rating_average,
  sp.rating_count,
  sp.gtin,
  sp.last_seen_at,
  sp.last_price_change_at,
  sp.first_seen_at,
  sp.public_slug,
  c.name            as category_name,
  cr.slug           as category_root_slug,
  cr.name           as category_root_name,
  sp.normalized_name,
  sp.store_category_id,
  sc.category_id,
  case
    when sp.currency = 'HNL' then sp.price
    else round(sp.price * fx.rate_to_hnl, 2)
  end               as price_hnl
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
left join find_your_prices.categories cr on cr.id = coalesce(c.parent_id, c.id)
left join find_your_prices.exchange_rates fx on fx.currency = sp.currency
where sp.is_active and s.is_active
with data;

comment on materialized view find_your_prices.mv_catalog is
  'Copia plana e indexada de v_store_products_current, mas price_hnl (0054). La lee el catalogo publico. Se refresca con refresh_catalog() al terminar el scraping y por pg_cron si algo cambio.';

comment on column find_your_prices.mv_catalog.price_hnl is
  'Precio de referencia en lempiras (price x exchange_rates). Solo para ordenar, filtrar y rangos; lo que se muestra es price en currency.';

-- Índices de 0030 y 0051, más el de price_hnl. El de `price` se conserva: lo
-- usa la degradación de la app mientras esta migración no corra.
create unique index if not exists mv_catalog_id_key
  on find_your_prices.mv_catalog (id);
create index if not exists mv_catalog_name_fts_idx
  on find_your_prices.mv_catalog using gin (to_tsvector('simple', normalized_name));
create unique index if not exists mv_catalog_public_slug_key
  on find_your_prices.mv_catalog (public_slug) where public_slug is not null;
create index if not exists mv_catalog_store_name_idx      on find_your_prices.mv_catalog (store_name);
create index if not exists mv_catalog_category_slug_idx   on find_your_prices.mv_catalog (category_slug);
create index if not exists mv_catalog_category_root_idx   on find_your_prices.mv_catalog (category_root_slug);
create index if not exists mv_catalog_store_category_idx  on find_your_prices.mv_catalog (store_category_id);
create index if not exists mv_catalog_brand_idx           on find_your_prices.mv_catalog (brand);
create index if not exists mv_catalog_newest_idx    on find_your_prices.mv_catalog (first_seen_at desc nulls last, id);
create index if not exists mv_catalog_discount_idx  on find_your_prices.mv_catalog (discount_percent desc nulls last, id);
create index if not exists mv_catalog_price_idx     on find_your_prices.mv_catalog (price, id);
create index if not exists mv_catalog_price_hnl_idx on find_your_prices.mv_catalog (price_hnl, id);
create index if not exists mv_catalog_rating_idx    on find_your_prices.mv_catalog (rating_average desc nulls last, id);

-- 0030 llamó `mv_catalog_store_category_idx` al índice sobre
-- `store_category_name`, y 0051 quiso crear uno sobre `store_category_id` con
-- ese mismo nombre: el `if not exists` lo saltó y `admin_store_category_counts`
-- quedó sin índice. Con la materializada nueva cada uno lleva el suyo.
create index if not exists mv_catalog_store_category_name_idx
  on find_your_prices.mv_catalog (store_category_name);

analyze find_your_prices.mv_catalog;

grant select on find_your_prices.mv_catalog to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Las vistas que se fueron con el cascade, con min/max en lempiras.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_store_facets as
select
  m.store_id,
  m.store_slug,
  m.store_name,
  m.store_logo_url            as logo_url,
  count(*)                    as product_count,
  count(*) filter (where m.list_price is not null) as discounted_count,
  min(m.price_hnl)            as min_price,
  max(m.price_hnl)            as max_price
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
group by m.store_id, m.store_slug, m.store_name, m.store_logo_url;

create or replace view find_your_prices.v_catalog_brand_facets as
select
  m.brand                        as brand_name,
  count(*)                       as product_count,
  min(m.price_hnl)               as min_price,
  max(m.price_hnl)               as max_price
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
  and m.brand is not null
group by m.brand
having count(*) >= 2;

create or replace view find_your_prices.v_catalog_summary as
select
  count(*)                                          as total_products,
  count(distinct m.store_id)                        as total_stores,
  count(distinct m.category_id)                     as total_categories,
  count(*) filter (where m.list_price is not null)  as discounted_products,
  count(*) filter (where m.in_stock)                as in_stock_products,
  min(m.price_hnl)                                  as min_price,
  max(m.price_hnl)                                  as max_price,
  max(m.last_seen_at)                               as last_seen_at
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued');

create or replace view find_your_prices.v_catalog_store_category_facets as
select
  m.store_slug,
  m.category_slug        as slug,
  count(*)               as product_count,
  count(*) filter (where m.list_price is not null) as discounted_count
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
  and m.category_slug is not null
group by m.store_slug, m.category_slug;

comment on view find_your_prices.v_catalog_store_category_facets is
  'Nodos canonicos con al menos un articulo comprable, por tienda. Fuente de las landings tienda x categoria.';

-- security_invoker como en 0012/0013/0033: vistas recién creadas no lo heredan.
do $$
declare
  v text;
begin
  if current_setting('server_version_num')::integer >= 150000 then
    foreach v in array array[
      'v_catalog_store_facets',
      'v_catalog_brand_facets',
      'v_catalog_summary',
      'v_catalog_store_category_facets'
    ] loop
      execute format('alter view find_your_prices.%I set (security_invoker = on)', v);
    end loop;
  end if;
end $$;

grant select on find_your_prices.v_catalog_store_facets          to anon, authenticated, service_role;
grant select on find_your_prices.v_catalog_brand_facets          to anon, authenticated, service_role;
grant select on find_your_prices.v_catalog_summary               to anon, authenticated, service_role;
grant select on find_your_prices.v_catalog_store_category_facets to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Facetas acotadas (0031 y 0033): rango de precio en lempiras.
-- Mismo cuerpo, solo cambian minPrice/maxPrice.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.catalog_category_facets(p_slug text)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with scope as (
    select *
    from find_your_prices.mv_catalog m
    where (m.category_slug = p_slug or m.category_root_slug = p_slug)
      and m.price > 0
      and m.availability not in ('out_of_stock', 'discontinued')
  )
  select jsonb_build_object(
    'total', (select count(*) from scope),
    'discounted', (select count(*) from scope where list_price is not null),
    'minPrice', (select coalesce(min(price_hnl), 0) from scope),
    'maxPrice', (select coalesce(max(price_hnl), 0) from scope),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object('value', store_name, 'count', n) order by n desc)
      from (select store_name, count(*) as n from scope group by store_name) s
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by n desc)
      from (
        select brand, count(*) as n from scope
        where brand is not null
        group by brand having count(*) >= 2
        order by count(*) desc limit 300
      ) b
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('slug', category_slug, 'count', n) order by n desc)
      from (
        select category_slug, count(*) as n from scope
        where category_slug is not null and category_slug <> p_slug
        group by category_slug
      ) c
    ), '[]'::jsonb)
  );
$$;

grant execute on function find_your_prices.catalog_category_facets(text) to anon, authenticated, service_role;

create or replace function find_your_prices.catalog_store_facets(p_store_slug text, p_slug text default null)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with scope as (
    select *
    from find_your_prices.mv_catalog m
    where m.store_slug = p_store_slug
      and (p_slug is null or m.category_slug = p_slug or m.category_root_slug = p_slug)
      and m.price > 0
      and m.availability not in ('out_of_stock', 'discontinued')
  )
  select jsonb_build_object(
    'total', (select count(*) from scope),
    'discounted', (select count(*) from scope where list_price is not null),
    'minPrice', (select coalesce(min(price_hnl), 0) from scope),
    'maxPrice', (select coalesce(max(price_hnl), 0) from scope),
    'stores', '[]'::jsonb,
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by n desc)
      from (
        select brand, count(*) as n from scope
        where brand is not null
        group by brand having count(*) >= 2
        order by count(*) desc limit 300
      ) b
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('slug', category_slug, 'count', n) order by n desc)
      from (
        select category_slug, count(*) as n from scope
        where category_slug is not null and (p_slug is null or category_slug <> p_slug)
        group by category_slug
      ) c
    ), '[]'::jsonb)
  );
$$;

grant execute on function find_your_prices.catalog_store_facets(text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. El pg_cron de respaldo también se entera de un cambio de tasa.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.refresh_catalog_if_stale()
returns jsonb
language plpgsql
security definer
set search_path = find_your_prices, pg_catalog
as $$
declare
  v_last   timestamptz;
  v_latest timestamptz;
begin
  select refreshed_at into v_last from find_your_prices.catalog_refresh_log where id;

  select greatest(
    (select max(updated_at) from find_your_prices.store_products),
    (select max(updated_at) from find_your_prices.stores),
    (select max(updated_at) from find_your_prices.store_categories),
    (select max(updated_at) from find_your_prices.categories),
    (select max(updated_at) from find_your_prices.brands),
    (select max(updated_at) from find_your_prices.exchange_rates)
  ) into v_latest;

  if v_last is null or v_latest is null or v_latest > v_last then
    return find_your_prices.refresh_catalog('cron');
  end if;

  return jsonb_build_object('skipped', true, 'refreshed_at', v_last);
end;
$$;

revoke all on function find_your_prices.refresh_catalog_if_stale() from public, anon, authenticated;
grant execute on function find_your_prices.refresh_catalog_if_stale() to service_role;

-- -----------------------------------------------------------------------------
-- 7. Reporte: monedas del catálogo sin tasa (esperado: ninguna fila).
-- Esos artículos se ven, pero no entran a filtros ni orden por precio.
-- -----------------------------------------------------------------------------
select m.currency, count(*) as articulos_sin_tasa
from find_your_prices.mv_catalog m
where m.price_hnl is null and m.price is not null
group by m.currency
order by 2 desc;

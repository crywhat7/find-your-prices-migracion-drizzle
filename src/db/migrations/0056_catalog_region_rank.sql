-- =============================================================================
-- 0056_catalog_region_rank.sql
-- Las claves de Global, LATAM y United States van primero.
--
-- Por qué. Eneba (0055) vende la misma clave por región: "Fortnite ... V-Bucks
-- XBOX LIVE Key BRAZIL", "... MEXICO", "... TURKEY". Una clave de otra región
-- casi nunca se puede canjear en una cuenta hondureña, y como suele ser la
-- más barata, el catálogo la ponía arriba: buscar "vbucks" devolvía claves de
-- Brasil.
--
-- Qué cambia. `mv_catalog` publica dos columnas nuevas, al final:
--   - `region`: la región del artículo tal como la guarda la importación en
--     `store_products.attributes->>'region'` ("Global", "United States"...).
--     Null en las tiendas hondureñas, que no venden por región.
--   - `region_rank`: si la clave suele servir en Honduras.
--       0  sin región (todo lo que no es una clave), GLOBAL, LATAM y UNITED
--          STATES. Entre estas tres no hay preferencia: salen mezcladas según
--          el orden elegido.
--       1  cualquier otra región (Brasil, Turquía, Europa, ROW...).
--
-- El catálogo ordena primero por `region_rank` y después por lo que se haya
-- elegido (salvo en los órdenes por precio y por nombre, que se respetan tal
-- cual: quien pide "menor precio" ve lo más barato). Nada se esconde: las
-- claves regionales siguen saliendo, solo que al final.
--
-- Agregar o mover una región = cambiar la lista de abajo y volver a correr la
-- migración (o editar la materializada a mano).
--
-- Postgres no deja agregar columnas a una materializada: se reconstruye igual
-- que en 0054, con sus índices y las cuatro vistas que dependen de ella.
-- Las funciones de facetas (0031, 0033, 0054) no se tocan: Postgres no
-- registra dependencias de cuerpos de función y siguen leyendo la nueva.
--
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Candado antes del cascade, el mismo de 0054: solo pueden depender de
-- mv_catalog las cuatro vistas que esta migración vuelve a crear.
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
    raise exception 'mv_catalog tiene dependencias que esta migracion no conoce (%). Agregarlas a 0056 antes de correrla.', v_unknown;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. La materializada, con `region` y `region_rank`.
--
-- Mismas columnas y en el mismo orden que 0054; las dos nuevas van al final.
-- La región se compara normalizada ("United States" -> 'united_states'), que
-- es como viene en el CSV de Eneba.
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
  end               as price_hnl,
  nullif(sp.attributes->>'region', '') as region,
  case
    when coalesce(sp.attributes->>'region', '') = '' then 0
    when lower(replace(sp.attributes->>'region', ' ', '_')) in ('global', 'latam', 'united_states') then 0
    else 1
  end::smallint     as region_rank
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
  'Copia plana e indexada de v_store_products_current, mas price_hnl (0054) y region_rank (0056). La lee el catalogo publico. Se refresca con refresh_catalog() al terminar el scraping y por pg_cron si algo cambio.';

comment on column find_your_prices.mv_catalog.price_hnl is
  'Precio de referencia en lempiras (price x exchange_rates). Solo para ordenar, filtrar y rangos; lo que se muestra es price en currency.';

comment on column find_your_prices.mv_catalog.region is
  'Region de la clave (attributes.region, p. ej. "Global"). Null en lo que no se vende por region.';

comment on column find_your_prices.mv_catalog.region_rank is
  '0 = sin region, GLOBAL, LATAM o UNITED STATES; 1 = cualquier otra region. El catalogo ordena por esto primero (0056).';

-- Índices de 0054, más los dos órdenes por defecto precedidos de region_rank.
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
create index if not exists mv_catalog_region_discount_idx
  on find_your_prices.mv_catalog (region_rank, discount_percent desc nulls last, id);
create index if not exists mv_catalog_region_newest_idx
  on find_your_prices.mv_catalog (region_rank, first_seen_at desc nulls last, id);

-- 0030 llamó `mv_catalog_store_category_idx` al índice sobre
-- `store_category_name`, y 0051 quiso crear uno sobre `store_category_id` con
-- ese mismo nombre: el `if not exists` lo saltó y `admin_store_category_counts`
-- quedó sin índice. Con la materializada nueva cada uno lleva el suyo.
create index if not exists mv_catalog_store_category_name_idx
  on find_your_prices.mv_catalog (store_category_name);

analyze find_your_prices.mv_catalog;

grant select on find_your_prices.mv_catalog to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Las vistas que se fueron con el cascade, sin cambios desde 0054.
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
-- 4. Reporte: artículos por nivel de región (el 1 debería ser solo de Eneba).
-- -----------------------------------------------------------------------------
select m.region_rank, m.store_slug, count(*) as articulos
from find_your_prices.mv_catalog m
group by m.region_rank, m.store_slug
order by m.region_rank, articulos desc;

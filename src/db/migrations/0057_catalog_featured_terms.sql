-- =============================================================================
-- 0057_catalog_featured_terms.sql
-- Lo interesante de Eneba primero: una lista de términos que se edita a mano.
--
-- Por qué. El CSV de Eneba no trae descuento, calificación ni ventas, así que
-- el desempate del catálogo caía en el `id` (el slug del producto): orden
-- alfabético. Y entre lo que sale con región GLOBAL, LATAM o UNITED STATES hay
-- miles de "Crypto Voucher", "Gift Me Crypto Gift Card" y "Binance Gift Card",
-- DLC sueltos y juegos que nadie busca, que quedaban delante de Steam Wallet,
-- Roblox, Minecraft o GTA.
--
-- Qué cambia.
--   1. `catalog_featured_terms`: patrones (ILIKE sobre el nombre) por tienda,
--      con un nivel. Se edita desde Supabase → Table Editor, sin tocar código.
--        0 .. 49   destacado; menor = antes. Se usan 0 y 1.
--        (50)      sin regla: no se guarda, es lo que reciben los demás.
--        51 .. 99  relegado: sale después de todo lo demás.
--      Si un nombre cae en varias reglas, gana la que relega (un DLC de
--      Fortnite es DLC antes que Fortnite); entre destacados, la de menor nivel.
--   2. `mv_catalog` publica `featured_rank`: el nivel por 1024 más un resto
--      repartido por hash del id. El resto es lo que mezcla lo destacado
--      (tarjetas con juegos, y una marca con otra) en vez de dejar 200 tarjetas
--      de Amazon seguidas por orden alfabético; es estable entre refrescos.
--   3. El catálogo ordena por `region_rank`, luego `featured_rank` y luego por
--      lo elegido (mismos órdenes que ya respetan la región: no el de precio ni
--      el de nombre). Ver `catalog.ts`.
--   4. `refresh_catalog_if_stale()` también mira esta tabla: editar un término
--      se publica en el siguiente pg_cron (:00 o :30).
--
-- Las reglas son por tienda (`store_slug`): las tiendas hondureñas no tienen
-- ninguna, así que su orden no cambia y el cálculo no les cuesta nada. Lo
-- destacado de Eneba sí queda delante de ellas, igual que ya queda delante lo
-- que tiene región.
--
-- Agregar, mover o quitar un término:
--   insert into find_your_prices.catalog_featured_terms (store_slug, pattern, tier)
--   values ('eneba', '%palworld%', 0);
--   update find_your_prices.catalog_featured_terms set tier = 1 where id = 12;
--   delete from find_your_prices.catalog_featured_terms where pattern = '%hades%';
--   -- y esperar el pg_cron, o: select find_your_prices.refresh_catalog('terminos');
--      (por PostgREST puede dar timeout; en el SQL Editor no)
--
-- Reconstruye la materializada y sus cuatro vistas, como 0054 y 0056, y
-- reemplaza a 0056 (no hace falta correr las dos). Idempotente: se puede
-- volver a ejecutar; no pisa los términos que ya existan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La tabla de términos.
--
-- `pattern` es un ILIKE: % = cualquier cosa, _ = un carácter ("pok_mon"
-- encuentra Pokémon y "assassin_s" la comilla recta y la curva). Sin
-- distinguir mayúsculas. Cuidado con los patrones cortos: "%uber%" también
-- encuentra "Youtubers".
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.catalog_featured_terms (
  id          integer generated always as identity primary key,
  store_slug  text not null references find_your_prices.stores (slug) on update cascade on delete cascade,
  pattern     text not null,
  tier        smallint not null,
  note        text,
  updated_at  timestamptz not null default now(),
  constraint catalog_featured_terms_tier check (tier between 0 and 49 or tier between 51 and 99),
  constraint catalog_featured_terms_pattern_not_blank check (btrim(pattern) <> ''),
  constraint catalog_featured_terms_unique unique (store_slug, pattern)
);

comment on table find_your_prices.catalog_featured_terms is
  'Que va primero (tier 0-49) o al final (51-99) en el catalogo, por tienda, segun un ILIKE sobre el nombre. Alimenta mv_catalog.featured_rank (0057).';

drop trigger if exists catalog_featured_terms_touch on find_your_prices.catalog_featured_terms;
create trigger catalog_featured_terms_touch
  before update on find_your_prices.catalog_featured_terms
  for each row
  execute function find_your_prices.touch_updated_at();

alter table find_your_prices.catalog_featured_terms enable row level security;
revoke all on find_your_prices.catalog_featured_terms from anon, authenticated;
grant all on find_your_prices.catalog_featured_terms to service_role;

-- Lista inicial de Eneba, armada sobre el export del 2026-10-12.
--   tier 0   tarjetas y monedas de las plataformas que todos conocen, y los
--            juegos más buscados.
--   tier 1   juegos y tarjetas conocidos, de segunda línea.
--   tier 90  relegado: cripto, DLC y mejoras sueltas, y cursos y programas.
insert into find_your_prices.catalog_featured_terms (store_slug, pattern, tier, note)
values
  -- Tarjetas, suscripciones y monedas
  ('eneba', '%steam wallet%',              0, 'tarjeta'),
  ('eneba', '%playstation network%',       0, 'tarjeta'),
  ('eneba', '%playstation plus%',          0, 'suscripcion'),
  ('eneba', '%xbox gift card%',            0, 'tarjeta'),
  ('eneba', '%xbox live gift%',            0, 'tarjeta'),
  ('eneba', '%xbox game pass%',            0, 'suscripcion'),
  ('eneba', '%nintendo eshop card%',       0, 'tarjeta'),
  ('eneba', '%nintendo switch online%',    0, 'suscripcion'),
  ('eneba', '%roblox%',                    0, 'robux'),
  ('eneba', '%v-bucks%',                   0, 'fortnite'),
  ('eneba', '%netflix%',                   0, 'tarjeta'),
  ('eneba', '%spotify%',                   0, 'tarjeta'),
  ('eneba', '%google play%',               0, 'tarjeta'),
  ('eneba', '%apple gift card%',           0, 'tarjeta'),
  ('eneba', '%itunes gift card%',          0, 'tarjeta'),
  ('eneba', '%valorant points%',           0, 'moneda'),
  -- Juegos más buscados
  ('eneba', '%minecraft%',                 0, 'juego'),
  ('eneba', '%grand theft auto%',          0, 'juego'),
  ('eneba', '%gta v%',                     0, 'juego'),
  ('eneba', '%red dead redemption%',       0, 'juego'),
  ('eneba', '%ea sports fc%',              0, 'juego'),
  ('eneba', '%elden ring%',                0, 'juego'),
  ('eneba', '%cyberpunk 2077%',            0, 'juego'),
  ('eneba', '%witcher 3%',                 0, 'juego'),
  ('eneba', '%baldur_s gate 3%',           0, 'juego'),
  ('eneba', '%hogwarts legacy%',           0, 'juego'),
  ('eneba', '%god of war%',                0, 'juego'),
  ('eneba', '%spider-man%',                0, 'juego'),
  ('eneba', '%black myth%',                0, 'juego'),
  ('eneba', '%split fiction%',             0, 'juego'),
  ('eneba', '%it takes two%',              0, 'juego'),
  ('eneba', '%helldivers%',                0, 'juego'),
  ('eneba', '%palworld%',                  0, 'juego'),
  -- Segunda línea
  ('eneba', '%fortnite%',                  1, 'juego'),
  ('eneba', '%call of duty%',              1, 'juego'),
  ('eneba', '%resident evil%',             1, 'juego'),
  ('eneba', '%assassin_s creed%',          1, 'juego'),
  ('eneba', '%forza horizon%',             1, 'juego'),
  ('eneba', '%battlefield%',               1, 'juego'),
  ('eneba', '%diablo%',                    1, 'juego'),
  ('eneba', '%overwatch%',                 1, 'juego'),
  ('eneba', '%monster hunter%',            1, 'juego'),
  ('eneba', '%mortal kombat%',             1, 'juego'),
  ('eneba', '%tekken%',                    1, 'juego'),
  ('eneba', '%street fighter%',            1, 'juego'),
  ('eneba', '%dark souls%',                1, 'juego'),
  ('eneba', '%super mario%',               1, 'juego'),
  ('eneba', '%mario kart%',                1, 'juego'),
  ('eneba', '%zelda%',                     1, 'juego'),
  ('eneba', '%pok_mon%',                   1, 'juego'),
  ('eneba', '%stardew%',                   1, 'juego'),
  ('eneba', '%rocket league%',             1, 'juego'),
  ('eneba', '%counter-strike%',            1, 'juego'),
  ('eneba', '%razer gold%',                1, 'tarjeta'),
  ('eneba', '%amazon gift card%',          1, 'tarjeta'),
  ('eneba', '%twitch gift card%',          1, 'tarjeta'),
  ('eneba', '%free fire%',                 1, 'moneda'),
  ('eneba', '%genshin%',                   1, 'moneda'),
  ('eneba', '%pubg%',                      1, 'moneda'),
  -- Relegado
  ('eneba', '%crypto%',                   90, 'vouchers cripto'),
  ('eneba', '%binance%',                  90, 'vouchers cripto'),
  ('eneba', '%paypal%',                   90, 'vouchers de reventa'),
  ('eneba', '%(dlc)%',                    90, 'contenido suelto'),
  ('eneba', '%pre-order bonus%',          90, 'contenido suelto'),
  ('eneba', '%double xp%',                90, 'mejora suelta'),
  ('eneba', '%soundtrack%',               90, 'contenido suelto'),
  ('eneba', '%artbook%',                  90, 'contenido suelto'),
  ('eneba', '%alpha academy%',            90, 'cursos')
on conflict (store_slug, pattern) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Candado antes del cascade, el mismo de 0054/0056: solo pueden depender de
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
    raise exception 'mv_catalog tiene dependencias que esta migracion no conoce (%). Agregarlas a 0057 antes de correrla.', v_unknown;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. La materializada, con `region`, `region_rank` y `featured_rank`.
--
-- Mismas columnas y en el mismo orden que 0056; la nueva va al final.
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
  end::smallint     as region_rank,
  (
    coalesce(ft.tier, 50) * 1024
    + case
        when ft.tier < 50 then (hashtext(sp.id::text)::bigint & 1023)
        else 0
      end
  )::integer        as featured_rank
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
left join find_your_prices.categories cr on cr.id = coalesce(c.parent_id, c.id)
left join find_your_prices.exchange_rates fx on fx.currency = sp.currency
left join lateral (
  select coalesce(
           max(t.tier) filter (where t.tier > 50),
           min(t.tier) filter (where t.tier < 50)
         ) as tier
  from find_your_prices.catalog_featured_terms t
  where t.store_slug = s.slug
    and sp.name ilike t.pattern
) ft on true
where sp.is_active and s.is_active
with data;

comment on materialized view find_your_prices.mv_catalog is
  'Copia plana e indexada de v_store_products_current, mas price_hnl (0054), region_rank (0056) y featured_rank (0057). La lee el catalogo publico. Se refresca con refresh_catalog() al terminar el scraping y por pg_cron si algo cambio.';

comment on column find_your_prices.mv_catalog.price_hnl is
  'Precio de referencia en lempiras (price x exchange_rates). Solo para ordenar, filtrar y rangos; lo que se muestra es price en currency.';

comment on column find_your_prices.mv_catalog.region is
  'Region de la clave (attributes.region, p. ej. "Global"). Null en lo que no se vende por region.';

comment on column find_your_prices.mv_catalog.region_rank is
  '0 = sin region, GLOBAL, LATAM o UNITED STATES; 1 = cualquier otra region. El catalogo ordena por esto primero (0056).';

comment on column find_your_prices.mv_catalog.featured_rank is
  'Menor = antes. tier x 1024 + un resto repartido por hash del id (para que lo destacado salga mezclado y no por orden alfabetico). 51200 = sin regla, ni destacado ni relegado; mas alto = relegado. Sale de catalog_featured_terms (0057). El catalogo ordena por esto justo despues de region_rank.';

-- Índices de 0054, más los dos órdenes por defecto precedidos de region_rank y
-- featured_rank (el orden del catálogo es region_rank, featured_rank, la clave elegida).
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
create index if not exists mv_catalog_featured_discount_idx
  on find_your_prices.mv_catalog (region_rank, featured_rank, discount_percent desc nulls last, id);
create index if not exists mv_catalog_featured_newest_idx
  on find_your_prices.mv_catalog (region_rank, featured_rank, first_seen_at desc nulls last, id);

-- 0030 llamó `mv_catalog_store_category_idx` al índice sobre
-- `store_category_name`, y 0051 quiso crear uno sobre `store_category_id` con
-- ese mismo nombre: el `if not exists` lo saltó y `admin_store_category_counts`
-- quedó sin índice. Con la materializada nueva cada uno lleva el suyo.
create index if not exists mv_catalog_store_category_name_idx
  on find_your_prices.mv_catalog (store_category_name);

analyze find_your_prices.mv_catalog;

grant select on find_your_prices.mv_catalog to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Las vistas que se fueron con el cascade, sin cambios desde 0054.
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
-- 5. El pg_cron de respaldo también se entera de un cambio en los términos.
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
    (select max(updated_at) from find_your_prices.exchange_rates),
    (select max(updated_at) from find_your_prices.catalog_featured_terms)
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
-- 6. Reporte: cuántos artículos de Eneba caen en cada nivel de región y de
-- destacado (nivel 50 = sin regla, 90 = relegado).
-- -----------------------------------------------------------------------------
select m.region_rank,
       m.featured_rank / 1024 as nivel,
       count(*) as articulos,
       min(m.name) as ejemplo
from find_your_prices.mv_catalog m
where m.store_slug = 'eneba'
group by m.region_rank, m.featured_rank / 1024
order by m.region_rank, nivel;

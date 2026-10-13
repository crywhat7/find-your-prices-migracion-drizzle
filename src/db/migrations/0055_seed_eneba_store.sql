-- =============================================================================
-- 0055_seed_eneba_store.sql
-- Eneba entra al comparador como tienda, con su catálogo de aliado.
--
-- Por qué. 0047 dejó a los aliados fuera de `stores` ("no entra al
-- comparador"). Esa regla se descarta: con la alianza firmada, Eneba nos
-- comparte su catálogo y sus productos tienen que aparecer donde la gente
-- busca —"steam", "xbox", "gift card"— con el enlace de afiliado. La sección
-- /aliados sigue igual (promo, código, banner); esto es lo que faltaba.
--
-- No se scrapea. El catálogo llega como export CSV (formato Google Shopping)
-- y se carga a mano, cada vez que Eneba manda uno nuevo:
--
--   npm run eneba:import -- "ruta/al/eneba_export.csv"
--
-- El script entra por el mismo runner que las demás tiendas (bitácora,
-- dedupe por external_id, content_hash, price_history, bajas y refresco del
-- catálogo), usando el target de abajo. Ver scripts/import-eneba.ts.
--
-- Precios en USD tal cual los publica Eneba: el orden y los filtros los
-- comparan en lempiras gracias a 0054. Correr 0054 antes que esta.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La tienda.
--
-- `affiliateParams` se agrega al enlace de cada producto al importar (mismo
-- `af_id` que la sección de aliados, 0052). Cambiarlo acá y reimportar
-- reescribe todos los enlaces.
-- -----------------------------------------------------------------------------
insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'eneba',
  'Eneba',
  'https://www.eneba.com',
  'HN',
  'USD',
  'es-HN',
  'eneba',
  jsonb_build_object('affiliateParams', jsonb_build_object('af_id', 'findyourprices')),
  0,
  1,
  true,
  'Aliado (programa de afiliados). Sin scraping: el catálogo llega como CSV del aliado y se carga con '
  || '`npm run eneba:import -- <archivo.csv>`. Precios en USD. Categorías deducidas de la plataforma '
  || '(el CSV trae google_product_category 1279 en todo).'
)
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  default_currency = excluded.default_currency,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  notes = excluded.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. El target que usa el script.
--
-- `full_catalog`: el CSV es el catálogo entero del aliado, así que lo que deja
-- de venir se da de baja (el script lo puede evitar con --keep-missing).
-- INACTIVO a propósito: el cron no debe correrlo, no hay nada que descargar.
-- Si alguien le da "Ejecutar" en el panel, la estrategia responde cómo se
-- importa. `frequency_minutes` es solo informativo.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'eneba')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, paused_reason, notes
)
select
  s.id,
  'Eneba - Catalogo del aliado (CSV)',
  'full_catalog'::find_your_prices.scrape_target_kind,
  'https://www.eneba.com',
  '{}'::jsonb,
  43200,
  1,
  100,
  false,
  'Se carga a mano desde CSV: npm run eneba:import -- <archivo.csv>',
  'Export CSV que comparte Eneba. Cada importación queda en scrape_runs con trigger manual.'
from s
on conflict (store_id, url) where url is not null do update set
  name = excluded.name,
  kind = excluded.kind,
  is_active = excluded.is_active,
  paused_reason = excluded.paused_reason,
  notes = excluded.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. Categorías de Eneba, ya mapeadas al árbol canónico.
--
-- Son nuestras (las deduce `classifyEneba` en strategies/eneba.ts), así que
-- se dan de alta acá con su nodo canónico en vez de esperar a la primera
-- importación. La importación las vuelve a upsertar sin tocar `category_id`.
-- `coalesce`: lo que se haya corregido desde el panel gana.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'eneba')
insert into find_your_prices.store_categories (store_id, external_id, name, slug, level, position, category_id)
select s.id, v.external_id, v.name, v.external_id, 0, v.position, c.id
from s
cross join (values
  ('pc-games',       'Juegos para PC',              0, 'videojuegos'),
  ('xbox',           'Xbox',                        1, 'xbox'),
  ('playstation',    'PlayStation',                 2, 'playstation'),
  ('nintendo',       'Nintendo',                    3, 'nintendo'),
  ('software',       'Software',                    4, 'software'),
  ('gift-cards',     'Tarjetas de regalo',          5, 'codigos-digitales'),
  ('prepaid-crypto', 'Vouchers prepago y cripto',   6, 'codigos-digitales'),
  ('mobile-top-up',  'Recargas y monedas de juego', 7, 'codigos-digitales')
) as v(external_id, name, position, canonical_slug)
left join find_your_prices.categories c on c.slug = v.canonical_slug
on conflict (store_id, external_id) do update set
  name = excluded.name,
  position = excluded.position,
  category_id = coalesce(find_your_prices.store_categories.category_id, excluded.category_id),
  updated_at = now();

-- Reporte: las ocho categorías con su nodo (ninguna debería salir sin mapear).
select sc.external_id, sc.name, c.slug as categoria_canonica
from find_your_prices.store_categories sc
join find_your_prices.stores s on s.id = sc.store_id
left join find_your_prices.categories c on c.id = sc.category_id
where s.slug = 'eneba'
order by sc.position;

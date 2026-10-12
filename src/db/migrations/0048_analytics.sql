-- =============================================================================
-- 0048_analytics.sql
-- Estadísticas de visitas propias: cada página vista y cada clic hacia un
-- aliado, para el panel /admin/trafico y el reporte que se les muestra a los
-- aliados.
--
-- Qué se guarda y qué NO. Se guarda la página, la hora, de dónde vino la
-- visita (dominio de referencia y UTM), la ubicación aproximada que el
-- proveedor deduce de la IP (país, región, ciudad), el tipo de dispositivo,
-- navegador y sistema, y el ancho de pantalla. La IP NUNCA se guarda: se
-- reduce a un hash con una sal que cambia cada mes (`visitor_hash`), que
-- alcanza para contar visitantes únicos dentro del mes y no sirve para
-- seguir a nadie entre meses ni para recuperar la IP. `session_id` es un
-- número al azar que vive en el `sessionStorage` de la pestaña.
--
-- Esto es lo que dice la política de privacidad publicada; si cambia lo que
-- se guarda, cambia ella también.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

create table if not exists find_your_prices.page_views (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  path          text not null,
  page_type     text not null,
  locale        text,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  country       text,
  region        text,
  city          text,
  device        text not null,
  browser       text,
  os            text,
  screen_width  integer,
  visitor_hash  text not null,
  session_id    text
);

create index if not exists page_views_created_at_idx on find_your_prices.page_views (created_at);
create index if not exists page_views_path_created_idx on find_your_prices.page_views (path, created_at);

comment on table find_your_prices.page_views is
  'Una fila por pagina vista. Sin IP: visitor_hash es un HMAC con sal mensual.';

-- Clics hacia aliados con fecha (los contadores de 0047 no la tienen): es la
-- cifra que más le importa a un aliado.
create table if not exists find_your_prices.affiliate_click_events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  partner_id   uuid not null references find_your_prices.affiliate_partners(id) on delete cascade,
  offer_id     uuid references find_your_prices.affiliate_offers(id) on delete set null,
  country      text,
  device       text,
  visitor_hash text not null
);

create index if not exists affiliate_click_events_created_idx
  on find_your_prices.affiliate_click_events (created_at, partner_id);

-- Cerradas a las llaves públicas: se escriben y se leen desde el servidor.
alter table find_your_prices.page_views enable row level security;
alter table find_your_prices.affiliate_click_events enable row level security;
revoke all on find_your_prices.page_views from anon, authenticated;
revoke all on find_your_prices.affiliate_click_events from anon, authenticated;
grant all on find_your_prices.page_views to service_role;
grant all on find_your_prices.affiliate_click_events to service_role;

-- -----------------------------------------------------------------------------
-- Reporte de un rango, en una sola ida a la base.
--
-- Todo en hora de Honduras: "el lunes a las 8" es el lunes a las 8 de acá,
-- no en UTC. `p_bucket` es 'day', 'week' o 'month'; la serie trae todos los
-- tramos del rango, también los que tienen cero (un hueco en la línea no es
-- lo mismo que un cero).
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.analytics_report(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',
  p_limit integer default 12
)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with v as (
    select *, created_at at time zone 'America/Tegucigalpa' as local_at
    from find_your_prices.page_views
    where created_at >= p_from and created_at < p_to
  ),
  buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone 'America/Tegucigalpa'),
      (p_to - interval '1 second') at time zone 'America/Tegucigalpa',
      ('1 ' || p_bucket)::interval
    ) as bucket
  ),
  per_bucket as (
    select date_trunc(p_bucket, local_at) as bucket,
           count(*) as views,
           count(distinct visitor_hash) as visitors
    from v group by 1
  ),
  clicks as (
    select e.partner_id, count(*) as clicks, count(distinct e.visitor_hash) as visitors
    from find_your_prices.affiliate_click_events e
    where e.created_at >= p_from and e.created_at < p_to
    group by e.partner_id
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'views', count(*),
        'visitors', count(distinct visitor_hash),
        'sessions', count(distinct session_id),
        'mobile', count(*) filter (where device = 'mobile'),
        'honduras', count(*) filter (where country = 'HN'),
        'visitorDays', count(distinct (visitor_hash, local_at::date))
      ) from v
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
        'views', coalesce(p.views, 0),
        'visitors', coalesce(p.visitors, 0)
      ) order by b.bucket), '[]'::jsonb)
      from buckets b left join per_bucket p on p.bucket = b.bucket
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('label', path, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select path, count(*) n, count(distinct visitor_hash) u from v group by path order by 2 desc limit p_limit) t
    ),
    'pageTypes', (
      select coalesce(jsonb_agg(jsonb_build_object('label', page_type, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select page_type, count(*) n, count(distinct visitor_hash) u from v group by page_type) t
    ),
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('label', c, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select coalesce(country, '??') c, count(*) n, count(distinct visitor_hash) u from v group by 1 order by 2 desc limit p_limit) t
    ),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('label', c, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (
        select concat_ws(', ', city, region, country) c, count(*) n, count(distinct visitor_hash) u
        from v where city is not null group by 1 order by 2 desc limit p_limit
      ) t
    ),
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('label', device, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select device, count(*) n, count(distinct visitor_hash) u from v group by device) t
    ),
    'browsers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', b, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select coalesce(browser, 'Otro') b, count(*) n, count(distinct visitor_hash) u from v group by 1 order by 2 desc limit p_limit) t
    ),
    'os', (
      select coalesce(jsonb_agg(jsonb_build_object('label', o, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select coalesce(os, 'Otro') o, count(*) n, count(distinct visitor_hash) u from v group by 1 order by 2 desc limit p_limit) t
    ),
    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', r, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select coalesce(referrer_host, '(directo)') r, count(*) n, count(distinct visitor_hash) u from v group by 1 order by 2 desc limit p_limit) t
    ),
    'campaigns', (
      select coalesce(jsonb_agg(jsonb_build_object('label', c, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (
        select concat_ws(' · ', utm_source, utm_medium, utm_campaign) c, count(*) n, count(distinct visitor_hash) u
        from v where utm_source is not null or utm_campaign is not null
        group by 1 order by 2 desc limit p_limit
      ) t
    ),
    'locales', (
      select coalesce(jsonb_agg(jsonb_build_object('label', l, 'views', n, 'visitors', u) order by n desc), '[]'::jsonb)
      from (select coalesce(locale, '??') l, count(*) n, count(distinct visitor_hash) u from v group by 1) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_array(d, h, n)), '[]'::jsonb)
      from (
        select extract(isodow from local_at)::int d, extract(hour from local_at)::int h, count(*) n
        from v group by 1, 2
      ) t
    ),
    'partnerClicks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'label', p.name, 'views', c.clicks, 'visitors', c.visitors
      ) order by c.clicks desc), '[]'::jsonb)
      from clicks c join find_your_prices.affiliate_partners p on p.id = c.partner_id
    )
  );
$$;

revoke all on function find_your_prices.analytics_report(timestamptz, timestamptz, text, integer) from public;
grant execute on function find_your_prices.analytics_report(timestamptz, timestamptz, text, integer) to service_role;

-- `visitorDays` suma, día por día, los visitantes distintos de ese día:
-- dividido por los días del rango da el promedio diario exacto, que no se
-- puede sacar de los únicos del rango entero.

-- Totales sueltos, para comparar con el período anterior sin pagar el reporte entero.
create or replace function find_your_prices.analytics_totals(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  select jsonb_build_object(
    'views', count(*),
    'visitors', count(distinct visitor_hash),
    'sessions', count(distinct session_id),
    'mobile', count(*) filter (where device = 'mobile'),
    'honduras', count(*) filter (where country = 'HN'),
    'visitorDays', count(distinct (visitor_hash, (created_at at time zone 'America/Tegucigalpa')::date))
  )
  from find_your_prices.page_views
  where created_at >= p_from and created_at < p_to;
$$;

revoke all on function find_your_prices.analytics_totals(timestamptz, timestamptz) from public;
grant execute on function find_your_prices.analytics_totals(timestamptz, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- Retención: 25 meses (dos años completos para comparar año contra año, más
-- el mes en curso). Si la base tiene pg_cron, se programa sola cada día.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.purge_old_analytics()
returns void
language sql
set search_path = find_your_prices, pg_catalog
as $$
  delete from find_your_prices.page_views where created_at < now() - interval '25 months';
  delete from find_your_prices.affiliate_click_events where created_at < now() - interval '25 months';
$$;

revoke all on function find_your_prices.purge_old_analytics() from public;
grant execute on function find_your_prices.purge_old_analytics() to service_role;

do $$
begin
  perform cron.schedule('fyp-purge-analytics', '17 9 * * *', 'select find_your_prices.purge_old_analytics()');
exception when others then
  raise notice 'pg_cron no disponible (%): correr find_your_prices.purge_old_analytics() a mano de vez en cuando.', sqlerrm;
end $$;

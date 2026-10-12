-- =============================================================================
-- 0050_analytics_bots.sql
-- Los bots también se registran, marcados, para poder verlos o no en
-- /admin/trafico con un checkbox.
--
-- Hasta 0048 los bots se descartaban en la entrada. Como casi ninguno
-- ejecuta JavaScript, el contador del navegador no los ve: los registra
-- `src/proxy.ts` en el servidor, con `is_bot = true` y el nombre del bot
-- (Googlebot, facebookexternalhit, GPTBot…). Las personas se siguen contando
-- desde el navegador, así nadie se cuenta dos veces.
--
-- Por defecto los reportes los EXCLUYEN (`p_include_bots = false`): las
-- cifras que se les muestran a los aliados son de personas.
--
-- Idempotente.
-- =============================================================================

alter table find_your_prices.page_views
  add column if not exists is_bot boolean not null default false,
  add column if not exists bot_name text;

alter table find_your_prices.affiliate_click_events
  add column if not exists is_bot boolean not null default false,
  add column if not exists bot_name text;

-- Las funciones cambian de firma: se borran las de 0048 y se crean de nuevo.
drop function if exists find_your_prices.analytics_report(timestamptz, timestamptz, text, integer);
drop function if exists find_your_prices.analytics_totals(timestamptz, timestamptz);

create or replace function find_your_prices.analytics_report(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',
  p_limit integer default 12,
  p_include_bots boolean default false
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
      and (p_include_bots or not is_bot)
  ),
  bots as (
    select coalesce(bot_name, 'Otro bot') as bot_name, count(*) as n
    from find_your_prices.page_views
    where created_at >= p_from and created_at < p_to and is_bot
    group by 1
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
      and (p_include_bots or not e.is_bot)
    group by e.partner_id
  )
  select jsonb_build_object(
    -- Siempre, con o sin el filtro: cuántas vistas de bots hay en el rango.
    'botViews', (select coalesce(sum(n), 0) from bots),
    'bots', (
      select coalesce(jsonb_agg(jsonb_build_object('label', bot_name, 'views', n, 'visitors', 0) order by n desc), '[]'::jsonb)
      from (select * from bots order by n desc limit p_limit) t
    ),
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


create or replace function find_your_prices.analytics_totals(p_from timestamptz, p_to timestamptz, p_include_bots boolean default false)
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
  where created_at >= p_from and created_at < p_to
    and (p_include_bots or not is_bot);
$$;


revoke all on function find_your_prices.analytics_report(timestamptz, timestamptz, text, integer, boolean) from public;
grant execute on function find_your_prices.analytics_report(timestamptz, timestamptz, text, integer, boolean) to service_role;

revoke all on function find_your_prices.analytics_totals(timestamptz, timestamptz, boolean) from public;
grant execute on function find_your_prices.analytics_totals(timestamptz, timestamptz, boolean) to service_role;

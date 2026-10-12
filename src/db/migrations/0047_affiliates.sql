-- =============================================================================
-- 0047_affiliates.sql
-- Programa de afiliados: aliados (Eneba y los que vengan), sus códigos
-- promocionales y los productos que se destacan de cada uno.
--
-- Por qué. El sitio dejó los anuncios para sostenerse con patrocinios y
-- afiliaciones. Un aliado es una tienda en línea que nos paga una comisión
-- por las compras que llegan desde nuestros enlaces. Vive APARTE del
-- comparador: no es una tienda rastreada, no entra a `stores`, no aparece en
-- los resultados y no toca el orden de nada. Tiene su propia sección
-- (/aliados), sus propios enlaces y su propia bitácora de clics.
--
-- Se cargan a mano desde el panel (/admin/aliados): no hay scraping.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Aliados.
--
-- `affiliate_url` es el enlace con nuestro identificador de afiliado; si está
-- vacío se usa `website_url`. `promo_code` es el código general del aliado;
-- cada producto puede traer el suyo. `starts_at`/`ends_at` acotan campañas:
-- fuera de la ventana el aliado no se muestra aunque esté activo.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.affiliate_partners (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  website_url    text not null,
  affiliate_url  text,
  promo_code     text,
  promo_text_es  text,
  promo_text_en  text,
  tagline_es     text,
  tagline_en     text,
  description_es text,
  description_en text,
  logo_url       text,
  image_alt      text,
  is_active      boolean not null default false,
  is_featured    boolean not null default false,
  sort_order     integer not null default 0,
  starts_at      timestamptz,
  ends_at        timestamptz,
  click_count    bigint not null default 0,
  last_clicked_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint affiliate_partners_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint affiliate_partners_urls_http check (
    website_url ~* '^https?://' and (affiliate_url is null or affiliate_url ~* '^https?://')
  )
);

comment on table find_your_prices.affiliate_partners is
  'Aliados del programa de afiliados. Separados de stores: no se rastrean ni entran al comparador.';

-- -----------------------------------------------------------------------------
-- 2. Productos destacados de cada aliado.
--
-- Precio con moneda propia: un aliado como Eneba publica en dólares, no en
-- lempiras, y convertirlo sería inventar un precio. `url` es el enlace de
-- afiliado directo al producto.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.affiliate_offers (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references find_your_prices.affiliate_partners(id) on delete cascade,
  title_es    text not null,
  title_en    text,
  note_es     text,
  note_en     text,
  url         text not null,
  image_url   text,
  price       numeric(12, 2),
  list_price  numeric(12, 2),
  currency    text not null default 'USD',
  promo_code  text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  click_count bigint not null default 0,
  last_clicked_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint affiliate_offers_url_http check (url ~* '^https?://' and (image_url is null or image_url ~* '^https?://')),
  constraint affiliate_offers_currency check (currency ~ '^[A-Z]{3}$'),
  constraint affiliate_offers_prices check (
    (price is null or price >= 0) and (list_price is null or list_price >= 0)
  )
);

create index if not exists affiliate_offers_partner_idx
  on find_your_prices.affiliate_offers (partner_id, sort_order);

comment on table find_your_prices.affiliate_offers is
  'Productos destacados de un aliado, con enlace de afiliado y codigo opcional.';

-- updated_at al día en cada edición.
create or replace function find_your_prices.touch_updated_at()
returns trigger
language plpgsql
set search_path = find_your_prices, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists affiliate_partners_touch on find_your_prices.affiliate_partners;
create trigger affiliate_partners_touch
  before update on find_your_prices.affiliate_partners
  for each row
  when (old.click_count is not distinct from new.click_count)
  execute function find_your_prices.touch_updated_at();

drop trigger if exists affiliate_offers_touch on find_your_prices.affiliate_offers;
create trigger affiliate_offers_touch
  before update on find_your_prices.affiliate_offers
  for each row
  when (old.click_count is not distinct from new.click_count)
  execute function find_your_prices.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Seguridad: cerradas a las llaves públicas.
--
-- El sitio las lee desde el servidor con service_role (como el panel), así
-- que anon y authenticated no necesitan nada. RLS activa y sin políticas =
-- cero filas para ellos; además se revocan los grants. Lo mismo que las
-- tablas operativas de 0012.
-- -----------------------------------------------------------------------------
alter table find_your_prices.affiliate_partners enable row level security;
alter table find_your_prices.affiliate_offers enable row level security;

revoke all on find_your_prices.affiliate_partners from anon, authenticated;
revoke all on find_your_prices.affiliate_offers from anon, authenticated;
grant all on find_your_prices.affiliate_partners to service_role;
grant all on find_your_prices.affiliate_offers to service_role;

-- -----------------------------------------------------------------------------
-- 4. Contador de clics.
--
-- Lo llama la redirección /go/<aliado> antes de mandar a la persona al
-- aliado. Suma uno al aliado y, si vino de un producto, al producto. Solo
-- service_role: el endpoint corre en el servidor.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.record_affiliate_click(p_partner_id uuid, p_offer_id uuid default null)
returns void
language sql
security definer
set search_path = find_your_prices, pg_catalog
as $$
  update find_your_prices.affiliate_partners
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = p_partner_id;

  update find_your_prices.affiliate_offers
     set click_count = click_count + 1,
         last_clicked_at = now()
   where p_offer_id is not null
     and id = p_offer_id
     and partner_id = p_partner_id;
$$;

revoke all on function find_your_prices.record_affiliate_click(uuid, uuid) from public;
grant execute on function find_your_prices.record_affiliate_click(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Bucket de Storage para los logos de aliados. Igual que `store-images`
-- (0033): público de lectura, subida desde el panel.
-- -----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'affiliate-images',
    'affiliate-images',
    true,
    5242880, -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'affiliate_images_public_read'
  ) then
    create policy affiliate_images_public_read on storage.objects
      for select using (bucket_id = 'affiliate-images');
  end if;
exception when others then
  raise notice 'No se pudo crear el bucket affiliate-images desde SQL (%): crearlo desde Storage → New bucket, público.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Eneba, inactivo. Queda listo para completar desde el panel (enlace de
-- afiliado, código y logo) y activarlo cuando el acuerdo esté firmado.
-- -----------------------------------------------------------------------------
insert into find_your_prices.affiliate_partners (
  slug, name, website_url, tagline_es, tagline_en, description_es, description_en, is_active, sort_order
)
values (
  'eneba',
  'Eneba',
  'https://www.eneba.com',
  'Juegos, tarjetas de regalo y suscripciones digitales',
  'Games, gift cards and digital subscriptions',
  'Tienda digital de claves de juegos para PC y consolas, tarjetas de regalo (Steam, PlayStation, Xbox, Nintendo) y suscripciones. La entrega es por correo y al instante.',
  'Digital store for PC and console game keys, gift cards (Steam, PlayStation, Xbox, Nintendo) and subscriptions. Delivery is instant, by email.',
  false,
  0
)
on conflict (slug) do nothing;

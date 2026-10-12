-- =============================================================================
-- 0049_affiliate_applications.sql
-- Solicitudes de afiliación: una tienda que quiere ser aliada llena el
-- formulario de /aliados y queda acá, para que la contactemos desde
-- /admin/aliados.
--
-- Es el único lugar del sitio que pide datos de contacto, y solo a tiendas
-- que lo envían por su cuenta. La política de privacidad lo describe.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

create table if not exists find_your_prices.affiliate_applications (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  store_name    text not null,
  website       text,
  contact_name  text not null,
  email         text not null,
  phone         text,
  category      text,
  message       text,
  locale        text,
  -- new → contacted → accepted | rejected
  status        text not null default 'new',
  notes         text,
  -- Mismo hash anónimo de 0048: solo para frenar envíos en ráfaga.
  visitor_hash  text,
  constraint affiliate_applications_status check (status in ('new', 'contacted', 'accepted', 'rejected')),
  constraint affiliate_applications_lengths check (
    char_length(store_name) <= 120 and char_length(contact_name) <= 120 and char_length(email) <= 200
    and (message is null or char_length(message) <= 2000)
  )
);

create index if not exists affiliate_applications_created_idx
  on find_your_prices.affiliate_applications (created_at desc);
create index if not exists affiliate_applications_status_idx
  on find_your_prices.affiliate_applications (status);

drop trigger if exists affiliate_applications_touch on find_your_prices.affiliate_applications;
create trigger affiliate_applications_touch
  before update on find_your_prices.affiliate_applications
  for each row execute function find_your_prices.touch_updated_at();

-- Cerrada a las llaves públicas: el formulario escribe desde el servidor.
alter table find_your_prices.affiliate_applications enable row level security;
revoke all on find_your_prices.affiliate_applications from anon, authenticated;
grant all on find_your_prices.affiliate_applications to service_role;

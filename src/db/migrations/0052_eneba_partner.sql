-- =============================================================================
-- 0052_eneba_partner.sql
-- Da de alta a Eneba en la sección de aliados: enlace de afiliado, logo y
-- activación. La fila ya existía inactiva desde 0047.
--
-- El logo es la versión "invertida" de Eneba (public/images/partners/eneba.svg),
-- la de texto oscuro: sobre el fondo blanco de las tarjetas se ve, a diferencia
-- de la de texto blanco.
--
-- Es lo mismo que hacer desde /admin/aliados → Eneba.
-- =============================================================================

update find_your_prices.affiliate_partners
   set affiliate_url = 'https://www.eneba.com/?af_id=findyourprices',
       logo_url      = '/images/partners/eneba.svg',
       image_alt     = 'Eneba',
       is_active     = true,
       updated_at    = now()
 where slug = 'eneba';

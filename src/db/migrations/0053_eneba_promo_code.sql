-- =============================================================================
-- 0053_eneba_promo_code.sql
-- Código de descuento de Eneba (5%): `findyourprices`. Se muestra en la sección
-- de aliados con el botón de copiar.
--
-- Es lo mismo que hacer desde /admin/aliados → Eneba.
-- =============================================================================

update find_your_prices.affiliate_partners
   set promo_code    = 'findyourprices',
       promo_text_es = '5% de descuento con el código findyourprices',
       promo_text_en = '5% off with the code findyourprices',
       updated_at    = now()
 where slug = 'eneba';

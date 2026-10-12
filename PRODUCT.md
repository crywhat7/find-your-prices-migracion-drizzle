# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuario principal: el consumidor hondureño justo antes de comprar.** Ya sabe qué
quiere —un televisor, un celular, un cuaderno para la escuela— y entra a
averiguar en qué tienda está más barato antes de ir al local o pedirlo en línea.
La sesión es corta y con intención de compra: llega con una palabra en la
cabeza, la escribe, mira precios, y se va a la tienda que ganó.

Consecuencias de esto para cualquier trabajo futuro:

- La búsqueda es la acción principal de la portada, no un elemento más.
- Todo lo que retrase el primer resultado compite con el motivo de la visita.
- El destino natural del recorrido es salir hacia la tienda, no quedarse acá.
- Buena parte de las visitas ocurren en teléfono y con datos móviles.

Existen dos audiencias secundarias observables —quien vuelve a ver qué bajó de
precio, y el negocio que repone inventario— pero **no se optimiza para ellas**:
cuando entran en conflicto con el consumidor con intención de compra, gana el
consumidor.

## Product Purpose

Find Your Prices reúne en una sola búsqueda lo que venden las tiendas de
Honduras, para que comparar precios deje de significar abrir seis pestañas.

Es gratis, no pide cuenta y no vende nada: cada producto conserva el enlace a la
tienda de origen. El éxito es que alguien encuentre el precio más bajo en menos
tiempo del que le habría tomado revisar una sola tienda, y que se vaya del sitio
a comprar.

## Positioning

**El valor es la cobertura: están todas.**

Lo que hoy tiene un hondureño para comparar precios son grupos de WhatsApp,
publicaciones de Facebook y visitar tienda por tienda. Ninguna de esas opciones
es completa ni consultable. La diferencia defendible de Find Your Prices no es
una función de la interfaz sino el inventario detrás: el catálogo hondureño
completo, normalizado y buscable en un solo lugar.

De ahí se desprende la métrica que importa más que cualquier otra: **que no
falte ninguna tienda grande.** Una tienda ausente es un fallo de producto más
grave que cualquier fallo de interfaz, porque rompe la única promesa que el
producto hace.

## Operating Context

- **Mercado:** Honduras. Moneda lempira (HNL), con formato local (`es-HN`,
  `en-HN`): "L 1,299.00", no "1.299,00 HNL".
- **Idiomas:** español en la raíz del sitio, inglés bajo `/en`. El español es el
  idioma nativo del producto, con voseo hondureño; el inglés es traducción.
- **Tiendas cubiertas hoy (23, todas activas, octubre 2026):**
  - Supermercados y por mayor: Walmart Honduras, Paiz, PriceSmart Honduras,
    Comisariato Los Andes.
  - Tiendas por departamento y hogar: Diunsa, Larach y Cía, Lady Lee, ACOSA.
  - Electrónica y tecnología: Jetstereo, RadioShack Honduras, Steren, PC Builds
    Honduras, Game Station, Okashi HN.
  - Farmacia y cuidado personal: Farmacias Kielsa, Farmacia Siman, Prive
    Perfumes.
  - Librería y oficina: Metromedia, Office Depot, Paper Depot, Útiles de
    Honduras, Meyko.
  - Ropa: Zara.

  Cada una tiene su propia estrategia de scraping (`src/server/scraping/
  strategies/`). La lista viva está en la tabla `stores`.
- **Escala actual:** unos 128 600 artículos comprables (precio > 0 y con
  existencia) al 12 de octubre de 2026. Los que más aportan: Larach (~19 000),
  Walmart (~15 400), Metromedia (~12 800) y Zara (~11 800). El árbol propio
  tiene 208 categorías en 25 raíces.
- **Cómo entra la información:** un cron de GitHub Actions dispara cada hora y
  corre lo que vence según una agenda semanal fija (migración 0046, calendario
  en `src/db/docs/scrape-schedule.md`). Walmart, Paiz, PriceSmart, Comisariato
  Los Andes, Kielsa y Farmacia Siman se recorren dos veces por semana; el
  resto, una. Los catálogos grandes también se pueden correr a mano desde una
  computadora (`npm run scrape:local`). El catálogo cambia cuando corre el
  scraper, no cuando alguien visita.
- **Caché:** portada 5 min; categorías, tiendas y fichas 1 h; aliados 15 min.
  Guardar desde el panel regenera lo que toca, y `/admin` tiene botones para
  tirar el caché a mano.
- **Dónde corre:** Cloudflare Workers (plan Free) sobre Supabase. La ubicación
  de las visitas sale de las cabeceras de Cloudflare.
- **Panel interno (`/admin`):** tráfico, scraping, árbol y mapeo de categorías,
  contenido de categorías, tiendas y aliados. Es herramienta de operación, no
  parte del producto que ve el visitante. Se entra con `CRON_SECRET`, que deja
  una cookie de sesión; cada página la vuelve a comprobar (la del layout sola
  no protege los datos).
- **Sostenimiento:** patrocinios y un programa de afiliados (octubre 2026; el
  primer interesado es Eneba). Los anuncios se quitaron. Los aliados viven en
  su propia sección (`/aliados`, `/en/partners`), con su código promocional y
  productos destacados cargados a mano desde `/admin/aliados`; las salidas
  pasan por `/go/<aliado>`, que cuenta el clic. Las tiendas del comparador no
  pagan nada y no hay posiciones pagadas.

## Capabilities and Constraints

**Lo que el producto hace hoy**

- Búsqueda y filtrado sobre el catálogo completo, resuelto en Postgres
  (Supabase), no en el navegador.
- Filtros por tienda, categoría, marca, rango de precio, con descuento y
  disponibles; orden por recién agregados, destacados, descuento, precio, nombre
  y calificación.
- Cuatro modos de ver el catálogo: lista, cuadrícula, galería y comparación por
  tienda (hasta 4 columnas, una tienda por columna).
- Bandeja de comparación: apartar hasta 4 productos concretos y leerlos en una
  tabla de atributos.
- Ficha de producto con histórico de precio, galería y enlace a la tienda.
- Tema claro/oscuro y preferencias de vista persistidas.
- Páginas de contexto y políticas: acerca de, términos, privacidad y uso de
  contenido, en los dos idiomas.
- Sección de aliados: índice y página por aliado, con código promocional
  copiable y ofertas destacadas en la moneda del aliado. Cómo funcionan los
  enlaces de afiliado se explica en los términos de uso (sección 3,
  "Transparencia"), no con un aviso en la página: así lo decidió el equipo,
  como hacen los sitios de afiliados.
- Solicitud de afiliación: en `/aliados` una tienda deja sus datos (o escribe
  al correo de contacto) y la solicitud cae en la bandeja de `/admin/aliados`,
  con aviso en el inicio del panel mientras haya nuevas. Es el único
  formulario del sitio que pide datos de contacto (migración 0049).
- Logo propio: isotipo en la barra, logo completo en el pie, favicon, íconos
  de instalación y tarjeta para compartir. Se generan desde `public/icons/`
  con `scripts/generate-brand-assets.mjs`.

**Restricciones técnicas confirmadas**

- Next.js (App Router) sobre Supabase/Postgres. `src/server/` nunca se importa
  desde componentes cliente.
- **Agregar una tienda no debe tocar la base de datos, ni el runner, ni el
  endpoint, ni el panel.** Toda la particularidad de una tienda vive dentro de
  su estrategia. Esta regla es la que permite que la cobertura escale.
- El scraper solo lee contenido público: se identifica con el agente
  `FindYourPricesBot`, deja pausa entre solicitudes, respeta `Retry-After` y no
  elude autenticación ni protecciones.
- El endpoint del cron está protegido por `CRON_SECRET`. Un scraper abierto a
  internet sería una denegación de servicio gratis contra las tiendas.
- No hay cuentas ni sesión de usuario. Las preferencias del visitante viven en
  el `localStorage` de su propio navegador.
- Hay estadísticas de visitas propias (octubre 2026, migración 0048), para
  mostrarles el tráfico a los aliados: página, hora, referencia, UTM,
  ubicación aproximada (cabeceras de Cloudflare), dispositivo, navegador y
  sistema. **La IP no se guarda**: solo un HMAC con sal mensual para contar
  únicos dentro del mes. Se ven en `/admin/trafico`, con un reporte
  imprimible para aliados. Los bots se registran aparte desde `src/proxy.ts`
  (migración 0050), marcados y con nombre; el panel los muestra solo con
  «Incluir bots» marcado, y el reporte para aliados nunca los suma. La política de privacidad lo describe; si cambia
  lo que se guarda, cambia ella también.

**Decisiones abiertas, no inventar**

- **Alertas de precio** están confirmadas como rumbo, junto con seguir sumando
  tiendas. Chocan de frente con dos hechos vigentes: "gratis y sin cuenta" y una
  política de privacidad publicada que dice que no pedimos correo. Antes de
  construirlas hay que decidir el mecanismo (¿correo sin cuenta? ¿notificación
  del navegador?) y actualizar la política de privacidad en consecuencia.
- **La API del panel de scraping** (`/api/scraping/*`) queda abierta si
  `ADMIN_API_SECRET` no está definida; se acordó así para la primera etapa y
  sigue pendiente de resolver. Las páginas de `/admin` sí piden sesión.
- **El correo de contacto publicado** (`support@findyourprices.com`, en
  `src/config/site.ts`) tiene que ser un buzón que alguien lea: de él dependen
  el retiro de contenido y ahora también las tiendas que quieren afiliarse.
- **La lista de tiendas para SEO** (`siteConfig.stores` y la descripción del
  sitio) todavía nombra 7 tiendas, no las 23.
- **El dominio no está fijado:** la configuración dice `findyourprices.com` y el
  agente del scraper dice `findyourprices.hn`.

## Brand Commitments

- **Nombre:** Find Your Prices. No se traduce; en español lo acompaña la lectura
  nativa **"Encontrá tus precios"**, en voseo.
- **Voz:** directa, hondureña, sin corporativismo ni relleno. Frases cortas.
  Voseo en español ("buscá", "comparás", "vos decidís"), no tuteo ni "usted".
  Decir lo que el producto no es tiene tanto valor como decir lo que es.
- **Autoría:** lo hicieron dos personas, acreditadas por su apodo de GitHub
  dentro del texto de "Acerca de": **crywhat7** (github.com/crywhat7) y
  **fq962** (github.com/fq962). Sin empresa y sin inversionistas. Las únicas
  comisiones son las de los aliados, explicadas en los términos de uso.
- **Compromiso público con las tiendas:** la política de uso de contenido
  publicada promete retiro a pedido en 5 días hábiles, sin exigir reclamo legal.
  Está en vigor porque está publicada. (No fue marcada como innegociable en la
  entrevista; si eso cambia, la política publicada tiene que cambiar con ella.)

## Evidence on Hand

- **Datos reales:** catálogo vivo de 23 tiendas hondureñas (~128 600 artículos
  comprables), con historial de precios en `price_history`.
- **Tráfico:** medición propia desde el 12 de octubre de 2026 en
  `/admin/trafico` (migración 0048). Cualquier cifra de visitas sale de ahí.
- **Documentación propia:** `src/db/docs/documentation.md` (esquema) y
  `src/server/scraping/README.md` (cómo se suma una tienda).
- **Textos publicados y confirmados:** `src/features/about/aboutContent.ts` y
  `src/features/legal/legalContent.ts`.

**Lo que NO existe, y no debe fabricarse:**

- No hay testimonios, reseñas de usuarios, casos de éxito ni menciones de
  prensa. Las cifras de tráfico existen solo como lo que mide `/admin/trafico`:
  no se redondean hacia arriba ni se inventan.
- No hay fotografías de los creadores.
- No hay cifras de ahorro ("ahorrá hasta un X%") ni comparativas de competencia.
- Los textos legales no han sido revisados por un abogado.

## Product Principles

1. **La cobertura manda.** Una tienda que falta hace más daño que cualquier
   detalle de interfaz. Cuando haya que elegir entre sumar una tienda y pulir
   una pantalla, se suma la tienda.
2. **El comparador señala, no vende.** Nunca carrito, nunca pagos. El recorrido
   termina en la tienda, y eso es un éxito, no una fuga. Las comisiones de
   afiliado viven aparte, en Aliados, y están explicadas en los términos de
   uso: nunca entran a los resultados del comparador ni cambian su orden, y
   una tienda no puede pagar por aparecer ni por subir.
3. **Sin fricción y sin peaje.** Gratis, sin cuenta, sin registro para comparar.
   Cualquier función nueva que pida datos tiene que justificar por qué no puede
   funcionar sin ellos.
4. **Bilingüe de nacimiento.** Toda superficie nueva sale en español e inglés a
   la vez, con el español como idioma raíz y el inglés como traducción — nunca
   al revés, nunca una sola.
5. **Buen ciudadano con las tiendas.** El producto vive de datos ajenos: se
   accede a ellos sin causar molestia, se acredita siempre la fuente y se retira
   lo que una tienda pida. Lo que protege al producto es el comportamiento, no
   el texto de la política.

## Accessibility & Inclusion

No se estableció un estándar formal, pero el código ya sostiene un piso que el
trabajo futuro no debe bajar, y hay pruebas que lo verifican:

- Controles nativos donde importan (`<select>` nativo por el teclado, el lector
  de pantalla y la rueda de iOS), estilizados sin perder su semántica.
- Nombre accesible en todo control sin texto visible; el estado no se comunica
  solo con color (`aria-pressed` más cambio de glifo).
- Anillos de foco visibles; nunca `outline: none` sin reemplazo.
- Soporte real de `prefers-reduced-motion`.
- Contexto de uso: teléfono y datos móviles son el caso común, no el borde.

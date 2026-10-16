# Migración: Supabase → Drizzle + Postgres propio (Hetzner)

Objetivo: dejar de depender de Supabase como plataforma. La app habla con
Postgres directo por Drizzle; al final la base se muda a un servidor en Hetzner
y Supabase se apaga.

## Qué hay hoy (inventario, 2026-10-16)

| Pieza de Supabase | Dónde se usa | Reemplazo |
|---|---|---|
| `supabase-js` / PostgREST (~140 llamadas `.from()`/`.rpc()`) | 22 archivos, sobre todo `src/server/services/*` y `src/server/scraping/repository.ts` | Drizzle (`drizzle-orm` + driver `postgres`) |
| 13 RPC (`ingest_store_products`, `refresh_catalog`, `analytics_report`, …) | servicios | Se quedan como funciones SQL; se llaman con `db.execute(sql\`select …\`)` |
| Storage: 4 buckets (`affiliate-images`, `category-images`, `store-images`, `sitemaps`) | `affiliates.ts`, `categoryContent.ts`, `storeContent.ts`, `sitemapStore.ts`, `scripts/generate-sitemaps.ts` | Cloudflare R2 (ya hay R2 en la cuenta) |
| Roles `anon` / `authenticated` / `service_role` + RLS | 18 migraciones con grants/policies | Un rol `fyp_app` con grants explícitos; RLS deja de ser necesario |
| `pg_cron` (refresh del catálogo cada 30 min, purga de analytics y de errores) | migraciones 0030, 0048, 0051 | `pg_cron` instalado en Hetzner (paquete `postgresql-XX-cron`) |
| Auth | **no se usa** (el panel va con `CRON_SECRET`) | nada que hacer |

Lo que **no** cambia: el esquema `find_your_prices`, las funciones, vistas y la
materializada `mv_catalog`. Las migraciones SQL de `src/db/migrations` siguen
siendo la fuente de verdad; Drizzle se usa para consultar, no para migrar (por
ahora).

## Cómo se conecta cada entorno

- **Producción (Cloudflare Workers)**: Worker → **Hyperdrive** → Postgres.
  Hyperdrive mantiene el pool de conexiones fuera del Worker (un Worker no
  puede sostener conexiones entre requests) y además cachea lecturas.
  Driver: `postgres` (postgres.js), que corre en Workers con `nodejs_compat`.
- **Local, scripts y GitHub Actions**: `DATABASE_URL` directo.
- Mientras sigamos en Supabase: usar el **pooler de Supavisor en modo sesión
  (puerto 5432)** o la conexión directa. Si se usa el modo transacción (6543)
  hay que crear el cliente con `prepare: false`.

## Fases

### Fase 1 — Base de Drizzle (sin tocar comportamiento)
1. Instalar `drizzle-orm`, `postgres`, `drizzle-kit` (dev).
2. `src/server/db/schema.ts`: tablas, vistas y la materializada del esquema
   `find_your_prices` escritas a mano a partir de las migraciones
   (`pgSchema('find_your_prices')`). En la sesión de prueba se compara con
   `drizzle-kit pull` para cazar diferencias.
3. `src/server/db/client.ts`: `getDb()` que toma la conexión de Hyperdrive
   en el Worker (`getCloudflareContext().env.HYPERDRIVE`) y de `DATABASE_URL`
   fuera de él.
4. `drizzle.config.ts` y la variable `DATABASE_URL` en `.env.example`.

### Fase 2 — Migrar consultas, archivo por archivo (de chico a grande)
Cada servicio conserva su firma y la forma de lo que devuelve, así los
componentes no se enteran. Orden:
1. `errorLog.ts`, `logError.ts`, rutas `api/scraping/*`, `admin/scraping/page.tsx`
2. `quote.ts`, `sitemap.ts`, `analytics.ts`
3. `storePages.ts`, `categoryPages.ts`, `storeContent.ts`, `categoryContent.ts` (solo DB)
4. `categories.ts`, `affiliates.ts` (solo DB)
5. `scraping/repository.ts` (ingesta, RPC críticas)
6. `catalog.ts` (búsqueda, facetas, conteos, FTS: el más delicado)
7. Scripts: `scrape-all-local.ts`, `import-eneba.ts`, `reingest-local.ts`, `generate-sitemaps.ts`

Los tests que mockean `supabase-js` se reescriben contra el nuevo cliente.

### Fase 3 — Storage a R2
1. Bucket R2 público con dominio propio (p. ej. `assets.findyourprices.com`).
2. Subidas desde el Worker por binding de R2; desde scripts/Actions por la API S3.
3. Script de copia: bajar todo de los 4 buckets de Supabase y subirlo a R2.
4. Migración SQL que reescribe las URLs guardadas en la base
   (`replace(url, '<supabase>/storage/v1/object/public/', 'https://assets…/')`).

### Fase 4 — Sesión de prueba (red del teléfono)
Checklist en orden: conexión con `DATABASE_URL` → `drizzle-kit pull` y diff con
el schema → `npm run test:run` → `npm run dev` y recorrer home, búsqueda,
producto, categoría, tienda, cotización, panel (tiendas, categorías, aliados,
tráfico, errores, scraping) → una corrida de scraping local de una tienda →
`npm run cf:preview` con Hyperdrive.

### Fase 5 — Corte a producción todavía sobre Supabase
Crear Hyperdrive apuntando a Supabase, desplegar, mirar errores un par de días.
Así se separa "cambiar la forma de conectarse" de "cambiar de servidor".

### Fase 6 — Mudanza a Hetzner
1. Servidor (CAX11/CX22 alcanza para empezar), Postgres de la **misma versión
   mayor** que Supabase, extensiones: `pg_trgm`, `unaccent`, `fuzzystrmatch`,
   `pgcrypto`, `pg_cron`.
2. Seguridad: firewall que solo deje entrar al 5432 desde las IPs de
   Hyperdrive/GitHub Actions (o túnel), TLS obligatorio, usuario `fyp_app` sin
   superusuario.
3. Migración SQL de limpieza: grants a `fyp_app`, quitar policies que nombran
   roles de Supabase, `statement_timeout` del rol nuevo, recrear los 3 jobs de
   `pg_cron`.
4. `pg_dump --schema=find_your_prices` desde Supabase → `pg_restore` en Hetzner
   → `refresh materialized view` → comparar conteos.
5. Cambiar el origen de Hyperdrive y los secrets de GitHub. Ventana corta: pausar
   el cron de scraping durante el dump.
6. Backups: `pg_dump` diario a R2 (o Storage Box de Hetzner) + probar restaurar.

### Fase 7 — Limpieza
Quitar `@supabase/supabase-js`, `src/server/db/supabase.ts`, variables
`SUPABASE_*` y secrets de GitHub; bajar el plan de Supabase / borrar el proyecto
cuando haya pasado una semana sin incidentes y con backup propio verificado.

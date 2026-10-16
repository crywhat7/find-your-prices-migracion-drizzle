# db/

- `client.ts`: `getDb()`, la conexión a Postgres por Drizzle (Hyperdrive en el
  Worker, `DATABASE_URL` fuera de él).
- `schema.ts`: tablas y vistas del esquema `find_your_prices` para Drizzle. Las
  migraciones SQL de `src/db/migrations` siguen siendo la fuente de verdad.
- `supabase.ts`: el cliente viejo; se va cuando termine la migración
  (`docs/migracion-drizzle.md`).

Solo se importa desde código de servidor (`server/`, route handlers, server
actions) — nunca desde `components/` ni `features/*/components`.

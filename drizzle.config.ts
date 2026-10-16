import { defineConfig } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit. Por ahora solo se usa para `db:pull`
 * (introspección), que deja en `drizzle/` lo que hay realmente en la base para
 * compararlo con `src/server/db/schema.ts`. Las migraciones siguen siendo los
 * SQL de `src/db/migrations`.
 */

try {
  process.loadEnvFile('.env.local');
} catch {
  // Sin .env.local: se usa DATABASE_URL del entorno (CI).
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['find_your_prices'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});

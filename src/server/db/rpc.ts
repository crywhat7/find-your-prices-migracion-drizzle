import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { getDb } from './client';

/**
 * Llama una función de `find_your_prices` con argumentos por nombre, como
 * hacía `supabase.rpc(nombre, { p_x: ... })`, y devuelve su valor.
 *
 * Sirve para las funciones que devuelven un escalar o `jsonb` (casi todas). Las
 * que devuelven `table (...)` se consultan con `select * from fn()`.
 *
 * Los objetos y arrays viajan como `jsonb`; las fechas, como ISO.
 */
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Nombre de función inválido: ${name}`);

  const params = Object.entries(args)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(key)) throw new Error(`Argumento inválido: ${key}`);
      return sql`${sql.raw(key)} => ${toParam(value)}`;
    });

  const rows = await getDb().execute<{ result: T }>(
    sql`select find_your_prices.${sql.raw(name)}(${sql.join(params, sql`, `)}) as result`,
  );
  return rows[0]?.result as T;
}

function toParam(value: unknown): SQL | unknown {
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') return sql`${JSON.stringify(value)}::jsonb`;
  return value;
}

/**
 * Doble de Drizzle para los tests de servicios.
 *
 * Cada `db.select(...)`, `insert`, `update`, `delete` o `execute` abre una
 * consulta encadenable: cualquier método (`from`, `where`, `orderBy`, `limit`,
 * …) devuelve la misma consulta, y al esperarla resuelve con lo que diga
 * `resolve`. Así un test fija qué responde la base sin reproducir el SQL.
 *
 * `calls` registra cada consulta en orden; `call.select` son los campos que se
 * pidieron (la cuenta de `count()` se pide como `{ n }` en todo el proyecto).
 */

export interface DrizzleCall {
  kind: 'select' | 'insert' | 'update' | 'delete' | 'execute';
  select?: Record<string, unknown>;
}

type Resolver = (call: DrizzleCall) => unknown[] | Promise<unknown[]>;

export function createDrizzleMock(resolve: Resolver) {
  const calls: DrizzleCall[] = [];

  const query = (call: DrizzleCall): unknown => {
    calls.push(call);
    const run = () => Promise.resolve().then(() => resolve(call));
    const proxy: unknown = new Proxy(function chain() {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
            run().then(onFulfilled, onRejected);
        }
        if (prop === 'catch') return (onRejected: (reason: unknown) => unknown) => run().catch(onRejected);
        if (prop === 'finally') return (onFinally: () => void) => run().finally(onFinally);
        return () => proxy;
      },
    });
    return proxy;
  };

  const db = {
    select: (fields?: Record<string, unknown>) => query({ kind: 'select', select: fields }),
    insert: () => query({ kind: 'insert' }),
    update: () => query({ kind: 'update' }),
    delete: () => query({ kind: 'delete' }),
    execute: () => query({ kind: 'execute' }),
  };

  return { db, calls };
}

/** True si la consulta es una cuenta (`select({ n: count() })`). */
export function isCount(call: DrizzleCall): boolean {
  return call.kind === 'select' && call.select !== undefined && 'n' in call.select;
}

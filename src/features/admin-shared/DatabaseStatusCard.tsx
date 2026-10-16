import type { DatabaseStatus } from '@/server/db/status';

/**
 * Tarjeta "Base de datos" del panel: si la consulta de prueba pasó por
 * Drizzle y por qué conexión (Hyperdrive, pooler o directa). Los datos los
 * arma el servidor en cada carga de /admin.
 */

const SOURCE_LABEL: Record<DatabaseStatus['connection']['source'], string> = {
  hyperdrive: 'Binding HYPERDRIVE (Cloudflare)',
  database_url: 'Variable DATABASE_URL',
  none: 'Sin configurar',
};

const MODE_LABEL: Record<DatabaseStatus['connection']['mode'], string> = {
  hyperdrive: 'Hyperdrive',
  'transaction-pooler': 'Pooler Supavisor · modo transacción',
  'session-pooler': 'Pooler Supavisor · modo sesión',
  direct: 'Conexión directa a Postgres',
  unknown: '—',
};

export function DatabaseStatusCard({ status }: { status: DatabaseStatus }) {
  const { connection } = status;
  const items: Array<[string, string | null]> = [
    ['Cliente', 'Drizzle ORM + postgres.js (TCP)'],
    ['Origen', SOURCE_LABEL[connection.source]],
    ['Modo', MODE_LABEL[connection.mode]],
    ['Host', connection.host ? `${connection.host}:${connection.port}` : null],
    [
      'Pool · pipelining',
      connection.poolMax != null
        ? `${connection.poolMax} conexiones · ${connection.pipelining ? 'activado' : 'apagado'}`
        : null,
    ],
    ['Base · usuario', status.database ? `${status.database} · ${status.user}` : null],
    ['Postgres', status.serverVersion],
    ['application_name', status.applicationName],
    ['Latencia de la prueba', status.latencyMs != null ? `${status.latencyMs} ms` : null],
  ];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
      {status.ok ? (
        <p className="flex items-center gap-2 text-[0.875rem] font-medium text-[var(--price-win)]">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[var(--price-win)]" />
          Conectado por Drizzle: la consulta de prueba fue directo a Postgres, sin la API REST de Supabase
        </p>
      ) : (
        <div role="alert">
          <p className="flex items-center gap-2 text-[0.875rem] font-medium text-[var(--critical)]">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[var(--critical)]" />
            La consulta de prueba por Drizzle falló
          </p>
          {status.error && (
            <p className="mt-2 font-mono text-[0.75rem] break-words text-[var(--critical)]">{status.error}</p>
          )}
        </div>
      )}

      <dl className="mt-4 grid gap-4 text-[0.8125rem] sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</dt>
            <dd className="mt-1 font-mono text-[0.75rem] break-words text-[var(--text)]">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

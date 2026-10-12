import type { ReactNode } from 'react';
import { hasAdminSession } from '@/server/admin/session';
import { AdminGate } from '@/features/admin-gate/AdminGate';

/**
 * Puerta de todo /admin (scraping y categorías).
 *
 * Sin cookie de sesión válida se muestra el formulario de clave en lugar de la
 * página. La clave es CRON_SECRET; ver `server/admin/session.ts`.
 *
 * Esto pinta la puerta, pero NO protege los datos: la página corre en
 * paralelo con el layout. Cada `page.tsx` repite la comprobación.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await hasAdminSession())) return <AdminGate />;
  return <>{children}</>;
}

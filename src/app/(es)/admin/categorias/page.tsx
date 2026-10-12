import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { CategoryAdminLoader } from '@/features/admin-categories/CategoryAdminLoader';
import { hasAdminSession } from '@/server/admin/session';

/**
 * Panel de categorías.
 *
 * Dos trabajos en una pantalla: relacionar las categorías de cada tienda con
 * el árbol propio del sitio, y mantener ese árbol. Los datos los trae el
 * navegador desde /admin/categorias/datos; las acciones van contra
 * /api/admin/categories/*.
 *
 * Misma situación de acceso que el panel de scraping: abierto hasta que
 * entre OAuth; ADMIN_API_SECRET cierra la API.
 */

export const metadata: Metadata = {
  title: 'Panel de categorías',
  robots: NO_INDEX_ROBOTS,
};

export const dynamic = 'force-dynamic';

export default async function CategoryAdminPage() {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  // Los datos no van en la página: llegan aparte, compactos, desde
  // /admin/categorias/datos. Ver `CategoryAdminLoader`.
  return <CategoryAdminLoader />;
}

import { encodeCategoryData } from "@/features/admin-categories/rowCodec";
import { hasAdminSession } from "@/server/admin/session";
import { logError } from "@/server/errors/logError";
import { loadCategoryAdminData } from "@/server/services/categories";

/**
 * GET /admin/categorias/datos  →  árbol, tiendas y categorías de tienda en
 * formato compacto (ver `features/admin-categories/rowCodec.ts`).
 *
 * Vive bajo /admin y no bajo /api porque la cookie de sesión del panel tiene
 * `path: /admin`: en /api no viajaría. Un route handler no pasa por el
 * layout, así que la sesión se comprueba acá.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!(await hasAdminSession())) return Response.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await loadCategoryAdminData();
    return Response.json(encodeCategoryData(data.categories, data.stores, data.storeCategories), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const logId = await logError({ source: "handled", error, path: "/admin/categorias/datos", route: "/admin/categorias/datos", method: "GET" });
    return Response.json(
      { error: error instanceof Error ? error.message : String(error), logId },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

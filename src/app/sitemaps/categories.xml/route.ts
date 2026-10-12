import { categoriesSitemapXml } from "@/lib/seo/sitemapBuild";
import { serveSitemap, SITEMAP_OBJECTS } from "@/server/services/sitemapStore";

/**
 * Sitemap de las páginas de categoría, en los dos idiomas. El contenido se
 * arma en `categoriesSitemapXml`; normalmente sale ya hecho de Storage (ver
 * `sitemapStore.ts`).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return serveSitemap(SITEMAP_OBJECTS.categories, categoriesSitemapXml);
}

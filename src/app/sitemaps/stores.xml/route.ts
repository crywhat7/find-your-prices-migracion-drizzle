import { storesSitemapXml } from "@/lib/seo/sitemapBuild";
import { serveSitemap, SITEMAP_OBJECTS } from "@/server/services/sitemapStore";

/**
 * Sitemap de las landings de tienda, en los dos idiomas. El contenido se arma
 * en `storesSitemapXml`; normalmente sale ya hecho de Storage (ver
 * `sitemapStore.ts`).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return serveSitemap(SITEMAP_OBJECTS.stores, storesSitemapXml);
}

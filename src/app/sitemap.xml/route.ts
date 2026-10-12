import { sitemapIndexXml } from "@/lib/seo/sitemapBuild";
import { countSitemapProducts, sitemapChunkCount } from "@/server/services/sitemap";
import { serveSitemap, SITEMAP_OBJECTS } from "@/server/services/sitemapStore";

/**
 * Índice de sitemaps: `https://findyourprices.com/sitemap.xml`.
 *
 * Es la única dirección que hay que dar de alta en Search Console y la única
 * que declara `robots.txt`. Desde acá cuelgan el archivo de páginas fijas y
 * tantos archivos de producto como haga falta.
 *
 * Está escrito como route handler y no con la convención `app/sitemap.ts`
 * porque esa convención sólo sabe emitir `<urlset>`, y lo que va en la raíz de
 * un catálogo de este tamaño es un `<sitemapindex>`.
 *
 * Lo normal es servir el que dejó hecho `scripts/generate-sitemaps.ts` en
 * Storage; armarlo al vuelo es sólo el respaldo (ver `sitemapStore.ts`).
 * Dinámico a propósito: copiar el archivo guardado cuesta un `fetch`, y así
 * nunca queda congelado un índice del momento del build.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return serveSitemap(SITEMAP_OBJECTS.index, async () =>
    sitemapIndexXml(sitemapChunkCount(await countSitemapProducts())),
  );
}

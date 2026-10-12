import { productSitemapXml } from "@/lib/seo/sitemapBuild";
import { countSitemapProducts, getSitemapProducts, sitemapChunkCount } from "@/server/services/sitemap";
import { serveSitemap, SITEMAP_OBJECTS } from "@/server/services/sitemapStore";

/**
 * Un archivo de sitemap por tanda de fichas: `/sitemaps/products/1.xml`.
 *
 * El catálogo pasa de 50 000 artículos, que es justo el límite de URLs por
 * archivo del protocolo. Partirlo no es una optimización: un `<urlset>` con
 * más de 50 000 entradas lo rechaza Google entero, no de la 50 001 en adelante.
 *
 * El índice (`/sitemap.xml`) es el que decide cuántas tandas hay; acá sólo se
 * sirve la que piden. Normalmente sale de Storage (ver `sitemapStore.ts`); si
 * el archivo no está, se arma al vuelo.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ chunk: string }>;
}

/**
 * El segmento llega como `"3.xml"`.
 *
 * La extensión va en el nombre del archivo y no en la carpeta porque un
 * sitemap tiene que verse como un `.xml` desde la URL: hay rastreadores que
 * miran la extensión antes que el `Content-Type`, y Search Console lo espera
 * así. El precio es tener que quitarla acá.
 */
function parseChunk(raw: string): number | null {
  const match = /^(\d+)\.xml$/.exec(raw);
  if (!match) return null;
  const chunk = Number(match[1]);
  return Number.isInteger(chunk) && chunk >= 1 ? chunk : null;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { chunk: raw } = await context.params;
  const chunk = parseChunk(raw);

  // 404 y no un archivo vacío: un sitemap válido pero sin URLs le dice a Google
  // que esas fichas se retiraron, y las saca del índice. No encontrarlo es la
  // respuesta correcta a una tanda que no existe.
  if (chunk === null) return new Response("Not found", { status: 404 });

  return serveSitemap(SITEMAP_OBJECTS.product(chunk), async () => {
    if (chunk > sitemapChunkCount(await countSitemapProducts())) return null;
    const products = await getSitemapProducts(chunk);
    return products.length === 0 ? null : productSitemapXml(products);
  });
}

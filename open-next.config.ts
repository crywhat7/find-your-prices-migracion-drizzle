import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * Cómo guarda el sitio sus páginas en Cloudflare.
 *
 * Sin esto OpenNext usa una caché de mentira: `revalidate` y el ISR existen en
 * el código pero cada visita arma la página de cero, consulta Supabase y gasta
 * CPU del Worker. Con el catálogo entero expuesto a Googlebot eso terminaba en
 * 503 (error 1102, CPU agotada) en una de cada seis fichas.
 *
 * Todo lo de acá entra en el plan gratuito de Cloudflare:
 *
 * - `incrementalCache`: R2 guarda cada página ya armada (bucket
 *   `find-your-prices-cache`, binding `NEXT_INC_CACHE_R2_BUCKET`). Envuelta en
 *   la caché regional (Cache API de cada centro de datos), que responde sin ir
 *   a R2 mientras la entrada esté fresca: menos latencia y menos lecturas de R2.
 * - `tagCache`: D1 anota cuándo se invalidó cada ruta o etiqueta, para que
 *   `revalidatePath` / `revalidateTag` (panel, `/api/revalidate`) sigan
 *   funcionando (base `find-your-prices-tags`, binding `NEXT_TAG_CACHE_D1`).
 *   La tabla la crea `opennextjs-cloudflare deploy`.
 * - `queue`: la cola en memoria regenera la página vencida en el mismo Worker,
 *   después de responder con la copia anterior. La alternativa con Durable
 *   Objects escala mejor; queda para cuando el tráfico lo pida.
 * - `enableCacheInterception`: una página que está en caché se sirve antes de
 *   cargar Next. Es el ahorro grande de CPU. Hay que apagarlo si algún día se
 *   usa PPR.
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  tagCache: d1NextTagCache,
  queue: memoryQueue,
  enableCacheInterception: true,
});

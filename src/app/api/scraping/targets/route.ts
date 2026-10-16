import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { asc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorCode } from '@/server/db/pg';
import { scrapeTargets, vScrapeTargetHealth } from '@/server/db/schema';
import { hasStrategy } from '@/server/scraping/registry';

/**
 * CRUD de targets para el panel.
 *
 *   GET  /api/scraping/targets            -> lista con estado de salud
 *   POST /api/scraping/targets            -> alta de un target
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TARGET_KINDS: readonly string[] = scrapeTargets.kind.enumValues;
type TargetKind = (typeof scrapeTargets.kind.enumValues)[number];

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);

    // La vista ya trae tienda, ultima corrida y contadores resueltos.
    const targets = await getDb()
      .select()
      .from(vScrapeTargetHealth)
      .orderBy(asc(vScrapeTargetHealth.store_name), asc(vScrapeTargetHealth.target_name));

    return Response.json({ ok: true, targets });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);

    const body = (await request.json()) as Record<string, unknown>;

    const storeId = typeof body.store_id === 'string' ? body.store_id : null;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const kind = (typeof body.kind === 'string' ? body.kind : 'category') as TargetKind;

    if (!storeId) return badRequest('store_id es obligatorio');
    if (!name) return badRequest('name es obligatorio');
    if (!TARGET_KINDS.includes(kind)) {
      return badRequest(`kind debe ser uno de: ${TARGET_KINDS.join(', ')}`);
    }

    // Si el target trae estrategia propia, tiene que existir en el registro;
    // si no, se hereda la de la tienda y se valida al correr.
    const strategyKey = typeof body.strategy_key === 'string' && body.strategy_key
      ? body.strategy_key
      : null;
    if (strategyKey && !hasStrategy(strategyKey)) {
      return badRequest(`No existe una estrategia registrada con la clave "${strategyKey}"`);
    }

    const frequency = Number(body.frequency_minutes);
    const frequencyMinutes = Number.isFinite(frequency) && frequency >= 1 ? Math.floor(frequency) : 720;

    /**
     * Ancla del horario. Si no viene, la primera corrida es ahora y la rejilla
     * queda anclada a este momento; el panel manda una fecha explicita cuando el
     * operador elige "todos los lunes a las 08:00".
     */
    const anchorRaw = typeof body.schedule_anchor_at === 'string' ? body.schedule_anchor_at : null;
    const anchorDate = anchorRaw ? new Date(anchorRaw) : new Date();
    const anchor = Number.isFinite(anchorDate.getTime()) ? anchorDate : new Date();

    let target: typeof scrapeTargets.$inferSelect | undefined;
    try {
      [target] = await getDb()
        .insert(scrapeTargets)
        .values({
        store_id: storeId,
        name,
        kind,
        url: typeof body.url === 'string' && body.url ? body.url : null,
        strategy_key: strategyKey,
        config:
          typeof body.config === 'object' && body.config !== null ? (body.config as Record<string, unknown>) : {},
        frequency_minutes: frequencyMinutes,
        schedule_anchor_at: anchor.toISOString(),
        next_run_at: anchor.toISOString(),
        max_pages: Number(body.max_pages) > 0 ? Math.floor(Number(body.max_pages)) : null,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
        is_active: body.is_active !== false,
        notes: typeof body.notes === 'string' ? body.notes : null,
        })
        .returning();
    } catch (error) {
      // Choque con el indice unique (store_id, url).
      if (pgErrorCode(error) === '23505') {
        return badRequest('Ya existe un target con esa url para esta tienda');
      }
      throw error;
    }

    return Response.json({ ok: true, target }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

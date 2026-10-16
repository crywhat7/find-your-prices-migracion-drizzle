import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { scrapeRuns } from '@/server/db/schema';

/**
 * GET /api/scraping/runs?targetId=<uuid>&limit=50
 * Bitacora de corridas, mas reciente primero.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);

    const url = new URL(request.url);
    const targetId = url.searchParams.get('targetId');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const runs = await getDb()
      .select()
      .from(scrapeRuns)
      .where(targetId ? eq(scrapeRuns.target_id, targetId) : undefined)
      .orderBy(desc(scrapeRuns.started_at))
      .limit(limit);

    return Response.json({ ok: true, runs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

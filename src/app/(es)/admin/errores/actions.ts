'use server';

import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/server/admin/session';
import { resolveErrorGroup } from '@/server/errors/errorLog';

/** Marca un grupo de errores como resuelto y vuelve a la misma vista. */
export async function resolveErrorAction(formData: FormData): Promise<void> {
  if (!(await hasAdminSession())) throw new Error('No autorizado');
  const fingerprint = String(formData.get('fingerprint') ?? '');
  const back = String(formData.get('back') ?? '/admin/errores');
  const safeBack = back.startsWith('/admin/errores') ? back : '/admin/errores';

  if (!/^[0-9a-f]{8}$/.test(fingerprint)) redirect(safeBack);
  await resolveErrorGroup(fingerprint);
  redirect(safeBack);
}

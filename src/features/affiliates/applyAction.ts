'use server';

import { headers } from 'next/headers';
import type { Locale } from '@/features/i18n/translate';
import { readVisitor } from '@/server/services/analytics';
import { countRecentApplications, createApplication } from '@/server/services/affiliates';
import { validateApplication, type ApplicationField } from './applicationRules';

/**
 * Recibe la solicitud de afiliación del formulario público de /aliados.
 *
 * Frenos contra spam, todos invisibles para una persona:
 *   - un campo trampa (`company_url`) oculto que solo un bot llena;
 *   - el tiempo desde que se pintó el formulario: menos de 3 s no es humano;
 *   - como mucho 3 envíos por hora por visitante (el hash anónimo de 0048).
 * A un bot se le contesta "listo" igual, para que no aprenda qué lo delató.
 */

export interface ApplyState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  errors?: Partial<Record<ApplicationField, string>>;
  /** Lo que la persona escribió, para no borrárselo si hay un error. */
  values?: Partial<Record<ApplicationField, string>>;
}

const FIELDS: Record<ApplicationField, string> = {
  storeName: 'store_name',
  website: 'website',
  contactName: 'contact_name',
  email: 'email',
  phone: 'phone',
  category: 'category',
  message: 'message',
};

const COPY: Record<Locale, { fix: string; tooMany: string; failed: string }> = {
  es: {
    fix: 'Revisá los campos marcados.',
    tooMany: 'Ya recibimos varias solicitudes desde acá. Probá en un rato o escribinos por correo.',
    failed: 'No se pudo enviar. Probá de nuevo o escribinos por correo.',
  },
  en: {
    fix: 'Check the highlighted fields.',
    tooMany: 'We already got several requests from here. Try again later or email us.',
    failed: 'It could not be sent. Try again or email us.',
  },
};

const MIN_FILL_MS = 3000;

export async function submitAffiliateApplication(_previous: ApplyState, formData: FormData): Promise<ApplyState> {
  const locale: Locale = formData.get('locale') === 'en' ? 'en' : 'es';
  const copy = COPY[locale];

  const values = Object.fromEntries(
    (Object.keys(FIELDS) as ApplicationField[]).map((field) => [field, String(formData.get(FIELDS[field]) ?? '')]),
  ) as Record<ApplicationField, string>;

  // Bots: se les dice que sí y no se guarda nada.
  const startedAt = Number(formData.get('started_at') || 0);
  const tooFast = startedAt > 0 && Date.now() - startedAt < MIN_FILL_MS;
  if (String(formData.get('company_url') ?? '') !== '' || tooFast) return { status: 'ok' };

  const result = validateApplication(values, locale);
  if (!result.ok) return { status: 'error', message: copy.fix, errors: result.errors, values };

  try {
    const visitor = readVisitor(await headers());
    if (visitor && (await countRecentApplications(visitor.visitorHash)) >= 3) {
      return { status: 'error', message: copy.tooMany, values };
    }
    await createApplication(result.data, locale, visitor?.visitorHash ?? null);
  } catch (error) {
    console.error('[aliados] no se pudo guardar la solicitud:', error);
    return { status: 'error', message: copy.failed, values };
  }

  return { status: 'ok' };
}

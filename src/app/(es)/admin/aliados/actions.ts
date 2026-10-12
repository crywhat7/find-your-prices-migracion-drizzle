'use server';

import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/server/admin/session';
import {
  createPartner,
  deleteOffer,
  deletePartner,
  removePartnerLogo,
  saveOffer,
  updatePartner,
  uploadPartnerLogo,
  type OfferInput,
  type PartnerInput,
} from '@/server/services/affiliates';

/**
 * Server actions del programa de afiliados. Como las de tiendas: cada una
 * vuelve a comprobar la cookie antes de tocar nada, y el resultado vuelve
 * por la URL (`?status=`), así el formulario funciona sin JavaScript.
 */

async function assertAdmin(): Promise<void> {
  if (!(await hasAdminSession())) throw new Error('No autorizado');
}

function statusPath(base: string, status: 'saved' | 'deleted' | 'error', message?: string): string {
  const params = new URLSearchParams({ status });
  if (message) params.set('message', message.slice(0, 300));
  return `${base}?${params}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

function partnerInput(formData: FormData): PartnerInput {
  return {
    name: text(formData, 'name'),
    slug: text(formData, 'slug'),
    websiteUrl: text(formData, 'website_url'),
    affiliateUrl: text(formData, 'affiliate_url'),
    promoCode: text(formData, 'promo_code'),
    promoTextEs: text(formData, 'promo_text_es'),
    promoTextEn: text(formData, 'promo_text_en'),
    taglineEs: text(formData, 'tagline_es'),
    taglineEn: text(formData, 'tagline_en'),
    descriptionEs: text(formData, 'description_es'),
    descriptionEn: text(formData, 'description_en'),
    imageAlt: text(formData, 'image_alt'),
    isActive: formData.get('is_active') === 'on',
    isFeatured: formData.get('is_featured') === 'on',
    sortOrder: text(formData, 'sort_order'),
    startsAt: text(formData, 'starts_at'),
    endsAt: text(formData, 'ends_at'),
  };
}

function offerInput(formData: FormData): OfferInput {
  return {
    titleEs: text(formData, 'title_es'),
    titleEn: text(formData, 'title_en'),
    noteEs: text(formData, 'note_es'),
    noteEn: text(formData, 'note_en'),
    url: text(formData, 'url'),
    imageUrl: text(formData, 'image_url'),
    price: text(formData, 'price'),
    listPrice: text(formData, 'list_price'),
    currency: text(formData, 'currency'),
    promoCode: text(formData, 'promo_code'),
    isActive: formData.get('is_active') === 'on',
    sortOrder: text(formData, 'sort_order'),
  };
}

export async function createPartnerAction(formData: FormData): Promise<void> {
  await assertAdmin();
  let id: string;
  try {
    id = await createPartner(partnerInput(formData));
  } catch (error) {
    redirect(statusPath('/admin/aliados', 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${id}`, 'saved'));
}

export async function updatePartnerAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = text(formData, 'id');
  try {
    await updatePartner(id, partnerInput(formData));
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${id}`, 'saved'));
}

export async function deletePartnerAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = text(formData, 'id');
  if (formData.get('confirm') !== 'on') {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', 'Marcá la casilla de confirmación para borrar el aliado.'));
  }
  try {
    await deletePartner(id);
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', errorMessage(error)));
  }
  redirect(statusPath('/admin/aliados', 'deleted'));
}

export async function uploadPartnerLogoAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = text(formData, 'id');
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', 'Elegí una imagen antes de subir.'));
  }
  try {
    await uploadPartnerLogo(id, file);
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${id}`, 'saved'));
}

export async function removePartnerLogoAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = text(formData, 'id');
  try {
    await removePartnerLogo(id);
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${id}`, 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${id}`, 'saved'));
}

export async function saveOfferAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const partnerId = text(formData, 'partner_id');
  const offerId = text(formData, 'offer_id') || null;
  try {
    await saveOffer(partnerId, offerId, offerInput(formData));
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${partnerId}`, 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${partnerId}`, 'saved'));
}

export async function deleteOfferAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const partnerId = text(formData, 'partner_id');
  const offerId = text(formData, 'offer_id');
  try {
    await deleteOffer(partnerId, offerId);
  } catch (error) {
    redirect(statusPath(`/admin/aliados/${partnerId}`, 'error', errorMessage(error)));
  }
  redirect(statusPath(`/admin/aliados/${partnerId}`, 'saved'));
}

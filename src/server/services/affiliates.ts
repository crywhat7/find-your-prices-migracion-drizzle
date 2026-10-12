import 'server-only';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { SITE_ROUTES } from '@/features/i18n/routes';
import {
  isSafeHttpUrl,
  isValidSlug,
  isWithinWindow,
  normalizeCurrency,
  partnerPaths,
  slugify,
} from '@/features/affiliates/affiliateRules';
import { hasDatabase } from './catalog';

/**
 * Programa de afiliados (migración 0047): lectura para las páginas públicas,
 * escritura para el panel y el contador de clics de la redirección.
 *
 * Las tablas están cerradas a las llaves públicas, así que todo pasa por el
 * cliente de servidor, igual que `storeContent.ts`. Las páginas públicas solo
 * ven aliados activos y dentro de su ventana de campaña, y de ellos solo los
 * productos activos.
 */

export const AFFILIATE_IMAGES_BUCKET = 'affiliate-images';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface AffiliateOffer {
  id: string;
  partnerId: string;
  titleEs: string;
  titleEn: string | null;
  noteEs: string | null;
  noteEn: string | null;
  url: string;
  imageUrl: string | null;
  price: number | null;
  listPrice: number | null;
  currency: string;
  /** Código propio del producto; si es `null` vale el del aliado. */
  promoCode: string | null;
  isActive: boolean;
  sortOrder: number;
  clickCount: number;
}

export interface AffiliatePartner {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  affiliateUrl: string | null;
  promoCode: string | null;
  promoTextEs: string | null;
  promoTextEn: string | null;
  taglineEs: string | null;
  taglineEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  imageAlt: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  clickCount: number;
  offers: AffiliateOffer[];
}

const PARTNER_COLUMNS =
  'id, slug, name, website_url, affiliate_url, promo_code, promo_text_es, promo_text_en, tagline_es, tagline_en, description_es, description_en, logo_url, image_alt, is_active, is_featured, sort_order, starts_at, ends_at, click_count';
const OFFER_COLUMNS =
  'id, partner_id, title_es, title_en, note_es, note_en, url, image_url, price, list_price, currency, promo_code, is_active, sort_order, click_count';

/** Sin la 0047 la tabla no existe: las páginas muestran "sin aliados" y no caen. */
const MISSING_TABLE = '42P01';
const MISSING_RELATION_POSTGREST = 'PGRST205';

function isMissingTable(error: { code?: string } | null): boolean {
  return Boolean(error && (error.code === MISSING_TABLE || error.code === MISSING_RELATION_POSTGREST));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapOffer(row: Record<string, unknown>): AffiliateOffer {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    titleEs: String(row.title_es),
    titleEn: (row.title_en as string | null) ?? null,
    noteEs: (row.note_es as string | null) ?? null,
    noteEn: (row.note_en as string | null) ?? null,
    url: String(row.url),
    imageUrl: (row.image_url as string | null) ?? null,
    price: toNumber(row.price),
    listPrice: toNumber(row.list_price),
    currency: String(row.currency ?? 'USD'),
    promoCode: (row.promo_code as string | null) ?? null,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    clickCount: Number(row.click_count ?? 0),
  };
}

function mapPartner(row: Record<string, unknown>, offers: AffiliateOffer[]): AffiliatePartner {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    websiteUrl: String(row.website_url),
    affiliateUrl: (row.affiliate_url as string | null) ?? null,
    promoCode: (row.promo_code as string | null) ?? null,
    promoTextEs: (row.promo_text_es as string | null) ?? null,
    promoTextEn: (row.promo_text_en as string | null) ?? null,
    taglineEs: (row.tagline_es as string | null) ?? null,
    taglineEn: (row.tagline_en as string | null) ?? null,
    descriptionEs: (row.description_es as string | null) ?? null,
    descriptionEn: (row.description_en as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    imageAlt: (row.image_alt as string | null) ?? null,
    isActive: Boolean(row.is_active),
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order ?? 0),
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    clickCount: Number(row.click_count ?? 0),
    offers: offers.filter((offer) => offer.partnerId === String(row.id)),
  };
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

/** Todos los aliados con todos sus productos, para el panel. */
export async function listPartnersForAdmin(): Promise<AffiliatePartner[]> {
  const db = getSupabaseAdmin();
  const [partners, offers] = await Promise.all([
    db.from('affiliate_partners').select(PARTNER_COLUMNS).order('sort_order').order('name'),
    db.from('affiliate_offers').select(OFFER_COLUMNS).order('sort_order').order('created_at'),
  ]);
  if (partners.error) throw new Error(explain(partners.error));
  if (offers.error) throw new Error(explain(offers.error));

  const offerRows = ((offers.data ?? []) as unknown as Array<Record<string, unknown>>).map(mapOffer);
  return ((partners.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) =>
    mapPartner(row, offerRows),
  );
}

export async function getPartnerForAdmin(id: string): Promise<AffiliatePartner | null> {
  const rows = await listPartnersForAdmin();
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * Lo que ve el visitante: aliados activos y vigentes, con sus productos
 * activos. Destacados primero, después el orden del panel.
 */
export async function listPublicPartners(now: Date = new Date()): Promise<AffiliatePartner[]> {
  if (!hasDatabase()) return [];
  const db = getSupabaseAdmin();
  const partners = await db
    .from('affiliate_partners')
    .select(PARTNER_COLUMNS)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('sort_order')
    .order('name');
  if (isMissingTable(partners.error)) return [];
  if (partners.error) throw new Error(partners.error.message);

  const live = ((partners.data ?? []) as unknown as Array<Record<string, unknown>>).filter((row) =>
    isWithinWindow((row.starts_at as string | null) ?? null, (row.ends_at as string | null) ?? null, now),
  );
  if (live.length === 0) return [];

  const offers = await db
    .from('affiliate_offers')
    .select(OFFER_COLUMNS)
    .eq('is_active', true)
    .in(
      'partner_id',
      live.map((row) => String(row.id)),
    )
    .order('sort_order')
    .order('created_at');
  if (offers.error) throw new Error(offers.error.message);

  const offerRows = ((offers.data ?? []) as unknown as Array<Record<string, unknown>>).map(mapOffer);
  return live.map((row) => mapPartner(row, offerRows));
}

export async function getPublicPartner(slug: string): Promise<AffiliatePartner | null> {
  if (!isValidSlug(slug)) return null;
  const partners = await listPublicPartners();
  return partners.find((partner) => partner.slug === slug) ?? null;
}

/**
 * A dónde manda `/go/<aliado>`: el enlace del producto si vino uno válido de
 * ese aliado, si no el enlace de afiliado, si no el sitio. Suma el clic.
 * `null` si el aliado no existe o no está vigente.
 */
export interface Outbound {
  target: string;
  partnerId: string;
  offerId: string | null;
}

export async function resolveOutbound(slug: string, offerId: string | null): Promise<Outbound | null> {
  const partner = await getPublicPartner(slug);
  if (!partner) return null;

  const offer = offerId ? partner.offers.find((item) => item.id === offerId) ?? null : null;
  const target = offer?.url ?? partner.affiliateUrl ?? partner.websiteUrl;
  if (!isSafeHttpUrl(target)) return null;

  // El clic no puede frenar la salida: si falla, se pierde un conteo, nada más.
  const { error } = await getSupabaseAdmin().rpc('record_affiliate_click', {
    p_partner_id: partner.id,
    p_offer_id: offer?.id ?? null,
  });
  if (error) console.warn('[affiliates] no se pudo contar el clic:', error.message);

  return { target, partnerId: partner.id, offerId: offer?.id ?? null };
}

// -----------------------------------------------------------------------------
// Escritura (panel)
// -----------------------------------------------------------------------------

export interface PartnerInput {
  name: string;
  slug: string;
  websiteUrl: string;
  affiliateUrl: string;
  promoCode: string;
  promoTextEs: string;
  promoTextEn: string;
  taglineEs: string;
  taglineEn: string;
  descriptionEs: string;
  descriptionEn: string;
  imageAlt: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
}

export interface OfferInput {
  titleEs: string;
  titleEn: string;
  noteEs: string;
  noteEn: string;
  url: string;
  imageUrl: string;
  price: string;
  listPrice: string;
  currency: string;
  promoCode: string;
  isActive: boolean;
  sortOrder: string;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function requiredUrl(value: string, label: string): string {
  const trimmed = value.trim();
  if (!isSafeHttpUrl(trimmed)) throw new Error(`${label}: tiene que ser una URL que empiece con https://`);
  return trimmed;
}

function optionalUrl(value: string, label: string): string | null {
  const trimmed = nullable(value);
  return trimmed === null ? null : requiredUrl(trimmed, label);
}

function optionalPrice(value: string, label: string): number | null {
  const trimmed = nullable(value.replace(/,/g, ''));
  if (trimmed === null) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label}: no es un número válido.`);
  return Math.round(parsed * 100) / 100;
}

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `<input type="datetime-local">` llega sin zona ("2026-11-01T00:00"). Se
 * interpreta en hora de Honduras (UTC−6, sin horario de verano), que es la
 * que tiene en la cabeza quien carga la campaña.
 */
function optionalDate(value: string): string | null {
  const trimmed = nullable(value);
  if (trimmed === null) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(trimmed);
  const withZone = hasZone ? trimmed : `${trimmed}${hasSeconds ? '' : ':00'}-06:00`;
  const time = Date.parse(withZone);
  if (Number.isNaN(time)) throw new Error('Fecha inválida.');
  return new Date(time).toISOString();
}

function partnerRow(input: PartnerInput) {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre es obligatorio.');
  const slug = slugify(input.slug.trim() || name);
  if (!isValidSlug(slug)) throw new Error('El slug solo puede tener minúsculas, números y guiones.');

  const startsAt = optionalDate(input.startsAt);
  const endsAt = optionalDate(input.endsAt);
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error('La campaña termina antes de empezar.');
  }

  return {
    name,
    slug,
    website_url: requiredUrl(input.websiteUrl, 'Sitio web'),
    affiliate_url: optionalUrl(input.affiliateUrl, 'Enlace de afiliado'),
    promo_code: nullable(input.promoCode),
    promo_text_es: nullable(input.promoTextEs),
    promo_text_en: nullable(input.promoTextEn),
    tagline_es: nullable(input.taglineEs),
    tagline_en: nullable(input.taglineEn),
    description_es: nullable(input.descriptionEs),
    description_en: nullable(input.descriptionEn),
    image_alt: nullable(input.imageAlt),
    is_active: input.isActive,
    is_featured: input.isFeatured,
    sort_order: integer(input.sortOrder),
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

function offerRow(input: OfferInput) {
  const title = input.titleEs.trim();
  if (!title) throw new Error('El nombre del producto es obligatorio.');
  const currency = normalizeCurrency(input.currency || 'USD');
  if (!currency) throw new Error('La moneda tiene que ser un código de tres letras (USD, HNL, EUR).');

  return {
    title_es: title,
    title_en: nullable(input.titleEn),
    note_es: nullable(input.noteEs),
    note_en: nullable(input.noteEn),
    url: requiredUrl(input.url, 'Enlace del producto'),
    image_url: optionalUrl(input.imageUrl, 'Imagen'),
    price: optionalPrice(input.price, 'Precio'),
    list_price: optionalPrice(input.listPrice, 'Precio anterior'),
    currency,
    promo_code: nullable(input.promoCode),
    is_active: input.isActive,
    sort_order: integer(input.sortOrder),
  };
}

/** Explica los errores de base que el panel puede provocar. */
function explain(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Ya existe un aliado con ese slug.';
  if (isMissingTable(error)) return 'Faltan las tablas de afiliados: corré la migración 0047_affiliates.sql en Supabase.';
  return error.message;
}

export async function createPartner(input: PartnerInput): Promise<string> {
  const db = getSupabaseAdmin();
  const result = await db.from('affiliate_partners').insert(partnerRow(input)).select('id, slug').single();
  if (result.error) throw new Error(explain(result.error));
  revalidatePartners([String(result.data.slug)]);
  return String(result.data.id);
}

export async function updatePartner(id: string, input: PartnerInput): Promise<void> {
  const db = getSupabaseAdmin();
  const before = await db.from('affiliate_partners').select('slug').eq('id', id).single();
  if (before.error) throw new Error(explain(before.error));

  const result = await db.from('affiliate_partners').update(partnerRow(input)).eq('id', id).select('slug').single();
  if (result.error) throw new Error(explain(result.error));
  revalidatePartners([String(before.data.slug), String(result.data.slug)]);
}

export async function deletePartner(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const row = await db.from('affiliate_partners').select('slug, logo_url').eq('id', id).single();
  if (row.error) throw new Error(explain(row.error));

  const result = await db.from('affiliate_partners').delete().eq('id', id);
  if (result.error) throw new Error(explain(result.error));

  await removeStoredObject(row.data.logo_url as string | null);
  revalidatePartners([String(row.data.slug)]);
}

export async function saveOffer(partnerId: string, offerId: string | null, input: OfferInput): Promise<void> {
  const db = getSupabaseAdmin();
  const row = offerRow(input);
  const result = offerId
    ? await db.from('affiliate_offers').update(row).eq('id', offerId).eq('partner_id', partnerId)
    : await db.from('affiliate_offers').insert({ ...row, partner_id: partnerId });
  if (result.error) throw new Error(explain(result.error));
  await revalidatePartnerById(partnerId);
}

export async function deleteOffer(partnerId: string, offerId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const result = await db.from('affiliate_offers').delete().eq('id', offerId).eq('partner_id', partnerId);
  if (result.error) throw new Error(explain(result.error));
  await revalidatePartnerById(partnerId);
}

/**
 * Sube el logo al bucket y guarda su URL. Mismo esquema de nombre que las
 * tiendas (`<slug>-<marca de tiempo>`): reemplazar el logo cambia la URL y
 * ninguna caché sigue mostrando el anterior.
 */
export async function uploadPartnerLogo(id: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede pasar de 5 MB.');

  const db = getSupabaseAdmin();
  const partner = await db.from('affiliate_partners').select('slug, logo_url').eq('id', id).single();
  if (partner.error) throw new Error(explain(partner.error));

  const extension = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const objectPath = `${partner.data.slug}-${Date.now().toString(36)}.${extension}`;

  const bytes = await file.arrayBuffer();
  const upload = await db.storage
    .from(AFFILIATE_IMAGES_BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (upload.error) throw new Error(`No se pudo subir la imagen: ${upload.error.message}`);

  const { data } = db.storage.from(AFFILIATE_IMAGES_BUCKET).getPublicUrl(objectPath);
  const update = await db.from('affiliate_partners').update({ logo_url: data.publicUrl }).eq('id', id);
  if (update.error) throw new Error(explain(update.error));

  await removeStoredObject(partner.data.logo_url as string | null);
  revalidatePartners([String(partner.data.slug)]);
  return data.publicUrl;
}

export async function removePartnerLogo(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const partner = await db.from('affiliate_partners').select('slug, logo_url').eq('id', id).single();
  if (partner.error) throw new Error(explain(partner.error));

  const update = await db.from('affiliate_partners').update({ logo_url: null }).eq('id', id);
  if (update.error) throw new Error(explain(update.error));

  await removeStoredObject(partner.data.logo_url as string | null);
  revalidatePartners([String(partner.data.slug)]);
}

/** Borra el objeto del bucket si la URL es de este bucket. Nunca lanza. */
async function removeStoredObject(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/object/public/${AFFILIATE_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(url.slice(index + marker.length));
  await getSupabaseAdmin().storage.from(AFFILIATE_IMAGES_BUCKET).remove([objectPath]);
}

async function revalidatePartnerById(partnerId: string): Promise<void> {
  const row = await getSupabaseAdmin().from('affiliate_partners').select('slug').eq('id', partnerId).single();
  revalidatePartners(row.error ? [] : [String(row.data.slug)]);
}

/** Tira el índice de aliados en los dos idiomas y la página de cada slug tocado. */
function revalidatePartners(slugs: string[]): void {
  for (const path of Object.values(SITE_ROUTES.partners)) revalidatePath(path);
  for (const slug of new Set(slugs)) {
    for (const path of Object.values(partnerPaths(slug))) revalidatePath(path);
  }
}

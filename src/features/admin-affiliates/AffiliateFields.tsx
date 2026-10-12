import type { ReactNode } from 'react';
import type { AffiliateOffer, AffiliatePartner } from '@/server/services/affiliates';

/**
 * Campos de los formularios de aliado y de producto del panel. Son HTML
 * plano dentro de un `<form action={serverAction}>`: no hay estado de
 * cliente, y el mismo bloque sirve para crear y para editar (con o sin
 * valores por defecto).
 */

export const inputClass =
  'w-full border-0 border-b border-[var(--border-strong)] bg-transparent px-0 py-2 text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]';
export const buttonClass =
  'rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]';
export const ghostButtonClass =
  'rounded-full border border-[var(--border-strong)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
export const dangerButtonClass =
  'rounded-full border border-[var(--critical)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--critical)] transition-colors hover:bg-[var(--critical-soft)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--critical)]';

export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.75rem] leading-[1.45] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h2>
      {hint && <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-[1.55] text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

/** "2026-11-01T06:00:00Z" → "2026-11-01T00:00", en hora de Honduras (UTC−6). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time - 6 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function PartnerFields({ partner }: { partner?: AffiliatePartner }) {
  return (
    <div className="space-y-10">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="name" required defaultValue={partner?.name ?? ''} placeholder="Eneba" className={inputClass} />
        </Field>
        <Field label="Slug" hint="La URL pública: /aliados/<slug>. Vacío = se arma con el nombre.">
          <input name="slug" defaultValue={partner?.slug ?? ''} placeholder="eneba" className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Sitio web" hint="La portada del aliado, sin parámetros de afiliado.">
          <input
            name="website_url"
            type="url"
            required
            defaultValue={partner?.websiteUrl ?? ''}
            placeholder="https://www.eneba.com"
            className={inputClass}
          />
        </Field>
        <Field
          label="Enlace de afiliado"
          hint="El enlace con nuestro identificador, tal como lo da el programa. Vacío = se usa el sitio web (no suma comisión)."
        >
          <input
            name="affiliate_url"
            type="url"
            defaultValue={partner?.affiliateUrl ?? ''}
            placeholder="https://www.eneba.com/?af_id=…"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Field label="Código promocional" hint="El código general del aliado. Cada producto puede tener el suyo.">
          <input
            name="promo_code"
            defaultValue={partner?.promoCode ?? ''}
            placeholder="FINDYOURPRICES"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Qué da el código (ES)" hint="Una frase: «5 % de descuento extra en tu primera compra».">
          <input name="promo_text_es" defaultValue={partner?.promoTextEs ?? ''} className={inputClass} />
        </Field>
        <Field label="Qué da el código (EN)">
          <input name="promo_text_en" defaultValue={partner?.promoTextEn ?? ''} className={inputClass} />
        </Field>
        <Field label="Qué vende (ES)" hint="Una línea bajo el nombre.">
          <input name="tagline_es" defaultValue={partner?.taglineEs ?? ''} className={inputClass} />
        </Field>
        <Field label="Qué vende (EN)">
          <input name="tagline_en" defaultValue={partner?.taglineEn ?? ''} className={inputClass} />
        </Field>
        <Field label="Descripción (ES)">
          <textarea name="description_es" rows={3} defaultValue={partner?.descriptionEs ?? ''} className={`${inputClass} resize-y`} />
        </Field>
        <Field label="Descripción (EN)">
          <textarea name="description_en" rows={3} defaultValue={partner?.descriptionEn ?? ''} className={`${inputClass} resize-y`} />
        </Field>
        <Field label="Texto alternativo del logo" hint="Vacío = el nombre del aliado.">
          <input name="image_alt" defaultValue={partner?.imageAlt ?? ''} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
        <Field label="Campaña desde" hint="Hora de Honduras. Vacío = sin inicio.">
          <input name="starts_at" type="datetime-local" defaultValue={toLocalInput(partner?.startsAt ?? null)} className={inputClass} />
        </Field>
        <Field label="Campaña hasta" hint="Vacío = sin fin.">
          <input name="ends_at" type="datetime-local" defaultValue={toLocalInput(partner?.endsAt ?? null)} className={inputClass} />
        </Field>
        <Field label="Orden" hint="Menor = antes.">
          <input name="sort_order" type="number" defaultValue={partner?.sortOrder ?? 0} className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Check name="is_active" label="Activo (se muestra en el sitio)" defaultChecked={partner?.isActive ?? false} />
        <Check name="is_featured" label="Destacado (va primero)" defaultChecked={partner?.isFeatured ?? false} />
      </div>
    </div>
  );
}

export function OfferFields({ offer }: { offer?: AffiliateOffer }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Field label="Producto (ES)">
          <input name="title_es" required defaultValue={offer?.titleEs ?? ''} placeholder="EA SPORTS FC 26 (PC) · Clave de EA App" className={inputClass} />
        </Field>
        <Field label="Producto (EN)" hint="Vacío = el mismo nombre.">
          <input name="title_en" defaultValue={offer?.titleEn ?? ''} className={inputClass} />
        </Field>
        <Field label="Nota (ES)" hint="Opcional: región, plataforma, condición.">
          <input name="note_es" defaultValue={offer?.noteEs ?? ''} placeholder="Clave global, entrega inmediata" className={inputClass} />
        </Field>
        <Field label="Nota (EN)">
          <input name="note_en" defaultValue={offer?.noteEn ?? ''} className={inputClass} />
        </Field>
        <Field label="Enlace de afiliado del producto" wide>
          <input name="url" type="url" required defaultValue={offer?.url ?? ''} placeholder="https://www.eneba.com/…?af_id=…" className={inputClass} />
        </Field>
        <Field label="URL de la imagen" hint="Copiá la dirección de la imagen desde la página del aliado." wide>
          <input name="image_url" type="url" defaultValue={offer?.imageUrl ?? ''} placeholder="https://…" className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-4">
        <Field label="Precio">
          <input name="price" inputMode="decimal" defaultValue={offer?.price ?? ''} placeholder="29.99" className={`${inputClass} tabular-nums`} />
        </Field>
        <Field label="Precio anterior" hint="Para mostrar el descuento.">
          <input name="list_price" inputMode="decimal" defaultValue={offer?.listPrice ?? ''} className={`${inputClass} tabular-nums`} />
        </Field>
        <Field label="Moneda">
          <input name="currency" maxLength={3} defaultValue={offer?.currency ?? 'USD'} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Orden">
          <input name="sort_order" type="number" defaultValue={offer?.sortOrder ?? 0} className={inputClass} />
        </Field>
        <Field label="Código propio" hint="Vacío = el del aliado." wide>
          <input name="promo_code" defaultValue={offer?.promoCode ?? ''} className={`${inputClass} font-mono`} />
        </Field>
      </div>
      <Check name="is_active" label="Activo" defaultChecked={offer?.isActive ?? true} />
    </div>
  );
}

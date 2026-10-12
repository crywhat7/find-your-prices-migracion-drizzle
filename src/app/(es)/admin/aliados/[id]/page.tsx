import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImagePlate } from '@/components/shared/ImagePlate';
import { formatOfferPrice, isWithinWindow, partnerPaths } from '@/features/affiliates/affiliateRules';
import {
  buttonClass,
  dangerButtonClass,
  ghostButtonClass,
  OfferFields,
  PartnerFields,
  SectionTitle,
} from '@/features/admin-affiliates/AffiliateFields';
import { ImageUploader } from '@/features/admin-shared/ImageUploader';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { getPartnerForAdmin } from '@/server/services/affiliates';
import {
  deleteOfferAction,
  deletePartnerAction,
  removePartnerLogoAction,
  saveOfferAction,
  updatePartnerAction,
  uploadPartnerLogoAction,
} from '../actions';

/**
 * Un aliado: sus datos, el logo y sus productos destacados. Todo por server
 * actions, como el formulario de tiendas.
 */
export const metadata: Metadata = { title: 'Editar aliado', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}

export default async function AffiliateEditPage({ params, searchParams }: PageProps) {
  const [{ id }, { status, message }] = await Promise.all([params, searchParams]);
  const partner = await getPartnerForAdmin(id);
  if (!partner) notFound();

  const visible = partner.isActive && isWithinWindow(partner.startsAt, partner.endsAt);
  const paths = partnerPaths(partner.slug);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
              Panel
            </Link>
            {' · '}
            <Link href="/admin/aliados" className="text-[var(--accent)] hover:opacity-70">
              ← Aliados
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            {partner.name}
          </h1>
          <p className="enter mt-3 flex flex-wrap gap-x-4 text-[0.8125rem] text-[var(--text-tertiary)]">
            <span className="font-mono">/{partner.slug}</span>
            <span className={visible ? 'text-[var(--price-win)]' : ''}>
              {!partner.isActive ? 'Inactivo' : visible ? 'Visible en el sitio' : 'Fuera de campaña'}
            </span>
            <span className="tabular-nums">{partner.clickCount} clics</span>
            {visible && (
              <>
                <Link href={paths.es} target="_blank" className="text-[var(--accent)] hover:opacity-70">
                  Ver página ES
                </Link>
                <Link href={paths.en} target="_blank" className="text-[var(--accent)] hover:opacity-70">
                  Ver página EN
                </Link>
              </>
            )}
          </p>

          {status === 'saved' && (
            <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
              Guardado. Las páginas de aliados ya se regeneraron.
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="mt-6 rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {message ?? 'No se pudo guardar.'}
            </p>
          )}
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl space-y-16">
          <section>
            <SectionTitle
              title="Logo"
              hint="Cuadrado y sobre fondo blanco o transparente, hasta 5 MB. Podés pegarlo directo del portapapeles."
            />
            <div className="mt-6 grid gap-6 sm:grid-cols-[10rem_1fr]">
              <ImagePlate
                imageUrl={partner.logoUrl}
                alt={partner.imageAlt ?? partner.name}
                name={partner.name}
                eager
                className="aspect-square rounded-3xl border border-[var(--border)]"
                initialClassName="text-6xl"
              />
              <div className="space-y-4">
                <ImageUploader
                  entityId={partner.id}
                  action={uploadPartnerLogoAction}
                  buttonClass={buttonClass}
                  storageKey="aliados"
                />
                {partner.logoUrl && (
                  <form action={removePartnerLogoAction}>
                    <input type="hidden" name="id" value={partner.id} />
                    <button type="submit" className={ghostButtonClass}>
                      Quitar logo
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          <form action={updatePartnerAction} className="space-y-8">
            <input type="hidden" name="id" value={partner.id} />
            <SectionTitle title="Datos del aliado" />
            <PartnerFields partner={partner} />
            <div className="flex items-center gap-4 border-t border-[var(--border)] pt-8">
              <button type="submit" className={buttonClass}>
                Guardar
              </button>
              <Link href="/admin/aliados" className="text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)]">
                Volver a la lista
              </Link>
            </div>
          </form>

          <section className="space-y-6">
            <SectionTitle
              title="Productos destacados"
              hint="Se muestran en la página del aliado y los primeros cuatro también en /aliados. El precio va en la moneda del aliado: no se convierte."
            />
            {partner.offers.length === 0 && (
              <p className="text-[0.875rem] text-[var(--text-tertiary)]">Sin productos todavía.</p>
            )}
            <ul className="space-y-2">
              {partner.offers.map((offer) => (
                <li key={offer.id}>
                  <details className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-2xl">
                      <ImagePlate imageUrl={offer.imageUrl} alt="" name={offer.titleEs} className="h-12 w-12 shrink-0 rounded-xl" initialClassName="text-xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium text-[var(--text)]">
                          {offer.titleEs}
                          {!offer.isActive && (
                            <span className="ml-2 text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
                              inactivo
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-[var(--text-tertiary)]">
                          {offer.price !== null && (
                            <span className="tabular-nums">{formatOfferPrice(offer.price, offer.currency, 'es')}</span>
                          )}
                          <span className="font-mono">{offer.promoCode ?? partner.promoCode ?? 'sin código'}</span>
                          <span className="tabular-nums">{offer.clickCount} clics</span>
                        </span>
                      </span>
                      <span className="text-[0.8125rem] text-[var(--text-tertiary)] group-open:hidden">Editar</span>
                      <span className="hidden text-[0.8125rem] text-[var(--text-tertiary)] group-open:inline">Cerrar</span>
                    </summary>
                    <div className="space-y-6 border-t border-[var(--border)] px-4 py-6 sm:px-6">
                      <form action={saveOfferAction} className="space-y-6">
                        <input type="hidden" name="partner_id" value={partner.id} />
                        <input type="hidden" name="offer_id" value={offer.id} />
                        <OfferFields offer={offer} />
                        <button type="submit" className={buttonClass}>
                          Guardar producto
                        </button>
                      </form>
                      <form action={deleteOfferAction}>
                        <input type="hidden" name="partner_id" value={partner.id} />
                        <input type="hidden" name="offer_id" value={offer.id} />
                        <button type="submit" className={dangerButtonClass}>
                          Borrar producto
                        </button>
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>

            <form
              action={saveOfferAction}
              className="space-y-6 rounded-3xl border border-dashed border-[var(--border-strong)] p-5 sm:p-6"
            >
              <input type="hidden" name="partner_id" value={partner.id} />
              <h3 className="text-[1rem] font-semibold tracking-[-0.01em] text-[var(--text)]">Agregar producto</h3>
              <OfferFields />
              <button type="submit" className={buttonClass}>
                Agregar
              </button>
            </form>
          </section>

          <section className="space-y-4 border-t border-[var(--border)] pt-10">
            <SectionTitle
              title="Borrar aliado"
              hint="Borra el aliado, sus productos y su logo. No se puede deshacer; para ocultarlo un tiempo, desmarcá «Activo»."
            />
            <form action={deletePartnerAction} className="flex flex-wrap items-center gap-4">
              <input type="hidden" name="id" value={partner.id} />
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
                <input type="checkbox" name="confirm" required className="h-4 w-4 accent-[var(--critical)]" />
                Sí, borrar {partner.name}
              </label>
              <button type="submit" className={dangerButtonClass}>
                Borrar aliado
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ImagePlate } from '@/components/shared/ImagePlate';
import { isWithinWindow, partnerPaths } from '@/features/affiliates/affiliateRules';
import { buttonClass, PartnerFields, SectionTitle } from '@/features/admin-affiliates/AffiliateFields';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { ApplicationsInbox } from '@/features/admin-affiliates/ApplicationsInbox';
import {
  listApplications,
  listPartnersForAdmin,
  type AffiliateApplication,
  type AffiliatePartner,
} from '@/server/services/affiliates';
import { createPartnerAction, updateApplicationAction } from './actions';
import { hasAdminSession } from '@/server/admin/session';

/**
 * Programa de afiliados: la bandeja de solicitudes que llegan desde el
 * formulario de /aliados, la lista de aliados con sus clics y el formulario
 * para dar uno de alta. Detrás de la puerta de /admin.
 */
export const metadata: Metadata = { title: 'Aliados', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ status?: string; message?: string }>;
}

export default async function AffiliateAdminPage({ searchParams }: PageProps) {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const { status, message } = await searchParams;

  let rows: AffiliatePartner[] = [];
  let loadError: string | null = null;
  try {
    rows = await listPartnersForAdmin();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  let applications: AffiliateApplication[] = [];
  let applicationsError: string | null = null;
  try {
    applications = await listApplications();
  } catch (error) {
    applicationsError = error instanceof Error ? error.message : String(error);
  }

  const live = rows.filter((row) => row.isActive && isWithinWindow(row.startsAt, row.endsAt)).length;
  const clicks = rows.reduce((sum, row) => sum + row.clickCount, 0);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
              Panel
            </Link>
            {' · '}
            <Link href="/aliados" target="_blank" className="text-[var(--accent)] hover:opacity-70">
              Ver /aliados
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            Aliados
          </h1>
          <p className="enter mt-4 max-w-[62ch] text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
            El programa de afiliados: cada aliado con su enlace de afiliado, su código y los productos que destacamos.
            Vive aparte del comparador: no toca resultados ni orden.
          </p>
          <dl className="enter mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            <Stat label="Aliados" value={rows.length} />
            <Stat label="Visibles hoy" value={live} />
            <Stat label="Clics totales" value={clicks} />
          </dl>

          {status === 'saved' && (
            <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
              Guardado.
            </p>
          )}
          {status === 'deleted' && (
            <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
              Aliado borrado, con sus productos.
            </p>
          )}
          {(status === 'error' || loadError) && (
            <p role="alert" className="mt-6 rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {message ?? loadError ?? 'No se pudo guardar.'}
            </p>
          )}
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl space-y-16">
          <ApplicationsInbox applications={applications} error={applicationsError} action={updateApplicationAction} />

          <section className="space-y-6">
            <SectionTitle title="Aliados" />
            {rows.length === 0 ? (
              <p className="text-[0.875rem] text-[var(--text-tertiary)]">Todavía no hay aliados. Creá el primero abajo.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id}>
                    <PartnerRow row={row} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-8">
            <SectionTitle
              title="Nuevo aliado"
              hint="Se crea inactivo si no marcás «Activo». Después de crearlo podés subir el logo y cargar productos."
            />
            <form action={createPartnerAction} className="space-y-8 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:p-8">
              <PartnerFields />
              <div className="border-t border-[var(--border)] pt-6">
                <button type="submit" className={buttonClass}>
                  Crear aliado
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

function PartnerRow({ row }: { row: AffiliatePartner }) {
  const visible = row.isActive && isWithinWindow(row.startsAt, row.endsAt);
  const state = !row.isActive ? 'inactivo' : visible ? 'visible' : 'fuera de campaña';

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
      <ImagePlate imageUrl={row.logoUrl} alt="" name={row.name} className="h-12 w-12 shrink-0 rounded-xl" initialClassName="text-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium text-[var(--text)]">
          {row.name}
          <span
            className={`ml-2 text-[0.6875rem] tracking-[0.14em] uppercase ${
              visible ? 'text-[var(--price-win)]' : 'text-[var(--text-tertiary)]'
            }`}
          >
            {state}
          </span>
          {row.isFeatured && (
            <span className="ml-2 text-[0.6875rem] tracking-[0.14em] text-[var(--accent)] uppercase">destacado</span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-[var(--text-tertiary)]">
          <span className="font-mono">/{row.slug}</span>
          <span>{row.promoCode ? <span className="font-mono">{row.promoCode}</span> : 'sin código'}</span>
          <span>{row.affiliateUrl ? 'enlace de afiliado ✓' : 'sin enlace de afiliado'}</span>
          <span className="tabular-nums">
            {row.offers.length} {row.offers.length === 1 ? 'producto' : 'productos'}
          </span>
          <span className="tabular-nums">{row.clickCount} clics</span>
        </p>
      </div>
      {visible && (
        <Link
          href={partnerPaths(row.slug).es}
          target="_blank"
          className="hidden text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)] sm:block"
        >
          Ver
        </Link>
      )}
      <Link
        href={`/admin/aliados/${row.id}`}
        className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        Editar
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="tracking-[0.14em] uppercase">{label}</dt>
      <dd className="text-[1rem] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
    </div>
  );
}

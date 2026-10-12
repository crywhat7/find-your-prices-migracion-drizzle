import type { AffiliateApplication, ApplicationStatus } from '@/server/services/affiliates';
import { buttonClass, inputClass, SectionTitle } from './AffiliateFields';

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: 'Nueva',
  contacted: 'Contactada',
  accepted: 'Aceptada',
  rejected: 'Descartada',
};

const STATUS_TONE: Record<ApplicationStatus, string> = {
  new: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  contacted: 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
  accepted: 'bg-[var(--price-win-soft)] text-[var(--price-win)]',
  rejected: 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]',
};

const dateFormat = new Intl.DateTimeFormat('es-HN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Tegucigalpa',
});

/**
 * Bandeja de solicitudes de afiliación: las nuevas primero y abiertas, con
 * botón de responder por correo (y por WhatsApp si dejaron teléfono), estado
 * y notas internas. Todo por server action, sin JavaScript.
 */
export function ApplicationsInbox({
  applications,
  error,
  action,
}: {
  applications: AffiliateApplication[];
  error: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const pending = applications.filter((row) => row.status === 'new').length;

  return (
    <section id="solicitudes" className="scroll-mt-6 space-y-6">
      <SectionTitle
        title={pending > 0 ? `Solicitudes · ${pending} ${pending === 1 ? 'nueva' : 'nuevas'}` : 'Solicitudes'}
        hint="Tiendas que pidieron ser aliadas desde el formulario de /aliados. Escribiles y marcá en qué quedó."
      />
      {error ? (
        <p role="alert" className="rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
          {error}
        </p>
      ) : applications.length === 0 ? (
        <p className="text-[0.875rem] text-[var(--text-tertiary)]">Todavía no llegó ninguna.</p>
      ) : (
        <ul className="space-y-2">
          {applications.map((row) => (
            <li key={row.id}>
              <ApplicationRow row={row} action={action} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicationRow({ row, action }: { row: AffiliateApplication; action: (formData: FormData) => Promise<void> }) {
  const subject = encodeURIComponent(`Find Your Prices × ${row.storeName}`);
  const whatsapp = row.phone ? row.phone.replace(/[^\d]/g, '') : '';

  return (
    <details open={row.status === 'new'} className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.06em] uppercase ${STATUS_TONE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-[var(--text)]">{row.storeName}</span>
        <span className="text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">{dateFormat.format(new Date(row.createdAt))}</span>
      </summary>

      <div className="space-y-5 border-t border-[var(--border)] px-4 py-5 sm:px-6">
        <dl className="grid gap-x-8 gap-y-3 text-[0.875rem] sm:grid-cols-2">
          <Item label="Contacto" value={row.contactName} />
          <Item label="Correo" value={<a href={`mailto:${row.email}`} className="text-[var(--accent)] hover:underline">{row.email}</a>} />
          {row.phone && <Item label="Teléfono" value={row.phone} />}
          {row.website && (
            <Item
              label="Sitio"
              value={
                <a href={row.website} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--accent)] hover:underline">
                  {row.website.replace(/^https?:\/\//, '')}
                </a>
              }
            />
          )}
          {row.category && <Item label="Qué vende" value={row.category} />}
          <Item label="Idioma" value={row.locale === 'en' ? 'Inglés' : 'Español'} />
          {row.message && <Item label="Mensaje" value={<span className="whitespace-pre-line">{row.message}</span>} wide />}
        </dl>

        <div className="flex flex-wrap gap-2">
          <a
            href={`mailto:${row.email}?subject=${subject}`}
            className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] hover:bg-[var(--bg-subtle)]"
          >
            Responder por correo
          </a>
          {whatsapp.length >= 8 && (
            <a
              href={`https://wa.me/${whatsapp.length === 8 ? `504${whatsapp}` : whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] hover:bg-[var(--bg-subtle)]"
            >
              Escribir por WhatsApp
            </a>
          )}
        </div>

        <form action={action} className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={row.id} />
          <label className="block">
            <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">Estado</span>
            <select name="status" defaultValue={row.status} className={inputClass}>
              {(Object.keys(STATUS_LABEL) as ApplicationStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">Notas internas</span>
            <input name="notes" defaultValue={row.notes ?? ''} placeholder="Le escribí el lunes, espera propuesta…" className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Guardar
          </button>
        </form>
      </div>
    </details>
  );
}

function Item({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</dt>
      <dd className="mt-0.5 text-[var(--text)]">{value}</dd>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { AFFILIATE_COPY } from "./affiliateCopy";
import type { ApplicationField } from "./applicationRules";
import { submitAffiliateApplication, type ApplyState } from "./applyAction";

const INITIAL: ApplyState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3.5 py-2.5 text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] aria-[invalid=true]:border-[var(--critical)]";

/**
 * "¿Tenés una tienda en línea?": la tienda deja sus datos y la solicitud cae
 * en /admin/aliados. Funciona sin JavaScript (es un `<form action>` con
 * server action); con JavaScript no recarga y muestra los errores en su
 * campo. El correo de contacto queda a la vista para quien prefiera
 * escribir directo.
 */
export function AffiliateApplyForm({ locale }: { locale: Locale }) {
  const copy = AFFILIATE_COPY[locale].apply;
  const [state, action, pending] = useActionState(submitAffiliateApplication, INITIAL);
  // Cuándo se pintó el formulario: un envío en menos de 3 s es un bot. Se
  // escribe al montar y no en el render, para que el HTML del servidor y el
  // del navegador coincidan. Sin JavaScript queda vacío y no frena a nadie.
  const startedRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (startedRef.current) startedRef.current.value = String(Date.now());
  }, []);

  const mailto = `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(copy.emailSubject)}`;

  if (state.status === "ok") {
    return (
      <div role="status" className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-10 text-center sm:px-10">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto h-8 w-8 text-[var(--price-win)]"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.5 2.8 2.8L16.5 9.5" />
        </svg>
        <h3 className="mt-3 text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{copy.successTitle}</h3>
        <p className="mt-1 text-[0.9375rem] text-[var(--text-secondary)]">{copy.successBody}</p>
      </div>
    );
  }

  const error = (field: ApplicationField) => state.errors?.[field];
  const value = (field: ApplicationField) => state.values?.[field] ?? "";

  return (
    <form action={action} noValidate className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:p-8">
      <input type="hidden" name="locale" value={locale} />
      <input ref={startedRef} type="hidden" name="started_at" defaultValue="" />
      {/* Trampa para bots: fuera de la vista y del orden de tabulación. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company URL
          <input type="text" name="company_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="store_name" label={copy.storeName} error={error("storeName")}>
          <input id="store_name" name="store_name" required maxLength={120} autoComplete="organization" defaultValue={value("storeName")} {...invalid(error("storeName"), "store_name")} className={inputClass} />
        </Field>
        <Field id="website" label={copy.website} optional={copy.optional} error={error("website")}>
          <input id="website" name="website" type="text" inputMode="url" maxLength={200} placeholder={copy.websitePlaceholder} autoComplete="url" defaultValue={value("website")} {...invalid(error("website"), "website")} className={inputClass} />
        </Field>
        <Field id="contact_name" label={copy.contactName} error={error("contactName")}>
          <input id="contact_name" name="contact_name" required maxLength={120} autoComplete="name" defaultValue={value("contactName")} {...invalid(error("contactName"), "contact_name")} className={inputClass} />
        </Field>
        <Field id="email" label={copy.email} error={error("email")}>
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={value("email")} {...invalid(error("email"), "email")} className={inputClass} />
        </Field>
        <Field id="phone" label={copy.phone} optional={copy.optional} hint={copy.phoneHint} error={error("phone")}>
          <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={value("phone")} {...invalid(error("phone"), "phone")} className={inputClass} />
        </Field>
        <Field id="category" label={copy.category} optional={copy.optional} error={error("category")}>
          <input id="category" name="category" maxLength={120} placeholder={copy.categoryPlaceholder} defaultValue={value("category")} {...invalid(error("category"), "category")} className={inputClass} />
        </Field>
        <Field id="message" label={copy.message} optional={copy.optional} error={error("message")} wide>
          <textarea id="message" name="message" rows={4} maxLength={2000} placeholder={copy.messagePlaceholder} defaultValue={value("message")} {...invalid(error("message"), "message")} className={`${inputClass} resize-y`} />
        </Field>
      </div>

      {state.status === "error" && state.message && (
        <p role="alert" className="mt-5 rounded-xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
          {state.message}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[44ch] text-[0.75rem] leading-[1.5] text-[var(--text-tertiary)]">{copy.privacy}</p>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-[var(--text)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
        >
          {pending ? copy.sending : copy.submit}
        </button>
      </div>

      <p className="mt-6 border-t border-[var(--border)] pt-5 text-[0.875rem] text-[var(--text-secondary)]">
        {copy.emailAlternative}{" "}
        <a href={mailto} className="font-medium text-[var(--accent)] underline-offset-[3px] hover:underline">
          {siteConfig.contactEmail}
        </a>
      </p>
    </form>
  );
}

function invalid(error: string | undefined, id: string) {
  return error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-[0.8125rem] font-medium text-[var(--text)]">
        {label}
        {optional && <span className="text-[0.75rem] font-normal text-[var(--text-tertiary)]">({optional})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.75rem] text-[var(--critical)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  );
}

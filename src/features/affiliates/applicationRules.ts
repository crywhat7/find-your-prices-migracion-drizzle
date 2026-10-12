import type { Locale } from "@/features/i18n/translate";

/**
 * Validación de la solicitud de afiliación. Pura, para que el servidor y las
 * pruebas usen la misma regla. El navegador ya valida con `required` y
 * `type="email"`; esto es lo que vale de verdad.
 */

export type ApplicationField = "storeName" | "website" | "contactName" | "email" | "phone" | "category" | "message";

export interface ApplicationData {
  storeName: string;
  website: string | null;
  contactName: string;
  email: string;
  phone: string | null;
  category: string | null;
  message: string | null;
}

export type ApplicationResult =
  | { ok: true; data: ApplicationData }
  | { ok: false; errors: Partial<Record<ApplicationField, string>> };

const MESSAGES: Record<Locale, Record<string, string>> = {
  es: {
    required: "Este campo es obligatorio.",
    email: "Revisá el correo: no parece válido.",
    website: "Revisá la dirección del sitio.",
    long: "Es demasiado largo.",
  },
  en: {
    required: "This field is required.",
    email: "Check the email: it does not look valid.",
    website: "Check the website address.",
    long: "It is too long.",
  },
};

const LIMITS: Record<ApplicationField, number> = {
  storeName: 120,
  website: 200,
  contactName: 120,
  email: 200,
  phone: 40,
  category: 120,
  message: 2000,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "tienda.hn" → "https://tienda.hn". `null` si no es una dirección web. */
export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function validateApplication(raw: Record<ApplicationField, string>, locale: Locale): ApplicationResult {
  const t = MESSAGES[locale];
  const errors: Partial<Record<ApplicationField, string>> = {};
  const value = (field: ApplicationField) => (raw[field] ?? "").trim();

  for (const field of Object.keys(LIMITS) as ApplicationField[]) {
    if (value(field).length > LIMITS[field]) errors[field] = t.long;
  }
  for (const field of ["storeName", "contactName", "email"] as const) {
    if (!value(field)) errors[field] = t.required;
  }
  if (value("email") && !errors.email && !EMAIL_PATTERN.test(value("email"))) errors.email = t.email;

  const website = normalizeWebsite(value("website"));
  if (value("website") && !website && !errors.website) errors.website = t.website;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const optional = (field: ApplicationField) => value(field) || null;
  return {
    ok: true,
    data: {
      storeName: value("storeName"),
      website,
      contactName: value("contactName"),
      email: value("email").toLowerCase(),
      phone: optional("phone"),
      category: optional("category"),
      message: optional("message"),
    },
  };
}

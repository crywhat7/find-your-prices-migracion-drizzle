"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PreferencesRows } from "@/components/layout/PreferencesMenu";
import { useCart } from "@/features/cart/useCart";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { useFavorites } from "@/features/products/useFavorites";

const LABELS: Record<
  Locale,
  { menu: string; close: string; categories: string; stores: string; partners: string; favorites: string; quote: string }
> = {
  es: {
    menu: "Menú",
    close: "Cerrar menú",
    categories: "Categorías",
    stores: "Tiendas",
    partners: "Aliados",
    favorites: "Favoritos",
    quote: "Cotización",
  },
  en: {
    menu: "Menu",
    close: "Close menu",
    categories: "Categories",
    stores: "Stores",
    partners: "Partners",
    favorites: "Favorites",
    quote: "Quote",
  },
};

export interface MobileMenuProps {
  /**
   * El buscador está en uso y la barra le cedió el sitio de favoritos,
   * cotización y preferencias: el panel los muestra debajo de los destinos.
   */
  compact?: boolean;
  /** La página actual en cada idioma; se lo pasa al selector de idioma. */
  localePaths?: Record<Locale, string>;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Menú hamburguesa de teléfono y tableta: categorías, tiendas y aliados.
 *
 * En escritorio esas dos puertas van sueltas en la barra; en pantallas chicas
 * competían con el buscador y con favoritos por los mismos 360px, y el
 * buscador —la acción principal— quedaba a media caja. Acá se pliegan detrás
 * de un botón, y la barra se queda con lo que se usa a cada rato: buscar,
 * favoritos y preferencias. Sólo se monta por debajo de `lg` (ver SiteNav).
 *
 * Mismo comportamiento que `PreferencesMenu`: panel flotante, se cierra con
 * Escape, al tocar fuera o al elegir un destino.
 *
 * Con `compact` recibe además lo que la barra apartó para el buscador. El
 * botón da un respingo al recibirlo y, si hay favoritos o artículos en la
 * cotización, lleva un punto: los contadores siguen a la vista aunque sus
 * iconos no.
 */
export function MobileMenu({ compact = false, localePaths, onOpenChange }: MobileMenuProps = {}) {
  const { locale } = useLocale();
  const labels = LABELS[locale] ?? LABELS.en;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const { count: favoritesCount } = useFavorites();
  const { count: cartCount } = useCart();
  const close = () => setOpen(false);

  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? labels.close : labels.menu}
        title={labels.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="mobile-menu-button"
        className={`relative -m-1 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          open ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {/* La clave cambia al compactarse para repetir el respingo; al volver
            no se anima, el movimiento lo llevan los iconos que salen. */}
        <svg
          key={compact ? "compact" : "full"}
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-[20px] w-[20px] ${compact ? "[animation:fyp-menu-receive_520ms_var(--ease-spring)_160ms_both]" : ""}`}
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {compact && !open && favoritesCount + cartCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg)] [animation:fyp-scale-in_320ms_var(--ease-spring)_260ms_both]"
          />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className={`absolute top-full right-0 z-50 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-md)] ${
            compact ? "w-[15.5rem]" : "w-[13.5rem]"
          }`}
          style={{ animation: "fyp-fade 180ms var(--ease-out-quart) both" }}
        >
          <div role="menu" aria-label={labels.menu}>
            <MenuLink href={routeFor("categories", locale)} label={labels.categories} onNavigate={close}>
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
            </MenuLink>
            <MenuLink href={routeFor("stores", locale)} label={labels.stores} onNavigate={close}>
              <path d="M3.5 9.5 5 4.5h14l1.5 5" />
              <path d="M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0" />
              <path d="M5 12.5v7h14v-7" />
              <path d="M10 19.5v-4.5h4v4.5" />
            </MenuLink>
            <MenuLink href={routeFor("partners", locale)} label={labels.partners} onNavigate={close}>
              <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
              <path d="M5 12.5v7h14v-7" />
              <path d="M12 8.5v11" />
              <path d="M12 8.5S10.8 4.5 8.4 4.5a2 2 0 0 0 0 4H12Zm0 0s1.2-4 3.6-4a2 2 0 0 1 0 4H12Z" />
            </MenuLink>

            {compact && (
              <>
                <div aria-hidden="true" className="mx-3 my-1.5 h-px bg-[var(--border)]" />
                <MenuLink
                  href={routeFor("favorites", locale)}
                  label={labels.favorites}
                  count={favoritesCount}
                  tone="favorite"
                  onNavigate={close}
                  style={arrive(0)}
                >
                  <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 6.9 4.5c1.9 0 3.5 1 4.4 2.4a5.1 5.1 0 0 1 4.4-2.4c3.3 0 5.6 3.1 4.3 6.6C19.5 15.9 12 20.5 12 20.5Z" />
                </MenuLink>
                <MenuLink
                  href={routeFor("quote", locale)}
                  label={labels.quote}
                  count={cartCount}
                  onNavigate={close}
                  style={arrive(1)}
                >
                  <path d="M3 4h2.2l2.2 11.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1" />
                  <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="20" r="1.1" fill="currentColor" stroke="none" />
                </MenuLink>
              </>
            )}
          </div>

          {compact && (
            <div className="mt-1.5 border-t border-[var(--border)] px-2 pt-2 pb-1" style={arrive(2)}>
              <PreferencesRows localePaths={localePaths} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Entrada escalonada de lo que llega desde la barra, uno tras otro. */
function arrive(index: number): CSSProperties {
  return { animation: `fyp-menu-arrive 420ms var(--ease-out-expo) ${60 + index * 50}ms both` };
}

function MenuLink({
  href,
  label,
  count = 0,
  tone = "ink",
  onNavigate,
  style,
  children,
}: {
  href: string;
  label: string;
  /** Contador a la derecha; con 0 no se pinta. */
  count?: number;
  tone?: "ink" | "favorite";
  onNavigate: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      style={style}
      aria-label={count > 0 ? `${label} (${count})` : undefined}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[20px] w-[20px] text-[var(--text-secondary)]"
      >
        {children}
      </svg>
      {label}
      {count > 0 && (
        <span
          aria-hidden="true"
          className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums ${
            tone === "favorite"
              ? "bg-[var(--favorite)] text-[var(--favorite-contrast)]"
              : "bg-[var(--text)] text-[var(--text-inverted)]"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

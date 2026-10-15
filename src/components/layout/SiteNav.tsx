"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { PreferencesMenu } from "@/components/layout/PreferencesMenu";
import { SHELL } from "@/components/layout/shell";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { SiteSearch } from "@/features/products/components/SiteSearch";
import { useFavorites } from "@/features/products/useFavorites";
import { useCart } from "@/features/cart/useCart";

const HOME_LABEL: Record<string, string> = {
  en: "Find Your Prices — home",
  es: "Find Your Prices — inicio",
};

const CATEGORIES_LABEL: Record<string, string> = {
  en: "Categories",
  es: "Categorías",
};

const STORES_LABEL: Record<string, string> = {
  en: "Stores",
  es: "Tiendas",
};

const PARTNERS_LABEL: Record<string, string> = {
  en: "Partners",
  es: "Aliados",
};

const FAVORITES_LABEL: Record<string, string> = {
  en: "Favorites",
  es: "Favoritos",
};

const QUOTE_LABEL: Record<string, string> = {
  en: "Quote",
  es: "Cotización",
};

/**
 * Barra fija translúcida. La hairline inferior sólo aparece cuando la página
 * ya se desplazó: en reposo la navegación se funde con el fondo.
 */
export interface SiteNavProps {
  /** La página actual en cada idioma; se lo pasa al selector de idioma. */
  localePaths?: Record<Locale, string>;
}

export function SiteNav({ localePaths }: SiteNavProps = {}) {
  const { locale } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);
  const { count: favoritesCount } = useFavorites();
  const { count: cartCount } = useCart();
  const [searchActive, setSearchActive] = useState(false);
  // Si el menú se abrió con la barra compacta, sigue compacta hasta cerrarlo:
  // tocar el botón le quita el foco al buscador, y sin esto los iconos
  // volverían a la barra —y se irían del panel— justo al abrirlo.
  const [menuHolds, setMenuHolds] = useState(false);
  const compact = searchActive || menuHolds;

  useScrollProgress();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`enter-fade sticky top-0 z-40 print:hidden h-14 bg-[var(--glass)] backdrop-blur-xl transition-[border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] ${
        isScrolled
          ? "border-b border-[var(--border)] shadow-[var(--shadow-sm)]"
          : "border-b border-transparent"
      }`}
    >
      <div className={`${SHELL} flex h-full items-center gap-3 sm:gap-4`}>
        {/* El logo lleva al catálogo. Desde que existen páginas que no son la
            portada, era la única salida de vuelta y no estaba. Es el isotipo
            (ver `.brand-isotipo` en globals.css): más bajo en teléfono, donde
            cada píxel de ancho se lo quita al buscador. */}
        <Link
          href={routeFor("home", locale)}
          aria-label={HOME_LABEL[locale] ?? HOME_LABEL.en}
          className="group -m-1.5 shrink-0 rounded-lg p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span
            aria-hidden="true"
            className="brand-isotipo h-[22px] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-spring)] group-hover:scale-[1.06] sm:h-[26px]"
          />
        </Link>

        {/* El buscador va en la barra y no en la página: es la acción
            principal del sitio y tiene que estar a mano en todas las páginas
            y a cualquier altura del scroll. En teléfono ocupa todo lo que
            queda entre el logo y el icono de categorías; en escritorio se
            acota para que no se convierta en una línea de un metro. */}
        <div className="min-w-0 flex-1 lg:mx-auto lg:max-w-[34rem]">
          <SiteSearch onActiveChange={setSearchActive} />
        </div>

        {/* Las puertas del sitio después del buscador: categorías, tiendas,
            aliados y favoritos. Un rastreador tiene que encontrar las dos
            primeras desde cualquier página. Por debajo de `lg` categorías,
            tiendas y aliados se pliegan en el menú hamburguesa (los enlaces siguen en
            el pie para los rastreadores) y la barra queda con favoritos,
            preferencias y menú, en ese orden. Idioma y tema van plegados en el último botón.
            Y mientras se usa el buscador, en teléfono también se pliegan
            favoritos, cotización y preferencias (ver `.nav-tools`). */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          <NavLink
            href={routeFor("categories", locale)}
            label={CATEGORIES_LABEL[locale] ?? CATEGORIES_LABEL.en}
          >
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
          </NavLink>

          <NavLink href={routeFor("stores", locale)} label={STORES_LABEL[locale] ?? STORES_LABEL.en}>
            {/* Un toldo de tienda. */}
            <path d="M3.5 9.5 5 4.5h14l1.5 5" />
            <path d="M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0" />
            <path d="M5 12.5v7h14v-7" />
            <path d="M10 19.5v-4.5h4v4.5" />
          </NavLink>

          <NavLink href={routeFor("partners", locale)} label={PARTNERS_LABEL[locale] ?? PARTNERS_LABEL.en}>
            {/* Un regalo: los aliados traen su código de descuento. */}
            <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
            <path d="M5 12.5v7h14v-7" />
            <path d="M12 8.5v11" />
            <path d="M12 8.5S10.8 4.5 8.4 4.5a2 2 0 0 0 0 4H12Zm0 0s1.2-4 3.6-4a2 2 0 0 1 0 4H12Z" />
          </NavLink>

          <div data-collapsed={compact} className="nav-tools">
            <div className="nav-tools-row flex items-center gap-0.5 sm:gap-2">
              {/* El corazón es la puerta a "Mis favoritos" y a la vez el contador:
                  se ve cuántos hay sin entrar. En el servidor y hasta hidratar el
                  contador es 0 y no se pinta, así el HTML coincide. */}
              <Link
                href={routeFor("favorites", locale)}
                aria-label={
                  favoritesCount > 0
                    ? `${FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en} (${favoritesCount})`
                    : (FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en)
                }
                title={FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en}
                className="nav-tool relative -m-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--favorite)] focus-visible:ring-2 focus-visible:ring-[var(--favorite)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[20px] w-[20px]"
                  fill={favoritesCount > 0 ? "var(--favorite)" : "none"}
                  stroke={favoritesCount > 0 ? "var(--favorite)" : "currentColor"}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 6.9 4.5c1.9 0 3.5 1 4.4 2.4a5.1 5.1 0 0 1 4.4-2.4c3.3 0 5.6 3.1 4.3 6.6C19.5 15.9 12 20.5 12 20.5Z" />
                </svg>
                {favoritesCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--favorite)] px-1 text-[0.625rem] font-semibold tabular-nums text-[var(--favorite-contrast)] shadow-[var(--shadow-sm)]"
                  >
                    {favoritesCount > 99 ? "99+" : favoritesCount}
                  </span>
                )}
              </Link>

              {/* El carrito: la puerta a la cotización, con el número de
                  artículos distintos. En tinta y no en color: es la herramienta
                  de trabajo de la barra, no un estado. */}
              <Link
                href={routeFor("quote", locale)}
                aria-label={
                  cartCount > 0
                    ? `${QUOTE_LABEL[locale] ?? QUOTE_LABEL.en} (${cartCount})`
                    : (QUOTE_LABEL[locale] ?? QUOTE_LABEL.en)
                }
                title={QUOTE_LABEL[locale] ?? QUOTE_LABEL.en}
                className="nav-tool relative -m-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={`h-[20px] w-[20px] ${cartCount > 0 ? "text-[var(--text)]" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4h2.2l2.2 11.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1" />
                  <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="20" r="1.1" fill="currentColor" stroke="none" />
                </svg>
                {cartCount > 0 && (
                  <span
                    key={cartCount}
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--text)] px-1 text-[0.625rem] font-semibold tabular-nums text-[var(--text-inverted)] shadow-[var(--shadow-sm)] [animation:fyp-heartbeat_420ms_var(--ease-spring)_both]"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>

              <div className="nav-tool">
                <PreferencesMenu localePaths={localePaths} />
              </div>
            </div>
          </div>

          {/* Último en teléfono: favoritos, cotización, preferencias, menú. */}
          <div className="lg:hidden">
            <MobileMenu
              compact={compact}
              localePaths={localePaths}
              onOpenChange={(open) => setMenuHolds(open && searchActive)}
            />
          </div>
        </div>
      </div>

      {/* Progreso de lectura: se dibuja contra el scroll del documento, no
          contra un temporizador, así que no miente sobre cuánto falta. Donde
          no hay scroll-driven animations no se pinta en absoluto. */}
      <span
        aria-hidden="true"
        className="scroll-progress absolute inset-x-0 bottom-0 h-px bg-[var(--accent)]"
      />
    </nav>
  );
}

/**
 * Enlace de la barra con icono y nombre, sólo en escritorio (`lg`); por
 * debajo vive en `MobileMenu`. Los hijos son los trazos del icono (viewBox
 * 24, trazo 1.6).
 */
function NavLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="-m-1 hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-1 text-[0.8125rem] lg:flex font-medium tracking-[-0.01em] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:px-2.5"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[20px] w-[20px]"
      >
        {children}
      </svg>
      <span>{label}</span>
    </Link>
  );
}

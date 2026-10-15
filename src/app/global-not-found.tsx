import type { Metadata } from "next";
import { RootDocument } from "@/components/layout/RootDocument";
import { NotFoundView } from "@/features/errors/NotFoundView";
import "./globals.css";

export const metadata: Metadata = {
  title: "Página no encontrada · Find Your Prices",
  description: "La página que buscás no existe o ya no está disponible.",
  robots: { index: false, follow: true },
};

/**
 * 404 para URLs que no coinciden con ninguna ruta. No hay un layout raíz
 * único (cada idioma tiene el suyo), así que Next no puede armar este caso
 * con `not-found.tsx` y pide un documento completo. Se activa con
 * `experimental.globalNotFound` en `next.config.ts`.
 *
 * Aquí no se conoce el idioma de la URL, así que se sirve en español, el
 * idioma por defecto del sitio.
 */
export default function GlobalNotFound() {
  return (
    <RootDocument locale="es">
      <NotFoundView locale="es" />
    </RootDocument>
  );
}

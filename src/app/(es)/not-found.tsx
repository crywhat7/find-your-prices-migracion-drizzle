import type { Metadata } from "next";
import { NotFoundView } from "@/features/errors/NotFoundView";

/**
 * Sin canónica ni hreflang: el layout declara los de la portada, y un 404 no
 * debe apuntar a ninguna página como su versión preferida.
 */
export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "La página que buscás no existe o ya no está disponible.",
  alternates: {},
  robots: { index: false, follow: true },
};

/** Se muestra cuando una página en español llama a `notFound()`. Ver `NotFoundView`. */
export default function NotFound() {
  return <NotFoundView locale="es" />;
}

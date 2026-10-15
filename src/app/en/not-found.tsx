import type { Metadata } from "next";
import { NotFoundView } from "@/features/errors/NotFoundView";

/**
 * Sin canónica ni hreflang: el layout declara los de la portada, y un 404 no
 * debe apuntar a ninguna página como su versión preferida.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you are looking for does not exist or is no longer available.",
  alternates: {},
  robots: { index: false, follow: true },
};

/** Shown when an English page calls `notFound()`. See `NotFoundView`. */
export default function NotFound() {
  return <NotFoundView locale="en" />;
}

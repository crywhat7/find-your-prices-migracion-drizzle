/**
 * Insignia de tienda aliada: el sello con el apretón de manos, a 16px.
 *
 * Reemplaza a la píldora con el texto "Aliado": junto al nombre de la tienda
 * una marca se reconoce de un vistazo y no le quita ancho al nombre. El
 * texto sigue ahí como `alt` (lector de pantalla) y `title` (al pasar el
 * cursor). Los archivos salen de `scripts/generate-partner-badge.mjs`.
 */
export function PartnerBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- ícono fijo de 16px, ya optimizado */
    <img
      src="/brand/partner-badge-32.webp"
      srcSet="/brand/partner-badge-16.webp 1x, /brand/partner-badge-32.webp 2x, /brand/partner-badge-48.webp 3x"
      width={16}
      height={16}
      alt={label}
      title={label}
      decoding="async"
      className={`inline-block h-4 w-4 shrink-0 ${className}`}
    />
  );
}

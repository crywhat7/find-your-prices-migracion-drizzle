import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_TAGLINE, siteConfig } from "@/config/site";

/**
 * Manifiesto web.
 *
 * No es SEO en sentido estricto —Google no rankea por esto—, pero Lighthouse
 * lo mide dentro de "Best Practices" y es lo que permite que el sitio se
 * agregue a la pantalla de inicio en Android con su icono y su color, en vez
 * de como un marcador con una captura genérica.
 *
 * En español, que es el idioma por defecto: el manifiesto no se negocia por
 * idioma y el público del catálogo es hondureño.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${SITE_TAGLINE.es}`,
    short_name: siteConfig.shortName,
    description: SITE_DESCRIPTION.es,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es-HN",
    dir: "ltr",
    categories: ["shopping", "utilities"],
    // Fondo oscuro y acento azul: los mismos tokens `--bg` y `--accent` del
    // tema oscuro de globals.css, que es el tema por defecto del sitio.
    background_color: "#08080a",
    theme_color: "#08080a",
    // El isotipo en placa blanca (ver scripts/generate-brand-assets.mjs).
    // 192 y 512 son los dos tamaños que Chrome exige para ofrecer "instalar";
    // el `maskable` deja aire para que Android lo recorte en círculo o en
    // gota sin comerse las letras.
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

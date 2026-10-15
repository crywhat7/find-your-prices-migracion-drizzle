"use client";

import { useCallback, useState } from "react";

export const PRODUCT_IMAGE_PLACEHOLDER = "/images/no-image-placeholder.png";

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  /** Clases de la foto real: tamaño, `object-contain`, margen, la escala al pasar por encima. */
  className?: string;
  /** Clases del placeholder. Por defecto rellena la placa entera. */
  placeholderClassName?: string;
  loading?: "lazy" | "eager";
}

/**
 * Foto de producto con respaldo: si no hay URL, o si la tienda la sirve rota
 * (404, hotlink bloqueado, dominio caído), se pinta `no-image-placeholder.png`
 * en su lugar.
 *
 * El placeholder no hereda el margen ni el `object-contain` de la foto: va con
 * `object-cover` y sin margen, así la placa entera queda gris en vez de un
 * rectángulo gris flotando dentro de una placa blanca.
 */
export function ProductImage({
  src,
  alt,
  className = "",
  placeholderClassName = "h-full w-full object-cover",
  loading = "lazy",
}: ProductImageProps) {
  // Se guarda QUÉ url falló y no un booleano: cuando cambia `src` (la galería
  // al elegir otra miniatura) el fallo anterior deja de aplicar solo.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Si la imagen falla antes de que React hidrate, el `onError` ya pasó y no
  // vuelve a dispararse. Al montar se revisa si quedó cargada pero vacía.
  const checkBroken = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && src && img.complete && img.naturalWidth === 0) setFailedSrc(src);
    },
    [src],
  );

  if (!src || failedSrc === src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={PRODUCT_IMAGE_PLACEHOLDER} alt="" loading={loading} className={placeholderClassName} />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- imagen externa de la tienda */
    <img
      ref={checkBroken}
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

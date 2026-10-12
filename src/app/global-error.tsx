"use client";

import { useEffect } from "react";

/**
 * Último recurso: un error en el layout raíz, donde no hay tema, fuentes ni
 * navegación. Por eso trae su propio documento y estilos en línea, con los
 * mismos colores del tema oscuro del sitio. El idioma sale de la ruta.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const english = typeof window !== "undefined" && /^\/en(\/|$)/.test(window.location.pathname);

  useEffect(() => {
    if (error.digest) return;
    try {
      const body = JSON.stringify({ message: error.message, stack: error.stack, path: window.location.pathname, kind: "global" });
      navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }));
    } catch {
      // Nada que hacer.
    }
  }, [error]);

  return (
    <html lang={english ? "en" : "es"}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080a",
          color: "#f5f5f7",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <title>{english ? "Something went wrong · Find Your Prices" : "Algo falló · Find Your Prices"}</title>
        <main style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.03em", margin: 0 }}>
            {english ? "Something got stuck on our side" : "Algo se trabó de nuestro lado"}
          </h1>
          <p style={{ color: "#a1a1a6", fontSize: 16, lineHeight: 1.6, marginTop: 16 }}>
            {english
              ? "It is not your fault. It has been logged and we will look into it. Try again in a moment."
              : "No es tu culpa. Ya quedó anotado y lo vamos a revisar. Probá de nuevo en un momento."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={retry}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "12px 24px",
                background: "#f5f5f7",
                color: "#08080a",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {english ? "Try again" : "Intentar de nuevo"}
            </button>
            <a
              href={english ? "/en" : "/"}
              style={{
                borderRadius: 999,
                padding: "12px 24px",
                border: "1px solid rgba(245,245,247,0.24)",
                color: "#f5f5f7",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {english ? "Go to the comparator" : "Ir al comparador"}
            </a>
          </div>
          {error.digest && (
            <p style={{ color: "#87878d", fontSize: 12, marginTop: 40 }}>
              {english ? "Reference code" : "Código de referencia"}: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

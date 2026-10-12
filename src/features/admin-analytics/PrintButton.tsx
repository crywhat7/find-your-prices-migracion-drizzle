"use client";

/** Abre el diálogo de impresión; desde ahí se guarda como PDF. */
export function PrintButton({ className }: { className: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Imprimir o guardar PDF
    </button>
  );
}

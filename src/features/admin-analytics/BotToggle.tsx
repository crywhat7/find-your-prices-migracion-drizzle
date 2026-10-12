"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatInt } from "./format";

/**
 * "Incluir bots": un checkbox de verdad que lleva a la misma vista con o sin
 * `?bots=1`. La URL guarda la elección, así se puede compartir o volver a
 * ella. Al lado, cuántas vistas de bots hay en el rango, para saber de
 * cuánto se habla antes de marcarlo.
 */
export function BotToggle({
  checked,
  toggleHref,
  botViews,
  sampleRate,
}: {
  checked: boolean;
  toggleHref: string;
  botViews: number;
  /** Fracción de visitas de bots que se anotan (ver `botSampleRate`). */
  sampleRate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[0.8125rem] text-[var(--text-secondary)] print:hidden">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={() => startTransition(() => router.push(toggleHref, { scroll: false }))}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span>
        Incluir bots y rastreadores
        <span className="ml-1.5 tabular-nums text-[var(--text-tertiary)]">
          ({formatInt(botViews)} {botViews === 1 ? "vista" : "vistas"} en el rango
          {sampleRate < 1 && sampleRate > 0 ? `, muestra de 1 cada ${Math.round(1 / sampleRate)}` : ""})
        </span>
      </span>
      {pending && <span className="text-[var(--text-tertiary)]">…</span>}
    </label>
  );
}

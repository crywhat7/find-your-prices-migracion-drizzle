"use client";

import { useEffect, useState } from "react";
import { BUILD_INFO, commitUrl, formatBuildTime, type BuildInfo } from "@/lib/buildInfo";
import { fetchServerBuild } from "./VersionWatcher";

type ServerState = { status: "loading" } | { status: "error" } | { status: "ready"; info: BuildInfo };

/**
 * Tarjeta de versión del panel: qué build corre en el servidor (¿ya terminó
 * el despliegue?) y con cuál se cargó este navegador (¿está al día o con
 * caché vieja?). Se lee del lado del navegador para que la comparación sea
 * real: si la armara el servidor, mostraría su propia versión dos veces.
 */
export function VersionPanel() {
  const [server, setServer] = useState<ServerState>({ status: "loading" });

  const load = async () => {
    const info = await fetchServerBuild();
    setServer(info ? { status: "ready", info } : { status: "error" });
  };

  useEffect(() => {
    let alive = true;
    void fetchServerBuild().then((info) => {
      if (alive) setServer(info ? { status: "ready", info } : { status: "error" });
    });
    return () => {
      alive = false;
    };
  }, []);

  const upToDate = server.status === "ready" && server.info.buildId === BUILD_INFO.buildId;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge server={server} upToDate={upToDate} />
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void load()} className="text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)]">
            Volver a revisar
          </button>
          {server.status === "ready" && !upToDate && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-[var(--text)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Recargar
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-4 text-[0.8125rem] sm:grid-cols-2">
        <BuildColumn label="Servidor (lo desplegado)" info={server.status === "ready" ? server.info : null} pending={server.status === "loading"} />
        <BuildColumn label="Este navegador" info={BUILD_INFO} />
      </dl>
    </div>
  );
}

function StatusBadge({ server, upToDate }: { server: ServerState; upToDate: boolean }) {
  if (server.status === "loading") {
    return <span className="text-[0.875rem] text-[var(--text-tertiary)]">Revisando…</span>;
  }
  if (server.status === "error") {
    return <span className="text-[0.875rem] text-[var(--critical)]">No se pudo consultar /api/version</span>;
  }
  return upToDate ? (
    <span className="flex items-center gap-2 text-[0.875rem] font-medium text-[var(--price-win)]">
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[var(--price-win)]" />
      Este navegador está al día con lo desplegado
    </span>
  ) : (
    <span className="flex items-center gap-2 text-[0.875rem] font-medium text-[var(--critical)]">
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[var(--critical)]" />
      Este navegador tiene una versión vieja: recargá
    </span>
  );
}

function BuildColumn({ label, info, pending = false }: { label: string; info: BuildInfo | null; pending?: boolean }) {
  const link = info ? commitUrl(info.commit) : null;
  return (
    <div>
      <dt className="text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</dt>
      <dd className="mt-1 text-[var(--text)]">
        {info ? (
          <>
            <span className="font-semibold">v{info.version}</span>
            {" · "}
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="font-mono text-[var(--accent)] hover:underline">
                {info.commit}
              </a>
            ) : (
              <span className="font-mono">{info.commit}</span>
            )}
            <span className="block text-[0.75rem] text-[var(--text-tertiary)]">
              Compilado {formatBuildTime(info.builtAt)} · <span className="font-mono">{info.buildId}</span>
            </span>
          </>
        ) : (
          <span className="text-[var(--text-tertiary)]">{pending ? "…" : "—"}</span>
        )}
      </dd>
    </div>
  );
}

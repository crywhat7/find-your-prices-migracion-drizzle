import type { Instrumentation } from "next";

/**
 * Todo error que se escapa en el servidor —render de páginas, route
 * handlers, server actions, proxy— pasa por acá y queda en la bitácora de
 * /admin/errores, con la ruta, el método y el `digest` que Next le muestra
 * al visitante como código de referencia.
 *
 * Los errores que el código atrapa a propósito (y muestra con un aviso) no
 * llegan acá: esos los anota quien los atrapa, con `logError`.
 *
 * `logError` se importa dentro de la función para que este archivo no
 * arrastre la base de datos al arranque de cada runtime.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logError } = await import("@/server/errors/logError");
  const userAgent = request.headers["user-agent"];

  await logError({
    source: context.routeType,
    error,
    path: request.path,
    route: context.routePath,
    method: request.method,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    context: {
      renderSource: "renderSource" in context ? context.renderSource : undefined,
      revalidateReason: context.revalidateReason,
    },
  });
};

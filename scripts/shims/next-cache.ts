/**
 * `next/cache` para los scripts que corren fuera de Next.
 *
 * Los servicios del sitio envuelven sus consultas en `unstable_cache`, que
 * fuera de un servidor de Next lanza "incrementalCache missing". En un script
 * de una sola pasada no hay nada que cachear: cada función se llama tal cual.
 *
 * Lo enchufa `scripts/tsconfig.json` (`paths`), sólo para quien corra con
 * `--tsconfig scripts/tsconfig.json`. El build del sitio no lo ve.
 */
export function unstable_cache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return fn;
}

export function revalidateTag(): void {}

export function revalidatePath(): void {}

/**
 * Sinónimos de la búsqueda.
 *
 * La búsqueda exige cada palabra escrita como prefijo de alguna palabra del
 * nombre ("play 5" → 'play:* & 5:*'). Eso falla cuando la gente escribe
 * junto lo que la tienda escribe separado, o al revés: "vbucks" no encuentra
 * "Fortnite 1000 V-Bucks", porque el nombre normalizado dice "v bucks".
 *
 * Cada grupo es una lista de formas equivalentes, ya normalizadas (minúsculas,
 * sin acentos, [a-z0-9] y espacios, como `normalized_name`). Si lo escrito
 * contiene una de ellas, esa parte de la consulta pasa a aceptar cualquiera:
 * "fortnite vbucks" → 'fortnite:* & (vbucks:* | (v <-> bucks:*) | ...)'.
 *
 * Agregar un grupo es agregar una línea. Solo equivalencias seguras: un
 * sinónimo que en otra tienda significa otra cosa ("pavos" son V-Bucks en
 * España y pavos en el súper) mezcla resultados en vez de encontrarlos.
 */
export const SEARCH_SYNONYMS: ReadonlyArray<ReadonlyArray<string>> = [
  ['vbucks', 'v bucks', 'vbuck', 'v buck'],
  ['giftcard', 'gift card', 'tarjeta de regalo'],
  ['gamepass', 'game pass'],
  ['psplus', 'ps plus', 'playstation plus'],
  ['ps5', 'playstation 5'],
  ['ps4', 'playstation 4'],
  ['audifonos', 'auriculares'],
  ['laptop', 'portatil'],
];

/** Formas de cada grupo partidas en palabras, de la más larga a la más corta. */
const PHRASES: { words: string[]; group: ReadonlyArray<string> }[] = SEARCH_SYNONYMS.flatMap((group) =>
  group.map((form) => ({ words: form.split(' '), group })),
).sort((a, b) => b.words.length - a.words.length);

/**
 * Una forma como término de tsquery. Una palabra va como prefijo, igual que el
 * resto de la búsqueda. Varias van seguidas (`<->`) y exactas salvo la
 * última: "v bucks" como `v:* & bucks:*` encontraba "Volumen 2 ... Bucket
 * List"; `v <-> bucks:*` solo encuentra "V-Bucks".
 */
function formTerm(words: string[]): string {
  if (words.length === 1) return `${words[0]}:*`;
  return `(${[...words.slice(0, -1), `${words[words.length - 1]}:*`].join(' <-> ')})`;
}

/**
 * Palabras ya normalizadas → tsquery con prefijos y sinónimos. `null` sin
 * palabras.
 */
export function wordsToTsQuery(words: string[]): string | null {
  if (words.length === 0) return null;
  const parts: string[] = [];

  for (let i = 0; i < words.length; ) {
    // La forma más larga que calce desde acá: "playstation plus" antes que nada.
    const match = PHRASES.find(({ words: phrase }) =>
      phrase.every((word, offset) => words[i + offset] === word),
    );
    if (match) {
      parts.push(`(${match.group.map((form) => formTerm(form.split(' '))).join(' | ')})`);
      i += match.words.length;
    } else {
      parts.push(`${words[i]}:*`);
      i += 1;
    }
  }

  return parts.join(' & ');
}

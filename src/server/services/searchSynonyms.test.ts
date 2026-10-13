import { describe, expect, it } from 'vitest';
import { wordsToTsQuery } from './searchSynonyms';

describe('wordsToTsQuery', () => {
  it('sin sinónimos es AND de prefijos', () => {
    expect(wordsToTsQuery(['play', '5'])).toBe('play:* & 5:*');
  });

  it('"vbucks" también busca "v bucks", como lo escribe Eneba', () => {
    expect(wordsToTsQuery(['fortnite', 'vbucks'])).toBe(
      'fortnite:* & (vbucks:* | (v <-> bucks:*) | vbuck:* | (v <-> buck:*))',
    );
  });

  it('una forma de varias palabras se reconoce entera', () => {
    expect(wordsToTsQuery(['v', 'bucks', '1000'])).toBe(
      '(vbucks:* | (v <-> bucks:*) | vbuck:* | (v <-> buck:*)) & 1000:*',
    );
  });

  it('prefiere la forma más larga', () => {
    expect(wordsToTsQuery(['playstation', 'plus'])).toBe(
      '(psplus:* | (ps <-> plus:*) | (playstation <-> plus:*))',
    );
  });

  it('sin palabras devuelve null', () => {
    expect(wordsToTsQuery([])).toBeNull();
  });
});

-- =============================================================================
-- 0057_search_did_you_mean.sql
-- "Quizá quisiste decir": corrige palabras mal escritas de una búsqueda sin
-- resultados.
--
-- Por qué. La búsqueda exige todas las palabras (0026), así que un error de
-- tipeo —"televsor", "audifnos", "fortnte"— deja la lista vacía y la persona
-- no sabe si no hay nada o si escribió mal.
--
-- Cómo.
--   1. `catalog_words`: el vocabulario del catálogo, cada palabra de
--      `mv_catalog.normalized_name` con en cuántos artículos aparece. Sale de
--      `ts_stat`, con un índice de trigramas (pg_trgm, instalado en 0001).
--      Solo palabras de 3+ letras, no puramente numéricas y presentes en 2+
--      artículos: una errata de una sola ficha no debe ser la corrección.
--   2. `suggest_search_query(p_query)`: recibe la búsqueda ya normalizada
--      (como `normalized_name`). Cada palabra que no exista en el vocabulario
--      —ni como palabra ni como comienzo de una, porque la búsqueda es por
--      prefijo— se cambia por la más cercana: entre las 20 más parecidas por
--      trigramas, la de menos ediciones (levenshtein, de fuzzystrmatch) y, a
--      igual distancia, la más común.
--      Devuelve la búsqueda corregida, o null si no había nada que corregir o
--      no se encontró nada parecido.
--   3. `refresh_catalog()` también refresca el vocabulario. Si ese paso falla,
--      el catálogo queda refrescado igual y el error queda como warning.
--
-- La app solo ofrece la corrección si esa búsqueda sí trae resultados con los
-- mismos filtros (ver `findSpellingSuggestion` en services/catalog.ts).
--
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. levenshtein(). Supabase trae fuzzystrmatch disponible; se instala en
-- public, junto a pg_trgm (0001).
-- -----------------------------------------------------------------------------
create extension if not exists fuzzystrmatch with schema public;

-- -----------------------------------------------------------------------------
-- 1. Vocabulario.
-- -----------------------------------------------------------------------------
create materialized view if not exists find_your_prices.catalog_words as
select s.word, s.ndoc as freq
from ts_stat($q$select to_tsvector('simple', normalized_name) from find_your_prices.mv_catalog$q$) s
where s.ndoc >= 2
  and length(s.word) between 3 and 40
  and s.word !~ '^[0-9]+$'
with data;

comment on materialized view find_your_prices.catalog_words is
  'Vocabulario del catalogo (palabras de mv_catalog.normalized_name y en cuantos articulos aparecen). Lo usa suggest_search_query (0057). Se refresca con refresh_catalog().';

-- Única para `refresh ... concurrently`; `text_pattern_ops` para el chequeo de
-- prefijo (`like 'palabra%'`); trigramas para buscar la más parecida.
create unique index if not exists catalog_words_word_key
  on find_your_prices.catalog_words (word);
create index if not exists catalog_words_word_prefix_idx
  on find_your_prices.catalog_words (word text_pattern_ops);
create index if not exists catalog_words_word_trgm_idx
  on find_your_prices.catalog_words using gin (word public.gin_trgm_ops);

grant select on find_your_prices.catalog_words to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. La corrección.
--
-- Dos pasos. Los trigramas (`%`, umbral 0.3) encuentran rápido, con su
-- índice, las 20 palabras más parecidas. Entre ellas gana la de menos
-- ediciones: los trigramas solos preferían "forte" a "fortnite" para
-- "fortnte", porque castigan las palabras largas. A igual distancia, la más
-- común. Más de un tercio de la palabra en ediciones (mínimo 2) ya no es una
-- errata: no se corrige.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.suggest_search_query(p_query text)
returns text
language plpgsql
stable
set search_path = find_your_prices, public, pg_catalog
as $$
declare
  v_word    text;
  v_best    text;
  v_out     text[] := '{}';
  v_changed boolean := false;
begin
  foreach v_word in array regexp_split_to_array(trim(coalesce(p_query, '')), '\s+') loop
    continue when v_word = '';

    -- Cortas, números o que ya existen (como palabra o como comienzo de una):
    -- se dejan como están.
    if length(v_word) < 3
       or v_word ~ '^[0-9]+$'
       or v_word !~ '^[a-z0-9]+$'
       or exists (select 1 from catalog_words w where w.word like v_word || '%')
    then
      v_out := v_out || v_word;
      continue;
    end if;

    select c.word into v_best
      from (
        select w.word, w.freq
          from catalog_words w
         where w.word % v_word
         order by similarity(w.word, v_word) desc
         limit 20
      ) c
     where levenshtein(c.word, v_word) <= greatest(2, length(v_word) / 3)
     order by levenshtein(c.word, v_word), c.freq desc, c.word
     limit 1;

    if v_best is null then
      v_out := v_out || v_word;
    else
      v_out := v_out || v_best;
      v_changed := true;
    end if;
  end loop;

  return case when v_changed then array_to_string(v_out, ' ') end;
end;
$$;

comment on function find_your_prices.suggest_search_query(text) is
  'Busqueda normalizada -> la misma con las palabras desconocidas cambiadas por la mas parecida del catalogo (catalog_words), o null. Ver 0057.';

grant execute on function find_your_prices.suggest_search_query(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. refresh_catalog() refresca también el vocabulario.
-- Mismo cuerpo que 0030 más el paso del vocabulario.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.refresh_catalog(p_triggered_by text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = find_your_prices, pg_catalog
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_ms      integer;
begin
  refresh materialized view concurrently find_your_prices.mv_catalog;

  -- El vocabulario es un extra: si falla, el catálogo ya quedó al día.
  begin
    refresh materialized view concurrently find_your_prices.catalog_words;
  exception when others then
    raise warning 'refresh_catalog: no se pudo refrescar catalog_words (%)', sqlerrm;
  end;

  v_ms := (extract(epoch from clock_timestamp() - v_started) * 1000)::integer;

  insert into find_your_prices.catalog_refresh_log (id, refreshed_at, duration_ms, triggered_by)
  values (true, now(), v_ms, p_triggered_by)
  on conflict (id) do update set
    refreshed_at = excluded.refreshed_at,
    duration_ms  = excluded.duration_ms,
    triggered_by = excluded.triggered_by;

  return jsonb_build_object('refreshed_at', now(), 'duration_ms', v_ms, 'triggered_by', p_triggered_by);
end;
$$;

revoke all on function find_your_prices.refresh_catalog(text) from public, anon, authenticated;
grant execute on function find_your_prices.refresh_catalog(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Reporte: tamaño del vocabulario y un par de correcciones de ejemplo.
-- -----------------------------------------------------------------------------
select
  (select count(*) from find_your_prices.catalog_words)                    as palabras,
  find_your_prices.suggest_search_query('televsor samsumg')                as ejemplo_1,
  find_your_prices.suggest_search_query('audifnos inalambricos')           as ejemplo_2;

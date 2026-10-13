# Activar la caché de páginas en Cloudflare (R2 + D1)

> **Para quién es esto:** para la persona que tiene acceso a la cuenta de
> Cloudflare donde corre `findyourprices.com`. No hace falta tocar código.
> Son unos 20–30 minutos de clics en el panel.
>
> **Lo que NO hay que hacer:** mergear la rama `infra/cloudflare-r2-cache`
> antes de terminar los pasos 1 a 4. Si se mergea antes, el deploy falla
> (la config apunta a un bucket y una base que todavía no existen).

---

## Por qué hace falta

Desde que el sitio corre en Cloudflare Workers (plan Free), Google pierde
visitas: el Worker tiene un techo de **10 ms de CPU por petición**, y armar una
ficha de producto con Next.js lo pasa. Medido el 12-oct-2026, **1 de cada 6
fichas respondía `503` con el error 1102** ("Worker exceeded resource limits").
Googlebot ve esos errores, rastrea menos y baja el sitio en los resultados.
Pasamos de 5.500–7.500 visitas diarias a unas 100.

El arreglo es guardar cada página ya armada y servirla desde ahí:

| Pieza | Para qué | Costo |
|---|---|---|
| **R2** (bucket `find-your-prices-cache`) | Guarda cada página ya armada | Gratis hasta 10 GB y 1M escrituras / 10M lecturas al mes. **Probablemente pida tarjeta para activarlo**, pero no cobra dentro de ese límite. |
| **D1** (base `find-your-prices-tags`) | Anota cuándo se invalidó cada página, para que el botón "refrescar caché" del panel siga funcionando | Gratis, sin tarjeta |

Probado en local con el Worker real: una ficha pasa de **1,6 s** (primera
visita) a **0,03 s** (las siguientes).

La configuración ya está escrita en la rama `infra/cloudflare-r2-cache`
(`wrangler.jsonc` y `open-next.config.ts`). Solo faltan los recursos en
Cloudflare y dos datos que hay que copiar del panel.

---

## Paso 0 — Antes de tocar nada: anotar cómo se despliega hoy

Esto sirve para no romper lo que ya funciona.

1. Entrá a **Workers & Pages** y abrí el Worker del sitio.
2. Anotá el **nombre exacto del Worker** (arriba a la izquierda, por ejemplo
   `find-your-prices`).
3. Andá a **Settings → Build** y anotá:
   - el *Build command*
   - el *Deploy command*
   - la *rama de producción* (debería ser `main`)
   - si están activados los *builds para ramas que no son de producción*
4. Andá a **Deployments**, abrí el último deploy que salió bien y copiá las
   **primeras ~40 líneas del log del build**: ahí se ve qué gestor de paquetes
   usa (npm o bun) y qué versión de `@opennextjs/cloudflare` instala.
5. Andá a **Settings → Variables and Secrets** y anotá **solo los nombres**
   (no los valores) de las variables que hay.

---

## Paso 1 — Crear la base D1 (gratis, sin tarjeta)

1. Menú izquierdo: **Storage & Databases → D1 SQL Database**.
2. **Create database**.
3. Nombre: `find-your-prices-tags` (exacto).
4. Ubicación: la que ofrezca por defecto (o la más cercana a EE. UU. este).
5. Crear y, en la página de la base, copiar el **Database ID** (un UUID tipo
   `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

No hace falta crear tablas: las crea el deploy.

---

## Paso 2 — Crear el bucket R2

1. Menú izquierdo: **Storage & Databases → R2 Object Storage**.
2. Si es la primera vez, Cloudflare pide **activar R2**. Puede pedir una
   tarjeta: el plan incluye un uso gratis mensual y no cobra si no se pasa.
   (Si no se quiere poner tarjeta, parar acá y avisar: hay que buscar otra
   opción.)
3. **Create bucket**.
4. Nombre: `find-your-prices-cache` (exacto).
5. Ubicación: *Automatic*. Clase de almacenamiento: *Standard*.
6. Crear. No hace falta configurar nada más (ni acceso público, ni CORS).

---

## Paso 3 — Ajustes del dominio (no dependen del código, se pueden hacer ya)

Estos son independientes de la rama: se pueden aplicar hoy mismo sin riesgo.

1. **Redirigir `http://` a `https://`.** Hoy `http://findyourprices.com`
   responde la página en vez de redirigir, y Google lo ve como contenido
   duplicado.
   - Abrí el dominio `findyourprices.com` → **SSL/TLS → Edge Certificates** →
     activar **Always Use HTTPS**.
2. **(Opcional) `www`.** Hoy `www.findyourprices.com` no resuelve.
   - **DNS → Add record**: tipo `CNAME`, nombre `www`, destino
     `findyourprices.com`, *Proxied* (nube naranja).
   - **Rules → Redirect Rules → Create rule**: si el hostname es
     `www.findyourprices.com`, redirección dinámica 301 a
     `concat("https://findyourprices.com", http.request.uri.path)` conservando
     la query string.
3. **Que no se bloquee a Google.** **Security → Events**, filtrar por
   *User agent contiene "Googlebot"* en los últimos 7 días. Si aparece
   bloqueado o con desafío, avisar (y anotar qué regla lo hizo).

---

## Paso 4 — Avisar con estos datos

Copiá este mensaje, completalo y mandáselo a Milton (o pegalo directamente en
Claude Code dentro del proyecto):

```text
Listos los pasos de docs/cloudflare-cache-r2.md. Datos:

- Nombre del Worker: ____________
- D1 Database ID (find-your-prices-tags): ____________
- Bucket R2 find-your-prices-cache creado: sí / no (motivo: ____ )
- Build command actual: ____________
- Deploy command actual: ____________
- Rama de producción: ____________
- Builds de ramas que no son de producción: activados / desactivados
- Gestor de paquetes y versión de @opennextjs/cloudflare que aparecen en el log del build: ____________
- Variables y secretos (solo nombres): ____________
- Always Use HTTPS activado: sí / no
- www configurado: sí / no / no se hizo
- ¿Googlebot aparece bloqueado en Security → Events?: sí / no

Completá la rama infra/cloudflare-r2-cache con estos datos, revisala y
dejala lista para mergear.
```

Con esos datos se completa `wrangler.jsonc` (nombre del Worker e ID de D1), se
revisa que el comando de build sea compatible y se deja la rama lista.

---

## Paso 5 — Después del merge (lo hace quien mergea)

1. En **Settings → Build** del Worker, dejar:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
2. Mergear `infra/cloudflare-r2-cache` a `main`. El push dispara el deploy.
3. Mirar el log del deploy: tiene que decir *Populating remote R2 incremental
   cache* y *Creating D1 table if necessary* sin errores.

### Cómo comprobar que funcionó

Desde cualquier terminal:

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://findyourprices.com/p/la-corona
```

Correrlo dos veces: la segunda tiene que dar `200` y bastante menos de 1 s.

Y en **Workers → (el Worker) → Metrics**, en las horas siguientes, los errores
*Exceeded CPU Time Limit* tienen que bajar mucho.

### Si algo sale mal (volver atrás)

- En **Deployments**, botón **Rollback** al deploy anterior: vuelve en
  segundos a como estaba.
- Después, revertir el merge en GitHub (`Revert` en el PR) para que el próximo
  push no lo vuelva a desplegar.
- El bucket R2 y la base D1 se pueden quedar: sin el código que los usa no
  hacen nada ni cuestan nada.

---

## Paso 6 — Variables en el build (obligatorio desde el 13-oct-2026)

Cloudflare tiene **dos** lugares para variables y no se comparten:

- **Settings → Variables and Secrets**: las usa el Worker cuando atiende
  visitas. Estas ya estaban.
- **Settings → Build → Variables and secrets**: las usa el *build*. Acá
  faltaban.

Next arma la portada, `/categorias` y `/tiendas` durante el build, y el deploy
sube esas páginas a la caché de R2. Sin las variables de Supabase en el build,
salieron armadas sin base: la portada con productos de ejemplo ("Wireless
Mouse", Amazon) y `/tiendas` con "0 artículos de 0 tiendas", y la caché las
sirvió a todos hasta que vencieron. Se arregló a mano invalidando la caché.

En **Settings → Build → Variables and secrets** agregar, con los mismos valores
que tienen las variables del Worker:

| Variable | Tipo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | texto |
| `NEXT_PUBLIC_SITE_URL` | texto (`https://findyourprices.com`) |
| `SUPABASE_SECRET_KEY` | **secreto** |

Desde el commit que sigue a este paso, un build sin `NEXT_PUBLIC_SUPABASE_URL`
**falla a propósito** (mensaje: *Falta NEXT_PUBLIC_SUPABASE_URL en un build de
producción*). Si un deploy falla con ese mensaje, producción sigue con la
versión anterior: solo hay que agregar la variable de arriba y reintentar.

---

## Recomendado (cuesta US$5/mes)

El plan **Workers Paid** sube el techo de CPU de 10 ms a 30 s por petición y el
de peticiones de 100 mil por día a 10 millones al mes. Con la caché de R2 la
mayoría de las visitas ya no gastan CPU, pero la **primera** visita a cada ficha
todavía arma la página y puede pasarse de los 10 ms. Es el único cambio que
elimina el error 1102 del todo.

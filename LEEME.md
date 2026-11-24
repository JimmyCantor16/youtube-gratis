# Sala TV — mockup para cliente

Fase 1 del plan `docs/plan-sala-cliente.html`: una tele con control remoto que se
alimenta con enlaces de YouTube, clasificados por categoría (canal), película o
serie, temporada y episodio. Sitio estático: sin build y sin servidor.

## Verlo

```bash
cd demos/sala-cliente
python -m http.server 8765      # luego http://127.0.0.1:8765
```

Hace falta servirlo (no abrir el archivo con doble clic): el catálogo se lee con
`fetch` y los módulos JS no cargan desde `file://`.

**Ojo:** en redes o equipos con filtro de contenido que bloquee YouTube, ni las
portadas ni los videos cargan. Para enseñarlo, usar otra red (celular con datos).

## Qué hay

| Archivo | Qué es |
|---|---|
| `index.html` + `assets/app.js` | La tele: canales = categorías, mando (números, CH, VOL, ⏮ ⏭, OK, ficha, teclas de color), filas («Continuar viendo», destacados, recién agregados, por canal y por género), ficha con temporadas y episodios, búsqueda, perfiles adulto/infantil. |
| `panel.html` + `assets/panel.js` | Panel del dueño: pegar un enlace (se comprueba solo con oEmbed), clasificar, series pegando varios enlaces, reordenar, canales, publicar. |
| `assets/comun.js` | Carga del catálogo, YouTube (id, oEmbed, portadas), progreso por perfil. |
| `catalogo.json` | El catálogo publicado. En la versión real lo escribe el panel con un commit en GitHub. |

## Qué es de mentira en el mockup

- **Publicar** guarda en el `localStorage` del navegador; la tele lo lee por encima
  de `catalogo.json`. En la versión real es un commit y Render redespliega.
- **El progreso y los perfiles** viven en el navegador. En la versión real, en
  PostgreSQL (Neon), por cuenta.
- **El panel no pide clave.** En la versión real va con login, como el panel de la
  barbería.
- **Playlists:** sin clave de YouTube solo se pueden traer los episodios uno a uno
  (pegando varios enlaces de golpe). La importación de una playlist entera va en
  el servidor, con la YouTube Data API.

## Contenido de demostración

Películas abiertas de Blender Studio (CC BY) y videos públicos de la NASA, todos
comprobados el 18-nov-2026 por oEmbed: existen y su dueño permite incrustarlos.
Además, «Lucifer — avances oficiales»: tráileres y avances de las temporadas 1 y 2
publicados por sus dueños (FOX, Warner Bros. y DC) en sus canales oficiales; los
derechos son de ellos. Y «Las siete edades del rock — promos oficiales» (Seven Ages
of Rock, BBC/VH1 2007): 7 promos de su emisión en la televisión pública de Uruguay,
de los canales oficiales de Canal 5 (@Canal5UY) y TNU, comprobadas el 23-nov-2026.
Ni la BBC ni VH1 publican los episodios completos en YouTube; las copias completas
que circulan son subidas de terceros sin derechos y no se usan. Se reemplaza por el
contenido del cliente desde el panel o editando `catalogo.json`.

## Cambiar la marca

`catalogo.json` → `marca`: `nombre` (logo, título y rótulo de la tele) y `acento`
(color de acción, en hex). El texto sobre el acento se elige solo según su brillo.

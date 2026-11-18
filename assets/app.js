import {
  cargarCatalogo, episodiosDe, portada, portadaDe, apto, etiquetaEdad, duracionLegible, metaDe,
  perfilActual, cambiarPerfil, progresoDe, guardarProgreso, estaVisto, siguienteDe, escapar,
} from "./comun.js";

const $ = (s, el = document) => el.querySelector(s);
const ICONO = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  sig: '<svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  izq: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  der: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
};
const COLORES = ["var(--rojo)", "var(--verde)", "var(--amarillo)", "var(--azul)"];

const estado = {
  cat: null,
  perfil: perfilActual(),
  canales: [],
  canal: 0,
  posicion: new Map(), // canal → índice en su programación
  encendida: true,
  empezado: false, // hasta el primer «play» la tele muestra la portada (sin autoplay)
  actual: null, // { titulo, ep }
  player: null,
  playerListo: null,
  reloj: null,
};

// ---------- Arranque ----------

async function iniciar() {
  try {
    const { catalogo } = await cargarCatalogo();
    estado.cat = catalogo;
  } catch (e) {
    $("#filas").innerHTML = `<p class="vacio">No se pudo cargar el catálogo. ${escapar(e.message)}</p>`;
    return;
  }
  aplicarMarca(estado.cat.marca || {});
  aplicarPerfil();
  enlazarEventos();
}

function aplicarMarca(marca) {
  const nombre = marca.nombre || "Sala TV";
  $("#marca").textContent = nombre;
  document.title = nombre;
  const [a, ...b] = nombre.split(" ");
  $("#tv-marca").innerHTML = escapar(a) + (b.length ? " <span>" + escapar(b.join(" ")) + "</span>" : "");
  if (marca.acento && /^#[0-9a-f]{6}$/i.test(marca.acento)) {
    document.documentElement.style.setProperty("--acento", marca.acento);
    document.documentElement.style.setProperty("--acento-tinta", luminancia(marca.acento) > 0.45 ? "#062a22" : "#ffffff");
  }
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function aplicarPerfil() {
  document.body.classList.toggle("infantil", estado.perfil === "infantil");
  $("#aviso-infantil").hidden = estado.perfil !== "infantil";
  $(".perfil .perfil-ava").textContent = estado.perfil === "infantil" ? "I" : "A";
  $(".perfil .perfil-nom").textContent = estado.perfil === "infantil" ? "Infantil" : "Adulto";
  construirCanales();
  pintarMando();
  pintarFilas();
  const sigueSiendoApto = estado.actual && apto(estado.actual.titulo, estado.perfil);
  if (!sigueSiendoApto) {
    estado.actual = null;
    if (estado.player) estado.player.stopVideo?.();
    estado.canal = Math.min(estado.canal, estado.canales.length - 1);
    mostrarCanal(Math.max(0, estado.canal), { silencioso: true, forzarPortada: true });
  } else {
    pintarAhora();
  }
}

function construirCanales() {
  const cats = [...estado.cat.categorias].sort((a, b) => a.canal - b.canal);
  estado.canales = cats
    .map((c) => ({
      categoria: c,
      items: estado.cat.titulos
        .filter((t) => t.categoria === c.id && apto(t, estado.perfil))
        .flatMap((t) => episodiosDe(t).map((ep) => ({ titulo: t, ep }))),
    }))
    .filter((c) => c.items.length);
}

// ---------- La tele ----------

function itemDe(canal) {
  const c = estado.canales[canal];
  if (!c) return null;
  const pos = Math.min(estado.posicion.get(canal) || 0, c.items.length - 1);
  return c.items[pos];
}

function mostrarCanal(i, { silencioso = false, forzarPortada = false } = {}) {
  if (!estado.canales.length) return;
  const n = estado.canales.length;
  estado.canal = ((i % n) + n) % n;
  const c = estado.canales[estado.canal];
  document.querySelectorAll("#numeros .tecla").forEach((b, k) => b.classList.toggle("activa", k === estado.canal));
  if (!silencioso) {
    osd(`CH ${String(c.categoria.canal).padStart(2, "0")}<small>${escapar(c.categoria.nombre)}</small>`);
    zumbido();
  }
  const item = itemDe(estado.canal);
  if (estado.empezado && estado.encendida && !forzarPortada) reproducir(item);
  else verPortada(item);
}

function verPortada(item) {
  estado.actual = item;
  if (!item) return;
  const img = $("#poster-img");
  img.src = portada(item.ep.youtube, true);
  img.onerror = () => { img.onerror = null; img.src = portada(item.ep.youtube); };
  img.alt = item.titulo.nombre;
  $("#poster").hidden = false;
  $("#poster").setAttribute("aria-label", "Ver " + item.titulo.nombre);
  $("#sin-senal").hidden = true;
  ambiente(item);
  pintarAhora();
}

function ambiente(item) {
  $("#ambi").style.backgroundImage = `url("${portada(item.ep.youtube)}")`;
}

function cargarApiYoutube() {
  if (estado.playerListo) return estado.playerListo;
  estado.playerListo = new Promise((resolver, rechazar) => {
    window.onYouTubeIframeAPIReady = resolver;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => rechazar(new Error("No se pudo cargar el reproductor de YouTube."));
    document.head.appendChild(s);
  });
  return estado.playerListo;
}

async function reproducir(item, desde) {
  if (!item) return;
  estado.empezado = true;
  estado.actual = item;
  if (!estado.encendida) encender(true);
  $("#poster").hidden = true;
  $("#sin-senal").hidden = true;
  const reg = progresoDe(estado.perfil)[item.ep.clave];
  const inicio = desde ?? (reg && !estaVisto(reg) && reg.s > 5 ? reg.s : 0);
  ambiente(item);
  rotulo(item);
  pintarAhora();
  try {
    await cargarApiYoutube();
  } catch (e) {
    sinSenal(e.message);
    return;
  }
  if (!estado.player) {
    estado.player = new YT.Player("reproductor", {
      host: "https://www.youtube-nocookie.com",
      videoId: item.ep.youtube,
      playerVars: { autoplay: 1, start: inicio, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 },
      events: { onStateChange: cambioDeEstado, onError: errorDeVideo },
    });
  } else {
    estado.player.loadVideoById({ videoId: item.ep.youtube, startSeconds: inicio });
  }
}

function cambioDeEstado(ev) {
  const pantalla = $("#pantalla");
  if (ev.data === YT.PlayerState.PLAYING) {
    pantalla.classList.add("reproduciendo");
    clearInterval(estado.reloj);
    estado.reloj = setInterval(guardarAhora, 4000);
  } else {
    pantalla.classList.remove("reproduciendo");
    clearInterval(estado.reloj);
    if (ev.data === YT.PlayerState.PAUSED) {
      guardarAhora();
      pintarContinuar();
    }
    if (ev.data === YT.PlayerState.ENDED) {
      const d = estado.player.getDuration();
      guardarProgreso(estado.perfil, estado.actual.ep.clave, d, d);
      pintarContinuar();
      siguiente(true);
    }
  }
}

function guardarAhora() {
  if (!estado.player || !estado.actual) return;
  const s = estado.player.getCurrentTime?.() || 0;
  const d = estado.player.getDuration?.() || estado.actual.ep.duracion || 0;
  if (s > 1) guardarProgreso(estado.perfil, estado.actual.ep.clave, s, d);
}

function errorDeVideo(ev) {
  // 101/150: el dueño no deja verlo fuera de YouTube; 100: ya no existe.
  const motivo = ev.data === 100 ? "Este video ya no existe en YouTube." : "Este video no se puede ver fuera de YouTube.";
  sinSenal(motivo + "<br><small>Pasando al siguiente…</small>");
  setTimeout(() => siguiente(true), 3500);
}

function sinSenal(html) {
  const el = $("#sin-senal");
  el.innerHTML = `<div>SIN SEÑAL<br>${html}</div>`;
  el.hidden = false;
}

function siguiente(auto = false) {
  const c = estado.canales[estado.canal];
  if (!c) return;
  const pos = (estado.posicion.get(estado.canal) || 0) + 1;
  estado.posicion.set(estado.canal, pos % c.items.length);
  const item = itemDe(estado.canal);
  if (auto) osd(`<small>A continuación</small>`);
  if (estado.empezado) reproducir(item, 0);
  else verPortada(item);
}

function anterior() {
  const c = estado.canales[estado.canal];
  if (!c) return;
  const pos = (estado.posicion.get(estado.canal) || 0) - 1;
  estado.posicion.set(estado.canal, (pos + c.items.length) % c.items.length);
  const item = itemDe(estado.canal);
  if (estado.empezado) reproducir(item, 0);
  else verPortada(item);
}

/** Llevar un episodio concreto a la tele (desde la ficha o una tarjeta). */
function verEnLaTele(titulo, ep, desde) {
  const canal = estado.canales.findIndex((c) => c.categoria.id === titulo.categoria);
  if (canal < 0) return;
  const pos = estado.canales[canal].items.findIndex((it) => it.ep.clave === ep.clave);
  estado.posicion.set(canal, Math.max(0, pos));
  estado.canal = canal;
  document.querySelectorAll("#numeros .tecla").forEach((b, k) => b.classList.toggle("activa", k === canal));
  reproducir(estado.canales[canal].items[Math.max(0, pos)], desde);
  $(".escenario").scrollIntoView({ behavior: "smooth", block: "start" });
}

function encender(on) {
  estado.encendida = on;
  $("#tv").classList.toggle("off", !on);
  $("#apagada").hidden = on;
  if (!on) {
    estado.player?.pauseVideo?.();
    // El nodo se recrea para que el puntito de apagado se anime de nuevo.
    $("#apagada").innerHTML = "<i></i>";
  } else {
    zumbido();
    mostrarCanal(estado.canal);
  }
}

function volumen(delta) {
  if (!estado.player?.getVolume) return osd("VOL --");
  if (estado.player.isMuted()) estado.player.unMute();
  const v = Math.max(0, Math.min(100, estado.player.getVolume() + delta));
  estado.player.setVolume(v);
  const barras = Math.round(v / 10);
  osd(`VOL<small>${"▮".repeat(barras)}${"▯".repeat(10 - barras)}</small>`);
}

function silenciar() {
  if (!estado.player?.isMuted) return;
  if (estado.player.isMuted()) { estado.player.unMute(); osd("<small>Sonido</small>"); }
  else { estado.player.mute(); osd("MUTE"); }
}

function playPausa() {
  if (!estado.empezado || !estado.player?.getPlayerState) return reproducir(estado.actual || itemDe(estado.canal));
  const s = estado.player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) { estado.player.pauseVideo(); osd("❚❚"); }
  else { estado.player.playVideo(); osd("▶"); }
}

function osd(html) {
  const el = $("#osd");
  el.innerHTML = html;
  el.classList.remove("ver");
  void el.offsetWidth;
  el.classList.add("ver");
}

function rotulo(item) {
  const el = $("#rotulo");
  const sub = item.titulo.tipo === "serie" ? `T${item.ep.temporada} · E${item.ep.numero} — ${escapar(item.ep.nombre)}` : metaDe(item.titulo);
  el.innerHTML = `<b>${escapar(item.titulo.nombre)}</b><small>${sub}</small>`;
  el.hidden = true;
  void el.offsetWidth;
  el.hidden = false;
}

function zumbido() {
  const tv = $("#tv");
  tv.classList.remove("zumbido");
  void tv.offsetWidth;
  tv.classList.add("zumbido");
}

// ---------- Mando ----------

function pintarMando() {
  $("#numeros").innerHTML = estado.canales
    .slice(0, 9)
    .map((c, i) => `<button class="tecla${i === estado.canal ? " activa" : ""}" data-canal="${i}" aria-label="Canal ${c.categoria.canal}: ${escapar(c.categoria.nombre)}" title="${escapar(c.categoria.nombre)}">${c.categoria.canal}</button>`)
    .join("");
  const cuatro = estado.canales.slice(0, 4);
  $("#colores").innerHTML =
    cuatro.map((c, i) => `<button data-canal="${i}" style="background:${COLORES[i]}" aria-label="${escapar(c.categoria.nombre)}" title="${escapar(c.categoria.nombre)}"></button>`).join("") +
    cuatro.map((c) => `<span class="lbl">${escapar(c.categoria.nombre)}</span>`).join("");
}

function accion(nombre) {
  switch (nombre) {
    case "power": return encender(!estado.encendida);
    case "mute": return silenciar();
    case "ch+": return mostrarCanal(estado.canal + 1);
    case "ch-": return mostrarCanal(estado.canal - 1);
    case "vol+": return volumen(10);
    case "vol-": return volumen(-10);
    case "next": return siguiente();
    case "prev": return anterior();
    case "ok": return playPausa();
    case "info": return estado.actual && abrirFicha(estado.actual.titulo.id);
  }
}

// ---------- Ahora en la tele ----------

function pintarAhora() {
  const it = estado.actual;
  if (!it) { $("#ahora").innerHTML = ""; return; }
  const c = estado.canales[estado.canal];
  const serie = it.titulo.tipo === "serie";
  const eps = episodiosDe(it.titulo);
  const hayOtro = serie && eps.findIndex((e) => e.clave === it.ep.clave) < eps.length - 1;
  $("#ahora").innerHTML = `
    <div class="ahora-caja">
      <div class="ahora-txt">
        <div class="eyebrow">${estado.empezado ? "Ahora en el canal" : "En el canal"} ${c ? c.categoria.canal + " · " + escapar(c.categoria.nombre) : ""}</div>
        <h2>${escapar(it.titulo.nombre)}${serie ? ` <span style="color:var(--muted);font-weight:500">· T${it.ep.temporada}:E${it.ep.numero} ${escapar(it.ep.nombre)}</span>` : ""}</h2>
        <p>${metaDe(it.titulo)} · ${escapar(it.titulo.generos?.join(", ") || "")}</p>
      </div>
      ${estado.empezado ? "" : `<button class="btn primario" data-accion="ok">${ICONO.play} Ver ahora</button>`}
      ${hayOtro ? `<button class="btn" data-accion="next">${ICONO.sig} Siguiente episodio</button>` : ""}
      <button class="btn" data-accion="info">${ICONO.info} Ficha</button>
    </div>`;
}

// ---------- Filas ----------

function titulosAptos() {
  return estado.cat.titulos.filter((t) => apto(t, estado.perfil));
}

function tarjeta(t, { extra = "", barra = null } = {}) {
  return `<button class="tarjeta" data-titulo="${escapar(t.id)}">
    <div class="tarjeta-img">
      <img src="${portadaDe(t)}" alt="" loading="lazy">
      <span class="chip-tipo">${t.tipo === "serie" ? "Serie" : "Película"}</span>
      <span class="chip-edad">${etiquetaEdad(t.edad)}</span>
      ${barra !== null ? `<span class="barra"><i style="width:${Math.round(barra * 100)}%"></i></span>` : ""}
    </div>
    <div class="tarjeta-txt"><b>${escapar(t.nombre)}</b><small>${extra || metaDe(t)}</small></div>
  </button>`;
}

function fila(id, titulo, html, { destacados = false, canal = null } = {}) {
  if (!html) return "";
  return `<section class="fila" id="${id}">
    <div class="fila-cab">
      <h3>${titulo}${canal ? ` <span class="canal">CH ${String(canal).padStart(2, "0")}</span>` : ""}</h3>
      <div class="fila-flechas"><button data-mover="-1" aria-label="Anterior">${ICONO.izq}</button><button data-mover="1" aria-label="Siguiente">${ICONO.der}</button></div>
    </div>
    <div class="carril${destacados ? " destacados" : ""}">${html}</div>
  </section>`;
}

function continuarHtml() {
  const prog = progresoDe(estado.perfil);
  return titulosAptos()
    .map((t) => {
      const sig = siguienteDe(t, estado.perfil);
      if (!sig.empezado || sig.terminado) return null;
      const reg = prog[sig.ep.clave];
      const en = Math.max(...episodiosDe(t).map((e) => prog[e.clave]?.en || 0));
      const fraccion = reg && reg.d ? reg.s / reg.d : 0;
      const extra = t.tipo === "serie"
        ? `${reg ? "Sigue" : "Siguiente"}: T${sig.ep.temporada}:E${sig.ep.numero} · ${escapar(sig.ep.nombre)}`
        : `Quedan ${duracionLegible(Math.max(60, (reg?.d || t.duracion) - (reg?.s || 0)))}`;
      return { en, html: tarjeta(t, { extra, barra: fraccion }) };
    })
    .filter(Boolean)
    .sort((a, b) => b.en - a.en)
    .map((x) => x.html)
    .join("");
}

function pintarContinuar() {
  const html = continuarHtml();
  const existente = $("#fila-continuar");
  const nuevo = fila("fila-continuar", "Continuar viendo", html);
  if (existente) existente.outerHTML = nuevo || "<div id='fila-continuar'></div>";
  else if (nuevo) $("#filas").insertAdjacentHTML("afterbegin", nuevo);
}

function pintarFilas() {
  const aptos = titulosAptos();
  const partes = [fila("fila-continuar", "Continuar viendo", continuarHtml()) || "<div id='fila-continuar'></div>"];
  partes.push(fila("fila-destacados", "Destacados", aptos.filter((t) => t.destacado).map((t) => tarjeta(t)).join(""), { destacados: true }));
  const nuevos = [...aptos].sort((a, b) => (b.agregado || "").localeCompare(a.agregado || "")).slice(0, 8);
  partes.push(fila("fila-nuevos", "Recién agregados", nuevos.map((t) => tarjeta(t, { extra: "Nuevo · " + metaDe(t) })).join("")));
  for (const c of estado.canales) {
    const ts = aptos.filter((t) => t.categoria === c.categoria.id);
    partes.push(fila("fila-" + c.categoria.id, escapar(c.categoria.nombre), ts.map((t) => tarjeta(t)).join(""), { canal: c.categoria.canal }));
  }
  // Géneros con al menos 3 títulos, sin los que están en casi todo (no dicen nada).
  const cuenta = new Map();
  aptos.forEach((t) => (t.generos || []).forEach((g) => cuenta.set(g, (cuenta.get(g) || 0) + 1)));
  [...cuenta.entries()]
    .filter(([, n]) => n >= 3 && n < aptos.length * 0.7)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .forEach(([g]) => partes.push(fila("fila-g-" + g, escapar(g), aptos.filter((t) => t.generos?.includes(g)).map((t) => tarjeta(t)).join(""))));
  $("#filas").innerHTML = partes.join("") || `<p class="vacio">Todavía no hay nada que ver en este perfil.</p>`;
}

// ---------- Ficha ----------

function abrirFicha(id, temporadaElegida) {
  const t = estado.cat.titulos.find((x) => x.id === id);
  if (!t) return;
  const dlg = $("#ficha");
  const sig = siguienteDe(t, estado.perfil);
  const prog = progresoDe(estado.perfil);
  const serie = t.tipo === "serie";
  const temps = t.temporadas || [];
  const tSel = temporadaElegida ?? (serie ? Math.max(0, temps.findIndex((x) => x.numero === sig.ep.temporada)) : 0);
  const textoPlay = sig.terminado ? "Volver a ver"
    : sig.empezado ? (serie ? `Continuar T${sig.ep.temporada}:E${sig.ep.numero}` : "Continuar")
    : (serie ? "Ver episodio 1" : "Ver en la tele");
  const eps = serie ? episodiosDe(t).filter((e) => e.t === tSel) : [];
  const actual = estado.actual?.ep.clave;

  dlg.innerHTML = `
    <div class="ficha-fondo">
      <img id="ficha-img" src="${t.youtube || eps[0] ? portada(t.youtube || eps[0].youtube, true) : ""}" alt="">
      <button class="ficha-cerrar" data-cerrar aria-label="Cerrar">${ICONO.x}</button>
    </div>
    <div class="ficha-cuerpo">
      <h2 id="ficha-titulo">${escapar(t.nombre)}</h2>
      <p class="ficha-meta">${t.anio || ""} · <span class="edad">${etiquetaEdad(t.edad)}</span> · ${serie ? `${episodiosDe(t).length} episodios` : duracionLegible(t.duracion)}${t.idioma ? " · " + escapar(t.idioma) : ""}</p>
      <div class="ficha-acc">
        <button class="btn primario" data-play>${ICONO.play} ${textoPlay}</button>
      </div>
      <p class="sinopsis">${escapar(t.sinopsis || "")}</p>
      <div class="generos">${(t.generos || []).map((g) => `<span>${escapar(g)}</span>`).join("")}</div>
      ${serie ? `
        <div class="temporadas">
          <h3>Episodios</h3>
          ${temps.length > 1 ? temps.map((x, i) => `<button data-temporada="${i}" aria-pressed="${i === tSel}">Temporada ${x.numero}</button>`).join("") : ""}
        </div>
        <div class="episodios">
          ${eps.map((e) => {
            const r = prog[e.clave];
            const f = r && r.d ? Math.min(1, r.s / r.d) : 0;
            return `<button class="episodio${e.clave === actual ? " actual" : ""}" data-ep="${escapar(e.clave)}">
              <span class="num">${e.numero}</span>
              <span class="mini"><img src="${portada(e.youtube)}" alt="" loading="lazy">${f ? `<span class="barra"><i style="width:${Math.round(f * 100)}%"></i></span>` : ""}</span>
              <span><b>${escapar(e.nombre)}</b><small>${duracionLegible(e.duracion)}${estaVisto(r) ? ' · <span class="visto">Visto</span>' : ""}${e.clave === actual ? " · En la tele" : ""}</small></span>
            </button>`;
          }).join("")}
        </div>` : ""}
    </div>`;

  const img = $("#ficha-img", dlg);
  img.onerror = () => { img.onerror = null; img.src = portadaDe(t); };
  $("[data-cerrar]", dlg).onclick = () => dlg.close();
  $("[data-play]", dlg).onclick = () => { dlg.close(); verEnLaTele(t, sig.ep, sig.terminado ? 0 : undefined); };
  dlg.querySelectorAll("[data-temporada]").forEach((b) => (b.onclick = () => abrirFicha(id, Number(b.dataset.temporada))));
  dlg.querySelectorAll("[data-ep]").forEach((b) => (b.onclick = () => {
    const ep = episodiosDe(t).find((e) => e.clave === b.dataset.ep);
    dlg.close();
    verEnLaTele(t, ep);
  }));
  if (!dlg.open) dlg.showModal();
}

// ---------- Búsqueda ----------

const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function buscar(q) {
  const n = normal(q).trim();
  const res = $("#resultados");
  if (n.length < 2) {
    res.hidden = true;
    $("#filas").hidden = false;
    return;
  }
  const hallados = titulosAptos().filter((t) =>
    normal([t.nombre, t.sinopsis, ...(t.generos || []), ...episodiosDe(t).map((e) => e.nombre)].join(" ")).includes(n)
  );
  $("#filas").hidden = true;
  res.hidden = false;
  res.innerHTML = `<h3>${hallados.length ? `Resultados para «${escapar(q.trim())}»` : `Nada para «${escapar(q.trim())}»`}</h3>
    ${hallados.length ? `<div class="rejilla-res">${hallados.map((t) => tarjeta(t)).join("")}</div>`
      : `<p class="vacio">Prueba con otro nombre o con un género, por ejemplo «comedia» o «espacio».</p>`}`;
}

// ---------- Eventos ----------

function enlazarEventos() {
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-accion],[data-canal],[data-titulo],[data-mover]");
    if (!el) return;
    if (el.dataset.accion) {
      el.classList.add("pulsada");
      setTimeout(() => el.classList.remove("pulsada"), 120);
      accion(el.dataset.accion);
    } else if (el.dataset.canal !== undefined) {
      mostrarCanal(Number(el.dataset.canal));
    } else if (el.dataset.titulo) {
      abrirFicha(el.dataset.titulo);
    } else if (el.dataset.mover) {
      const carril = el.closest(".fila").querySelector(".carril");
      carril.scrollBy({ left: Number(el.dataset.mover) * carril.clientWidth * 0.9, behavior: "smooth" });
    }
  });

  $("#poster").addEventListener("click", () => reproducir(estado.actual || itemDe(estado.canal)));

  let espera;
  $("#q").addEventListener("input", (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => buscar(ev.target.value), 120);
  });
  $("#q").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.target.value = ""; buscar(""); }
  });

  const menu = $("#menu-perfil");
  $("#perfil").addEventListener("click", (ev) => {
    ev.stopPropagation();
    const r = ev.currentTarget.getBoundingClientRect();
    menu.style.top = r.bottom + 8 + "px";
    menu.style.right = Math.max(8, innerWidth - r.right) + "px";
    menu.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.perfil === estado.perfil)));
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-perfil]");
    if (!b) return;
    menu.hidden = true;
    if (b.dataset.perfil === estado.perfil) return;
    guardarAhora();
    estado.perfil = b.dataset.perfil;
    cambiarPerfil(estado.perfil);
    estado.posicion.clear();
    aplicarPerfil();
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest("#menu-perfil,#perfil")) menu.hidden = true; });

  document.addEventListener("keydown", (ev) => {
    if (ev.target.closest("input,textarea,select") || $("#ficha").open) return;
    if (/^[1-9]$/.test(ev.key)) {
      const i = estado.canales.findIndex((c) => String(c.categoria.canal) === ev.key);
      if (i >= 0) mostrarCanal(i);
    } else if (ev.key === "PageUp") { ev.preventDefault(); accion("ch+"); }
    else if (ev.key === "PageDown") { ev.preventDefault(); accion("ch-"); }
    else if (ev.key === "m") accion("mute");
    else if (ev.key === "i") accion("info");
    else if (ev.key === "n") accion("next");
    else if (ev.key === "+") accion("vol+");
    else if (ev.key === "-") accion("vol-");
  });

  addEventListener("pagehide", guardarAhora);
  $("#ficha").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
}

iniciar();

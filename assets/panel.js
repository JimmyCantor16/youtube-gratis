import {
  cargarCatalogo, catalogoOriginal, publicarEnNavegador, descartarPublicado,
  idDeYoutube, playlistDeYoutube, datosDeVideo, portada, portadaDe, metaDe, episodiosDe, escapar,
} from "./comun.js";

const $ = (s, el = document) => el.querySelector(s);
const CLAVE_BORRADOR = "sala_borrador";
const EDADES = [[0, "Todo público"], [7, "7+"], [12, "12+"], [16, "16+"], [18, "18+"]];
const ICO = {
  arriba: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  abajo: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  borrar: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  editar: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

const st = {
  publicado: null, // lo que ve la tele ahora mismo
  borrador: null, // lo que el dueño está editando
  filtro: "todo",
  q: "",
  ed: null, // { nuevo, idOriginal, t, previa, errores, log }
};

const copia = (x) => JSON.parse(JSON.stringify(x));
const hoy = () => new Date().toISOString().slice(0, 10);

function guardarBorrador() {
  try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(st.borrador)); } catch { /* sin almacenamiento: queda en memoria */ }
  pintarPendientes();
}

async function iniciar() {
  const { catalogo } = await cargarCatalogo();
  st.publicado = catalogo;
  let borrador = null;
  try { borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null"); } catch { /* nada */ }
  st.borrador = borrador?.titulos ? borrador : copia(catalogo);
  $("#marca").textContent = (st.borrador.marca?.nombre || "Sala TV");
  pintarTodo();
  enlazar();
}

// ---------- Cambios pendientes ----------

function cambios() {
  const antes = new Map(st.publicado.titulos.map((t) => [t.id, JSON.stringify(t)]));
  const ahora = new Map(st.borrador.titulos.map((t) => [t.id, JSON.stringify(t)]));
  let n = 0;
  ahora.forEach((v, k) => { if (antes.get(k) !== v) n++; });
  antes.forEach((_, k) => { if (!ahora.has(k)) n++; });
  if (JSON.stringify(st.publicado.categorias) !== JSON.stringify(st.borrador.categorias)) n++;
  return n;
}

function sinPublicar(t) {
  const p = st.publicado.titulos.find((x) => x.id === t.id);
  return !p || JSON.stringify(p) !== JSON.stringify(t);
}

function pintarPendientes() {
  const n = cambios();
  $("#publicar").disabled = n === 0;
  const el = $("#pendientes");
  el.hidden = n === 0;
  el.textContent = n === 1 ? "1 cambio sin publicar" : `${n} cambios sin publicar`;
}

// ---------- Lista ----------

function nombreCategoria(id) {
  return st.borrador.categorias.find((c) => c.id === id)?.nombre || "Sin categoría";
}

function pintarTodo() {
  pintarFiltros();
  pintarLista();
  pintarCategorias();
  pintarPendientes();
}

function pintarFiltros() {
  const ops = [["todo", "Todo"], ...st.borrador.categorias.map((c) => [c.id, c.nombre])];
  if (!ops.some(([id]) => id === st.filtro)) st.filtro = "todo";
  $("#filtros").innerHTML = ops
    .map(([id, n]) => `<button role="tab" data-filtro="${escapar(id)}" aria-selected="${id === st.filtro}">${escapar(n)}</button>`)
    .join("");
}

const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function pintarLista() {
  const q = normal(st.q);
  const lista = st.borrador.titulos
    .filter((t) => st.filtro === "todo" || t.categoria === st.filtro)
    .filter((t) => !q || normal(t.nombre + " " + (t.generos || []).join(" ")).includes(q))
    .sort((a, b) => (b.agregado || "").localeCompare(a.agregado || ""));
  const activo = st.ed?.idOriginal;
  $("#lista").innerHTML = lista.length
    ? lista.map((t) => `
      <button class="pn-item${t.id === activo ? " activo" : ""}" data-editar="${escapar(t.id)}">
        <img src="${portadaDe(t)}" alt="" loading="lazy">
        <span><b>${escapar(t.nombre)}</b><small>${escapar(nombreCategoria(t.categoria))} · ${metaDe(t)}</small></span>
        <span class="pn-insignias">
          ${sinPublicar(t) ? '<span class="ins nuevo">Sin publicar</span>' : ""}
          ${t.destacado ? '<span class="ins dest">Destacado</span>' : ""}
          <span class="ins">${t.tipo === "serie" ? "Serie" : "Película"}</span>
        </span>
      </button>`).join("")
    : `<p class="vacio">${st.q ? "Nada coincide con la búsqueda." : "Esta categoría está vacía. Agrega el primer título."}</p>`;
}

// ---------- Categorías ----------

function pintarCategorias() {
  const cats = st.borrador.categorias;
  $("#cats").innerHTML = cats.map((c, i) => {
    const usados = st.borrador.titulos.filter((t) => t.categoria === c.id).length;
    return `<div class="pn-cat">
      <span class="num" title="Canal">${c.canal}</span>
      <input value="${escapar(c.nombre)}" data-cat-nombre="${i}" maxlength="30" aria-label="Nombre del canal ${c.canal}">
      <span class="pn-cat-acc">
        <button class="ico" data-cat-mover="${i}:-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">${ICO.arriba}</button>
        <button class="ico" data-cat-mover="${i}:1" ${i === cats.length - 1 ? "disabled" : ""} aria-label="Bajar">${ICO.abajo}</button>
        <button class="ico" data-cat-borrar="${i}" ${usados ? `disabled title="Tiene ${usados} título(s): muévelos antes de borrarla"` : ""} aria-label="Borrar">${ICO.borrar}</button>
      </span>
    </div>`;
  }).join("");
}

function renumerar() {
  st.borrador.categorias.forEach((c, i) => (c.canal = i + 1));
}

function slug(texto, existentes) {
  const base = normal(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "titulo";
  let id = base;
  for (let n = 2; existentes.has(id); n++) id = `${base}-${n}`;
  return id;
}

// ---------- Editor ----------

function nuevoTitulo() {
  abrirEditor({
    nuevo: true,
    idOriginal: null,
    t: {
      tipo: "pelicula",
      categoria: st.filtro !== "todo" ? st.filtro : st.borrador.categorias[0]?.id,
      nombre: "", anio: new Date().getFullYear(), edad: 0, idioma: "", generos: [], sinopsis: "",
      youtube: "", duracion: 0, destacado: false,
      temporadas: [{ numero: 1, episodios: [] }],
    },
    previa: null,
  });
}

function editarTitulo(id) {
  const t = st.borrador.titulos.find((x) => x.id === id);
  if (!t) return;
  const c = copia(t);
  if (!c.temporadas) c.temporadas = [{ numero: 1, episodios: [] }];
  abrirEditor({ nuevo: false, idOriginal: id, t: c, previa: c.youtube ? { id: c.youtube, titulo: null } : null });
}

function abrirEditor(ed) {
  st.ed = { errores: {}, log: [], ...ed };
  $("#editor").hidden = false;
  $("#editor-vacio").hidden = true;
  pintarEditor();
  pintarLista();
  if (innerWidth < 900) $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarEditor() {
  st.ed = null;
  $("#editor").hidden = true;
  $("#editor-vacio").hidden = false;
  pintarLista();
}

function generosConocidos() {
  const s = new Set();
  st.borrador.titulos.forEach((t) => (t.generos || []).forEach((g) => s.add(g)));
  (st.ed?.t.generos || []).forEach((g) => s.add(g));
  return [...s].sort((a, b) => a.localeCompare(b, "es"));
}

function err(campo) {
  const e = st.ed.errores[campo];
  return e ? `<small class="error" id="err-${campo}">${escapar(e)}</small>` : "";
}

function inv(campo) {
  return st.ed.errores[campo] ? ` aria-invalid="true" aria-describedby="err-${campo}"` : "";
}

function pintarEditor() {
  const { t, previa, nuevo } = st.ed;
  const serie = t.tipo === "serie";
  const gens = generosConocidos();
  $("#editor").innerHTML = `
    <div class="pn-ed-cab">
      <h2>${nuevo ? "Nuevo título" : "Editar «" + escapar(t.nombre) + "»"}</h2>
      <div class="segmento" role="group" aria-label="Tipo">
        <button type="button" data-tipo="pelicula" aria-pressed="${!serie}">Película</button>
        <button type="button" data-tipo="serie" aria-pressed="${serie}">Serie</button>
      </div>
    </div>

    ${serie ? "" : `
    <div class="campo">
      <span>Enlace de YouTube</span>
      <div class="enlace">
        <input id="enlace" placeholder="https://www.youtube.com/watch?v=…" value="${escapar(st.ed.enlaceTexto ?? (t.youtube ? "https://youtu.be/" + t.youtube : ""))}"${inv("enlace")}>
        <button class="btn" type="button" data-comprobar>Comprobar</button>
      </div>
      ${err("enlace")}
      ${previa ? `<div class="previa">
        <img src="${portada(previa.id)}" alt="">
        <div>${previa.titulo ? `<b>${escapar(previa.titulo)}</b><small>${escapar(previa.autor || "")}</small><br>` : ""}
        <small class="ok-txt">✓ Se puede ver dentro de la tele</small></div>
      </div>` : `<small class="ayuda">Se comprueba que exista y que YouTube deje verlo fuera de su web.</small>`}
    </div>`}

    <div class="campo">
      <span>Nombre</span>
      <input data-campo="nombre" value="${escapar(t.nombre)}" maxlength="80"${inv("nombre")}>
      ${err("nombre")}
    </div>

    <div class="dos">
      <label class="campo"><span>Categoría (canal)</span>
        <select data-campo="categoria"${inv("categoria")}>
          ${st.borrador.categorias.map((c) => `<option value="${escapar(c.id)}" ${c.id === t.categoria ? "selected" : ""}>${c.canal} · ${escapar(c.nombre)}</option>`).join("")}
        </select>${err("categoria")}
      </label>
      <label class="campo"><span>Edad</span>
        <select data-campo="edad" data-num>
          ${EDADES.map(([v, n]) => `<option value="${v}" ${Number(t.edad) === v ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </label>
      <label class="campo"><span>Año</span>
        <input data-campo="anio" data-num type="number" min="1900" max="2100" value="${t.anio || ""}"${inv("anio")}>${err("anio")}
      </label>
      ${serie ? "" : `<label class="campo"><span>Duración (min)</span>
        <input data-campo="duracion" data-min type="number" min="0" max="600" value="${t.duracion ? Math.round(t.duracion / 60) : ""}">
      </label>`}
    </div>

    <label class="campo"><span>Idioma</span>
      <input data-campo="idioma" value="${escapar(t.idioma || "")}" placeholder="Español, Inglés, Sin diálogos…" maxlength="30">
    </label>

    <div class="campo">
      <span class="etq">Géneros</span>
      <div class="chips">
        ${gens.map((g) => `<button type="button" data-genero="${escapar(g)}" aria-pressed="${t.generos.includes(g)}">${escapar(g)}</button>`).join("")}
        <input id="genero-nuevo" placeholder="+ Nuevo género" maxlength="24" aria-label="Agregar un género nuevo">
      </div>
    </div>

    <label class="campo"><span>Sinopsis</span>
      <textarea data-campo="sinopsis" maxlength="400" placeholder="De qué trata, en una o dos frases.">${escapar(t.sinopsis || "")}</textarea>
    </label>

    <label class="check"><input type="checkbox" data-campo="destacado" ${t.destacado ? "checked" : ""}> Mostrar en «Destacados»</label>

    ${serie ? pintarTemporadas() : ""}

    <div class="pn-ed-pie">
      ${nuevo ? "<span></span>" : `<button class="btn peligro" type="button" data-borrar-titulo>Borrar título</button>`}
      <div>
        <button class="btn" type="button" data-cancelar>Cancelar</button>
        <button class="btn primario" type="button" data-guardar>${nuevo ? "Agregar al catálogo" : "Guardar cambios"}</button>
      </div>
    </div>`;
}

function pintarTemporadas() {
  const { t, log } = st.ed;
  return `
    <div class="campo" style="margin-top:18px">
      <span class="etq">Temporadas y episodios</span>
      ${err("episodios")}
      ${t.temporadas.map((temp, ti) => `
        <div class="temp">
          <div class="temp-cab"><b>Temporada ${temp.numero}</b>
            ${t.temporadas.length > 1 && !temp.episodios.length ? `<button class="ico" data-quitar-temp="${ti}" aria-label="Quitar temporada">${ICO.borrar}</button>` : ""}
          </div>
          ${temp.episodios.map((ep, ei) => `
            <div class="ep-fila">
              <span class="n">${ei + 1}</span>
              <img src="${portada(ep.youtube)}" alt="">
              <input value="${escapar(ep.nombre)}" data-ep-nombre="${ti}:${ei}" aria-label="Nombre del episodio ${ei + 1}">
              <span class="ep-acc">
                <button class="ico" data-ep-mover="${ti}:${ei}:-1" ${ei === 0 ? "disabled" : ""} aria-label="Subir">${ICO.arriba}</button>
                <button class="ico" data-ep-mover="${ti}:${ei}:1" ${ei === temp.episodios.length - 1 ? "disabled" : ""} aria-label="Bajar">${ICO.abajo}</button>
                <button class="ico" data-ep-borrar="${ti}:${ei}" aria-label="Quitar episodio">${ICO.borrar}</button>
              </span>
            </div>`).join("")}
          <div class="agregar-eps">
            <textarea data-pegar="${ti}" placeholder="Pega aquí uno o varios enlaces de YouTube, uno por línea"></textarea>
            <div><button class="btn chico" type="button" data-agregar-eps="${ti}">Agregar episodios</button></div>
          </div>
        </div>`).join("")}
      <div><button class="btn chico" type="button" data-nueva-temp>+ Agregar temporada</button></div>
      ${log.length ? `<ul class="log">${log.map((l) => `<li class="${l.mal ? "mal" : ""}">${escapar(l.txt)}</li>`).join("")}</ul>` : ""}
    </div>`;
}

let esperaEnlace;
async function comprobarEnlace() {
  clearTimeout(esperaEnlace);
  const ed = st.ed;
  // Lo escrito se conserva al repintar: si la comprobación falla, el dueño
  // debe ver QUÉ pegó junto al error, no un campo vacío.
  const texto = $("#enlace").value;
  ed.enlaceTexto = texto;
  ed.errores.enlace = "";
  const id = idDeYoutube(texto);
  if (!id) {
    ed.errores.enlace = playlistDeYoutube(texto)
      ? "Es una playlist. Para importarla entera hace falta la clave de YouTube (versión con servidor). Por ahora cambia a «Serie» y pega los enlaces de los episodios."
      : "Eso no parece un enlace de YouTube.";
    ed.previa = null;
    return pintarEditor();
  }
  const boton = $("[data-comprobar]");
  boton.disabled = true;
  boton.textContent = "Comprobando…";
  try {
    const d = await datosDeVideo(id);
    ed.previa = { id, titulo: d.titulo, autor: d.autor };
    ed.t.youtube = id;
    if (!ed.t.nombre.trim()) ed.t.nombre = d.titulo.slice(0, 80);
    const enUso = st.borrador.titulos.find((x) => x.id !== ed.idOriginal && (x.youtube === id || episodiosDe(x).some((e) => e.youtube === id)));
    if (enUso) ed.errores.enlace = `Aviso: ese video ya está en «${enUso.nombre}».`;
  } catch (e) {
    ed.previa = null;
    ed.t.youtube = "";
    ed.errores.enlace = e.message;
  }
  pintarEditor();
}

async function agregarEpisodios(ti) {
  const ed = st.ed;
  // Una línea puede traer varios enlaces (separados por espacio o coma) o
  // ninguno; una línea sin enlaces es UN error, no uno por palabra.
  const ids = [];
  ed.log = [];
  for (const linea of $(`[data-pegar="${ti}"]`).value.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const hallados = linea.split(/[\s,]+/).map(idDeYoutube).filter(Boolean);
    if (!hallados.length) ed.log.push({ mal: true, txt: `«${linea.slice(0, 50)}»: no es un enlace de un video de YouTube.` });
    ids.push(...hallados);
  }
  if (!ids.length) return pintarEditor();
  const temp = ed.t.temporadas[ti];
  const boton = $(`[data-agregar-eps="${ti}"]`);
  boton.disabled = true;
  for (const [i, id] of ids.entries()) {
    boton.textContent = `Comprobando ${i + 1} de ${ids.length}…`;
    if (ed.t.temporadas.some((x) => x.episodios.some((e) => e.youtube === id))) {
      ed.log.push({ mal: true, txt: `${id}: ya está en esta serie, no se repite.` });
      continue;
    }
    try {
      const d = await datosDeVideo(id);
      temp.episodios.push({ nombre: d.titulo.slice(0, 90), youtube: id, duracion: 0 });
      ed.log.push({ txt: `✓ ${d.titulo}` });
    } catch (e) {
      ed.log.push({ mal: true, txt: `${id}: ${e.message}` });
    }
  }
  delete ed.errores.episodios;
  pintarEditor();
}

function validar() {
  const { t } = st.ed;
  const e = {};
  if (!t.nombre.trim()) e.nombre = "Ponle un nombre al título.";
  if (!st.borrador.categorias.some((c) => c.id === t.categoria)) e.categoria = "Elige una categoría.";
  if (t.anio && (t.anio < 1900 || t.anio > 2100)) e.anio = "Año entre 1900 y 2100.";
  if (t.tipo === "pelicula" && !t.youtube) e.enlace = "Pega el enlace del video y pulsa «Comprobar».";
  if (t.tipo === "serie" && !t.temporadas.some((x) => x.episodios.length)) e.episodios = "Agrega al menos un episodio.";
  st.ed.errores = e;
  return !Object.keys(e).length;
}

function guardar() {
  if (!validar()) {
    pintarEditor();
    $("#editor [aria-invalid='true'], #editor .error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const ed = st.ed;
  const t = copia(ed.t);
  t.nombre = t.nombre.trim();
  t.generos = t.generos || [];
  if (t.tipo === "serie") {
    delete t.youtube;
    delete t.duracion;
    t.temporadas = t.temporadas.filter((x) => x.episodios.length).map((x, i) => ({ ...x, numero: i + 1 }));
  } else {
    delete t.temporadas;
  }
  if (!t.idioma) delete t.idioma;
  if (!t.destacado) delete t.destacado;
  if (ed.nuevo) {
    t.id = slug(t.nombre, new Set(st.borrador.titulos.map((x) => x.id)));
    t.agregado = hoy();
    st.borrador.titulos.push(t);
  } else {
    const i = st.borrador.titulos.findIndex((x) => x.id === ed.idOriginal);
    st.borrador.titulos[i] = t;
  }
  guardarBorrador();
  aviso(ed.nuevo ? `«${t.nombre}» agregado. Falta publicar para que se vea en la tele.` : "Cambios guardados. Falta publicar.");
  cerrarEditor();
}

function borrarTitulo() {
  const t = st.ed.t;
  if (!confirm(`¿Borrar «${t.nombre}» del catálogo? Desaparecerá de la tele al publicar.`)) return;
  st.borrador.titulos = st.borrador.titulos.filter((x) => x.id !== st.ed.idOriginal);
  guardarBorrador();
  aviso(`«${t.nombre}» borrado. Falta publicar.`);
  cerrarEditor();
}

function publicar() {
  const nuevo = copia(st.borrador);
  nuevo.version = (st.publicado.version || 0) + 1;
  nuevo.actualizado = hoy();
  if (!publicarEnNavegador(nuevo)) return aviso("Este navegador no deja guardar datos: no se pudo publicar.");
  st.publicado = nuevo;
  st.borrador = copia(nuevo);
  try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* nada */ }
  pintarTodo();
  aviso('Publicado: la tele ya muestra los cambios. <a href="./" target="_blank" rel="noopener">Abrir la tele</a>', true);
}

let temporizador;
function aviso(html, esHtml = false) {
  const el = $("#toast");
  if (esHtml) el.innerHTML = html;
  else el.textContent = html;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (el.hidden = true), 5200);
}

// ---------- Eventos ----------

function enlazar() {
  $("#nuevo").onclick = nuevoTitulo;
  document.querySelector("[data-nuevo]").onclick = nuevoTitulo;
  $("#publicar").onclick = publicar;
  $("#pn-q").addEventListener("input", (e) => { st.q = e.target.value; pintarLista(); });

  $("#filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b) return;
    st.filtro = b.dataset.filtro;
    pintarFiltros();
    pintarLista();
  });
  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-editar]");
    if (b) editarTitulo(b.dataset.editar);
  });

  // Categorías
  $("#cats").addEventListener("change", (e) => {
    const i = e.target.dataset.catNombre;
    if (i === undefined) return;
    const v = e.target.value.trim();
    if (!v) { e.target.value = st.borrador.categorias[i].nombre; return; }
    st.borrador.categorias[i].nombre = v;
    guardarBorrador();
    pintarFiltros();
    pintarLista();
  });
  $("#cats").addEventListener("click", (e) => {
    const m = e.target.closest("[data-cat-mover]");
    const b = e.target.closest("[data-cat-borrar]");
    const cats = st.borrador.categorias;
    if (m) {
      const [i, d] = m.dataset.catMover.split(":").map(Number);
      [cats[i], cats[i + d]] = [cats[i + d], cats[i]];
    } else if (b) {
      cats.splice(Number(b.dataset.catBorrar), 1);
    } else return;
    renumerar();
    guardarBorrador();
    pintarTodo();
    if (st.ed) pintarEditor();
  });
  $("#nueva-cat").addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = e.target.nombre.value.trim();
    if (!nombre) return;
    st.borrador.categorias.push({ id: slug(nombre, new Set(st.borrador.categorias.map((c) => c.id))), nombre, canal: 0 });
    renumerar();
    e.target.reset();
    guardarBorrador();
    pintarTodo();
    if (st.ed) pintarEditor();
    aviso(`Canal «${nombre}» creado. Agrégale títulos y publica.`);
  });

  $("#descargar").onclick = () => {
    const blob = new Blob([JSON.stringify(st.borrador, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "catalogo.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#restaurar").onclick = async () => {
    if (!confirm("¿Volver al catálogo original? Se pierden los cambios publicados en este navegador y los borradores.")) return;
    descartarPublicado();
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* nada */ }
    st.publicado = await catalogoOriginal();
    st.borrador = copia(st.publicado);
    cerrarEditor();
    pintarTodo();
    aviso("Catálogo original restaurado.");
  };

  // Editor (delegado: se repinta entero en los cambios de estructura)
  const ed = $("#editor");
  ed.addEventListener("input", (e) => {
    const el = e.target;
    if (!st.ed) return;
    if (el.dataset.campo) {
      const c = el.dataset.campo;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.dataset.num !== undefined) v = v === "" ? 0 : Number(v);
      if (el.dataset.min !== undefined) v = Math.round(Number(v || 0) * 60);
      st.ed.t[c] = v;
      if (st.ed.errores[c]) { delete st.ed.errores[c]; el.removeAttribute("aria-invalid"); $("#err-" + c)?.remove(); }
    } else if (el.dataset.epNombre) {
      const [ti, ei] = el.dataset.epNombre.split(":").map(Number);
      st.ed.t.temporadas[ti].episodios[ei].nombre = el.value;
    } else if (el.id === "enlace") {
      st.ed.enlaceTexto = el.value;
      clearTimeout(esperaEnlace);
      // Pegar un enlace válido lo comprueba solo; escribir a mano no molesta.
      if (idDeYoutube(el.value) && idDeYoutube(el.value) !== st.ed.t.youtube) esperaEnlace = setTimeout(comprobarEnlace, 400);
    }
  });
  ed.addEventListener("change", (e) => { if (e.target.dataset.campo) e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  ed.addEventListener("keydown", (e) => {
    if (e.target.id === "genero-nuevo" && e.key === "Enter") {
      e.preventDefault();
      const g = e.target.value.trim();
      if (g && !st.ed.t.generos.includes(g)) st.ed.t.generos.push(g);
      pintarEditor();
      $("#genero-nuevo")?.focus();
    }
    if (e.target.id === "enlace" && e.key === "Enter") { e.preventDefault(); comprobarEnlace(); }
  });
  ed.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !st.ed) return;
    const t = st.ed.t;
    const d = b.dataset;
    if (d.tipo) { t.tipo = d.tipo; st.ed.errores = {}; pintarEditor(); }
    else if (d.comprobar !== undefined) comprobarEnlace();
    else if (d.genero) {
      t.generos = t.generos.includes(d.genero) ? t.generos.filter((g) => g !== d.genero) : [...t.generos, d.genero];
      b.setAttribute("aria-pressed", String(t.generos.includes(d.genero)));
    }
    else if (d.agregarEps !== undefined) agregarEpisodios(Number(d.agregarEps));
    else if (d.epMover) {
      const [ti, ei, dir] = d.epMover.split(":").map(Number);
      const eps = t.temporadas[ti].episodios;
      [eps[ei], eps[ei + dir]] = [eps[ei + dir], eps[ei]];
      pintarEditor();
    } else if (d.epBorrar) {
      const [ti, ei] = d.epBorrar.split(":").map(Number);
      t.temporadas[ti].episodios.splice(ei, 1);
      pintarEditor();
    } else if (d.nuevaTemp !== undefined) {
      t.temporadas.push({ numero: t.temporadas.length + 1, episodios: [] });
      pintarEditor();
    } else if (d.quitarTemp) {
      t.temporadas.splice(Number(d.quitarTemp), 1);
      t.temporadas.forEach((x, i) => (x.numero = i + 1));
      pintarEditor();
    } else if (d.guardar !== undefined) guardar();
    else if (d.cancelar !== undefined) cerrarEditor();
    else if (d.borrarTitulo !== undefined) borrarTitulo();
  });
}

iniciar().catch((e) => {
  $("#lista").innerHTML = `<p class="vacio">No se pudo cargar el catálogo: ${escapar(e.message)}</p>`;
});

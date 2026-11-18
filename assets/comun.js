// Lo que comparten la tele (index.html) y el panel del dueño (panel.html).
//
// El catálogo PUBLICADO es catalogo.json: en la versión real, «Publicar
// cambios» hace un commit de ese archivo en GitHub y Render redespliega.
// En este mockup no hay servidor, así que el panel publica en este navegador
// (localStorage) y la tele lee eso por encima del archivo. Así se puede
// enseñar el flujo completo —pegar un enlace y verlo en la tele— sin backend.

const CLAVE_PUBLICADO = "sala_catalogo_publicado";
const CLAVE_PROGRESO = "sala_progreso";
const CLAVE_PERFIL = "sala_perfil";

function leer(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export async function cargarCatalogo() {
  const local = leer(CLAVE_PUBLICADO, null);
  if (local && Array.isArray(local.titulos) && Array.isArray(local.categorias)) {
    return { catalogo: local, origen: "navegador" };
  }
  const r = await fetch("catalogo.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("No se pudo leer catalogo.json (" + r.status + ")");
  return { catalogo: await r.json(), origen: "archivo" };
}

export async function catalogoOriginal() {
  const r = await fetch("catalogo.json", { cache: "no-cache" });
  return r.json();
}

export function publicarEnNavegador(catalogo) {
  return escribir(CLAVE_PUBLICADO, catalogo);
}

export function descartarPublicado() {
  escribir(CLAVE_PUBLICADO, null);
}

// ---------- YouTube ----------

export function idDeYoutube(texto) {
  const t = String(texto || "").trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* no es una URL */
  }
  return null;
}

export function playlistDeYoutube(texto) {
  try {
    return new URL(String(texto).trim()).searchParams.get("list");
  } catch {
    return null;
  }
}

/** Título y autor de un video sin clave de API (oEmbed acepta CORS). */
export async function datosDeVideo(id) {
  const url =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  const r = await fetch(url);
  if (r.status === 401 || r.status === 403) {
    throw new Error("El dueño de ese video no permite verlo fuera de YouTube.");
  }
  if (!r.ok) throw new Error("Ese video no existe o es privado.");
  const d = await r.json();
  return { titulo: d.title, autor: d.author_name };
}

export function portada(id, grande = false) {
  return `https://i.ytimg.com/vi/${id}/${grande ? "maxresdefault" : "hqdefault"}.jpg`;
}

// ---------- Catálogo ----------

export function episodiosDe(titulo) {
  if (titulo.tipo !== "serie") {
    return [{ clave: titulo.id, nombre: titulo.nombre, youtube: titulo.youtube, duracion: titulo.duracion, t: 0, e: 0 }];
  }
  const lista = [];
  (titulo.temporadas || []).forEach((temp, ti) =>
    (temp.episodios || []).forEach((ep, ei) =>
      lista.push({
        clave: `${titulo.id}:${temp.numero}:${ei + 1}`,
        nombre: ep.nombre,
        youtube: ep.youtube,
        duracion: ep.duracion,
        temporada: temp.numero,
        numero: ei + 1,
        t: ti,
        e: ei,
      })
    )
  );
  return lista;
}

export function portadaDe(titulo) {
  if (titulo.portada) return titulo.portada;
  const id = titulo.youtube || episodiosDe(titulo)[0]?.youtube;
  return id ? portada(id) : "";
}

export function apto(titulo, perfil) {
  return perfil !== "infantil" || (titulo.edad || 0) <= 7;
}

export function etiquetaEdad(edad) {
  return edad ? edad + "+" : "TP";
}

export function duracionLegible(segundos) {
  if (!segundos) return "";
  const m = Math.round(segundos / 60);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + (m % 60) + " min";
}

export function metaDe(titulo) {
  const partes = [titulo.anio, etiquetaEdad(titulo.edad)];
  if (titulo.tipo === "serie") {
    const n = episodiosDe(titulo).length;
    const t = (titulo.temporadas || []).length;
    partes.push(t > 1 ? `${t} temporadas` : `${n} episodio${n === 1 ? "" : "s"}`);
  } else {
    partes.push(duracionLegible(titulo.duracion));
  }
  return partes.filter(Boolean).join(" · ");
}

// ---------- Perfil y progreso (por perfil) ----------

export function perfilActual() {
  return leer(CLAVE_PERFIL, "adulto") === "infantil" ? "infantil" : "adulto";
}

export function cambiarPerfil(perfil) {
  escribir(CLAVE_PERFIL, perfil);
}

function todoElProgreso() {
  return leer(CLAVE_PROGRESO, {});
}

export function progresoDe(perfil) {
  return todoElProgreso()[perfil] || {};
}

export function guardarProgreso(perfil, clave, segundo, duracion) {
  const todo = todoElProgreso();
  const mio = todo[perfil] || (todo[perfil] = {});
  mio[clave] = { s: Math.floor(segundo), d: Math.floor(duracion || 0), en: Date.now() };
  escribir(CLAVE_PROGRESO, todo);
}

/** Visto si pasó del 92 %: los créditos no cuentan como «a medias». */
export function estaVisto(registro) {
  return !!registro && registro.d > 0 && registro.s / registro.d >= 0.92;
}

/** Siguiente episodio por ver de un título (o el primero). */
export function siguienteDe(titulo, perfil) {
  const eps = episodiosDe(titulo);
  const prog = progresoDe(perfil);
  let ultimo = -1;
  let ultimoEn = 0;
  eps.forEach((ep, i) => {
    const r = prog[ep.clave];
    if (r && r.en > ultimoEn) {
      ultimoEn = r.en;
      ultimo = i;
    }
  });
  if (ultimo < 0) return { ep: eps[0], desde: 0, empezado: false };
  const r = prog[eps[ultimo].clave];
  if (estaVisto(r)) {
    const sig = eps[ultimo + 1];
    return sig ? { ep: sig, desde: 0, empezado: true } : { ep: eps[0], desde: 0, empezado: false, terminado: true };
  }
  return { ep: eps[ultimo], desde: r.s > 5 ? r.s : 0, empezado: true };
}

export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

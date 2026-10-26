'use strict';
// Convierte las filas de un Excel (País, Ciudad, Tipo, Fechas, Lugar / Parroquia, Contacto, Teléfono / Email)
// en registros con el formato de la tabla `retiros`.

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@. ]+/g, ' ').replace(/\s+/g, ' ').trim();

const PAISES = {
  'ee uu': 'EE.UU.', 'eeuu': 'EE.UU.', 'e e u u': 'EE.UU.', 'usa': 'EE.UU.', 'us': 'EE.UU.', 'u s a': 'EE.UU.', 'u s': 'EE.UU.',
  'estados unidos': 'EE.UU.', 'united states': 'EE.UU.', 'united states of america': 'EE.UU.', 'estados unidos de america': 'EE.UU.',
  'espana': 'España', 'spain': 'España', 'panama': 'Panamá', 'peru': 'Perú', 'italia': 'Italia', 'italy': 'Italia',
  'suecia': 'Suecia', 'sweden': 'Suecia', 'francia': 'Francia', 'france': 'Francia', 'alemania': 'Alemania', 'germany': 'Alemania',
  'paises bajos': 'Países Bajos', 'holanda': 'Países Bajos', 'netherlands': 'Países Bajos', 'brasil': 'Brasil', 'brazil': 'Brasil',
  'mexico': 'México', 'colombia': 'Colombia', 'venezuela': 'Venezuela', 'argentina': 'Argentina', 'chile': 'Chile',
  'ecuador': 'Ecuador', 'bolivia': 'Bolivia', 'paraguay': 'Paraguay', 'uruguay': 'Uruguay', 'costa rica': 'Costa Rica',
  'guatemala': 'Guatemala', 'honduras': 'Honduras', 'el salvador': 'El Salvador', 'nicaragua': 'Nicaragua',
  'republica dominicana': 'República Dominicana', 'rep dominicana': 'República Dominicana', 'dominican republic': 'República Dominicana',
  'puerto rico': 'Puerto Rico', 'cuba': 'Cuba', 'portugal': 'Portugal', 'canada': 'Canadá', 'reino unido': 'Reino Unido',
  'uk': 'Reino Unido', 'united kingdom': 'Reino Unido', 'irlanda': 'Irlanda', 'ireland': 'Irlanda', 'polonia': 'Polonia',
  'poland': 'Polonia', 'belgica': 'Bélgica', 'belgium': 'Bélgica', 'suiza': 'Suiza', 'switzerland': 'Suiza', 'austria': 'Austria',
};

function pais(v, existentes) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const k = norm(s).replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  for (const e of existentes) if (norm(e).replace(/\./g, ' ').replace(/\s+/g, ' ').trim() === k) return e;
  if (PAISES[k]) return PAISES[k];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function genero(v) {
  const k = norm(v);
  if (!k) return '';
  const h = /\b(hombres?|varon(es)?|caballeros?|men|male|masculino|masc)\b/.test(k);
  const m = /\b(mujeres?|damas?|women|woman|female|femenino|fem|senoras?)\b/.test(k);
  if ((h && m) || /\b(ambos|mixto|mixta|mixed|both|parejas?|matrimonios?|couples?)\b/.test(k)) return 'Ambos';
  if (m) return 'Mujeres';
  if (h) return 'Hombres';
  return '';
}

function idioma(v) {
  const k = norm(v);
  if (!k) return { v: '' };
  if (/\b(espanol|castellano|spanish|es|esp)\b/.test(k) && !/\b(ingles|english|en)\b/.test(k)) return { v: 'Español' };
  if (/\b(ingles|english|en|eng)\b/.test(k) && !/\b(espanol|spanish|es)\b/.test(k)) return { v: 'Inglés' };
  if (/\b(por confirmar|tbd|tba)\b/.test(k)) return { v: 'Por confirmar' };
  return { v: 'Por confirmar', aviso: `Idioma no reconocido ("${String(v).trim()}"): quedó como Por confirmar.` };
}

const MESES = {
  enero: 1, ene: 1, january: 1, jan: 1, febrero: 2, feb: 2, february: 2, marzo: 3, mar: 3, march: 3, abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, june: 6, julio: 7, jul: 7, july: 7, agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, september: 9, octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11, diciembre: 12, dic: 12, december: 12, dec: 12,
};

const pad = n => String(n).padStart(2, '0');
function valida(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Devuelve { fecha, aviso, texto } ; fecha = '' si no se pudo leer.
function fecha(v, hoy) {
  if (v === null || v === undefined || v === '') return { fecha: '' };
  if (v instanceof Date && !isNaN(v)) return { fecha: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}` };
  if (typeof v === 'number' && v > 20000 && v < 80000) { // serial de Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
  }
  const texto = String(v).trim();
  if (!texto) return { fecha: '' };
  const k = norm(texto);
  let m;
  if ((m = texto.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)) && valida(+m[1], +m[2], +m[3])) return { fecha: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, texto };
  if ((m = texto.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/))) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let mo = a, d = b;                                          // el archivo usa MM/DD/YYYY
    if (a > 12 && b <= 12) { d = a; mo = b; }                   // 25/12/2027: solo puede ser día/mes
    if (valida(y, mo, d)) return { fecha: `${y}-${pad(mo)}-${pad(d)}`, texto };
  }
  // Texto con nombre de mes: "5 al 7 de marzo de 2027", "March 5-7, 2027", "12-14 mayo"
  const palabras = k.split(' ');
  const mes = palabras.map(p => MESES[p]).find(Boolean);
  if (mes) {
    const dia = (k.match(/\b(\d{1,2})\b/) || [])[1];
    const anio = (k.match(/\b(20\d{2})\b/) || [])[1];
    if (dia && +dia >= 1 && +dia <= 31) {
      let y = anio ? +anio : null, aviso;
      if (!y) {
        const h = hoy || new Date();
        y = h.getUTCFullYear();
        if (new Date(Date.UTC(y, mes - 1, +dia)) < new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()))) y++;
        aviso = `Sin año en "${texto}": se asumió ${y}.`;
      }
      if (valida(y, mes, +dia)) return { fecha: `${y}-${pad(mes)}-${pad(+dia)}`, aviso, texto };
    }
  }
  return { fecha: '', aviso: `Fecha no reconocida ("${texto}"): se importa sin fecha.`, texto };
}

const CAMPOS = {
  pais: ['pais', 'country'],
  ciudad: ['ciudad', 'city'],
  tipo: ['tipo', 'tipo de retiro', 'genero', 'type'],
  idioma: ['idioma', 'language', 'lengua'],
  notas: ['notas', 'nota', 'observaciones', 'notes', 'comentarios'],
  fechas: ['fecha de inicio', 'fechas', 'fecha', 'date', 'dates', 'start date', 'inicio'],
  lugar: ['lugar parroquia', 'lugar', 'parroquia', 'lugar o parroquia', 'parish', 'place'],
  contacto: ['contacto', 'contact', 'contactos'],
  tel: ['telefono email', 'telefono', 'email', 'correo', 'telefono o email', 'telefono correo', 'phone', 'phone email'],
};
const ORDEN = ['pais', 'ciudad', 'lugar', 'fechas', 'tipo', 'idioma', 'contacto', 'tel', 'notas'];

function detectarColumnas(filas) {
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const celdas = filas[i].map(norm);
    const map = {};
    for (const [campo, alias] of Object.entries(CAMPOS)) {
      const j = celdas.findIndex(c => alias.includes(c));
      if (j >= 0) map[campo] = j;
    }
    if (map.pais !== undefined && map.lugar !== undefined) return { map, inicio: i + 1 };
  }
  return null;
}

function partirContactos(contacto, tel) {
  const out = { contacto1: '', contacto2: '', tel1: '', tel2: '', social: '', extra: '' };
  const nombres = String(contacto ?? '').split(/[;\/\n|]+/).map(s => s.trim()).filter(Boolean);
  out.contacto1 = nombres[0] || '';
  out.contacto2 = nombres[1] || '';
  if (nombres.length > 2) out.extra = 'Más contactos: ' + nombres.slice(2).join(', ');
  const items = String(tel ?? '').split(/[;\/\n|]+|,\s+|\s+y\s+|\s+o\s+/i).map(s => s.trim()).filter(Boolean);
  const correos = items.filter(s => s.includes('@'));
  const tels = items.filter(s => !s.includes('@'));
  out.social = correos.join(', ');
  out.tel1 = tels[0] || '';
  out.tel2 = tels[1] || '';
  if (tels.length > 2) out.extra = [out.extra, 'Más teléfonos: ' + tels.slice(2).join(', ')].filter(Boolean).join(' ');
  return out;
}

const celda = v => (v === null || v === undefined) ? '' : (v instanceof Date ? v : String(v).trim());

// hojas: [{ sheet, data: [[...]] }]; ya: Set de claves ya existentes en la base; existentes: países ya usados.
function analizar(hojas, { ya = new Set(), existentes = [], hoy } = {}) {
  const rows = [];
  const vistas = new Set();
  let leidas = 0;
  for (const h of hojas) {
    const filas = (h.data || []).filter(f => f.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    if (!filas.length) continue;
    const det = detectarColumnas(filas) || { map: Object.fromEntries(ORDEN.map((c, i) => [c, i])), inicio: 0 };
    const cell = (f, c) => det.map[c] === undefined ? '' : celda(f[det.map[c]]);
    // número de fila real en Excel (aprox.: posición dentro de las filas no vacías)
    filas.slice(det.inicio).forEach((f, i) => {
      leidas++;
      const avisos = [], errores = [];
      const fe = fecha(cell(f, 'fechas'), hoy);
      if (fe.aviso) avisos.push(fe.aviso);
      const tipoRaw = cell(f, 'tipo');
      const g = genero(tipoRaw);
      if (!g) errores.push(tipoRaw ? `Tipo no reconocido ("${tipoRaw}").` : 'Falta el tipo (Hombres, Mujeres o Ambos).');
      const id = idioma(cell(f, 'idioma'));
      if (id.aviso) avisos.push(id.aviso);
      const p = pais(cell(f, 'pais'), existentes);
      if (!p) errores.push('Falta el país.');
      const parroquia = String(cell(f, 'lugar')).slice(0, 300);
      if (!parroquia) errores.push('Falta el lugar / parroquia.');
      if (!fe.fecha && !fe.aviso) avisos.push('Sin fecha.');
      const c = partirContactos(cell(f, 'contacto'), cell(f, 'tel'));
      const notas = [
        String(cell(f, 'notas')).slice(0, 1500),
        fe.texto && /[a-z]/i.test(fe.texto) ? `Fechas según el archivo: ${fe.texto}.` : (fe.aviso && fe.texto ? `Fecha original: ${fe.texto}.` : ''),
        c.extra,
      ].filter(Boolean).join(' ');
      const r = {
        hoja: h.sheet, linea: det.inicio + i + 1,
        pais: p, ciudad: String(cell(f, 'ciudad')).slice(0, 300), parroquia, fecha: fe.fecha, genero: g, idioma: id.v,
        contacto1: c.contacto1, tel1: c.tel1, contacto2: c.contacto2, tel2: c.tel2, social: c.social, notas,
        avisos, errores, duplicada: '',
      };
      const clave = [norm(r.pais), norm(r.parroquia), r.fecha].join('|');
      if (!errores.length) {
        if (ya.has(clave)) r.duplicada = 'Ya existe en la base de datos.';
        else if (vistas.has(clave)) r.duplicada = 'Repetida en el archivo.';
        vistas.add(clave);
      }
      rows.push(r);
    });
  }
  return { rows, leidas };
}

const claveDe = r => [norm(r.pais), norm(r.parroquia), r.fecha || ''].join('|');

module.exports = { analizar, claveDe, norm, fecha, genero, pais, partirContactos };

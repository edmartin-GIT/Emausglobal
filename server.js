'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const Database  = require('better-sqlite3');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
if (!ADMIN_PASS) console.warn('⚠ ADMIN_PASS no está definido: el panel de administrador queda deshabilitado.');
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('emaus:' + ADMIN_PASS).digest('hex');
const SESSION_MS = 12 * 60 * 60 * 1000;

// ── Base de datos ──
const DB_PATH = process.env.DB_PATH || '/data/emaus.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS retiros (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pais       TEXT NOT NULL,
    ciudad     TEXT NOT NULL DEFAULT '',
    parroquia  TEXT NOT NULL,
    fecha      TEXT NOT NULL DEFAULT '',
    genero     TEXT NOT NULL CHECK (genero IN ('Hombres','Mujeres','Ambos')),
    idioma     TEXT NOT NULL DEFAULT 'Por confirmar',
    contacto1  TEXT NOT NULL DEFAULT '',
    tel1       TEXT NOT NULL DEFAULT '',
    contacto2  TEXT NOT NULL DEFAULT '',
    tel2       TEXT NOT NULL DEFAULT '',
    social     TEXT NOT NULL DEFAULT '',
    notas      TEXT NOT NULL DEFAULT '',
    fuente     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_retiros_fecha ON retiros (fecha);
`);

const COLS = ['pais','ciudad','parroquia','fecha','genero','idioma','contacto1','tel1','contacto2','tel2','social','notas','fuente'];
const GENEROS = ['Hombres', 'Mujeres', 'Ambos'];
const IDIOMAS = ['Español', 'Inglés', 'Por confirmar'];

function clean(body) {
  const d = {};
  for (const c of COLS) d[c] = String(body?.[c] ?? '').trim().slice(0, c === 'notas' ? 2000 : 300);
  if (!d.pais || !d.parroquia) return { error: 'País y parroquia son obligatorios.' };
  if (!GENEROS.includes(d.genero)) return { error: 'Tipo de retiro no válido.' };
  if (!IDIOMAS.includes(d.idioma)) d.idioma = 'Por confirmar';
  if (d.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return { error: 'La fecha no es válida.' };
  if (d.fuente && !/^https?:\/\//i.test(d.fuente)) return { error: 'El enlace de la fuente debe empezar con http:// o https://' };
  return { data: d };
}

const insertSQL = `INSERT INTO retiros (${COLS.join(',')}) VALUES (${COLS.map(c => '@' + c).join(',')})`;

// Carga inicial: solo si la tabla está vacía.
if (db.prepare('SELECT COUNT(*) AS n FROM retiros').get().n === 0) {
  const seedFile = path.join(__dirname, 'seed', 'retiros.json');
  if (fs.existsSync(seedFile)) {
    const rows = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const ins = db.prepare(insertSQL);
    db.transaction(list => { for (const r of list) { const { data } = clean(r); if (data) ins.run(data); } })(rows);
    console.log(`Datos iniciales cargados: ${rows.length} retiros.`);
  }
}
console.log(`Base de datos lista: ${DB_PATH}`);

// ── Sesión de administrador (token firmado, sin estado) ──
function sign(payload) { return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url'); }
function makeToken() { const exp = String(Date.now() + SESSION_MS); return exp + '.' + sign(exp); }
function validToken(tok) {
  const [exp, sig] = String(tok || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function requireAdmin(req, res, next) {
  const tok = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (ADMIN_PASS && validToken(tok)) return next();
  res.status(401).json({ error: 'Sesión vencida. Entra de nuevo.' });
}

// ── Middleware ──
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' } });

// ── Público ──
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/retiros', (req, res) => {
  const retiros = db.prepare('SELECT id, ' + COLS.join(', ') + ' FROM retiros ORDER BY fecha = \'\', fecha, pais, parroquia').all();
  const updated = db.prepare('SELECT MAX(updated_at) AS u FROM retiros').get().u || '';
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ retiros, updated });
});

// ── Administrador ──
app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (ADMIN_PASS && same(req.body?.user ?? '', ADMIN_USER) && same(req.body?.pass ?? '', ADMIN_PASS))
    return res.json({ token: makeToken() });
  res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
});
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true }));

app.post('/api/admin/retiros', requireAdmin, (req, res) => {
  const { data, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(insertSQL).run(data);
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put('/api/admin/retiros/:id', requireAdmin, (req, res) => {
  const { data, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(`UPDATE retiros SET ${COLS.map(c => c + '=@' + c).join(', ')},
    updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=@id`).run({ ...data, id: Number(req.params.id) });
  if (!info.changes) return res.status(404).json({ error: 'Retiro no encontrado.' });
  res.json({ ok: true });
});
app.delete('/api/admin/retiros/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM retiros WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Emaús Global escuchando en :${PORT}`));

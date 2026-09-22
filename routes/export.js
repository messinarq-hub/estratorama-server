const express = require('express');
const pool = require('../db');

const router = express.Router();

// Protección simple por token secreto en la URL (no requiere login de la app,
// porque Google Sheets no puede enviar el header Authorization).
// El token se configura como variable de entorno EXPORT_TOKEN en Render.
function checkToken(req, res, next) {
  const token = req.query.token;
  if (!token || token !== process.env.EXPORT_TOKEN) {
    return res.status(401).send('Token inválido o faltante.');
  }
  next();
}

function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s;
    if (v instanceof Date) s = v.toISOString().replace('T', ' ').slice(0, 19);
    else if (Array.isArray(v)) s = v.join(', ');
    else s = String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.map(([, label]) => esc(label)).join(',');
  const lines = rows.map((r) => columns.map(([key]) => esc(r[key])).join(','));
  return '\uFEFF' + [header, ...lines].join('\n');
}

const NIVELES_COLS = [
  ['unidad', 'Unidad'], ['estrato', 'Estrato'], ['nivel', 'Nivel'],
  ['profundidad_inicio_cm', 'Prof_Inicio'], ['profundidad_fin_cm', 'Prof_Fin'],
  ['consistencia', 'Consistencia'], ['granulo_dominante', 'Granulo_Dominante'],
  ['forma_clastos', 'Forma_Clastos'], ['color_principal', 'Color'], ['inclusiones', 'Inclusiones'],
  ['hay_materiales', 'Hay_Materiales'], ['estado_nivel', 'Estado'],
  ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

const MATERIALES_COLS = [
  ['unidad', 'Unidad'], ['nivel', 'Nivel'], ['estrato', 'Estrato'],
  ['tipo_material', 'Tipo'], ['frecuencia', 'Frecuencia'], ['descripcion', 'Descripcion'],
  ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

router.get('/niveles.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM niveles ORDER BY unidad, nivel');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, NIVELES_COLS));
});

router.get('/materiales.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM materiales ORDER BY unidad, nivel');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, MATERIALES_COLS));
});

module.exports = router;

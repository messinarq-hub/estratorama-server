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
    else if (typeof v === 'string' && /^\{.*\}$/.test(v)) {
      // Postgres devuelve los arrays de enums personalizados como texto "{a,b}"
      // en vez de un array real — lo traducimos a "a, b" legible.
      s = v.slice(1, -1).split(',').filter(Boolean).join(', ');
    }
    else s = String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.map(([, label]) => esc(label)).join(',');
  const lines = rows.map((r) => columns.map(([key]) => esc(r[key])).join(','));
  return '\uFEFF' + [header, ...lines].join('\n');
}

const NIVELES_COLS = [
  ['id', 'ID'],
  ['unidad', 'Unidad'], ['estrato', 'Estrato'], ['nivel', 'Nivel'],
  ['profundidad_inicio_cm', 'Prof_Inicio'], ['profundidad_fin_cm', 'Prof_Fin'], ['prof_otro', 'Prof_Otro'],
  ['control_estratigrafico', 'Control_Estratigrafico'],
  ['consistencia', 'Consistencia'], ['granulo_dominante', 'Granulo_Dominante'],
  ['granulo_secundario', 'Granulo_Secundario'], ['granulo_terciario', 'Granulo_Terciario'],
  ['forma_clastos', 'Forma_Clastos'], ['color_principal', 'Color'], ['color_secundario', 'Color_Secundario'],
  ['inclusiones', 'Otros_Elementos'], ['otros_desc', 'Otros_Elementos_Desc'],
  ['observaciones', 'Observaciones'],
  ['id_rasgo', 'ID_Rasgo'], ['tipo_rasgo', 'Tipo_Rasgo'], ['descripcion_rasgo', 'Descripcion_Rasgo'],
  ['hay_materiales', 'Hay_Materiales'],
  ['foto_perfil', 'Foto_Perfil'], ['foto_planta', 'Foto_Planta'],
  ['estado_nivel', 'Estado'], ['perfil_dibujado', 'Perfil_Dibujado'], ['observaciones_perfil', 'Observaciones_Perfil'],
  ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

const UNIDADES_COLS = [
  ['unidad', 'Unidad'], ['proyecto', 'Proyecto'], ['sitio', 'Sitio'], ['sector', 'Sector'],
  ['dimensiones_m2', 'Dimensiones_m2'], ['creado_en', 'Creado_En'],
];

const MATERIALES_COLS = [
  ['id', 'ID_Material'], ['id_registro', 'ID_Registro'],
  ['unidad', 'Unidad'], ['nivel', 'Nivel'], ['estrato', 'Estrato'],
  ['tipo_material', 'Tipo'], ['frecuencia', 'Frecuencia'], ['descripcion', 'Descripcion'],
  ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

router.get('/niveles.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM niveles ORDER BY unidad, nivel');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, NIVELES_COLS));
});

router.get('/unidades.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM unidades ORDER BY unidad');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, UNIDADES_COLS));
});

router.get('/materiales.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM materiales ORDER BY unidad, nivel');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, MATERIALES_COLS));
});

const RECOLECCIONES_COLS = [
  ['id', 'ID'], ['codigo_unidad', 'Codigo_Unidad'], ['proyecto', 'Proyecto'], ['sitio', 'Sitio'],
  ['fecha', 'Fecha'], ['dim_largo_m', 'Largo_m'], ['dim_ancho_m', 'Ancho_m'],
  ['hora_inicio', 'Hora_Inicio'], ['hora_termino', 'Hora_Termino'],
  ['jefe_unidad', 'Jefe_Unidad'], ['titulo_jefe', 'Titulo_Jefe'], ['equipo_apoyo', 'Equipo_Apoyo'],
  ['area_densidad', 'Area_Densidad'], ['datum', 'Datum'], ['huso', 'Huso'],
  ['referencia_obras', 'Referencia_Obras'],
  ['visibilidad', 'Visibilidad'], ['cobertura_vegetal', 'Cobertura_Vegetal'],
  ['sin_disturbacion', 'Sin_Disturbacion'],
  ['disturbacion_antropico', 'Disturbacion_Antropico'], ['disturbacion_natural', 'Disturbacion_Natural'],
  ['superficie_revisada', 'Superficie_Revisada'], ['modalidad', 'Modalidad'],
  ['resultado', 'Resultado'], ['total_elementos', 'Total_Elementos'],
  ['observaciones', 'Observaciones'],
  ['firma_jefe_unidad', 'Firma_Jefe_Unidad'], ['firma_arqueologo', 'Firma_Arqueologo'],
  ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

const MATERIALES_RECOLECCION_COLS = [
  ['id', 'ID_Material'], ['id_recoleccion', 'ID_Recoleccion'], ['codigo_unidad', 'Codigo_Unidad'],
  ['materialidad', 'Materialidad'], ['materialidad_otro', 'Materialidad_Otro'],
  ['cantidad', 'Cantidad'], ['n_bolsa', 'N_Bolsa'],
  ['foto_cenital', 'Foto_Cenital'], ['foto_unidad_completa', 'Foto_Unidad_Completa'], ['foto_detalle', 'Foto_Detalle'],
  ['descripcion', 'Descripcion'], ['responsable', 'Responsable'], ['creado_en', 'Creado_En'],
];

router.get('/recolecciones.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM recolecciones ORDER BY codigo_unidad');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, RECOLECCIONES_COLS));
});

router.get('/materiales-recoleccion.csv', checkToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM materiales_recoleccion ORDER BY codigo_unidad');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(result.rows, MATERIALES_RECOLECCION_COLS));
});

module.exports = router;

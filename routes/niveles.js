const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();
router.use(requireAuth);

// GET /niveles?unidad=U43 — lista los niveles de una unidad (con sus materiales)
router.get('/', async (req, res) => {
  const { unidad } = req.query;
  const where = unidad ? 'WHERE unidad = $1' : '';
  const params = unidad ? [unidad] : [];

  const niveles = await pool.query(
    `SELECT * FROM niveles ${where} ORDER BY unidad, nivel`,
    params
  );

  const ids = niveles.rows.map(n => n.id);
  let materialesPorNivel = {};
  if (ids.length > 0) {
    const materiales = await pool.query(
      `SELECT * FROM materiales WHERE id_registro = ANY($1::uuid[])`,
      [ids]
    );
    materialesPorNivel = materiales.rows.reduce((acc, m) => {
      (acc[m.id_registro] ||= []).push(m);
      return acc;
    }, {});
  }

  const out = niveles.rows.map(n => ({ ...n, materiales: materialesPorNivel[n.id] || [] }));
  res.json(out);
});

// POST /niveles — crea un nivel nuevo (con sus materiales, si vienen)
router.post('/', async (req, res) => {
  const b = req.body;
  const responsable = req.user.username; // viene de la sesión autenticada, no del body

  const required = ['unidad', 'estrato', 'nivel', 'profundidadInicio', 'profundidadFin', 'consistencia', 'granuloDominante', 'colorPrincipal', 'observaciones'];
  for (const campo of required) {
    if (b[campo] === undefined || b[campo] === null || b[campo] === '') {
      return res.status(400).json({ error: `Falta el campo obligatorio: ${campo}` });
    }
  }
  if ((b.inclusiones || []).includes('Otros') && !b.otrosDesc) {
    return res.status(400).json({ error: 'Debes describir la inclusión "Otros".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // chequeo de duplicado real (unidad+nivel) — el índice UNIQUE también lo protege,
    // pero así devolvemos un mensaje claro en vez de un error crudo de Postgres.
    const dup = await client.query(
      'SELECT id FROM niveles WHERE unidad = $1 AND nivel = $2',
      [b.unidad, b.nivel]
    );
    if (dup.rowCount > 0 && !b.forzarDuplicado) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Ya existe una ficha para el Nivel ${b.nivel} de la unidad ${b.unidad}.`,
        duplicado: true,
      });
    }

    const nivelResult = await client.query(
      `INSERT INTO niveles (
        unidad, estrato, nivel, profundidad_inicio_cm, profundidad_fin_cm, prof_otro,
        control_estratigrafico, consistencia, granulo_dominante, granulo_secundario,
        color_principal, color_secundario, inclusiones, otros_desc, observaciones,
        id_rasgo, tipo_rasgo, descripcion_rasgo, hay_materiales, foto_perfil, foto_planta,
        estado_nivel, perfil_dibujado, observaciones_perfil, responsable
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING *`,
      [
        b.unidad, b.estrato, b.nivel, b.profundidadInicio, b.profundidadFin, b.profOtro || null,
        !!b.controlEstratigrafico, b.consistencia, b.granuloDominante, b.granuloSecundario || null,
        b.colorPrincipal, b.colorSecundario || null, b.inclusiones || [], b.otrosDesc || null, b.observaciones,
        b.idRasgo || null, b.tipoRasgo || null, b.descripcionRasgo || null,
        !!b.hayMateriales, !!b.fotoPerfil, !!b.fotoPlanta,
        b.estadoNivel || 'Continuación', b.perfilDibujado || [], b.observacionesPerfil || null, responsable,
      ]
    );
    const nivel = nivelResult.rows[0];

    const materialesGuardados = [];
    for (const m of (b.materiales || [])) {
      const matResult = await client.query(
        `INSERT INTO materiales (id_registro, tipo_material, frecuencia, descripcion, unidad, nivel, estrato, responsable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [nivel.id, m.tipo, m.frecuencia, m.descripcion || null, b.unidad, b.nivel, b.estrato, responsable]
      );
      materialesGuardados.push(matResult.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...nivel, materiales: materialesGuardados });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') { // unique_violation, por si dos requests chocan al mismo tiempo
      return res.status(409).json({ error: 'Ya existe una ficha para ese Nivel de esa Unidad.', duplicado: true });
    }
    console.error(e);
    res.status(500).json({ error: 'Error interno al guardar el nivel.' });
  } finally {
    client.release();
  }
});

// PUT /niveles/:id — edita un nivel existente
router.put('/:id', async (req, res) => {
  const b = req.body;
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE niveles SET
      estrato=$1, profundidad_inicio_cm=$2, profundidad_fin_cm=$3, prof_otro=$4,
      control_estratigrafico=$5, consistencia=$6, granulo_dominante=$7, granulo_secundario=$8,
      color_principal=$9, color_secundario=$10, inclusiones=$11, otros_desc=$12, observaciones=$13,
      id_rasgo=$14, tipo_rasgo=$15, descripcion_rasgo=$16, hay_materiales=$17,
      foto_perfil=$18, foto_planta=$19, estado_nivel=$20, perfil_dibujado=$21, observaciones_perfil=$22
     WHERE id = $23
     RETURNING *`,
    [
      b.estrato, b.profundidadInicio, b.profundidadFin, b.profOtro || null,
      !!b.controlEstratigrafico, b.consistencia, b.granuloDominante, b.granuloSecundario || null,
      b.colorPrincipal, b.colorSecundario || null, b.inclusiones || [], b.otrosDesc || null, b.observaciones,
      b.idRasgo || null, b.tipoRasgo || null, b.descripcionRasgo || null, !!b.hayMateriales,
      !!b.fotoPerfil, !!b.fotoPlanta, b.estadoNivel, b.perfilDibujado || [], b.observacionesPerfil || null,
      id,
    ]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: 'Nivel no encontrado.' });
  res.json(result.rows[0]);
});

// DELETE /niveles/:id
router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM niveles WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Nivel no encontrado.' });
  res.json({ ok: true });
});

module.exports = router;

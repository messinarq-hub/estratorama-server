const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();
router.use(requireAuth);

// GET /recolecciones — lista todas las fichas de recolección (con sus materiales)
router.get('/', async (req, res) => {
  const recs = await pool.query('SELECT * FROM recolecciones ORDER BY codigo_unidad');

  const ids = recs.rows.map((r) => r.id);
  let materialesPorRecoleccion = {};
  if (ids.length > 0) {
    const materiales = await pool.query(
      `SELECT * FROM materiales_recoleccion WHERE id_recoleccion = ANY($1::uuid[])`,
      [ids]
    );
    materialesPorRecoleccion = materiales.rows.reduce((acc, m) => {
      (acc[m.id_recoleccion] ||= []).push(m);
      return acc;
    }, {});
  }

  const out = recs.rows.map((r) => ({ ...r, materiales: materialesPorRecoleccion[r.id] || [] }));
  res.json(out);
});

// POST /recolecciones — crea una ficha de recolección nueva (con sus materiales, si vienen)
router.post('/', async (req, res) => {
  const b = req.body;
  const responsable = req.user.username;

  const required = [
    'codigoUnidad', 'proyecto', 'sitio', 'fecha', 'jefeUnidad',
    'visibilidad', 'coberturaVegetal', 'superficieRevisada', 'modalidad', 'resultado',
  ];
  for (const campo of required) {
    if (b[campo] === undefined || b[campo] === null || b[campo] === '') {
      return res.status(400).json({ error: `Falta el campo obligatorio: ${campo}` });
    }
  }
  if (b.resultado === 'Con material' && (b.totalElementos === undefined || b.totalElementos === null || b.totalElementos === '')) {
    return res.status(400).json({ error: 'Falta el N° total de elementos cuando el resultado es "Con material".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query('SELECT id FROM recolecciones WHERE codigo_unidad = $1', [b.codigoUnidad]);
    if (dup.rowCount > 0 && !b.forzarDuplicado) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Ya existe una ficha de recolección para la unidad ${b.codigoUnidad}.`,
        duplicado: true,
      });
    }

    const recResult = await client.query(
      `INSERT INTO recolecciones (
        proyecto, sitio, permiso_cmn, arqueologo_titular, codigo_unidad, fecha,
        dim_largo_m, dim_ancho_m, hora_inicio, hora_termino, jefe_unidad, titulo_jefe,
        equipo_apoyo, area_densidad, datum, huso, vertices, referencia_obras,
        visibilidad, cobertura_vegetal, cobertura_vegetal_otra,
        sin_disturbacion, disturbacion_antropico, disturbacion_antropico_otro,
        disturbacion_natural, disturbacion_natural_otro,
        superficie_revisada, superficie_revisada_otra, modalidad, modalidad_otra,
        resultado, total_elementos, croquis_imagen, observaciones,
        firma_jefe_unidad, firma_arqueologo, responsable
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
      ) RETURNING *`,
      [
        b.proyecto, b.sitio, b.permisoCmn || null, b.arqueologoTitular || null, b.codigoUnidad, b.fecha,
        b.dimLargo || null, b.dimAncho || null, b.horaInicio || null, b.horaTermino || null, b.jefeUnidad, b.tituloJefe || null,
        b.equipoApoyo || null, b.areaDensidad || null, b.datum || null, b.huso || null, b.vertices || {}, b.referenciaObras || null,
        b.visibilidad, b.coberturaVegetal, b.coberturaVegetalOtra || null,
        !!b.sinDisturbacion, b.disturbacionAntropico || [], b.disturbacionAntropicoOtro || null,
        b.disturbacionNatural || [], b.disturbacionNaturalOtro || null,
        b.superficieRevisada, b.superficieRevisadaOtra || null, b.modalidad, b.modalidadOtra || null,
        b.resultado, b.totalElementos || null, b.croquisImagen || null, b.observaciones || null,
        b.firmaJefeUnidad || null, b.firmaArqueologo || null, responsable,
      ]
    );
    const rec = recResult.rows[0];

    const materialesGuardados = [];
    for (const m of (b.materiales || [])) {
      if (!m.cantidad || Number(m.cantidad) <= 0) continue;
      const matResult = await client.query(
        `INSERT INTO materiales_recoleccion
          (id_recoleccion, materialidad, materialidad_otro, cantidad, n_bolsa, foto_cenital, foto_unidad_completa, foto_detalle, descripcion, codigo_unidad, responsable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          rec.id, m.materialidad, m.materialidadOtro || null, m.cantidad, m.nBolsa || null,
          m.fotoCenital || null, m.fotoUnidadCompleta || null, m.fotoDetalle || null, m.descripcion || null,
          b.codigoUnidad, responsable,
        ]
      );
      materialesGuardados.push(matResult.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...rec, materiales: materialesGuardados });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una ficha de recolección para esa unidad.', duplicado: true });
    }
    console.error(e);
    res.status(500).json({ error: 'Error interno al guardar la ficha de recolección.' });
  } finally {
    client.release();
  }
});

// PUT /recolecciones/:id — edita una ficha existente (y reemplaza su lista de materiales)
router.put('/:id', async (req, res) => {
  const b = req.body;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE recolecciones SET
        proyecto=$1, sitio=$2, permiso_cmn=$3, arqueologo_titular=$4, fecha=$5,
        dim_largo_m=$6, dim_ancho_m=$7, hora_inicio=$8, hora_termino=$9, jefe_unidad=$10, titulo_jefe=$11,
        equipo_apoyo=$12, area_densidad=$13, datum=$14, huso=$15, vertices=$16, referencia_obras=$17,
        visibilidad=$18, cobertura_vegetal=$19, cobertura_vegetal_otra=$20,
        sin_disturbacion=$21, disturbacion_antropico=$22, disturbacion_antropico_otro=$23,
        disturbacion_natural=$24, disturbacion_natural_otro=$25,
        superficie_revisada=$26, superficie_revisada_otra=$27, modalidad=$28, modalidad_otra=$29,
        resultado=$30, total_elementos=$31, croquis_imagen=$32, observaciones=$33,
        firma_jefe_unidad=$34, firma_arqueologo=$35
       WHERE id = $36
       RETURNING *`,
      [
        b.proyecto, b.sitio, b.permisoCmn || null, b.arqueologoTitular || null, b.fecha,
        b.dimLargo || null, b.dimAncho || null, b.horaInicio || null, b.horaTermino || null, b.jefeUnidad, b.tituloJefe || null,
        b.equipoApoyo || null, b.areaDensidad || null, b.datum || null, b.huso || null, b.vertices || {}, b.referenciaObras || null,
        b.visibilidad, b.coberturaVegetal, b.coberturaVegetalOtra || null,
        !!b.sinDisturbacion, b.disturbacionAntropico || [], b.disturbacionAntropicoOtro || null,
        b.disturbacionNatural || [], b.disturbacionNaturalOtro || null,
        b.superficieRevisada, b.superficieRevisadaOtra || null, b.modalidad, b.modalidadOtra || null,
        b.resultado, b.totalElementos || null, b.croquisImagen || null, b.observaciones || null,
        b.firmaJefeUnidad || null, b.firmaArqueologo || null,
        id,
      ]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha de recolección no encontrada.' });
    }
    const rec = result.rows[0];

    await client.query('DELETE FROM materiales_recoleccion WHERE id_recoleccion = $1', [id]);
    const materialesGuardados = [];
    for (const m of (b.materiales || [])) {
      if (!m.cantidad || Number(m.cantidad) <= 0) continue;
      const matResult = await client.query(
        `INSERT INTO materiales_recoleccion
          (id_recoleccion, materialidad, materialidad_otro, cantidad, n_bolsa, foto_cenital, foto_unidad_completa, foto_detalle, descripcion, codigo_unidad, responsable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          rec.id, m.materialidad, m.materialidadOtro || null, m.cantidad, m.nBolsa || null,
          m.fotoCenital || null, m.fotoUnidadCompleta || null, m.fotoDetalle || null, m.descripcion || null,
          rec.codigo_unidad, rec.responsable,
        ]
      );
      materialesGuardados.push(matResult.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ ...rec, materiales: materialesGuardados });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Error interno al editar la ficha de recolección.' });
  } finally {
    client.release();
  }
});

// DELETE /recolecciones/:id
router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM recolecciones WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Ficha de recolección no encontrada.' });
  res.json({ ok: true });
});

module.exports = router;

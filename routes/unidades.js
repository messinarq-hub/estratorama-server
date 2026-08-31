const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();
router.use(requireAuth);

// GET /unidades — lista todas las unidades (para el selector del formulario)
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM unidades ORDER BY unidad');
  res.json(result.rows);
});

// POST /unidades — crea o actualiza una unidad
// { unidad, proyecto, sitio, sector, dimensionesM2 }
router.post('/', async (req, res) => {
  const { unidad, proyecto, sitio, sector, dimensionesM2 } = req.body;
  if (!unidad || !proyecto || !sitio) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (unidad, proyecto, sitio).' });
  }

  const result = await pool.query(
    `INSERT INTO unidades (unidad, proyecto, sitio, sector, dimensiones_m2)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (unidad) DO UPDATE
       SET proyecto = EXCLUDED.proyecto,
           sitio = EXCLUDED.sitio,
           sector = EXCLUDED.sector,
           dimensiones_m2 = EXCLUDED.dimensiones_m2
     RETURNING *`,
    [unidad, proyecto, sitio, sector || null, dimensionesM2 || null]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;

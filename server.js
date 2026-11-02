require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const unidadesRoutes = require('./routes/unidades');
const nivelesRoutes = require('./routes/niveles');
const recoleccionesRoutes = require('./routes/recolecciones');
const exportRoutes = require('./routes/export');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // el croquis de planta viaja como imagen en base64

app.get('/', (req, res) => res.json({ ok: true, servicio: 'Estratorama API' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/unidades', unidadesRoutes);
app.use('/niveles', nivelesRoutes);
app.use('/recolecciones', recoleccionesRoutes);
app.use('/export', exportRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Estratorama API escuchando en :${PORT}`));
}

module.exports = app;

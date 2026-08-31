require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const unidadesRoutes = require('./routes/unidades');
const nivelesRoutes = require('./routes/niveles');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, servicio: 'Estratorama API' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/unidades', unidadesRoutes);
app.use('/niveles', nivelesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Estratorama API escuchando en :${PORT}`));
}

module.exports = app;

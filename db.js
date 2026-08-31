const { Pool } = require('pg');

// DATABASE_URL viene de la variable de entorno (ej. la que entrega Neon/Render).
// En Neon casi siempre requiere SSL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = pool;

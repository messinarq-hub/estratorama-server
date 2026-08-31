const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { SECRET } = require('../authMiddleware');

const router = express.Router();

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// POST /auth/registro { username, password }
router.post('/registro', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const { password } = req.body;

  if (!username) return res.status(400).json({ error: 'Falta el nombre de usuario.' });
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  const existing = await pool.query('SELECT 1 FROM usuarios WHERE username = $1', [username]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO usuarios (username, password_hash) VALUES ($1, $2)',
    [username, hash]
  );

  const token = jwt.sign({ username }, SECRET, { expiresIn: '30d' });
  res.status(201).json({ username, token });
});

// POST /auth/login { username, password }
router.post('/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const { password } = req.body;

  const result = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
  if (result.rowCount === 0) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = jwt.sign({ username }, SECRET, { expiresIn: '30d' });
  res.json({ username, token });
});

module.exports = router;

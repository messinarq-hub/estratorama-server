const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');

async function main() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => require('crypto').randomUUID(),
  });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";.*\n/, '') // pg-mem no necesita la extensión real
    .replace(/-- ---------- Trigger para actualizado_en ----------[\s\S]*$/, ''); // pg-mem no soporta CREATE TRIGGER (sí Postgres real)

  db.public.none(schema);
  console.log('✅ Esquema SQL aplicado sin errores sobre Postgres emulado');

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  // Monkey-patch: reemplazamos el pool real del módulo db.js por el emulado
  const dbModule = require('./db');
  Object.setPrototypeOf(dbModule, pool);
  Object.assign(dbModule, pool);

  const app = require('./server');
  const request = require('http').request;

  function call(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        const data = body ? JSON.stringify(body) : null;
        const req = request({
          hostname: 'localhost', port, path: urlPath, method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }, (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            server.close();
            try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); }
            catch (e) { resolve({ status: res.statusCode, body: raw }); }
          });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
      });
    });
  }

  let ok = 0, fail = 0;
  function check(desc, cond) {
    if (cond) { console.log('  ✅', desc); ok++; }
    else { console.log('  ❌', desc); fail++; }
  }

  console.log('\n--- 1) Registro de usuario ---');
  let r = await call('POST', '/auth/registro', { username: 'Rodrigo Alvar', password: '1234' });
  check('registro exitoso (201)', r.status === 201);
  check('username normalizado a rodrigo_alvar', r.body.username === 'rodrigo_alvar');
  const token = r.body.token;
  check('devuelve token', !!token);

  console.log('\n--- 2) Registro duplicado ---');
  r = await call('POST', '/auth/registro', { username: 'rodrigo_alvar', password: 'otra' });
  check('rechaza usuario duplicado (409)', r.status === 409);

  console.log('\n--- 3) Login correcto e incorrecto ---');
  r = await call('POST', '/auth/login', { username: 'rodrigo_alvar', password: '1234' });
  check('login correcto (200)', r.status === 200);
  r = await call('POST', '/auth/login', { username: 'rodrigo_alvar', password: 'mala' });
  check('login con clave incorrecta (401)', r.status === 401);

  console.log('\n--- 4) Endpoint protegido sin token ---');
  r = await call('GET', '/unidades', null, null);
  check('rechaza sin token (401)', r.status === 401);

  console.log('\n--- 5) Crear unidad ---');
  r = await call('POST', '/unidades', {
    unidad: 'U43', proyecto: 'Proyecto Demo', sitio: 'Lota', sector: 'Andén', dimensionesM2: 1,
  }, token);
  check('crea unidad (201)', r.status === 201);

  console.log('\n--- 6) Crear nivel válido ---');
  r = await call('POST', '/niveles', {
    unidad: 'U43', estrato: 'A', nivel: 1,
    profundidadInicio: 0, profundidadFin: 10,
    consistencia: 'Firme', granuloDominante: 'Menos 0,05 mm (limo y arcilla)',
    colorPrincipal: 'pardo oscuro', observaciones: 'Matriz de prueba',
    inclusiones: ['Subactual'],
    materiales: [{ tipo: 'Vidrio', frecuencia: 2, descripcion: 'Frag. transparente' }],
  }, token);
  check('crea nivel (201)', r.status === 201);
  check('trae el material anidado', r.body.materiales && r.body.materiales.length === 1);
  const nivelId = r.body.id;

  console.log('\n--- 7) Validación: falta campo obligatorio ---');
  r = await call('POST', '/niveles', { unidad: 'U43', estrato: 'A', nivel: 2 }, token);
  check('rechaza sin campos obligatorios (400)', r.status === 400);

  console.log('\n--- 8) Validación: Otros sin descripción ---');
  r = await call('POST', '/niveles', {
    unidad: 'U43', estrato: 'A', nivel: 2,
    profundidadInicio: 10, profundidadFin: 20,
    consistencia: 'Firme', granuloDominante: 'Menos 0,05 mm (limo y arcilla)',
    colorPrincipal: 'pardo oscuro', observaciones: 'test',
    inclusiones: ['Otros'],
  }, token);
  check('rechaza "Otros" sin describir (400)', r.status === 400);

  console.log('\n--- 9) Duplicado real (mismo Unidad + Nivel) ---');
  r = await call('POST', '/niveles', {
    unidad: 'U43', estrato: 'A', nivel: 1,
    profundidadInicio: 0, profundidadFin: 10,
    consistencia: 'Firme', granuloDominante: 'Menos 0,05 mm (limo y arcilla)',
    colorPrincipal: 'pardo oscuro', observaciones: 'otra vez nivel 1',
  }, token);
  check('rechaza duplicado sin forzar (409)', r.status === 409);
  check('marca duplicado:true', r.body.duplicado === true);

  console.log('\n--- 10) Listar niveles de la unidad ---');
  r = await call('GET', '/niveles?unidad=U43', null, token);
  check('lista niveles (200)', r.status === 200);
  check('devuelve 1 nivel guardado', r.body.length === 1);

  console.log('\n--- 11) Editar nivel ---');
  r = await call('PUT', `/niveles/${nivelId}`, {
    estrato: 'A', profundidadInicio: 0, profundidadFin: 10,
    consistencia: 'Muy firme', granuloDominante: 'Menos 0,05 mm (limo y arcilla)',
    colorPrincipal: 'pardo oscuro', observaciones: 'Editado en prueba',
    estadoNivel: 'Continuación',
  }, token);
  check('edita nivel (200)', r.status === 200);
  check('consistencia quedó actualizada', r.body.consistencia === 'Muy firme');

  console.log('\n--- 12) Eliminar nivel ---');
  r = await call('DELETE', `/niveles/${nivelId}`, null, token);
  check('elimina nivel (200)', r.status === 200);
  r = await call('GET', '/niveles?unidad=U43', null, token);
  check('la lista queda vacía tras eliminar', r.body.length === 0);

  console.log(`\n=== RESULTADO: ${ok} pruebas ok, ${fail} fallidas ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });

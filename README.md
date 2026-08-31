# Estratorama — Servidor

API real (Node.js + Express + PostgreSQL) que reemplaza el `localStorage` del
prototipo HTML. Probado con 20 pruebas automatizadas end-to-end (ver `test-server.js`).

## Qué incluye

- `schema.sql` — el esquema completo de la base de datos (usuarios, unidades, niveles, materiales).
- `server.js` — servidor Express con todos los endpoints.
- `routes/` — auth (registro/login con contraseña real), unidades, niveles.
- `db.js` — conexión a PostgreSQL.
- `authMiddleware.js` — protege los endpoints con JWT (token de sesión).

## 1. Crear la base de datos gratis en Neon

1. Entra a [neon.tech](https://neon.tech) y crea una cuenta (sin tarjeta de crédito).
2. Crea un proyecto nuevo. Neon te da un **connection string** parecido a:
   `postgresql://usuario:clave@ep-algo.neon.tech/neondb?sslmode=require`
3. Copia ese string, lo vas a necesitar en el paso 3.
4. Aplica el esquema: puedes pegar el contenido de `schema.sql` directo en el
   **SQL Editor** que trae Neon en su panel web, o usar `psql` si lo tienes instalado:
   ```bash
   psql "TU_CONNECTION_STRING" -f schema.sql
   ```

## 2. Subir este código a GitHub

```bash
cd estratorama-server
git init
git add .
git commit -m "Servidor inicial de Estratorama"
# crea un repo en GitHub y luego:
git remote add origin https://github.com/TU_USUARIO/estratorama-server.git
git push -u origin main
```

**Importante**: el archivo `.env` (si lo creas localmente) nunca debe subirse a
GitHub — ya está listado en `.gitignore`. Las variables de entorno reales se
configuran directo en Render (paso 3), no en el código.

## 3. Desplegar en Render (gratis)

1. Entra a [render.com](https://render.com), crea una cuenta (sin tarjeta), conecta tu GitHub.
2. "New +" → "Web Service" → elige el repo `estratorama-server`.
3. Configuración:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. En la sección "Environment", agrega estas variables:
   - `DATABASE_URL` → el connection string de Neon (paso 1)
   - `JWT_SECRET` → cualquier texto largo y aleatorio (ej. genera uno con `openssl rand -hex 32`)
5. Click "Create Web Service". Render te da una URL pública, algo como
   `https://estratorama-server.onrender.com`

Listo — cada vez que hagas `git push`, Render vuelve a desplegar solo.

## 4. Probar que quedó funcionando

```bash
curl https://TU-SERVICIO.onrender.com/health
# debería responder: {"status":"ok"}

curl -X POST https://TU-SERVICIO.onrender.com/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"username":"tu_nombre","password":"algo123"}'
# debería devolver un token
```

## Nota sobre el "sueño" del plan gratis de Render

El servicio gratuito se duerme tras 15 minutos sin uso. La primera consulta
después de eso tarda 30-50 segundos en responder mientras despierta — es
normal, no es un error. Las consultas siguientes son instantáneas hasta que
vuelve a dormirse por inactividad.

## Endpoints disponibles

| Método | Ruta | Requiere token | Descripción |
|---|---|---|---|
| POST | `/auth/registro` | No | Crea un usuario nuevo |
| POST | `/auth/login` | No | Inicia sesión, devuelve token |
| GET | `/unidades` | Sí | Lista todas las unidades |
| POST | `/unidades` | Sí | Crea o actualiza una unidad |
| GET | `/niveles?unidad=U43` | Sí | Lista los niveles de una unidad (con materiales) |
| POST | `/niveles` | Sí | Crea un nivel (con materiales anidados) |
| PUT | `/niveles/:id` | Sí | Edita un nivel |
| DELETE | `/niveles/:id` | Sí | Elimina un nivel |

Todas las rutas protegidas esperan el header:
`Authorization: Bearer TU_TOKEN` (el token lo entrega `/auth/login` o `/auth/registro`).

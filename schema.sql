-- ============================================================
-- Estratorama — Esquema de base de datos
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_uuid()

-- ---------- Tipos enumerados ----------

CREATE TYPE consistencia_t AS ENUM (
  'Suelto', 'Friable', 'Firme', 'Muy firme', 'Muy friable', 'Extremadamente firme'
);

CREATE TYPE granulometria_t AS ENUM (
  'Menos 0,05 mm (limo y arcilla)',
  '0,05 a 0,5 mm (arena fina)',
  '0,5 a 2,0 mm (arena gruesa)',
  '2,0 a 10,0 mm (gravilla)',
  'Sobre 10 mm (grava y piedras)'
);

CREATE TYPE estado_nivel_t AS ENUM (
  'Inicio', 'Continuación', 'Cambio estrato', 'Cierre excavación'
);

CREATE TYPE tipo_material_t AS ENUM (
  'Líticos', 'Cerámica indígena', 'Cerámica colonial', 'Osteofauna',
  'Loza', 'Vidrio', 'Metal', 'Carbón', 'Muestras', 'Otros'
);

CREATE TYPE inclusion_t AS ENUM (
  'Carbón', 'Conchas', 'Subactual', 'Otros'
);

CREATE TYPE perfil_t AS ENUM ('Norte', 'Sur', 'Este', 'Oeste');

-- ---------- Usuarios ----------
-- Autenticación real (reemplaza el PIN local del prototipo)

CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,              -- formato nombre_apellido, siempre minúsculas
  password_hash TEXT NOT NULL,                      -- bcrypt, nunca texto plano
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Unidades ----------
-- Se abre una vez por pozo de excavación; Sitio/Sector/Dimensiones
-- se heredan automáticamente por cada nivel que se registre en ella.

CREATE TABLE unidades (
  unidad        TEXT PRIMARY KEY,                   -- ej. "U43", "U6E"
  proyecto      TEXT NOT NULL,
  sitio         TEXT NOT NULL,
  sector        TEXT,
  dimensiones_m2 NUMERIC(6,2),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Niveles (registro de terreno) ----------
-- Tabla principal: un nivel de excavación por fila.

CREATE TABLE niveles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad                  TEXT NOT NULL REFERENCES unidades(unidad),
  estrato                 TEXT NOT NULL,             -- texto libre: acepta "A", "A-B", etc.
  nivel                   INTEGER NOT NULL,
  profundidad_inicio_cm   INTEGER NOT NULL,
  profundidad_fin_cm      INTEGER NOT NULL,
  prof_otro               TEXT,
  control_estratigrafico  BOOLEAN NOT NULL DEFAULT false,
  consistencia            consistencia_t NOT NULL,
  granulo_dominante       granulometria_t NOT NULL,
  granulo_secundario      granulometria_t,
  color_principal         TEXT NOT NULL,
  color_secundario        TEXT,
  inclusiones             inclusion_t[] NOT NULL DEFAULT '{}',
  otros_desc              TEXT,                      -- obligatorio si 'Otros' está en inclusiones (validado en la app)
  observaciones           TEXT NOT NULL,
  id_rasgo                TEXT,
  tipo_rasgo              TEXT,
  descripcion_rasgo       TEXT,
  hay_materiales          BOOLEAN NOT NULL DEFAULT false,
  foto_perfil             BOOLEAN NOT NULL DEFAULT false,
  foto_planta             BOOLEAN NOT NULL DEFAULT false,
  estado_nivel            estado_nivel_t NOT NULL DEFAULT 'Continuación',
  perfil_dibujado         perfil_t[] NOT NULL DEFAULT '{}',
  observaciones_perfil    TEXT,                      -- síntesis por capa, solo en cierre
  responsable             TEXT NOT NULL REFERENCES usuarios(username),
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (unidad, nivel)  -- evita duplicados reales a nivel de base de datos
);

CREATE INDEX idx_niveles_unidad ON niveles(unidad);
CREATE INDEX idx_niveles_responsable ON niveles(responsable);

-- ---------- Materiales ----------
-- Hallazgos culturales, vinculados a un nivel. Uno a muchos.

CREATE TABLE materiales (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_registro       UUID NOT NULL REFERENCES niveles(id) ON DELETE CASCADE,
  tipo_material     tipo_material_t NOT NULL,
  frecuencia        INTEGER NOT NULL CHECK (frecuencia > 0),
  descripcion       TEXT,
  -- heredados del nivel padre, duplicados por velocidad de lectura en reportes
  unidad            TEXT NOT NULL,
  nivel             INTEGER NOT NULL,
  estrato           TEXT NOT NULL,
  responsable       TEXT NOT NULL,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materiales_registro ON materiales(id_registro);
CREATE INDEX idx_materiales_unidad ON materiales(unidad);

-- ---------- Trigger para actualizado_en ----------

CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_niveles_actualizado
BEFORE UPDATE ON niveles
FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

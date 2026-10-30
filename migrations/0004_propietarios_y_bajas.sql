-- ============================================================
-- v4: Doble propietario (origen/entrega/actual), bajas con acta
-- obligatoria + nuevo propietario, PDFs de actas
-- ============================================================

-- 1) Propietario que ENTREGÓ el dispositivo al colegio (origen).
--    Se asigna al ALTA y queda bloqueado de por vida.
--    Ejemplo: "Alcaldía Municipal" lo entregó al "Colegio".
ALTER TABLE dispositivos ADD COLUMN propietario_origen_id INTEGER REFERENCES propietarios(id);

-- Para registros viejos, asumimos que el propietario_id actual
-- también fue quien lo entregó (mejor aproximación posible).
UPDATE dispositivos SET propietario_origen_id = propietario_id WHERE propietario_origen_id IS NULL;

-- 2) Archivos PDF para actas (base64 inline + nombre original + mime)
--    Cloudflare D1 acepta hasta varios MB por celda; suficiente para PDFs comunes.
ALTER TABLE actas ADD COLUMN archivo_pdf_base64 TEXT;
ALTER TABLE actas ADD COLUMN archivo_pdf_nombre VARCHAR(300);
ALTER TABLE actas ADD COLUMN archivo_pdf_mime VARCHAR(80);

-- 3) Tabla de BAJAS de dispositivos.
--    Cada vez que un dispositivo sale del colegio queda registrado
--    aquí (snapshot inmutable) con su acta obligatoria y el nuevo
--    propietario (quién lo recibe / a dónde va).
CREATE TABLE IF NOT EXISTS bajas_dispositivo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos(id),
  -- snapshot del dispositivo al momento de la baja
  codigo_patrimonial VARCHAR(80),
  numero_serie VARCHAR(120),
  marca VARCHAR(120),
  modelo VARCHAR(160),
  nombre_tipo VARCHAR(120),
  sala_origen VARCHAR(160),
  propietario_origen VARCHAR(200),
  propietario_anterior VARCHAR(200),
  -- nuevo dueño / destinatario (obligatorio)
  propietario_nuevo_id INTEGER REFERENCES propietarios(id),
  propietario_nuevo_nombre VARCHAR(200) NOT NULL,
  -- clasificación
  tipo_baja VARCHAR(60) NOT NULL DEFAULT 'Baja',  -- Baja | Donación | Venta | Devolución | Pérdida | Obsolescencia | Otro
  motivo TEXT,
  -- acta obligatoria
  acta_id INTEGER NOT NULL REFERENCES actas(id),
  numero_acta VARCHAR(60),
  -- auditoría
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha_baja DATETIME DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT
);
CREATE INDEX IF NOT EXISTS idx_baja_disp ON bajas_dispositivo(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_baja_tipo ON bajas_dispositivo(tipo_baja);
CREATE INDEX IF NOT EXISTS idx_baja_fecha ON bajas_dispositivo(fecha_baja);

-- 4) Asegurar tipo de novedad para "Salida / Cambio de Propietario al salir"
INSERT OR IGNORE INTO tipos_novedad (id, tipo_novedad) VALUES
  (16, 'Salida de Dispositivo'),
  (17, 'Entrega a Propietario Externo');

-- ============================================================
-- MEJORAS v2: separación valor/costo, actas mejoradas,
-- solicitudes de impresión, novedades automáticas
-- ============================================================

-- 1) Separar valor del dispositivo y costo de adquisición
--    valor_adquisicion (legacy) sigue existiendo y representa "costo de adquisición real"
ALTER TABLE dispositivos ADD COLUMN valor_dispositivo DECIMAL(15,2);
-- Inicializamos valor_dispositivo igual al valor_adquisicion existente (para los registros viejos)
UPDATE dispositivos SET valor_dispositivo = valor_adquisicion WHERE valor_dispositivo IS NULL;

-- 2) Mejorar actas: tipo de acta (movimiento, entrada, salida, mantenimiento, baja)
--    + URL/archivo opcional + observaciones más ricas
ALTER TABLE actas ADD COLUMN tipo_acta VARCHAR(60) DEFAULT 'General';
ALTER TABLE actas ADD COLUMN archivo_url VARCHAR(500);
-- novedad_id ya existía, dejamos la relación como está

-- 3) Tabla de solicitudes de impresión (cualquier rol no-tesorero la pide,
--    el tesorero la aprueba e imprime)
CREATE TABLE IF NOT EXISTS solicitudes_impresion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_solicitante_id INTEGER NOT NULL,
    dispositivo_id INTEGER NOT NULL,
    motivo TEXT,
    estado VARCHAR(30) DEFAULT 'Pendiente',
    fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_aprueba_id INTEGER,
    fecha_aprobacion DATETIME,
    FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id),
    FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id),
    FOREIGN KEY (usuario_aprueba_id) REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_solicimp_estado ON solicitudes_impresion(estado);

-- 4) Asegurar tipos_novedad básicos para movimientos automáticos
INSERT OR IGNORE INTO tipos_novedad (id, tipo_novedad) VALUES
    (2, 'Movimiento de Sala'),
    (3, 'Cambio de Custodia'),
    (13, 'Cambio de Propietario'),
    (14, 'Cambio de Estado'),
    (15, 'Edición de Datos');

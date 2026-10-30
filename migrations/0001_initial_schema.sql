-- ============================================================
-- SISTEMA DE INVENTARIO TECNOLÓGICO ESCOLAR
-- Base de Datos: inventario_tecnologico
-- Motor: SQLite (Cloudflare D1) | Compatibilidad: MySQL 8.0+
-- Fecha: Octubre 2023
-- ============================================================

-- 1. TABLA: roles
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_rol VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

-- 2. TABLA: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rol_id INTEGER NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- 3. TABLA: profesores
CREATE TABLE IF NOT EXISTS profesores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER UNIQUE NOT NULL,
    documento_identidad VARCHAR(20) UNIQUE NOT NULL,
    departamento VARCHAR(100),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 4. TABLA: salas
CREATE TABLE IF NOT EXISTS salas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_sala VARCHAR(100) NOT NULL UNIQUE,
    ubicacion_fisica VARCHAR(255),
    profesor_custodio_id INTEGER NOT NULL,
    FOREIGN KEY (profesor_custodio_id) REFERENCES profesores(id)
);

-- 5. TABLA: tipos_dispositivo
CREATE TABLE IF NOT EXISTS tipos_dispositivo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_tipo VARCHAR(100) NOT NULL UNIQUE,
    vida_util_meses INTEGER DEFAULT 60
);

-- 6. TABLA: propietarios
CREATE TABLE IF NOT EXISTS propietarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_propietario VARCHAR(100) NOT NULL UNIQUE,
    nit VARCHAR(20)
);

-- 7. TABLA: estados_dispositivo
CREATE TABLE IF NOT EXISTS estados_dispositivo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estado VARCHAR(50) NOT NULL UNIQUE
);

-- 8. TABLA: dispositivos (NÚCLEO)
CREATE TABLE IF NOT EXISTS dispositivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_patrimonial VARCHAR(50) NOT NULL UNIQUE,
    numero_serie VARCHAR(100) UNIQUE,
    tipo_id INTEGER NOT NULL,
    propietario_id INTEGER NOT NULL,
    estado_id INTEGER NOT NULL,
    sala_actual_id INTEGER NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    fecha_adquisicion DATE,
    valor_adquisicion DECIMAL(15,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tipo_id) REFERENCES tipos_dispositivo(id),
    FOREIGN KEY (propietario_id) REFERENCES propietarios(id),
    FOREIGN KEY (estado_id) REFERENCES estados_dispositivo(id),
    FOREIGN KEY (sala_actual_id) REFERENCES salas(id)
);

-- 9. TABLA: tipos_novedad
CREATE TABLE IF NOT EXISTS tipos_novedad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_novedad VARCHAR(100) NOT NULL UNIQUE
);

-- 10. TABLA: novedades (TRAZABILIDAD INMUTABLE)
CREATE TABLE IF NOT EXISTS novedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispositivo_id INTEGER NOT NULL,
    tipo_novedad_id INTEGER NOT NULL,
    usuario_registra_id INTEGER NOT NULL,
    fecha_novedad DATETIME DEFAULT CURRENT_TIMESTAMP,
    descripcion TEXT,
    FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id),
    FOREIGN KEY (tipo_novedad_id) REFERENCES tipos_novedad(id),
    FOREIGN KEY (usuario_registra_id) REFERENCES usuarios(id)
);

-- 11. TABLA: actas
CREATE TABLE IF NOT EXISTS actas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novedad_id INTEGER UNIQUE NOT NULL,
    numero_acta VARCHAR(50) NOT NULL UNIQUE,
    fecha_emision DATE DEFAULT CURRENT_DATE,
    firmantes TEXT,
    observaciones TEXT,
    FOREIGN KEY (novedad_id) REFERENCES novedades(id)
);

-- 12. TABLA: adjuntos_acta
CREATE TABLE IF NOT EXISTS adjuntos_acta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acta_id INTEGER NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    tipo_archivo VARCHAR(50),
    nombre_original VARCHAR(255),
    FOREIGN KEY (acta_id) REFERENCES actas(id)
);

-- 13. TABLA: garantias
CREATE TABLE IF NOT EXISTS garantias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispositivo_id INTEGER NOT NULL,
    proveedor VARCHAR(150),
    fecha_inicio DATE,
    fecha_fin DATE,
    contacto_soporte VARCHAR(255),
    observaciones TEXT,
    FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);

-- 14. TABLA: prestamos_internos
CREATE TABLE IF NOT EXISTS prestamos_internos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispositivo_id INTEGER NOT NULL,
    profesor_autoriza_id INTEGER NOT NULL,
    estudiante_solicitante VARCHAR(150) NOT NULL,
    fecha_prestamo DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_devolucion_esperada DATE NOT NULL,
    fecha_devolucion_real DATE,
    estado VARCHAR(30) DEFAULT 'Activo',
    observaciones TEXT,
    FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id),
    FOREIGN KEY (profesor_autoriza_id) REFERENCES profesores(id)
);

-- 15. TABLA: solicitudes_reporte
CREATE TABLE IF NOT EXISTS solicitudes_reporte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_solicitante_id INTEGER NOT NULL,
    fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
    parametros_reporte TEXT,
    estado VARCHAR(30) DEFAULT 'Pendiente',
    usuario_aprueba_id INTEGER,
    fecha_aprobacion DATETIME,
    FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id),
    FOREIGN KEY (usuario_aprueba_id) REFERENCES usuarios(id)
);

-- 16. TABLA: log_auditoria
CREATE TABLE IF NOT EXISTS log_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    accion VARCHAR(100) NOT NULL,
    tabla_afectada VARCHAR(100),
    registro_id INTEGER,
    detalle TEXT,
    fecha_accion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ÍNDICES PARA RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_dispositivos_tipo ON dispositivos(tipo_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_sala ON dispositivos(sala_actual_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_estado ON dispositivos(estado_id);
CREATE INDEX IF NOT EXISTS idx_novedades_dispositivo ON novedades(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_dispositivo ON prestamos_internos(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_log_usuario ON log_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_fecha ON log_auditoria(fecha_accion);

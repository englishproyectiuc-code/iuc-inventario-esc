-- ============================================================
-- DATOS INICIALES - SISTEMA DE INVENTARIO TECNOLÓGICO ESCOLAR
-- ============================================================

-- ROLES DEL SISTEMA (Tesorero, Contador, Rector, Profesor)
INSERT OR IGNORE INTO roles (nombre_rol, descripcion) VALUES
    ('Tesorero', 'Acceso completo CRUD a todos los módulos del sistema'),
    ('Contador', 'Solo puede ver el dashboard financiero y solicitar reportes'),
    ('Rector', 'Dashboard general, aprobar permisos y solicitar reportes'),
    ('Auditor', 'Acceso temporal de solo lectura a historial y actas'),
    ('Profesor', 'Gestión de sus salas asignadas y préstamos internos');

-- USUARIOS DEL SISTEMA
INSERT OR IGNORE INTO usuarios (rol_id, nombre_completo, email, password_hash, activo) VALUES
    (1, 'Administrador Tesorero', 'admin@colegio.edu.co', 'admin123', 1),
    (2, 'Contador Principal', 'contador@colegio.edu.co', 'contador123', 1),
    (3, 'Rector Institucional', 'rector@colegio.edu.co', 'rector123', 1),
    (5, 'Prof. Juan García', 'jgarcia@colegio.edu.co', 'prof123', 1),
    (5, 'Prof. María López', 'mlopez@colegio.edu.co', 'prof123', 1),
    (5, 'Prof. Carlos Ruiz', 'cruiz@colegio.edu.co', 'prof123', 1);

-- PROFESORES (vinculados a usuarios)
INSERT OR IGNORE INTO profesores (usuario_id, documento_identidad, departamento) VALUES
    (4, '12345678', 'Tecnología e Informática'),
    (5, '23456789', 'Ciencias Naturales'),
    (6, '34567890', 'Matemáticas');

-- TIPOS DE DISPOSITIVO
INSERT OR IGNORE INTO tipos_dispositivo (nombre_tipo, vida_util_meses) VALUES
    ('Computador de Escritorio', 60),
    ('Laptop / Portátil', 48),
    ('Tablet', 36),
    ('Impresora', 72),
    ('Proyector / Videoproyector', 60),
    ('Televisor Smart', 84),
    ('Servidor', 72),
    ('Switch de Red', 60),
    ('Router', 60),
    ('UPS / Regulador', 48),
    ('Escáner', 60),
    ('Cámara Web', 36),
    ('Kit de Robótica', 60),
    ('Gafas VR', 36),
    ('Impresora 3D', 60),
    ('Auriculares', 24);

-- PROPIETARIOS
INSERT OR IGNORE INTO propietarios (nombre_propietario, nit) VALUES
    ('Institución Educativa', '800.123.456-7'),
    ('Alcaldía Municipal', '900.234.567-8'),
    ('Ministerio de Educación', '800.001.000-1'),
    ('Donación Empresa Privada', 'N/A');

-- ESTADOS DE DISPOSITIVO
INSERT OR IGNORE INTO estados_dispositivo (estado) VALUES
    ('Activo'),
    ('En Mantenimiento'),
    ('Dado de Baja'),
    ('En Préstamo'),
    ('En Reparación'),
    ('Perdido');

-- SALAS
INSERT OR IGNORE INTO salas (nombre_sala, ubicacion_fisica, profesor_custodio_id) VALUES
    ('Sala de Informática 1', 'Bloque A - Piso 1', 1),
    ('Sala de Informática 2', 'Bloque A - Piso 2', 2),
    ('Laboratorio de Ciencias', 'Bloque B - Piso 1', 2),
    ('Biblioteca', 'Bloque C - Piso 1', 3),
    ('Sala de Robótica', 'Bloque B - Piso 2', 1),
    ('Sala de Profesores', 'Bloque A - Piso 1', 3),
    ('Rectoría', 'Bloque Principal', 3);

-- TIPOS DE NOVEDAD
INSERT OR IGNORE INTO tipos_novedad (tipo_novedad) VALUES
    ('Alta / Ingreso'),
    ('Movimiento de Sala'),
    ('Cambio de Custodia'),
    ('Mantenimiento Preventivo'),
    ('Mantenimiento Correctivo'),
    ('Reparación'),
    ('Baja / Retiro'),
    ('Pérdida o Robo'),
    ('Actualización'),
    ('Inventario Físico'),
    ('Préstamo Interno'),
    ('Devolución');

-- DISPOSITIVOS DE EJEMPLO
INSERT OR IGNORE INTO dispositivos (codigo_patrimonial, numero_serie, tipo_id, propietario_id, estado_id, sala_actual_id, marca, modelo, fecha_adquisicion, valor_adquisicion) VALUES
    ('INV-2023-001', 'SN-HP-001', 2, 1, 1, 1, 'HP', 'ProBook 450 G9', '2023-01-15', 3500000),
    ('INV-2023-002', 'SN-HP-002', 2, 1, 1, 1, 'HP', 'ProBook 450 G9', '2023-01-15', 3500000),
    ('INV-2023-003', 'SN-DELL-001', 1, 2, 1, 1, 'Dell', 'OptiPlex 7090', '2022-06-10', 4200000),
    ('INV-2023-004', 'SN-DELL-002', 1, 2, 1, 1, 'Dell', 'OptiPlex 7090', '2022-06-10', 4200000),
    ('INV-2023-005', 'SN-EPSON-001', 4, 1, 1, 1, 'Epson', 'EcoTank L3250', '2023-03-20', 980000),
    ('INV-2023-006', 'SN-EPSON-002', 5, 3, 1, 2, 'Epson', 'PowerLite 970', '2022-08-01', 2800000),
    ('INV-2023-007', 'SN-SAMSUNG-001', 3, 1, 1, 2, 'Samsung', 'Galaxy Tab S7', '2023-02-14', 1850000),
    ('INV-2023-008', 'SN-SAMSUNG-002', 3, 1, 1, 2, 'Samsung', 'Galaxy Tab S7', '2023-02-14', 1850000),
    ('INV-2023-009', 'SN-LG-001', 6, 2, 1, 3, 'LG', 'Smart TV 55"', '2022-11-05', 3200000),
    ('INV-2023-010', 'SN-APPLE-001', 2, 4, 2, 4, 'Apple', 'MacBook Air M1', '2021-09-01', 6500000),
    ('INV-2023-011', 'SN-LEGO-001', 13, 1, 1, 5, 'LEGO', 'Mindstorms EV3', '2023-04-10', 4800000),
    ('INV-2023-012', 'SN-META-001', 14, 3, 1, 5, 'Meta', 'Quest 2', '2023-05-15', 2200000);

-- NOVEDADES INICIALES
INSERT OR IGNORE INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, fecha_novedad, descripcion) VALUES
    (1, 1, 1, '2023-01-15', 'Alta inicial - Laptop HP ProBook 450 G9 - Sala Informática 1'),
    (2, 1, 1, '2023-01-15', 'Alta inicial - Laptop HP ProBook 450 G9 - Sala Informática 1'),
    (3, 1, 1, '2022-06-10', 'Alta inicial - PC Dell OptiPlex 7090 - Sala Informática 1'),
    (4, 1, 1, '2022-06-10', 'Alta inicial - PC Dell OptiPlex 7090 - Sala Informática 1'),
    (5, 1, 1, '2023-03-20', 'Alta inicial - Impresora Epson EcoTank L3250 - Sala Informática 1'),
    (6, 1, 1, '2022-08-01', 'Alta inicial - Proyector Epson PowerLite 970 - Sala Informática 2'),
    (7, 1, 1, '2023-02-14', 'Alta inicial - Tablet Samsung Galaxy Tab S7 - Sala Informática 2'),
    (8, 1, 1, '2023-02-14', 'Alta inicial - Tablet Samsung Galaxy Tab S7 - Sala Informática 2'),
    (10, 4, 1, '2024-01-10', 'MacBook Air M1 ingresado a mantenimiento preventivo'),
    (11, 1, 1, '2023-04-10', 'Alta inicial - Kit Robótica LEGO Mindstorms - Sala Robótica'),
    (12, 1, 1, '2023-05-15', 'Alta inicial - Gafas VR Meta Quest 2 - Sala Robótica');

-- GARANTÍAS
INSERT OR IGNORE INTO garantias (dispositivo_id, proveedor, fecha_inicio, fecha_fin, contacto_soporte) VALUES
    (1, 'HP Colombia S.A.S', '2023-01-15', '2026-01-15', 'soporte@hp.com.co - Tel: 018000-123456'),
    (2, 'HP Colombia S.A.S', '2023-01-15', '2026-01-15', 'soporte@hp.com.co - Tel: 018000-123456'),
    (3, 'Dell Technologies Colombia', '2022-06-10', '2025-06-10', 'soporte.dell@colombia.com - Tel: 018000-912200'),
    (7, 'Samsung Electronics Colombia', '2023-02-14', '2025-02-14', 'service@samsung.com.co'),
    (8, 'Samsung Electronics Colombia', '2023-02-14', '2025-02-14', 'service@samsung.com.co'),
    (12, 'Meta Platforms Inc', '2023-05-15', '2025-05-15', 'support@meta.com');

-- PRÉSTAMOS INTERNOS
INSERT OR IGNORE INTO prestamos_internos (dispositivo_id, profesor_autoriza_id, estudiante_solicitante, fecha_prestamo, fecha_devolucion_esperada, fecha_devolucion_real, estado) VALUES
    (7, 1, 'Estudiante: Ana Martínez - Grado 10°', '2024-01-20 08:00:00', '2024-01-20', '2024-01-20', 'Devuelto'),
    (8, 1, 'Estudiante: Pedro Sánchez - Grado 11°', '2024-02-15 08:00:00', '2026-03-15', NULL, 'Activo');

-- LOG DE AUDITORÍA INICIAL
INSERT OR IGNORE INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES
    (1, 'SISTEMA_INICIADO', 'sistema', NULL, 'Base de datos inicializada con datos semilla'),
    (1, 'ALTA_DISPOSITIVO', 'dispositivos', 1, 'Registro inicial: HP ProBook 450 G9 - INV-2023-001'),
    (1, 'ALTA_DISPOSITIVO', 'dispositivos', 2, 'Registro inicial: HP ProBook 450 G9 - INV-2023-002');

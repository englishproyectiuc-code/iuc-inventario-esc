import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const reportes = new Hono<{ Bindings: Bindings }>()

// GET /api/reportes/dashboard - Dashboard completo (Tesorero / Rector)
reportes.get('/dashboard', async (c) => {
  try {
    const [totalDisp, dispActivos, dispMantenimiento, dispBaja, totalSalas, totalProfesores, prestamosActivos] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as total FROM dispositivos').first(),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM dispositivos WHERE estado_id = (SELECT id FROM estados_dispositivo WHERE estado='Activo')").first(),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM dispositivos WHERE estado_id = (SELECT id FROM estados_dispositivo WHERE estado='En Mantenimiento')").first(),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM dispositivos WHERE estado_id = (SELECT id FROM estados_dispositivo WHERE estado='Dado de Baja')").first(),
      c.env.DB.prepare('SELECT COUNT(*) as total FROM salas').first(),
      c.env.DB.prepare('SELECT COUNT(*) as total FROM profesores').first(),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM prestamos_internos WHERE estado='Activo'").first(),
    ])
    const valorTotal = await c.env.DB.prepare("SELECT SUM(valor_adquisicion) as total FROM dispositivos WHERE estado_id != (SELECT id FROM estados_dispositivo WHERE estado='Dado de Baja')").first() as any
    const valorOriginal = await c.env.DB.prepare("SELECT SUM(valor_adquisicion) as total FROM dispositivos").first() as any
    const porTipo = await c.env.DB.prepare(`SELECT td.nombre_tipo, COUNT(*) as cantidad FROM dispositivos d JOIN tipos_dispositivo td ON d.tipo_id=td.id GROUP BY td.nombre_tipo ORDER BY cantidad DESC LIMIT 8`).all()
    const porSala = await c.env.DB.prepare(`SELECT s.nombre_sala, COUNT(*) as cantidad FROM dispositivos d JOIN salas s ON d.sala_actual_id=s.id GROUP BY s.nombre_sala ORDER BY cantidad DESC`).all()
    const garantiasVencer = await c.env.DB.prepare(`SELECT g.*, d.codigo_patrimonial, d.marca, d.modelo FROM garantias g JOIN dispositivos d ON g.dispositivo_id=d.id WHERE g.fecha_fin >= date('now') AND g.fecha_fin <= date('now', '+90 days') ORDER BY g.fecha_fin ASC`).all()
    const novedadesRecientes = await c.env.DB.prepare(`SELECT n.*, tn.tipo_novedad, d.codigo_patrimonial, d.marca FROM novedades n LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id=tn.id LEFT JOIN dispositivos d ON n.dispositivo_id=d.id ORDER BY n.fecha_novedad DESC LIMIT 8`).all()
    return c.json({
      success: true,
      data: {
        resumen: {
          total_dispositivos: (totalDisp as any)?.total || 0,
          activos: (dispActivos as any)?.total || 0,
          en_mantenimiento: (dispMantenimiento as any)?.total || 0,
          dados_de_baja: (dispBaja as any)?.total || 0,
          total_salas: (totalSalas as any)?.total || 0,
          total_profesores: (totalProfesores as any)?.total || 0,
          prestamos_activos: (prestamosActivos as any)?.total || 0,
          valor_total_inventario: (valorTotal as any)?.total || 0,
          valor_costo_total: (valorOriginal as any)?.total || 0,
        },
        por_tipo: porTipo.results,
        por_sala: porSala.results,
        garantias_por_vencer: garantiasVencer.results,
        novedades_recientes: novedadesRecientes.results,
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/reportes/dashboard-profesor?sala_id=X - Dashboard para profesor de sus salas
reportes.get('/dashboard-profesor', async (c) => {
  try {
    const { sala_id } = c.req.query()
    let whereClause = sala_id ? `WHERE d.sala_actual_id = ${parseInt(sala_id)}` : 'WHERE 1=1'
    const totalDisp = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dispositivos d ${whereClause}`).first() as any
    const dispActivos = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dispositivos d ${whereClause} AND d.estado_id = (SELECT id FROM estados_dispositivo WHERE estado='Activo')`).first() as any
    const dispMantenimiento = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dispositivos d ${whereClause} AND d.estado_id = (SELECT id FROM estados_dispositivo WHERE estado='En Mantenimiento')`).first() as any
    const porTipo = await c.env.DB.prepare(`SELECT td.nombre_tipo, COUNT(*) as cantidad FROM dispositivos d JOIN tipos_dispositivo td ON d.tipo_id=td.id ${whereClause} GROUP BY td.nombre_tipo ORDER BY cantidad DESC LIMIT 8`).all()
    return c.json({
      success: true,
      data: {
        resumen: {
          total_dispositivos: totalDisp?.total || 0,
          activos: dispActivos?.total || 0,
          en_mantenimiento: dispMantenimiento?.total || 0,
        },
        por_tipo: porTipo.results,
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/reportes/inventario-completo
reportes.get('/inventario-completo', async (c) => {
  try {
    const { sala_id } = c.req.query()
    let where = sala_id ? `WHERE d.sala_actual_id = ${parseInt(sala_id)}` : ''
    const result = await c.env.DB.prepare(`
      SELECT d.id, d.codigo_patrimonial, d.numero_serie, d.marca, d.modelo,
        td.nombre_tipo, td.vida_util_meses,
        p.nombre_propietario,
        ed.estado as estado_nombre,
        s.nombre_sala, s.ubicacion_fisica,
        u.nombre_completo as profesor_custodio,
        d.fecha_adquisicion, d.valor_adquisicion,
        ROUND(julianday('now') - julianday(d.fecha_adquisicion)) as dias_en_uso,
        CASE WHEN g.fecha_fin >= date('now') THEN 'Vigente' WHEN g.fecha_fin IS NULL THEN 'Sin garantía' ELSE 'Vencida' END as estado_garantia,
        g.fecha_fin as garantia_hasta
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      LEFT JOIN garantias g ON g.dispositivo_id = d.id
      ${where}
      ORDER BY d.codigo_patrimonial`).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/reportes/por-sala/:sala_id
reportes.get('/por-sala/:sala_id', async (c) => {
  try {
    const sala_id = c.req.param('sala_id')
    const sala = await c.env.DB.prepare(`SELECT s.*, u.nombre_completo as profesor FROM salas s LEFT JOIN profesores pr ON s.profesor_custodio_id=pr.id LEFT JOIN usuarios u ON pr.usuario_id=u.id WHERE s.id=?`).bind(sala_id).first()
    const dispositivos = await c.env.DB.prepare(`
      SELECT d.*, td.nombre_tipo, ed.estado as estado_nombre, p.nombre_propietario
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id=td.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id=ed.id
      LEFT JOIN propietarios p ON d.propietario_id=p.id
      WHERE d.sala_actual_id=? ORDER BY d.codigo_patrimonial`).bind(sala_id).all()
    return c.json({ success: true, data: { sala, dispositivos: dispositivos.results } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/reportes/auditoria
reportes.get('/auditoria', async (c) => {
  try {
    const { limit, usuario_id } = c.req.query()
    let query = `
      SELECT la.*, u.nombre_completo as usuario_nombre, r.nombre_rol
      FROM log_auditoria la
      LEFT JOIN usuarios u ON la.usuario_id = u.id
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE 1=1`
    const params: any[] = []
    if (usuario_id) { query += ` AND la.usuario_id = ?`; params.push(parseInt(usuario_id)) }
    query += ` ORDER BY la.fecha_accion DESC LIMIT ?`
    params.push(parseInt(limit || '200'))
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTES DINÁMICOS POR TIPO DE DISPOSITIVO
// Ejemplo: /api/reportes/por-tipo/3 (donde 3 = Smart TV)
// ============================================================
reportes.get('/por-tipo/:tipo_id', async (c) => {
  try {
    const tipo_id = c.req.param('tipo_id')
    const { sala_id } = c.req.query()
    let where = `WHERE d.tipo_id = ?`
    const binds: any[] = [tipo_id]
    if (sala_id) { where += ` AND d.sala_actual_id = ?`; binds.push(parseInt(sala_id)) }
    const tipo = await c.env.DB.prepare('SELECT * FROM tipos_dispositivo WHERE id=?').bind(tipo_id).first()
    const result = await c.env.DB.prepare(`
      SELECT d.id, d.codigo_patrimonial, d.numero_serie, d.marca, d.modelo,
        td.nombre_tipo,
        p.nombre_propietario,
        ed.estado as estado_nombre,
        s.nombre_sala, s.ubicacion_fisica,
        u.nombre_completo as profesor_custodio,
        d.fecha_adquisicion, d.valor_adquisicion,
        ROUND(julianday('now') - julianday(d.fecha_adquisicion)) as dias_en_uso,
        CASE WHEN g.fecha_fin >= date('now') THEN 'Vigente' WHEN g.fecha_fin IS NULL THEN 'Sin garantía' ELSE 'Vencida' END as estado_garantia,
        g.fecha_fin as garantia_hasta
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      LEFT JOIN garantias g ON g.dispositivo_id = d.id
      ${where}
      ORDER BY d.codigo_patrimonial`).bind(...binds).all()
    return c.json({ success: true, data: result.results, meta: { tipo } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTES POR ESTADO (Activos, En Mantenimiento, Dados de Baja)
// Ejemplo: /api/reportes/por-estado/1
// ============================================================
reportes.get('/por-estado/:estado_id', async (c) => {
  try {
    const estado_id = c.req.param('estado_id')
    const estado = await c.env.DB.prepare('SELECT * FROM estados_dispositivo WHERE id=?').bind(estado_id).first()
    const result = await c.env.DB.prepare(`
      SELECT d.id, d.codigo_patrimonial, d.numero_serie, d.marca, d.modelo,
        td.nombre_tipo,
        p.nombre_propietario,
        ed.estado as estado_nombre,
        s.nombre_sala, s.ubicacion_fisica,
        u.nombre_completo as profesor_custodio,
        d.fecha_adquisicion, d.valor_adquisicion
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      WHERE d.estado_id = ?
      ORDER BY d.codigo_patrimonial`).bind(estado_id).all()
    return c.json({ success: true, data: result.results, meta: { estado } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTE POR PROPIETARIO
// ============================================================
reportes.get('/por-propietario/:propietario_id', async (c) => {
  try {
    const propietario_id = c.req.param('propietario_id')
    const propietario = await c.env.DB.prepare('SELECT * FROM propietarios WHERE id=?').bind(propietario_id).first()
    const result = await c.env.DB.prepare(`
      SELECT d.id, d.codigo_patrimonial, d.numero_serie, d.marca, d.modelo,
        td.nombre_tipo, ed.estado as estado_nombre,
        s.nombre_sala, p.nombre_propietario,
        d.fecha_adquisicion, d.valor_adquisicion
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      WHERE d.propietario_id = ?
      ORDER BY d.codigo_patrimonial`).bind(propietario_id).all()
    return c.json({ success: true, data: result.results, meta: { propietario } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTE FINANCIERO (valor por tipo, propietario, sala)
// ============================================================
reportes.get('/financiero', async (c) => {
  try {
    const porTipo = await c.env.DB.prepare(`
      SELECT td.nombre_tipo, COUNT(*) as cantidad,
        SUM(d.valor_adquisicion) as valor_total,
        AVG(d.valor_adquisicion) as valor_promedio
      FROM dispositivos d JOIN tipos_dispositivo td ON d.tipo_id=td.id
      GROUP BY td.nombre_tipo ORDER BY valor_total DESC`).all()
    const porSala = await c.env.DB.prepare(`
      SELECT s.nombre_sala, COUNT(*) as cantidad,
        SUM(d.valor_adquisicion) as valor_total
      FROM dispositivos d JOIN salas s ON d.sala_actual_id=s.id
      GROUP BY s.nombre_sala ORDER BY valor_total DESC`).all()
    const porPropietario = await c.env.DB.prepare(`
      SELECT p.nombre_propietario, COUNT(*) as cantidad,
        SUM(d.valor_adquisicion) as valor_total
      FROM dispositivos d JOIN propietarios p ON d.propietario_id=p.id
      GROUP BY p.nombre_propietario ORDER BY valor_total DESC`).all()
    const total = await c.env.DB.prepare(`SELECT COUNT(*) as cantidad, SUM(valor_adquisicion) as valor_total FROM dispositivos`).first()
    // Aplanamos en un solo array para CSV: una fila por tipo
    const filas = (porTipo.results || []).map((r: any) => ({
      categoria: 'Por Tipo', concepto: r.nombre_tipo, cantidad: r.cantidad,
      valor_total: r.valor_total, valor_promedio: Math.round(r.valor_promedio || 0)
    })).concat((porSala.results || []).map((r: any) => ({
      categoria: 'Por Sala', concepto: r.nombre_sala, cantidad: r.cantidad,
      valor_total: r.valor_total, valor_promedio: null
    }))).concat((porPropietario.results || []).map((r: any) => ({
      categoria: 'Por Propietario', concepto: r.nombre_propietario, cantidad: r.cantidad,
      valor_total: r.valor_total, valor_promedio: null
    })))
    return c.json({ success: true, data: filas, meta: { total } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTE DE NOVEDADES (con filtro opcional por tipo)
// ============================================================
reportes.get('/novedades', async (c) => {
  try {
    const { tipo_novedad_id, sala_id, desde, hasta } = c.req.query()
    let where = 'WHERE 1=1'
    const binds: any[] = []
    if (tipo_novedad_id) { where += ' AND n.tipo_novedad_id = ?'; binds.push(parseInt(tipo_novedad_id)) }
    if (sala_id) { where += ' AND d.sala_actual_id = ?'; binds.push(parseInt(sala_id)) }
    if (desde) { where += ' AND date(n.fecha_novedad) >= date(?)'; binds.push(desde) }
    if (hasta) { where += ' AND date(n.fecha_novedad) <= date(?)'; binds.push(hasta) }
    const result = await c.env.DB.prepare(`
      SELECT n.id, n.fecha_novedad,
        tn.tipo_novedad,
        d.codigo_patrimonial, d.marca, d.modelo,
        td.nombre_tipo,
        s.nombre_sala,
        u.nombre_completo as registrado_por,
        n.descripcion
      FROM novedades n
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN dispositivos d ON n.dispositivo_id = d.id
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN usuarios u ON n.usuario_registra_id = u.id
      ${where}
      ORDER BY n.fecha_novedad DESC LIMIT 500`).bind(...binds).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTE DE PRÉSTAMOS
// ============================================================
reportes.get('/prestamos', async (c) => {
  try {
    const { estado } = c.req.query()
    let where = 'WHERE 1=1'
    const binds: any[] = []
    if (estado) { where += ' AND pi.estado = ?'; binds.push(estado) }
    const result = await c.env.DB.prepare(`
      SELECT pi.id, pi.estudiante_solicitante,
        pi.fecha_prestamo, pi.fecha_devolucion_esperada, pi.fecha_devolucion_real,
        pi.estado, pi.observaciones,
        d.codigo_patrimonial, d.marca, d.modelo,
        td.nombre_tipo,
        s.nombre_sala,
        u.nombre_completo as profesor_autoriza
      FROM prestamos_internos pi
      LEFT JOIN dispositivos d ON pi.dispositivo_id = d.id
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON pi.profesor_autoriza_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      ${where}
      ORDER BY pi.fecha_prestamo DESC LIMIT 500`).bind(...binds).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// REPORTE DE PROFESORES (listado con número de salas y dispositivos a cargo)
// ============================================================
reportes.get('/profesores', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT pr.id, pr.documento_identidad, pr.departamento,
        u.nombre_completo, u.email, u.activo,
        (SELECT COUNT(*) FROM salas s WHERE s.profesor_custodio_id = pr.id) as salas_a_cargo,
        (SELECT COUNT(*) FROM dispositivos d JOIN salas s ON d.sala_actual_id = s.id WHERE s.profesor_custodio_id = pr.id) as dispositivos_a_cargo,
        (SELECT GROUP_CONCAT(s.nombre_sala, ', ') FROM salas s WHERE s.profesor_custodio_id = pr.id) as salas
      FROM profesores pr
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      ORDER BY u.nombre_completo`).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/reportes/garantias
reportes.get('/garantias', async (c) => {
  try {
    const { sala_id } = c.req.query()
    let where = sala_id ? `AND d.sala_actual_id = ${parseInt(sala_id)}` : ''
    const result = await c.env.DB.prepare(`
      SELECT g.*, d.codigo_patrimonial, d.marca, d.modelo, td.nombre_tipo,
        s.nombre_sala,
        CASE WHEN g.fecha_fin >= date('now') THEN 'Vigente' ELSE 'Vencida' END as estado_garantia,
        CAST(julianday(g.fecha_fin) - julianday('now') AS INTEGER) as dias_restantes
      FROM garantias g
      JOIN dispositivos d ON g.dispositivo_id = d.id
      JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      WHERE 1=1 ${where}
      ORDER BY g.fecha_fin ASC`).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default reportes

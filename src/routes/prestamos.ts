import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const prestamos = new Hono<{ Bindings: Bindings }>()

// GET /api/prestamos
prestamos.get('/', async (c) => {
  try {
    const { estado, profesor_id } = c.req.query()
    let query = `
      SELECT pi.*, d.codigo_patrimonial, d.marca, d.modelo, td.nombre_tipo,
        u.nombre_completo as profesor_nombre, s.nombre_sala
      FROM prestamos_internos pi
      LEFT JOIN dispositivos d ON pi.dispositivo_id = d.id
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN profesores pr ON pi.profesor_autoriza_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      WHERE 1=1`
    const params: any[] = []
    if (estado) { query += ` AND pi.estado = ?`; params.push(estado) }
    // Filtrar por profesor para que solo vea sus propios préstamos
    if (profesor_id) { query += ` AND pi.profesor_autoriza_id = ?`; params.push(parseInt(profesor_id)) }
    query += ` ORDER BY pi.fecha_prestamo DESC`
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/prestamos
prestamos.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { dispositivo_id, profesor_autoriza_id, estudiante_solicitante, fecha_devolucion_esperada, observaciones } = body
    if (!dispositivo_id || !profesor_autoriza_id || !estudiante_solicitante || !fecha_devolucion_esperada) {
      return c.json({ success: false, error: 'Campos obligatorios faltantes' }, 400)
    }
    const device = await c.env.DB.prepare(`SELECT estado_id FROM dispositivos WHERE id=?`).bind(dispositivo_id).first() as any
    if (!device) return c.json({ success: false, error: 'Dispositivo no encontrado' }, 404)
    const result = await c.env.DB.prepare(`
      INSERT INTO prestamos_internos (dispositivo_id, profesor_autoriza_id, estudiante_solicitante, fecha_devolucion_esperada, estado, observaciones)
      VALUES (?, ?, ?, ?, 'Activo', ?)`).bind(dispositivo_id, profesor_autoriza_id, estudiante_solicitante, fecha_devolucion_esperada, observaciones || null).run()
    await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 11, ?, ?)`).bind(dispositivo_id, profesor_autoriza_id, `Préstamo interno a: ${estudiante_solicitante}`).run()
    await c.env.DB.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (?, 'PRESTAMO_CREADO', 'prestamos_internos', ?, ?)`).bind(profesor_autoriza_id, result.meta.last_row_id, `Préstamo a: ${estudiante_solicitante}`).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/prestamos/:id/devolver
prestamos.put('/:id/devolver', async (c) => {
  try {
    const id = c.req.param('id')
    const { observaciones } = await c.req.json().catch(() => ({})) as any
    const prestamo = await c.env.DB.prepare(`SELECT * FROM prestamos_internos WHERE id=?`).bind(id).first() as any
    if (!prestamo) return c.json({ success: false, error: 'Préstamo no encontrado' }, 404)
    const today = new Date().toISOString().split('T')[0]
    await c.env.DB.prepare(`UPDATE prestamos_internos SET estado='Devuelto', fecha_devolucion_real=?, observaciones=? WHERE id=?`).bind(today, observaciones || prestamo.observaciones, id).run()
    await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 12, ?, 'Devolución de préstamo interno')`).bind(prestamo.dispositivo_id, prestamo.profesor_autoriza_id).run()
    await c.env.DB.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (?, 'PRESTAMO_DEVUELTO', 'prestamos_internos', ?, 'Devolución registrada')`).bind(prestamo.profesor_autoriza_id, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default prestamos

import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const novedades = new Hono<{ Bindings: Bindings }>()

// GET /api/novedades
novedades.get('/', async (c) => {
  try {
    const { dispositivo_id, tipo, limit } = c.req.query()
    let query = `
      SELECT n.*, tn.tipo_novedad, u.nombre_completo as usuario_nombre,
        d.codigo_patrimonial, d.marca, d.modelo,
        a.id as acta_id, a.numero_acta, a.fecha_emision, a.firmantes
      FROM novedades n
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN usuarios u ON n.usuario_registra_id = u.id
      LEFT JOIN dispositivos d ON n.dispositivo_id = d.id
      LEFT JOIN actas a ON a.novedad_id = n.id
      WHERE 1=1`
    const params: any[] = []
    if (dispositivo_id) { query += ` AND n.dispositivo_id = ?`; params.push(dispositivo_id) }
    if (tipo) { query += ` AND n.tipo_novedad_id = ?`; params.push(tipo) }
    query += ` ORDER BY n.fecha_novedad DESC LIMIT ?`
    params.push(parseInt(limit || '50'))
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/novedades
novedades.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { dispositivo_id, tipo_novedad_id, descripcion, numero_acta, firmantes, nuevo_estado_id, nueva_sala_id } = body
    if (!dispositivo_id || !tipo_novedad_id) return c.json({ success: false, error: 'Campos obligatorios faltantes' }, 400)
    const novRes = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, ?, 1, ?)`).bind(dispositivo_id, tipo_novedad_id, descripcion || null).run()
    const novId = novRes.meta.last_row_id
    // Crear acta si se proporciona número de acta
    if (numero_acta) {
      await c.env.DB.prepare(`INSERT INTO actas (novedad_id, numero_acta, firmantes) VALUES (?, ?, ?)`).bind(novId, numero_acta, firmantes || null).run()
    }
    // Actualizar estado del dispositivo si se indica
    if (nuevo_estado_id) {
      await c.env.DB.prepare(`UPDATE dispositivos SET estado_id=? WHERE id=?`).bind(nuevo_estado_id, dispositivo_id).run()
    }
    // Actualizar sala si es un movimiento
    if (nueva_sala_id) {
      await c.env.DB.prepare(`UPDATE dispositivos SET sala_actual_id=? WHERE id=?`).bind(nueva_sala_id, dispositivo_id).run()
    }
    await c.env.DB.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (1, 'REGISTRAR_NOVEDAD', 'novedades', ?, ?)`).bind(novId, `Tipo: ${tipo_novedad_id} - Dispositivo: ${dispositivo_id}`).run()
    return c.json({ success: true, data: { id: novId } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/novedades/actas
novedades.get('/actas', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT a.*, n.descripcion as novedad_desc, tn.tipo_novedad, d.codigo_patrimonial, d.marca, d.modelo
      FROM actas a
      LEFT JOIN novedades n ON a.novedad_id = n.id
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN dispositivos d ON n.dispositivo_id = d.id
      ORDER BY a.fecha_emision DESC`).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default novedades

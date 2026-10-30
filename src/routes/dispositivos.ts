import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const dispositivos = new Hono<{ Bindings: Bindings }>()

// Helper: registrar novedad y auditoría
async function logNovedad(db: D1Database, dispId: number, tipoNovId: number, usuarioId: number, descripcion: string) {
  await db.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, ?, ?, ?)`)
    .bind(dispId, tipoNovId, usuarioId, descripcion).run()
}
async function logAuditoria(db: D1Database, usuarioId: number, accion: string, tabla: string, regId: number, detalle: string) {
  await db.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (?, ?, ?, ?, ?)`)
    .bind(usuarioId, accion, tabla, regId, detalle).run()
}

// GET /api/dispositivos - Listar todos con joins
dispositivos.get('/', async (c) => {
  try {
    const { search, estado, sala, tipo } = c.req.query()
    let query = `
      SELECT d.*, 
        td.nombre_tipo, td.vida_util_meses,
        p.nombre_propietario,
        po.nombre_propietario AS nombre_propietario_origen,
        ed.estado as estado_nombre,
        s.nombre_sala, s.ubicacion_fisica,
        pr.id as profesor_id,
        u.nombre_completo as profesor_nombre
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN propietarios po ON d.propietario_origen_id = po.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      WHERE 1=1`
    const params: any[] = []
    if (search) { query += ` AND (d.codigo_patrimonial LIKE ? OR d.marca LIKE ? OR d.modelo LIKE ? OR d.numero_serie LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
    if (estado) { query += ` AND d.estado_id = ?`; params.push(estado) }
    if (sala) { query += ` AND d.sala_actual_id = ?`; params.push(sala) }
    if (tipo) { query += ` AND d.tipo_id = ?`; params.push(tipo) }
    query += ` ORDER BY d.created_at DESC`
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: result.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/dispositivos/:id - Detalle completo
dispositivos.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const device = await c.env.DB.prepare(`
      SELECT d.*, td.nombre_tipo, td.vida_util_meses,
        p.nombre_propietario,
        po.nombre_propietario AS nombre_propietario_origen,
        ed.estado as estado_nombre, s.nombre_sala, s.ubicacion_fisica,
        u.nombre_completo as profesor_nombre
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN propietarios po ON d.propietario_origen_id = po.id
      LEFT JOIN estados_dispositivo ed ON d.estado_id = ed.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      WHERE d.id = ?`).bind(id).first()
    if (!device) return c.json({ success: false, error: 'Dispositivo no encontrado' }, 404)
    const novedades = await c.env.DB.prepare(`
      SELECT n.*, tn.tipo_novedad, u.nombre_completo as usuario_nombre,
        a.id as acta_id, a.numero_acta, a.tipo_acta, a.firmantes, a.archivo_url
      FROM novedades n
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN usuarios u ON n.usuario_registra_id = u.id
      LEFT JOIN actas a ON a.novedad_id = n.id
      WHERE n.dispositivo_id = ? ORDER BY n.fecha_novedad DESC`).bind(id).all()
    const garantias = await c.env.DB.prepare(`SELECT * FROM garantias WHERE dispositivo_id = ? ORDER BY fecha_fin DESC`).bind(id).all()
    const prestamos = await c.env.DB.prepare(`
      SELECT pi.*, u.nombre_completo as profesor_nombre
      FROM prestamos_internos pi
      LEFT JOIN profesores pr ON pi.profesor_autoriza_id = pr.id
      LEFT JOIN usuarios u ON pr.usuario_id = u.id
      WHERE pi.dispositivo_id = ? ORDER BY pi.fecha_prestamo DESC`).bind(id).all()
    // Actas vinculadas (a través de novedades)
    const actas = await c.env.DB.prepare(`
      SELECT a.*, tn.tipo_novedad
      FROM actas a
      JOIN novedades n ON a.novedad_id = n.id
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      WHERE n.dispositivo_id = ? ORDER BY a.fecha_emision DESC`).bind(id).all()
    return c.json({ success: true, data: { ...device, novedades: novedades.results, garantias: garantias.results, prestamos: prestamos.results, actas: actas.results } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/dispositivos - Crear con garantía OPCIONAL + ACTA DE ENTRADA OBLIGATORIA
dispositivos.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const {
      codigo_patrimonial, numero_serie, tipo_id,
      propietario_id,           // propietario ACTUAL (en posesión)
      propietario_origen_id,    // QUIÉN ENTREGÓ el dispositivo al colegio (BLOQUEADO desde aquí en adelante)
      estado_id, sala_actual_id,
      marca, modelo, fecha_adquisicion,
      valor_dispositivo, costo_adquisicion,
      valor_adquisicion,        // legacy
      garantia,                 // opcional
      acta,                     // OBLIGATORIA: { numero_acta, tipo_acta, firmantes, archivo_url?, archivo_pdf_base64?, archivo_pdf_nombre?, archivo_pdf_mime?, observaciones? }
      usuario_id
    } = body

    if (!codigo_patrimonial || !tipo_id || !propietario_id || !estado_id || !sala_actual_id) {
      return c.json({ success: false, error: 'Campos obligatorios faltantes' }, 400)
    }

    // ⚠️ ACTA DE ENTRADA OBLIGATORIA
    if (!acta || !acta.numero_acta || !String(acta.numero_acta).trim()) {
      return c.json({ success: false, error: 'El acta de entrada es OBLIGATORIA. Debe crear una nueva o vincular una existente para registrar el dispositivo.' }, 400)
    }

    const costoFinal = costo_adquisicion ?? valor_adquisicion ?? null
    const valorDispFinal = valor_dispositivo ?? costoFinal
    // Si no se especifica origen explícitamente, usamos el propietario_id como origen (caso simple)
    const origenFinal = propietario_origen_id ?? propietario_id

    const result = await c.env.DB.prepare(`
      INSERT INTO dispositivos (codigo_patrimonial, numero_serie, tipo_id, propietario_id, propietario_origen_id, estado_id, sala_actual_id, marca, modelo, fecha_adquisicion, valor_adquisicion, valor_dispositivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(codigo_patrimonial, numero_serie || null, tipo_id, propietario_id, origenFinal, estado_id, sala_actual_id,
            marca || null, modelo || null, fecha_adquisicion || null, costoFinal, valorDispFinal)
      .run()
    const newId = Number(result.meta.last_row_id)
    const uid = usuario_id || 1

    // Registrar novedad de alta
    const propOrigen = await c.env.DB.prepare(`SELECT nombre_propietario FROM propietarios WHERE id=?`).bind(origenFinal).first() as any
    const propActual = await c.env.DB.prepare(`SELECT nombre_propietario FROM propietarios WHERE id=?`).bind(propietario_id).first() as any
    const descAlta = `Alta inicial. Entregado por: ${propOrigen?.nombre_propietario || '?'} → Propietario actual: ${propActual?.nombre_propietario || '?'}`
    await logNovedad(c.env.DB, newId, 1, uid, descAlta)
    const novedadAlta = await c.env.DB.prepare(`SELECT id FROM novedades WHERE dispositivo_id=? ORDER BY id DESC LIMIT 1`).bind(newId).first() as any

    // Crear garantía si se proporciona
    if (garantia && garantia.fecha_fin) {
      await c.env.DB.prepare(`INSERT INTO garantias (dispositivo_id, proveedor, fecha_inicio, fecha_fin, contacto_soporte, observaciones) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(newId, garantia.proveedor || null, garantia.fecha_inicio || null, garantia.fecha_fin, garantia.contacto_soporte || null, garantia.observaciones || null)
        .run()
    }

    // CREAR / VINCULAR ACTA (obligatoria)
    let actaIdFinal: number
    if (acta.id) {
      // Vincular acta existente: reapuntamos su novedad a la novedad de alta si no tiene
      const existente = await c.env.DB.prepare(`SELECT id FROM actas WHERE id=?`).bind(acta.id).first() as any
      if (!existente) return c.json({ success: false, error: 'Acta especificada no existe' }, 400)
      actaIdFinal = existente.id
      // Re-vincular novedad si está huérfana
      await c.env.DB.prepare(`UPDATE actas SET novedad_id = COALESCE(novedad_id, ?) WHERE id = ?`)
        .bind(novedadAlta.id, actaIdFinal).run()
    } else {
      // Crear nueva acta vinculada a la novedad de alta
      const r = await c.env.DB.prepare(`INSERT INTO actas (novedad_id, numero_acta, tipo_acta, firmantes, archivo_url, archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, observaciones)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(novedadAlta.id, acta.numero_acta, acta.tipo_acta || 'Entrada',
              acta.firmantes || null, acta.archivo_url || null,
              acta.archivo_pdf_base64 || null, acta.archivo_pdf_nombre || null, acta.archivo_pdf_mime || null,
              acta.observaciones || null)
        .run()
      actaIdFinal = Number(r.meta.last_row_id)
    }

    await logAuditoria(c.env.DB, uid, 'ALTA_DISPOSITIVO', 'dispositivos', newId, `Nuevo dispositivo: ${codigo_patrimonial} (${marca || ''} ${modelo || ''}) · Acta vinculada id=${actaIdFinal}`)
    return c.json({ success: true, data: { id: newId, acta_id: actaIdFinal } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/dispositivos/:id - Edita SOLO campos no-sensibles y genera novedades automáticas
dispositivos.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json()
    const { tipo_id, propietario_id, estado_id, sala_actual_id, marca, usuario_id, acta_movimiento } = body
    const uid = usuario_id || 1

    // Leer estado anterior para detectar cambios
    const prev = await c.env.DB.prepare(`
      SELECT d.*, s.nombre_sala as sala_nombre, p.nombre_propietario, e.estado as estado_nombre
      FROM dispositivos d
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      LEFT JOIN estados_dispositivo e ON d.estado_id = e.id
      WHERE d.id = ?`).bind(id).first() as any
    if (!prev) return c.json({ success: false, error: 'Dispositivo no encontrado' }, 404)

    // Solo se actualizan: tipo, propietario, estado, sala, marca
    // NO se modifican: codigo_patrimonial, numero_serie, modelo, fecha_adquisicion, valor_*
    await c.env.DB.prepare(`
      UPDATE dispositivos SET tipo_id=?, propietario_id=?, estado_id=?, sala_actual_id=?, marca=?
      WHERE id=?`)
      .bind(tipo_id ?? prev.tipo_id, propietario_id ?? prev.propietario_id, estado_id ?? prev.estado_id, sala_actual_id ?? prev.sala_actual_id, marca ?? prev.marca, id)
      .run()

    // Detectar cambios y generar novedades automáticas
    const cambios: string[] = []
    let novedadCreadaId: number | null = null

    // Movimiento de sala
    if (sala_actual_id && sala_actual_id != prev.sala_actual_id) {
      const nuevaSala = await c.env.DB.prepare(`SELECT nombre_sala FROM salas WHERE id=?`).bind(sala_actual_id).first() as any
      const desc = `Movimiento: ${prev.sala_nombre || 'sin sala'} → ${nuevaSala?.nombre_sala || 'desconocida'}`
      cambios.push(desc)
      const r = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 2, ?, ?)`).bind(id, uid, desc).run()
      novedadCreadaId = Number(r.meta.last_row_id)
    }
    // Cambio de propietario
    if (propietario_id && propietario_id != prev.propietario_id) {
      const np = await c.env.DB.prepare(`SELECT nombre_propietario FROM propietarios WHERE id=?`).bind(propietario_id).first() as any
      const desc = `Cambio de propietario: ${prev.nombre_propietario || 'sin propietario'} → ${np?.nombre_propietario || 'desconocido'}`
      cambios.push(desc)
      const r = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 13, ?, ?)`).bind(id, uid, desc).run()
      if (!novedadCreadaId) novedadCreadaId = Number(r.meta.last_row_id)
    }
    // Cambio de estado
    if (estado_id && estado_id != prev.estado_id) {
      const ne = await c.env.DB.prepare(`SELECT estado FROM estados_dispositivo WHERE id=?`).bind(estado_id).first() as any
      const desc = `Cambio de estado: ${prev.estado_nombre || 'desconocido'} → ${ne?.estado || 'desconocido'}`
      cambios.push(desc)
      const r = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 14, ?, ?)`).bind(id, uid, desc).run()
      if (!novedadCreadaId) novedadCreadaId = Number(r.meta.last_row_id)
    }
    // Cambio de tipo
    if (tipo_id && tipo_id != prev.tipo_id) {
      cambios.push(`Cambio de tipo de dispositivo (id ${prev.tipo_id} → ${tipo_id})`)
      const r = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 15, ?, ?)`).bind(id, uid, 'Reclasificación de tipo de dispositivo').run()
      if (!novedadCreadaId) novedadCreadaId = Number(r.meta.last_row_id)
    }
    // Edición sin cambios sensibles (solo marca u otros)
    if (cambios.length === 0 && marca && marca !== prev.marca) {
      cambios.push(`Marca actualizada: ${prev.marca || 'sin marca'} → ${marca}`)
      await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 15, ?, ?)`).bind(id, uid, `Marca actualizada: ${prev.marca || 'sin marca'} → ${marca}`).run()
    }

    // Vincular acta opcional si se proporcionó (a la primera novedad creada)
    if (acta_movimiento && acta_movimiento.numero_acta && novedadCreadaId) {
      await c.env.DB.prepare(`INSERT INTO actas (novedad_id, numero_acta, tipo_acta, firmantes, archivo_url, observaciones) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(novedadCreadaId, acta_movimiento.numero_acta, acta_movimiento.tipo_acta || 'Movimiento',
              acta_movimiento.firmantes || null, acta_movimiento.archivo_url || null, acta_movimiento.observaciones || null)
        .run()
    }

    await logAuditoria(c.env.DB, uid, 'EDITAR_DISPOSITIVO', 'dispositivos', id, cambios.length ? cambios.join(' | ') : 'Edición sin cambios significativos')
    return c.json({ success: true, data: { cambios } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/dispositivos/:id - DEPRECADO en v4 (usar POST /api/bajas que exige acta + propietario nuevo)
// Se mantiene como atajo de "baja sin trazabilidad" pero el frontend ya no lo usa.
dispositivos.delete('/:id', async (c) => {
  return c.json({ success: false, error: 'Baja sin acta no permitida. Use el flujo de salida en /api/bajas con acta y nuevo propietario obligatorios.' }, 400)
})

export default dispositivos

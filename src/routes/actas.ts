import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const actas = new Hono<{ Bindings: Bindings }>()

// GET /api/actas - listar todas (sin enviar el base64 del PDF para no inflar la respuesta)
actas.get('/', async (c) => {
  try {
    const { dispositivo_id, tipo_acta } = c.req.query()
    let query = `
      SELECT a.id, a.novedad_id, a.numero_acta, a.fecha_emision, a.firmantes,
        a.tipo_acta, a.archivo_url, a.observaciones,
        a.archivo_pdf_nombre, a.archivo_pdf_mime,
        (CASE WHEN a.archivo_pdf_base64 IS NOT NULL THEN 1 ELSE 0 END) AS tiene_pdf,
        n.descripcion as novedad_desc, tn.tipo_novedad,
        d.id as dispositivo_id, d.codigo_patrimonial, d.marca, d.modelo
      FROM actas a
      LEFT JOIN novedades n ON a.novedad_id = n.id
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN dispositivos d ON n.dispositivo_id = d.id
      WHERE 1=1`
    const params: any[] = []
    if (dispositivo_id) { query += ` AND d.id = ?`; params.push(dispositivo_id) }
    if (tipo_acta) { query += ` AND a.tipo_acta = ?`; params.push(tipo_acta) }
    query += ` ORDER BY a.fecha_emision DESC`
    const r = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: r.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/actas/:id - detalle (sin base64 para listas; usar /pdf para descargar)
actas.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const a = await c.env.DB.prepare(`
      SELECT a.id, a.novedad_id, a.numero_acta, a.fecha_emision, a.firmantes,
        a.tipo_acta, a.archivo_url, a.observaciones,
        a.archivo_pdf_nombre, a.archivo_pdf_mime,
        (CASE WHEN a.archivo_pdf_base64 IS NOT NULL THEN 1 ELSE 0 END) AS tiene_pdf,
        n.descripcion as novedad_desc, tn.tipo_novedad,
        d.id as dispositivo_id, d.codigo_patrimonial, d.marca, d.modelo
      FROM actas a
      LEFT JOIN novedades n ON a.novedad_id = n.id
      LEFT JOIN tipos_novedad tn ON n.tipo_novedad_id = tn.id
      LEFT JOIN dispositivos d ON n.dispositivo_id = d.id
      WHERE a.id = ?`).bind(id).first()
    if (!a) return c.json({ success: false, error: 'Acta no encontrada' }, 404)
    return c.json({ success: true, data: a })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/actas/:id/pdf - descargar el PDF del acta (si tiene)
actas.get('/:id/pdf', async (c) => {
  try {
    const id = c.req.param('id')
    const a = await c.env.DB.prepare(`SELECT archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, numero_acta FROM actas WHERE id=?`).bind(id).first() as any
    if (!a || !a.archivo_pdf_base64) return c.json({ success: false, error: 'No hay PDF para esta acta' }, 404)
    // Decodificar base64 → bytes
    const b64 = String(a.archivo_pdf_base64).replace(/^data:[^;]+;base64,/, '')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const filename = a.archivo_pdf_nombre || `acta-${a.numero_acta || id}.pdf`
    return new Response(bytes, {
      headers: {
        'Content-Type': a.archivo_pdf_mime || 'application/pdf',
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300'
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/actas - crear acta (independiente o vinculada a dispositivo / novedad)
actas.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const {
      novedad_id, dispositivo_id, numero_acta, tipo_acta, firmantes,
      archivo_url, observaciones, usuario_id,
      archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime
    } = body
    if (!numero_acta) return c.json({ success: false, error: 'numero_acta requerido' }, 400)

    let novId = novedad_id
    if (!novId && dispositivo_id) {
      const tipoNovId = 15
      const novRes = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, ?, ?, ?)`)
        .bind(dispositivo_id, tipoNovId, usuario_id || 1, `Documentación: acta ${numero_acta} (${tipo_acta || 'General'})`)
        .run()
      novId = Number(novRes.meta.last_row_id)
    }
    if (!novId) return c.json({ success: false, error: 'Debe proporcionar novedad_id o dispositivo_id' }, 400)

    // Validar tamaño PDF (máx ~5MB en base64 ≈ 6.7M chars)
    if (archivo_pdf_base64 && String(archivo_pdf_base64).length > 7_500_000) {
      return c.json({ success: false, error: 'El PDF supera el tamaño máximo permitido (~5 MB).' }, 413)
    }

    const r = await c.env.DB.prepare(`INSERT INTO actas (novedad_id, numero_acta, tipo_acta, firmantes, archivo_url, archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, observaciones)
                                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(novId, numero_acta, tipo_acta || 'General', firmantes || null, archivo_url || null,
            archivo_pdf_base64 || null, archivo_pdf_nombre || null, archivo_pdf_mime || null,
            observaciones || null)
      .run()
    await c.env.DB.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (?, 'CREAR_ACTA', 'actas', ?, ?)`)
      .bind(usuario_id || 1, r.meta.last_row_id, `Acta ${numero_acta} (${tipo_acta || 'General'})${archivo_pdf_base64 ? ' + PDF' : ''}`).run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/actas/:id - permite también actualizar PDF (si se envía)
actas.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { numero_acta, tipo_acta, firmantes, archivo_url, observaciones,
            archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, eliminar_pdf } = body

    // Si quieren reemplazar/agregar PDF
    if (archivo_pdf_base64) {
      if (String(archivo_pdf_base64).length > 7_500_000) return c.json({ success: false, error: 'PDF excede 5 MB' }, 413)
      await c.env.DB.prepare(`UPDATE actas SET numero_acta=?, tipo_acta=?, firmantes=?, archivo_url=?, observaciones=?,
                                                archivo_pdf_base64=?, archivo_pdf_nombre=?, archivo_pdf_mime=? WHERE id=?`)
        .bind(numero_acta, tipo_acta, firmantes, archivo_url, observaciones,
              archivo_pdf_base64, archivo_pdf_nombre || null, archivo_pdf_mime || 'application/pdf', id).run()
    } else if (eliminar_pdf) {
      await c.env.DB.prepare(`UPDATE actas SET numero_acta=?, tipo_acta=?, firmantes=?, archivo_url=?, observaciones=?,
                                                archivo_pdf_base64=NULL, archivo_pdf_nombre=NULL, archivo_pdf_mime=NULL WHERE id=?`)
        .bind(numero_acta, tipo_acta, firmantes, archivo_url, observaciones, id).run()
    } else {
      await c.env.DB.prepare(`UPDATE actas SET numero_acta=?, tipo_acta=?, firmantes=?, archivo_url=?, observaciones=? WHERE id=?`)
        .bind(numero_acta, tipo_acta, firmantes, archivo_url, observaciones, id).run()
    }
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/actas/:id
actas.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`DELETE FROM actas WHERE id=?`).bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ============================================================
// SOLICITUDES DE IMPRESIÓN
// ============================================================

// GET /api/actas/solicitudes-impresion/all
actas.get('/solicitudes-impresion/all', async (c) => {
  try {
    const { estado } = c.req.query()
    let q = `SELECT si.*, u.nombre_completo as solicitante_nombre, r.nombre_rol,
        d.codigo_patrimonial, d.marca, d.modelo,
        ua.nombre_completo as aprobador_nombre
      FROM solicitudes_impresion si
      LEFT JOIN usuarios u ON si.usuario_solicitante_id = u.id
      LEFT JOIN roles r ON u.rol_id = r.id
      LEFT JOIN dispositivos d ON si.dispositivo_id = d.id
      LEFT JOIN usuarios ua ON si.usuario_aprueba_id = ua.id
      WHERE 1=1`
    const binds: any[] = []
    if (estado) { q += ` AND si.estado = ?`; binds.push(estado) }
    q += ` ORDER BY si.fecha_solicitud DESC LIMIT 100`
    const r = await c.env.DB.prepare(q).bind(...binds).all()
    return c.json({ success: true, data: r.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

actas.post('/solicitudes-impresion', async (c) => {
  try {
    const { usuario_solicitante_id, dispositivo_id, motivo } = await c.req.json()
    if (!usuario_solicitante_id || !dispositivo_id) return c.json({ success: false, error: 'Campos requeridos' }, 400)
    const r = await c.env.DB.prepare(`INSERT INTO solicitudes_impresion (usuario_solicitante_id, dispositivo_id, motivo) VALUES (?, ?, ?)`)
      .bind(usuario_solicitante_id, dispositivo_id, motivo || null).run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

actas.put('/solicitudes-impresion/:id/aprobar', async (c) => {
  try {
    const id = c.req.param('id')
    const { usuario_aprueba_id } = await c.req.json()
    const now = new Date().toISOString()
    await c.env.DB.prepare(`UPDATE solicitudes_impresion SET estado='Aprobada', usuario_aprueba_id=?, fecha_aprobacion=? WHERE id=?`)
      .bind(usuario_aprueba_id, now, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

actas.put('/solicitudes-impresion/:id/rechazar', async (c) => {
  try {
    const id = c.req.param('id')
    const { usuario_aprueba_id } = await c.req.json()
    const now = new Date().toISOString()
    await c.env.DB.prepare(`UPDATE solicitudes_impresion SET estado='Rechazada', usuario_aprueba_id=?, fecha_aprobacion=? WHERE id=?`)
      .bind(usuario_aprueba_id, now, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default actas

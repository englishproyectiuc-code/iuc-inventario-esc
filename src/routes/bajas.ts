import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const bajas = new Hono<{ Bindings: Bindings }>()

// GET /api/bajas - listar bajas con filtros
// Filtros: ?tipo_baja=&tipo_dispositivo_id=&desde=&hasta=
bajas.get('/', async (c) => {
  try {
    const { tipo_baja, tipo_dispositivo_id, desde, hasta } = c.req.query()
    let q = `
      SELECT b.*,
        td.nombre_tipo,
        a.numero_acta AS acta_numero, a.tipo_acta AS acta_tipo, a.archivo_url AS acta_archivo_url,
        (CASE WHEN a.archivo_pdf_base64 IS NOT NULL THEN 1 ELSE 0 END) AS acta_tiene_pdf,
        u.nombre_completo AS usuario_nombre
      FROM bajas_dispositivo b
      LEFT JOIN dispositivos d ON b.dispositivo_id = d.id
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN actas a ON b.acta_id = a.id
      LEFT JOIN usuarios u ON b.usuario_id = u.id
      WHERE 1=1`
    const binds: any[] = []
    if (tipo_baja) { q += ` AND b.tipo_baja = ?`; binds.push(tipo_baja) }
    if (tipo_dispositivo_id) { q += ` AND d.tipo_id = ?`; binds.push(tipo_dispositivo_id) }
    if (desde) { q += ` AND DATE(b.fecha_baja) >= ?`; binds.push(desde) }
    if (hasta) { q += ` AND DATE(b.fecha_baja) <= ?`; binds.push(hasta) }
    q += ` ORDER BY b.fecha_baja DESC`
    const r = await c.env.DB.prepare(q).bind(...binds).all()
    return c.json({ success: true, data: r.results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/bajas/resumen - conteos por tipo de baja y por tipo de dispositivo
bajas.get('/resumen', async (c) => {
  try {
    const porTipoBaja = await c.env.DB.prepare(`
      SELECT tipo_baja, COUNT(*) AS total
      FROM bajas_dispositivo
      GROUP BY tipo_baja
      ORDER BY total DESC`).all()
    const porTipoDispositivo = await c.env.DB.prepare(`
      SELECT td.nombre_tipo, COUNT(*) AS total
      FROM bajas_dispositivo b
      JOIN dispositivos d ON b.dispositivo_id = d.id
      JOIN tipos_dispositivo td ON d.tipo_id = td.id
      GROUP BY td.nombre_tipo
      ORDER BY total DESC`).all()
    const total = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM bajas_dispositivo`).first() as any
    return c.json({ success: true, data: { total: total?.total || 0, por_tipo_baja: porTipoBaja.results, por_tipo_dispositivo: porTipoDispositivo.results } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/bajas/:id - detalle
bajas.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const b = await c.env.DB.prepare(`
      SELECT b.*, td.nombre_tipo,
        a.numero_acta AS acta_numero, a.tipo_acta AS acta_tipo, a.archivo_url AS acta_archivo_url,
        a.firmantes AS acta_firmantes, a.observaciones AS acta_obs,
        (CASE WHEN a.archivo_pdf_base64 IS NOT NULL THEN 1 ELSE 0 END) AS acta_tiene_pdf,
        u.nombre_completo AS usuario_nombre
      FROM bajas_dispositivo b
      LEFT JOIN dispositivos d ON b.dispositivo_id = d.id
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN actas a ON b.acta_id = a.id
      LEFT JOIN usuarios u ON b.usuario_id = u.id
      WHERE b.id = ?`).bind(id).first()
    if (!b) return c.json({ success: false, error: 'Baja no encontrada' }, 404)
    return c.json({ success: true, data: b })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/bajas - DAR DE BAJA un dispositivo
// REGLAS:
//  - acta obligatoria (id de acta existente o objeto con datos para crear nueva)
//  - propietario_nuevo_nombre obligatorio (puede ser texto libre o id de propietario existente)
//  - tipo_baja obligatorio
bajas.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const {
      dispositivo_id,
      tipo_baja, motivo, observaciones,
      propietario_nuevo_id, propietario_nuevo_nombre,
      acta,                       // objeto: { id? | numero_acta, tipo_acta?, firmantes?, archivo_url?, archivo_pdf_base64?, archivo_pdf_nombre?, archivo_pdf_mime?, observaciones? }
      usuario_id
    } = body

    if (!dispositivo_id) return c.json({ success: false, error: 'dispositivo_id requerido' }, 400)
    if (!tipo_baja) return c.json({ success: false, error: 'tipo_baja requerido (Baja, Donación, Venta, Devolución, Pérdida, Obsolescencia, Otro)' }, 400)
    if (!propietario_nuevo_nombre && !propietario_nuevo_id) {
      return c.json({ success: false, error: 'Debe indicar el NUEVO propietario al que va el dispositivo (es obligatorio al sacarlo).' }, 400)
    }
    if (!acta) return c.json({ success: false, error: 'El acta es OBLIGATORIA al dar de baja. Cree una nueva o vincule una existente.' }, 400)
    if (!acta.id && !acta.numero_acta) {
      return c.json({ success: false, error: 'Indique el acta existente (acta.id) o los datos para crear una nueva (acta.numero_acta).' }, 400)
    }

    const uid = usuario_id || 1

    // Cargar snapshot del dispositivo
    const d = await c.env.DB.prepare(`
      SELECT d.*, td.nombre_tipo, s.nombre_sala,
        po.nombre_propietario AS propietario_origen_nombre,
        p.nombre_propietario AS propietario_actual_nombre
      FROM dispositivos d
      LEFT JOIN tipos_dispositivo td ON d.tipo_id = td.id
      LEFT JOIN salas s ON d.sala_actual_id = s.id
      LEFT JOIN propietarios po ON d.propietario_origen_id = po.id
      LEFT JOIN propietarios p ON d.propietario_id = p.id
      WHERE d.id = ?`).bind(dispositivo_id).first() as any
    if (!d) return c.json({ success: false, error: 'Dispositivo no encontrado' }, 404)

    // Resolver nombre del nuevo propietario
    let nuevoNombre = propietario_nuevo_nombre
    if (propietario_nuevo_id && !nuevoNombre) {
      const np = await c.env.DB.prepare(`SELECT nombre_propietario FROM propietarios WHERE id=?`).bind(propietario_nuevo_id).first() as any
      nuevoNombre = np?.nombre_propietario
    }
    if (!nuevoNombre) return c.json({ success: false, error: 'No se pudo resolver el nuevo propietario' }, 400)

    // 1) Crear novedad "Salida de Dispositivo" (tipo_novedad_id = 16)
    const descSalida = `Salida del dispositivo. Tipo: ${tipo_baja}. Propietario actual: ${d.propietario_actual_nombre || '?'} → Nuevo propietario: ${nuevoNombre}. ${motivo ? 'Motivo: ' + motivo : ''}`
    const novRes = await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 16, ?, ?)`)
      .bind(dispositivo_id, uid, descSalida).run()
    const novedadId = Number(novRes.meta.last_row_id)

    // 2) Vincular o crear acta
    let actaId: number
    if (acta.id) {
      const ex = await c.env.DB.prepare(`SELECT id FROM actas WHERE id=?`).bind(acta.id).first() as any
      if (!ex) return c.json({ success: false, error: 'Acta indicada no existe' }, 400)
      actaId = ex.id
      await c.env.DB.prepare(`UPDATE actas SET novedad_id = COALESCE(novedad_id, ?) WHERE id = ?`).bind(novedadId, actaId).run()
    } else {
      const r = await c.env.DB.prepare(`INSERT INTO actas (novedad_id, numero_acta, tipo_acta, firmantes, archivo_url, archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, observaciones)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(novedadId, acta.numero_acta, acta.tipo_acta || 'Salida',
              acta.firmantes || null, acta.archivo_url || null,
              acta.archivo_pdf_base64 || null, acta.archivo_pdf_nombre || null, acta.archivo_pdf_mime || null,
              acta.observaciones || null)
        .run()
      actaId = Number(r.meta.last_row_id)
    }

    // 3) Crear registro inmutable de baja con snapshot
    const numeroActaFinal = acta.numero_acta || (await c.env.DB.prepare(`SELECT numero_acta FROM actas WHERE id=?`).bind(actaId).first() as any)?.numero_acta
    const bajaRes = await c.env.DB.prepare(`
      INSERT INTO bajas_dispositivo
      (dispositivo_id, codigo_patrimonial, numero_serie, marca, modelo, nombre_tipo,
       sala_origen, propietario_origen, propietario_anterior,
       propietario_nuevo_id, propietario_nuevo_nombre,
       tipo_baja, motivo, acta_id, numero_acta, usuario_id, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(dispositivo_id, d.codigo_patrimonial, d.numero_serie || null, d.marca || null, d.modelo || null, d.nombre_tipo || null,
            d.nombre_sala || null, d.propietario_origen_nombre || null, d.propietario_actual_nombre || null,
            propietario_nuevo_id || null, nuevoNombre,
            tipo_baja, motivo || null, actaId, numeroActaFinal || null, uid, observaciones || null)
      .run()
    const bajaId = Number(bajaRes.meta.last_row_id)

    // 4) Actualizar dispositivo: estado=Dado de Baja, propietario_id = nuevo (si tiene id), mantener origen
    const estadoBaja = await c.env.DB.prepare(`SELECT id FROM estados_dispositivo WHERE estado='Dado de Baja'`).first() as any
    const estadoBajaId = estadoBaja?.id || 3
    if (propietario_nuevo_id) {
      await c.env.DB.prepare(`UPDATE dispositivos SET estado_id=?, propietario_id=? WHERE id=?`)
        .bind(estadoBajaId, propietario_nuevo_id, dispositivo_id).run()
      // Novedad de cambio de propietario
      await c.env.DB.prepare(`INSERT INTO novedades (dispositivo_id, tipo_novedad_id, usuario_registra_id, descripcion) VALUES (?, 17, ?, ?)`)
        .bind(dispositivo_id, uid, `Entrega a propietario externo: ${d.propietario_actual_nombre || '?'} → ${nuevoNombre}`).run()
    } else {
      await c.env.DB.prepare(`UPDATE dispositivos SET estado_id=? WHERE id=?`).bind(estadoBajaId, dispositivo_id).run()
    }

    // 5) Auditoría
    await c.env.DB.prepare(`INSERT INTO log_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle) VALUES (?, 'BAJA_DISPOSITIVO', 'bajas_dispositivo', ?, ?)`)
      .bind(uid, bajaId, `Baja (${tipo_baja}) de ${d.codigo_patrimonial} → ${nuevoNombre} · Acta id=${actaId}`).run()

    return c.json({ success: true, data: { id: bajaId, acta_id: actaId, novedad_id: novedadId } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default bajas

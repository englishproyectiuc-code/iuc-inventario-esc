import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const catalogos = new Hono<{ Bindings: Bindings }>()

// Roles
catalogos.get('/roles', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM roles ORDER BY id').all()
  return c.json({ success: true, data: r.results })
})

// Tipos de dispositivo
catalogos.get('/tipos-dispositivo', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM tipos_dispositivo ORDER BY nombre_tipo').all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/tipos-dispositivo', async (c) => {
  const { nombre_tipo, vida_util_meses } = await c.req.json()
  if (!nombre_tipo) return c.json({ success: false, error: 'nombre_tipo requerido' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO tipos_dispositivo (nombre_tipo, vida_util_meses) VALUES (?, ?)').bind(nombre_tipo, vida_util_meses || 60).run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
catalogos.put('/tipos-dispositivo/:id', async (c) => {
  const { nombre_tipo, vida_util_meses } = await c.req.json()
  await c.env.DB.prepare('UPDATE tipos_dispositivo SET nombre_tipo=?, vida_util_meses=? WHERE id=?').bind(nombre_tipo, vida_util_meses || 60, c.req.param('id')).run()
  return c.json({ success: true })
})
catalogos.delete('/tipos-dispositivo/:id', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM tipos_dispositivo WHERE id=?').bind(c.req.param('id')).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'No se puede eliminar: está en uso por dispositivos' }, 400)
  }
})

// Propietarios
catalogos.get('/propietarios', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM propietarios ORDER BY nombre_propietario').all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/propietarios', async (c) => {
  const { nombre_propietario, nit } = await c.req.json()
  if (!nombre_propietario) return c.json({ success: false, error: 'nombre_propietario requerido' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO propietarios (nombre_propietario, nit) VALUES (?, ?)').bind(nombre_propietario, nit || null).run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
catalogos.put('/propietarios/:id', async (c) => {
  const { nombre_propietario, nit } = await c.req.json()
  await c.env.DB.prepare('UPDATE propietarios SET nombre_propietario=?, nit=? WHERE id=?').bind(nombre_propietario, nit || null, c.req.param('id')).run()
  return c.json({ success: true })
})
catalogos.delete('/propietarios/:id', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM propietarios WHERE id=?').bind(c.req.param('id')).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'No se puede eliminar: está en uso' }, 400)
  }
})

// Estados
catalogos.get('/estados', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM estados_dispositivo ORDER BY estado').all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/estados', async (c) => {
  const { estado } = await c.req.json()
  if (!estado) return c.json({ success: false, error: 'estado requerido' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO estados_dispositivo (estado) VALUES (?)').bind(estado).run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
catalogos.put('/estados/:id', async (c) => {
  const { estado } = await c.req.json()
  await c.env.DB.prepare('UPDATE estados_dispositivo SET estado=? WHERE id=?').bind(estado, c.req.param('id')).run()
  return c.json({ success: true })
})
catalogos.delete('/estados/:id', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM estados_dispositivo WHERE id=?').bind(c.req.param('id')).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'No se puede eliminar: está en uso' }, 400)
  }
})

// Tipos de novedad
catalogos.get('/tipos-novedad', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM tipos_novedad ORDER BY tipo_novedad').all()
  return c.json({ success: true, data: r.results })
})

// Salas
catalogos.get('/salas', async (c) => {
  const { profesor_id } = c.req.query()
  let query = `
    SELECT s.*, u.nombre_completo as profesor_nombre, pr.documento_identidad,
      (SELECT COUNT(*) FROM dispositivos d WHERE d.sala_actual_id = s.id AND d.estado_id != 3) as total_dispositivos
    FROM salas s
    LEFT JOIN profesores pr ON s.profesor_custodio_id = pr.id
    LEFT JOIN usuarios u ON pr.usuario_id = u.id`
  if (profesor_id) {
    query += ` WHERE s.profesor_custodio_id = ?`
    const r = await c.env.DB.prepare(query + ' ORDER BY s.nombre_sala').bind(profesor_id).all()
    return c.json({ success: true, data: r.results })
  }
  const r = await c.env.DB.prepare(query + ' ORDER BY s.nombre_sala').all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/salas', async (c) => {
  const { nombre_sala, ubicacion_fisica, profesor_custodio_id } = await c.req.json()
  if (!nombre_sala || !profesor_custodio_id) return c.json({ success: false, error: 'Faltan campos obligatorios' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO salas (nombre_sala, ubicacion_fisica, profesor_custodio_id) VALUES (?, ?, ?)').bind(nombre_sala, ubicacion_fisica || null, profesor_custodio_id).run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
catalogos.put('/salas/:id', async (c) => {
  const { nombre_sala, ubicacion_fisica, profesor_custodio_id } = await c.req.json()
  await c.env.DB.prepare('UPDATE salas SET nombre_sala=?, ubicacion_fisica=?, profesor_custodio_id=? WHERE id=?').bind(nombre_sala, ubicacion_fisica, profesor_custodio_id, c.req.param('id')).run()
  return c.json({ success: true })
})
catalogos.delete('/salas/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM salas WHERE id=?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// Profesores
catalogos.get('/profesores', async (c) => {
  const r = await c.env.DB.prepare(`
    SELECT pr.*, u.nombre_completo, u.email, u.activo, r.nombre_rol,
      (SELECT COUNT(*) FROM salas s WHERE s.profesor_custodio_id = pr.id) as salas_a_cargo
    FROM profesores pr
    LEFT JOIN usuarios u ON pr.usuario_id = u.id
    LEFT JOIN roles r ON u.rol_id = r.id
    ORDER BY u.nombre_completo`).all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/profesores', async (c) => {
  const { nombre_completo, email, documento_identidad, departamento, password } = await c.req.json()
  if (!nombre_completo || !email || !documento_identidad) return c.json({ success: false, error: 'Faltan campos obligatorios' }, 400)
  const usuRes = await c.env.DB.prepare(`INSERT INTO usuarios (rol_id, nombre_completo, email, password_hash, activo) VALUES (5, ?, ?, ?, 1)`).bind(nombre_completo, email, password || 'prof123').run()
  const profRes = await c.env.DB.prepare('INSERT INTO profesores (usuario_id, documento_identidad, departamento) VALUES (?, ?, ?)').bind(usuRes.meta.last_row_id, documento_identidad, departamento || null).run()
  return c.json({ success: true, data: { id: profRes.meta.last_row_id } }, 201)
})
catalogos.put('/profesores/:id', async (c) => {
  const { nombre_completo, email, documento_identidad, departamento } = await c.req.json()
  const prof = await c.env.DB.prepare('SELECT usuario_id FROM profesores WHERE id=?').bind(c.req.param('id')).first() as any
  if (!prof) return c.json({ success: false, error: 'Profesor no encontrado' }, 404)
  await c.env.DB.prepare('UPDATE usuarios SET nombre_completo=?, email=? WHERE id=?').bind(nombre_completo, email, prof.usuario_id).run()
  await c.env.DB.prepare('UPDATE profesores SET documento_identidad=?, departamento=? WHERE id=?').bind(documento_identidad, departamento, c.req.param('id')).run()
  return c.json({ success: true })
})

// Usuarios - listar todos (solo tesorero)
catalogos.get('/usuarios', async (c) => {
  const r = await c.env.DB.prepare(`SELECT u.*, r.nombre_rol FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id ORDER BY u.nombre_completo`).all()
  return c.json({ success: true, data: r.results })
})
// Crear usuario (tesorero)
catalogos.post('/usuarios', async (c) => {
  const { nombre_completo, email, password_hash, rol_id, activo } = await c.req.json()
  if (!nombre_completo || !email || !password_hash || !rol_id) return c.json({ success: false, error: 'Faltan campos' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO usuarios (nombre_completo, email, password_hash, rol_id, activo) VALUES (?,?,?,?,?)').bind(nombre_completo, email, password_hash, rol_id, activo ?? 1).run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
// Cambiar contraseña
catalogos.put('/usuarios/:id/password', async (c) => {
  const { password_hash } = await c.req.json()
  await c.env.DB.prepare('UPDATE usuarios SET password_hash=? WHERE id=?').bind(password_hash, c.req.param('id')).run()
  return c.json({ success: true })
})
// Activar/desactivar usuario
catalogos.put('/usuarios/:id/toggle', async (c) => {
  const u = await c.env.DB.prepare('SELECT activo FROM usuarios WHERE id=?').bind(c.req.param('id')).first() as any
  if (!u) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
  await c.env.DB.prepare('UPDATE usuarios SET activo=? WHERE id=?').bind(u.activo ? 0 : 1, c.req.param('id')).run()
  return c.json({ success: true })
})

// Solicitudes de reporte
catalogos.get('/solicitudes-reporte', async (c) => {
  const r = await c.env.DB.prepare(`
    SELECT sr.*, u.nombre_completo as solicitante_nombre, r.nombre_rol,
      ua.nombre_completo as aprobador_nombre
    FROM solicitudes_reporte sr
    LEFT JOIN usuarios u ON sr.usuario_solicitante_id = u.id
    LEFT JOIN roles r ON u.rol_id = r.id
    LEFT JOIN usuarios ua ON sr.usuario_aprueba_id = ua.id
    ORDER BY sr.fecha_solicitud DESC LIMIT 100`).all()
  return c.json({ success: true, data: r.results })
})
catalogos.post('/solicitudes-reporte', async (c) => {
  const { usuario_solicitante_id, parametros_reporte } = await c.req.json()
  if (!usuario_solicitante_id || !parametros_reporte) return c.json({ success: false, error: 'Faltan campos' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO solicitudes_reporte (usuario_solicitante_id, parametros_reporte, estado) VALUES (?,?,?)').bind(usuario_solicitante_id, parametros_reporte, 'Pendiente').run()
  return c.json({ success: true, data: { id: r.meta.last_row_id } }, 201)
})
catalogos.put('/solicitudes-reporte/:id/aprobar', async (c) => {
  const { usuario_aprueba_id } = await c.req.json()
  const now = new Date().toISOString()
  await c.env.DB.prepare('UPDATE solicitudes_reporte SET estado=?, usuario_aprueba_id=?, fecha_aprobacion=? WHERE id=?').bind('Aprobada', usuario_aprueba_id, now, c.req.param('id')).run()
  return c.json({ success: true })
})
catalogos.put('/solicitudes-reporte/:id/rechazar', async (c) => {
  const { usuario_aprueba_id } = await c.req.json()
  const now = new Date().toISOString()
  await c.env.DB.prepare('UPDATE solicitudes_reporte SET estado=?, usuario_aprueba_id=?, fecha_aprobacion=? WHERE id=?').bind('Rechazada', usuario_aprueba_id, now, c.req.param('id')).run()
  return c.json({ success: true })
})

export default catalogos

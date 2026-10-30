# 📚 Sistema de Inventario Tecnológico Escolar

Aplicación web completa para la **gestión integral del inventario tecnológico de un colegio**: computadores, Smart TVs, tablets, proyectores, impresoras, cámaras, gafas VR, etc. Cubre **salas, custodios, garantías, préstamos, novedades, actas, reportes, auditoría y solicitudes de impresión** con control de acceso por rol.

> Desarrollado con **Hono + Cloudflare Pages + D1 (SQLite)** — arquitectura *edge-first*, sin servidores tradicionales, despliegue global instantáneo.

---

## 🆕 Novedades v4 (junio 2026)

- 🔒 **Acta OBLIGATORIA al ingresar un dispositivo** — no se puede registrar un dispositivo sin acta firmada. Se puede **crear el acta en el mismo formulario** (modo "nueva") o **vincular una existente** (modo "vincular").
- 🔒 **Acta OBLIGATORIA al sacar / dar de baja** — mismo principio. Vincular o crear nueva acta, sin excepciones.
- 📎 **Subida de PDFs a las actas** — el PDF firmado escaneado se almacena (base64) en D1 (máx ~5 MB) y se descarga vía `GET /api/actas/:id/pdf`.
- 👥 **Doble propietario** por dispositivo:
  - `propietario_origen_id` — quien ENTREGÓ el dispositivo (p. ej. Alcaldía). **Bloqueado de por vida** una vez creado.
  - `propietario_id` — quién lo posee AHORA (típicamente el colegio).
- 📤 **Nuevo propietario obligatorio al sacar** — al dar de baja un dispositivo debe indicarse a qué propietario / entidad va el dispositivo cuando sale (texto libre o selección del catálogo).
- 🗂️ **Lista de Bajas** — nueva tabla independiente `bajas_dispositivo` con **snapshot inmutable** (los nombres de propietarios, sala y tipo se copian al momento de la baja). Disponible para Tesorero, Rector y Contador con filtros por tipo de baja, tipo de dispositivo y fecha.
- 📖 **Historia clara del dispositivo**: `Origen (entregó) → Colegio (posee) → Nuevo propietario (al salir)`.

---

## 🌐 URLs

- **Local (sandbox):** http://localhost:3000
- **Servicio público actual:** https://3000-iovyexaena0jgvo07bnqv-5634da27.sandbox.novita.ai
- **Producción Cloudflare Pages:** *(pendiente de configurar — ver sección "Despliegue")*
- **GitHub:** *(pendiente de inicializar repo remoto)*

---

## 👥 Usuarios de prueba (cargados por el seed)

| Rol | Email | Contraseña | Capacidades |
|---|---|---|---|
| 🏛️ Tesorero | `tesorero@colegio.edu.co` | `tesorero123` | TODO (CRUD completo, catálogos, auditoría, reportes, imprimir) |
| 🎓 Rector | `rector@colegio.edu.co` | `rector123` | Lectura global + solicitar reportes + solicitar impresión |
| 💰 Contador | `contador@colegio.edu.co` | `contador123` | Lectura financiera + reportes contables + solicitar impresión |
| 👨‍🏫 Profesor | `prof1@colegio.edu.co` | `prof123` | Solo SUS salas + préstamos a estudiantes + solicitar impresión |

---

## ✨ Features actualmente completados

### 🔐 Autenticación y roles
- Login con email/contraseña, hashing simple compatible Cloudflare Workers
- 4 roles con permisos diferenciados: **Tesorero, Rector, Contador, Profesor**
- Cambio de contraseña inline (modal estilizado)
- Sidebar dinámico que se construye según los permisos del rol

### 📦 Gestión de dispositivos
- **CRUD completo** con filtros (búsqueda, estado, sala, tipo)
- **Campos sensibles bloqueados en edición**: código patrimonial, número de serie, modelo, fecha de adquisición, valor del dispositivo y costo de adquisición **no se pueden modificar** una vez registrados (ni siquiera desde la API: el backend ignora esos campos en `PUT`)
- **Dos campos económicos separados**:
  - `valor_dispositivo` → valor real del aparato (referencia de mercado)
  - `valor_adquisicion` (costo de adquisición) → lo que pagó el colegio (0 si fue donado)
- **Garantía y acta de entrada inline al crear** (secciones colapsables “¿quieres agregar una garantía?” / “¿quieres vincular un acta?”)
- **Generación automática de novedades** cuando se cambia: sala, propietario, estado o tipo. El usuario **no tiene que crear novedades manuales** al mover un dispositivo
- **Confirmación bonita "¿estás seguro?"** antes de guardar cambios críticos (movimientos/cambio de propietario), con explicación de qué pasará y referencia al flujo de actas
- **Acta de movimiento inline en edición** para vincular el acta firmada al movimiento que se va a realizar
- **Baja lógica** (no destruye datos, marca como “Dado de Baja” y registra novedad)
- **Ver detalle** con datos completos, historial de novedades, garantías y actas vinculadas
- **Impresión profesional** de la ficha del dispositivo (Tesorero) con todos los datos: identificación, ubicación, financieros, historial de novedades, garantías y actas
- **Solicitud de impresión** (Rector, Contador, Profesor) → crea automáticamente una solicitud que el Tesorero puede aprobar

### 🚪 Salas
- CRUD con asignación de **profesor custodio**
- Vista de tarjetas con contador de dispositivos por sala
- Profesores solo ven SUS salas (las demás aparecen bloqueadas con candado)

### 👨‍🏫 Profesores y usuarios
- Alta de profesores (crea usuario automáticamente con contraseña inicial)
- Tesorero puede gestionar usuarios y cambiar contraseñas

### 📝 Novedades
- Tipos: Alta, Movimiento de Sala, Cambio de Custodia, Cambio de Propietario, Cambio de Estado, Edición de Datos, Baja/Retiro, etc.
- Registro manual (modal `modal-novedad`) + **registro automático** desde dispositivos

### 📄 Actas
- **CRUD completo independiente** (botón “Nueva Acta”)
- Tipos: Entrada, Movimiento, Salida, Mantenimiento, Baja, Cambio de Custodia, Cambio de Propietario, General
- Campo flexible para adjuntar **enlace a documento** (Drive, intranet, ruta interna) — NO se obliga a subir PDF
- Vinculación opcional a un dispositivo (crea novedad “documental” si no hay novedad previa)
- Listado con tipo, dispositivo vinculado, fecha, firmantes y acciones (editar / eliminar)
- Solo el Tesorero puede crear / editar / eliminar actas

### 🛡️ Garantías
- Control de vigencia, días restantes, alertas visuales (vencida / por vencer / vigente)
- Reporte exportable
- Alta inline al crear el dispositivo

### 🤝 Préstamos internos (Profesores)
- Préstamo a estudiantes con fecha de devolución esperada
- Marcado visual de **vencidos** en rojo
- Confirmación estilizada al registrar devolución

### 📊 Reportes (Tesorero, Rector, Contador)
- Inventario completo (con filtro por sala)
- Por tipo de dispositivo (todos los tipos del catálogo)
- Por estado (todos los estados)
- Por propietario (todos los propietarios)
- Por sala
- Financiero (valores agrupados por tipo, propietario, estado)
- Garantías (vigentes / vencidas / por vencer)
- Novedades, Préstamos, Profesores, Auditoría
- **Exportación a CSV** con un click

### 🔍 Auditoría
- **Reporte detallado por usuario** (resumen agrupado con contador de acciones por tipo)
- Tabla cronológica completa con: fecha, usuario, rol, acción, tabla afectada, registro y detalle
- Inmutable: solo INSERTs, nunca UPDATEs ni DELETEs

### 🗂️ Catálogos (Tesorero)
- Tipos de dispositivo, Propietarios, Estados, Roles
- **Botones Ver / Editar / Borrar bonitos** (reemplazan los antiguos `prompt()` del navegador)
- Modal estilizado `modal-catalogo-item` para crear y editar
- Solicitud de borrado con confirmación

### 🎨 Sistema UI/UX
- **Pretty Dialog** propio (`prettyAlert`, `prettyConfirm`, `prettyPrompt`) que reemplaza todos los `alert/confirm/prompt` nativos del navegador
- Iconos por tipo (info / warn / danger / success / question) con colores y fondos coherentes
- Soporte para campo de explicación adicional (cuadro azul) — usado en confirmaciones críticas
- Bloqueado por overlay con `backdrop-filter: blur`
- **Estilos de impresión** (`@media print`, `#print-area`, `print-only`, `no-print`) para que al imprimir solo aparezca el contenido relevante

---

## 📋 URIs funcionales (API)

### Autenticación
- `POST /api/auth/login` → `{ email, password }`
- `POST /api/auth/change-password` → `{ user_id, new_password }`

### Dispositivos
- `GET  /api/dispositivos` *(filtros: `?search=&estado=&sala=&tipo=`)* — incluye `nombre_propietario_origen`
- `GET  /api/dispositivos/:id` → incluye `novedades[]`, `garantias[]`, `prestamos[]`, `actas[]`, `nombre_propietario`, `nombre_propietario_origen`
- `POST /api/dispositivos` → **acta OBLIGATORIA**. Soporta:
  - `propietario_origen_id` *(bloqueado de por vida tras creación)*
  - `garantia:{...}` opcional
  - `acta:{id}` para vincular existente **O** `acta:{numero_acta, tipo_acta, firmantes, archivo_url, archivo_pdf_base64, archivo_pdf_nombre, archivo_pdf_mime, observaciones}` para crear nueva (con PDF inline)
- `PUT  /api/dispositivos/:id` → **solo modifica** `tipo_id, propietario_id, estado_id, sala_actual_id, marca`. Genera novedades automáticas. Soporta `acta_movimiento:{...}` inline
- `DELETE /api/dispositivos/:id` → **DEPRECADO en v4**: la baja ahora requiere usar `POST /api/bajas` (con acta y nuevo propietario obligatorios)

### Bajas (v4 — registro inmutable de salidas)
- `GET    /api/bajas` *(filtros: `?tipo_baja=&tipo_dispositivo_id=&desde=&hasta=`)*
- `GET    /api/bajas/resumen` → conteos por tipo de baja y tipo de dispositivo
- `GET    /api/bajas/:id` → detalle completo incluido el acta vinculada
- `POST   /api/bajas` → **acta + nuevo propietario + tipo_baja OBLIGATORIOS**. Body:
  ```json
  {
    "dispositivo_id": 5,
    "tipo_baja": "Donación",  // Baja | Donación | Venta | Devolución | Pérdida | Obsolescencia | Otro
    "motivo": "...",
    "observaciones": "...",
    "propietario_nuevo_id": 7,           // opcional (catálogo)
    "propietario_nuevo_nombre": "Fundación X",  // o texto libre
    "acta": { "id": 3 }                  // vincular existente
    // o bien:
    // "acta": { "numero_acta":"ACT-...", "tipo_acta":"Salida", "firmantes":"...", "archivo_pdf_base64":"data:application/pdf;base64,...", "archivo_pdf_nombre":"acta.pdf", "archivo_pdf_mime":"application/pdf" }
  }
  ```
  → Crea novedad "Salida de Dispositivo" (tipo 16), vincula/crea acta, **inserta snapshot inmutable** en `bajas_dispositivo` (con nombres copiados), actualiza dispositivo a estado "Dado de Baja" y propietario al nuevo si se eligió uno del catálogo.

### Catálogos
- `GET/POST/PUT/DELETE /api/catalogos/tipos-dispositivo[/:id]`
- `GET/POST/PUT/DELETE /api/catalogos/propietarios[/:id]`
- `GET/POST/PUT/DELETE /api/catalogos/estados[/:id]`
- `GET /api/catalogos/roles`
- `GET/POST/PUT /api/catalogos/salas[/:id]`
- `GET/POST/PUT /api/catalogos/profesores[/:id]`
- `GET /api/catalogos/tipos-novedad`

### Actas (v4 — con soporte de PDF)
- `GET    /api/actas` *(filtros: `?dispositivo_id=&tipo_acta=`)* — devuelve `tiene_pdf` (no el base64)
- `GET    /api/actas/:id` — metadatos del acta (sin base64)
- `GET    /api/actas/:id/pdf` → **descarga binaria del PDF** (Content-Type: application/pdf, Content-Disposition: inline)
- `POST   /api/actas` → puede vincularse a novedad existente o crear novedad documental. Acepta `archivo_pdf_base64 / archivo_pdf_nombre / archivo_pdf_mime` (máx ~5 MB)
- `PUT    /api/actas/:id` → permite reemplazar el PDF (enviando nuevo base64), eliminarlo (`eliminar_pdf:true`) o sólo actualizar metadatos
- `DELETE /api/actas/:id`

### Solicitudes de impresión
- `GET  /api/actas/solicitudes-impresion/all` *(filtro: `?estado=`)*
- `POST /api/actas/solicitudes-impresion` → `{ usuario_solicitante_id, dispositivo_id, motivo }`
- `PUT  /api/actas/solicitudes-impresion/:id/aprobar` → `{ usuario_aprueba_id }`
- `PUT  /api/actas/solicitudes-impresion/:id/rechazar` → `{ usuario_aprueba_id }`

### Novedades
- `GET  /api/novedades` *(filtros)*
- `POST /api/novedades` *(con opción de acta vinculada)*
- `GET  /api/novedades/actas` *(legacy — se mantiene por compatibilidad)*

### Préstamos
- `GET  /api/prestamos`
- `POST /api/prestamos`
- `PUT  /api/prestamos/:id/devolver`

### Reportes
- `GET /api/reportes/inventario-completo`
- `GET /api/reportes/por-tipo/:id`
- `GET /api/reportes/por-estado/:id`
- `GET /api/reportes/por-propietario/:id`
- `GET /api/reportes/por-sala/:id`
- `GET /api/reportes/financiero`
- `GET /api/reportes/garantias`
- `GET /api/reportes/novedades`
- `GET /api/reportes/prestamos`
- `GET /api/reportes/profesores`
- `GET /api/reportes/auditoria`

### Solicitudes de reportes
- `GET/POST /api/solicitudes-reporte`

---

## 🗂️ Arquitectura de datos

### Servicios de almacenamiento
- **Cloudflare D1** (SQLite distribuida) — única fuente de verdad
- Migraciones versionadas en `migrations/` (4 hasta hoy: `0001_initial_schema`, `0002_seed_data`, `0003_mejoras`, `0004_propietarios_y_bajas`)

### Modelo de datos (19 tablas — incluye `bajas_dispositivo` v4)

| Tabla | Propósito |
|---|---|
| `roles` | Catálogo de roles (Tesorero, Rector, Contador, Profesor) |
| `usuarios` | Cuentas (email, password hash, rol) |
| `profesores` | Perfil docente (documento, departamento) ↔ `usuarios` |
| `salas` | Aulas/laboratorios con `profesor_custodio_id` |
| `tipos_dispositivo` | Catálogo de tipos + vida útil en meses |
| `propietarios` | Quién es dueño legal (escuela, alcaldía, donante…) |
| `estados_dispositivo` | Estados (Activo, En Mantenimiento, Dado de Baja, etc.) |
| `dispositivos` | Inventario maestro |
| `tipos_novedad` | Catálogo de eventos posibles (Alta, Movimiento, Cambio…) |
| `novedades` | **Trazabilidad inmutable** de cada cambio en un dispositivo |
| `actas` | Documentación formal (vinculadas a una novedad) |
| `adjuntos_acta` | Archivos físicos adjuntos a un acta (no usado en v3) |
| `garantias` | Vigencia y soporte de proveedor |
| `prestamos_internos` | Préstamos a estudiantes (privado por profesor/sala) |
| `solicitudes_reporte` | Pedidos de Rector/Contador al Tesorero |
| `solicitudes_impresion` | **(nuevo v3)** Pedidos de impresión de ficha de dispositivo |
| `log_auditoria` | **Inmutable**: cada acción se registra aquí |
| *(views internas auxiliares)* | — |

### Columnas clave por defecto (Cloudflare D1)
- `valor_dispositivo` (nuevo v3) → valor real
- `valor_adquisicion` (legacy) → costo pagado por el colegio
- `actas.tipo_acta` (nuevo v3) → Entrada / Movimiento / Salida / Mantenimiento / Baja…
- `actas.archivo_url` (nuevo v3) → enlace al documento

---

## 🧭 Flujo de datos (visión rápida)

```
[ Frontend SSR único getHTML() en index.tsx ]
            │
            │ axios (REST JSON)
            ▼
[ Hono (TypeScript) en src/routes/*.ts ]
            │
            │ c.env.DB.prepare(...).run/all/first
            ▼
[ Cloudflare D1 (SQLite distribuida) ]
            │
            │ Reglas:
            │  - Cada PUT/POST/DELETE → log_auditoria
            │  - Cada cambio en dispositivo crítico → novedad automática
            │  - Actas vinculadas a novedades (1 acta ↔ 1 novedad)
            ▼
[ Persistencia + Reportes + Trazabilidad ]
```

---

## 🧑‍💻 Guía rápida de uso

### Como Tesorero
1. Inicia sesión con `tesorero@colegio.edu.co / tesorero123`
2. Ve a **Dispositivos** → *Nuevo Dispositivo* → llena los datos. Si quieres, despliega *“¿Agregar una garantía?”* o *“¿Vincular un acta de entrada?”* y se guardan en la misma operación.
3. Para mover un dispositivo: click en **Editar**, cambia la sala. Aparecerá una confirmación bonita explicándote qué pasará. Si tienes un acta firmada, su número va en *“¿Vincular un acta a este movimiento?”*. Al guardar, **se registra automáticamente la novedad**.
4. Ve a **Actas → Nueva Acta** para crear actas independientes (mantenimientos, salidas, etc.).
5. Ve a **Catálogos** → tienes botones ojo (ver) / editar / borrar.
6. Ve a **Auditoría** → ves resumen por usuario + tabla detallada.
7. Para imprimir una ficha: **Ver Detalle → Imprimir**.

### Como Rector / Contador / Profesor
- Mismo flujo de visualización, pero los botones de creación/edición están ocultos.
- En **Ver Detalle** verás **“Solicitar Imprimir”** en vez de “Imprimir”. Al pulsarlo se te pide un motivo y se manda al Tesorero.

---

## 🚀 Instalación y desarrollo local

```bash
# 1. Instalar dependencias
cd /home/user/webapp
npm install

# 2. Aplicar migraciones a la DB local de wrangler
npm run db:migrate:local

# 3. Cargar datos de prueba
npm run db:seed

# 4. Compilar
npm run build

# 5. Lanzar con PM2 (recomendado)
pm2 start ecosystem.config.cjs

# 6. Probar
curl http://localhost:3000/api/catalogos/tipos-dispositivo
```

### Comandos útiles
```bash
npm run db:reset           # borra y vuelve a crear la DB local con seed
npm run db:console:local   # consola SQL de la DB local
pm2 logs --nostream        # ver logs sin bloquear
pm2 restart inventario-escolar
```

---

## ☁️ Despliegue (Cloudflare Pages)

```bash
# 1) Crear DB de producción (una vez)
npx wrangler d1 create inventario-escolar-production
# → copia el database_id que te devuelve en wrangler.jsonc

# 2) Aplicar migraciones en producción
npx wrangler d1 migrations apply inventario-escolar-production

# 3) Build y deploy
npm run build
npx wrangler pages deploy dist --project-name inventario-escolar
```

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | [Hono](https://hono.dev/) 4 + TypeScript (corre sobre Cloudflare Workers) |
| DB | Cloudflare D1 (SQLite) — local con `--local` |
| Frontend | SSR vía string template en `index.tsx`, hidratado con vanilla JS |
| CSS | Tailwind CSS por CDN + estilos custom inline (≈900 líneas) |
| Iconos | Font Awesome 6 (CDN) |
| Gráficos | Chart.js (CDN) |
| HTTP cliente | Axios (CDN) |
| Build | Vite 6 + `@hono/vite-cloudflare-pages` |
| Dev server | Wrangler 3 + PM2 |
| Persistencia | Cloudflare D1 + migraciones versionadas |

---

## 📂 Estructura del proyecto

```
webapp/
├── migrations/
│   ├── 0001_initial_schema.sql       # 16 tablas base
│   ├── 0002_seed_data.sql            # datos de prueba (4 roles, 4 usuarios, 10 dispositivos…)
│   └── 0003_mejoras.sql              # v3: valor_dispositivo, tipo_acta, archivo_url, solicitudes_impresion, tipos_novedad 2/3/13/14/15
├── src/
│   ├── index.tsx                     # Entrada principal: rutas, HTML SSR, CSS, JS (~2470 líneas)
│   ├── renderer.tsx                  # Plantilla HTML base
│   └── routes/
│       ├── auth.ts                   # login, cambio de contraseña
│       ├── dispositivos.ts           # CRUD + helpers logNovedad/logAuditoria + auto-novedades en PUT
│       ├── catalogos.ts              # CRUD de tipos, propietarios, estados, salas, profesores, roles
│       ├── novedades.ts              # alta manual + lista (legacy)
│       ├── actas.ts                  # (nuevo v3) CRUD + solicitudes_impresion
│       ├── prestamos.ts              # préstamos a estudiantes
│       ├── reportes.ts               # endpoints de reportes y auditoría
│       └── solicitudes.ts            # solicitudes de reporte
├── public/                           # estáticos (favicon, etc.)
├── dist/                             # build (generado por vite)
├── .wrangler/                        # estado local de D1 (no commitear)
├── ecosystem.config.cjs              # PM2: lanza wrangler pages dev en puerto 3000
├── wrangler.jsonc                    # config Cloudflare (binding DB → inventario-escolar-production)
├── vite.config.ts                    # plugin @hono/vite-cloudflare-pages
├── package.json                      # scripts: dev, build, deploy, db:*, etc.
└── README.md                         # este documento
```

---

## 🧱 Cómo funciona internamente (por capa)

### 1) Capa de presentación (SSR en `index.tsx`)
Todo el HTML, CSS y JS del cliente está dentro de una sola función `getHTML()` que se sirve desde `app.get('/', ...)`. **No hay framework de UI** — vanilla JS + axios + Tailwind. Esto mantiene el bundle pequeño (≈238 kB) y compatible con Cloudflare Workers.

### 2) Pretty Dialog (reemplazo de alert/confirm/prompt)
Tres funciones JS que devuelven Promesas:
```js
prettyAlert({ kind, title, message, explain, okText })
prettyConfirm({ kind, title, message, explain, okText, cancelText, danger })
prettyPrompt({ kind, title, message, placeholder, defaultValue, okText })
```
Todas usan el overlay `#pretty-dialog` con iconos diferenciados (info / warn / danger / success / question). El kind controla color del icono y fondo de la “píldora” circular superior. `explain` es un cuadro azul para dar contexto adicional (usado en confirmaciones críticas).

### 3) Helpers backend (en `dispositivos.ts`)
```ts
logNovedad(db, dispId, tipoNovId, usuarioId, descripcion)
logAuditoria(db, usuarioId, accion, tabla, regId, detalle)
```
Garantizan que cualquier cambio quede registrado en `novedades` (visible al usuario) y en `log_auditoria` (técnico, para reporte de auditoría).

### 4) Auto-novedades en PUT de dispositivos
El handler `PUT /api/dispositivos/:id`:
1. Lee el estado anterior del dispositivo (con joins para sacar nombres de sala/propietario/estado).
2. Actualiza **solo los campos no sensibles** (`tipo_id, propietario_id, estado_id, sala_actual_id, marca`).
3. Compara cada campo con el valor anterior y genera una novedad por cada cambio (`tipo_novedad_id`: 2 movimiento, 13 propietario, 14 estado, 15 datos).
4. Si se envió `acta_movimiento:{...}`, la vincula a la **primera novedad creada**.
5. Registra en `log_auditoria` un detalle con todos los cambios.

### 5) Garantía y acta inline al crear dispositivo
El `POST /api/dispositivos` acepta dos objetos opcionales en el body:
- `garantia:{ proveedor, fecha_inicio, fecha_fin, contacto_soporte, observaciones }`
- `acta:{ numero_acta, tipo_acta, firmantes, archivo_url, observaciones }`

Cuando vienen llenos, los inserta en la misma operación, y el acta se vincula a la **novedad de alta** que se generó automáticamente.

### 6) Sensitive fields locked at API level
Aunque el frontend ya marca los inputs como `readonly`, el backend tampoco acepta esos campos: la query `UPDATE` solo lista los 5 campos editables. Es **defensa en profundidad** — si alguien hace un `curl` con `codigo_patrimonial`, el campo será simplemente ignorado.

### 7) Print area
Hay un `<div id="print-area" class="print-only"></div>` oculto en pantalla pero visible al imprimir gracias a `@media print` (que oculta `.no-print` y muestra `.print-only`). La función `imprimirDetalle()` llama a `_buildPrintArea(deviceData)` que llena ese div con HTML limpio (tablas con bordes finos, header, footer) y luego invoca `window.print()`.

### 8) Solicitar imprimir (rol no-tesorero)
`solicitarImprimir()` usa `prettyPrompt` para pedir motivo y hace `POST /api/actas/solicitudes-impresion`. La tabla `solicitudes_impresion` queda con `estado='Pendiente'` esperando que el Tesorero apruebe (`PUT /api/actas/solicitudes-impresion/:id/aprobar`).

---

## 📜 Orden de desarrollo del proyecto

1. **Bootstrap**: creación con `npm create hono@latest --template cloudflare-pages`
2. **Migración inicial 0001**: las 16 tablas (roles, usuarios, profesores, salas, dispositivos, novedades, actas, garantías, préstamos, log_auditoria, etc.)
3. **Seed 0002**: 4 roles, 4 usuarios (1 por rol), 4 salas, 10 dispositivos, 12 tipos de novedad
4. **Backend mínimo**: rutas `auth`, `catalogos`, `dispositivos`, `novedades`, `reportes`
5. **Frontend SSR**: login, dashboards por rol, módulo dispositivos
6. **Módulos**: salas, profesores, novedades, actas, garantías, préstamos
7. **Sistema de permisos**: objeto `PERMISOS[rol]` que define menú lateral, página por defecto y banderas (puedeEditar, puedeBorrarCatalogos…)
8. **Reportes**: 11+ reportes con exportación CSV
9. **Catálogos**: gestión inicial con `prompt()` nativo (luego reemplazado)
10. **Auditoría**: tabla y reporte
11. **Migración 0003** (este turno):
    - `valor_dispositivo` añadido a `dispositivos`
    - `tipo_acta` y `archivo_url` añadidos a `actas`
    - Tabla `solicitudes_impresion` creada
    - `tipos_novedad` 2, 3, 13, 14, 15 garantizados
12. **Backend v3** (este turno):
    - Reescritura de `dispositivos.ts` con helpers y auto-novedades en PUT
    - Nuevo `actas.ts` con CRUD completo + solicitudes_impresion
    - PUT añadido a `catalogos.ts`
13. **Frontend v3** (este turno):
    - Sistema Pretty Dialog (alert/confirm/prompt estilizados)
    - Modal dispositivo rediseñado: banner edición, campos sensibles bloqueados, valor + costo separados, 3 secciones colapsables (acta movimiento, garantía, acta entrada)
    - Modal detalle con sección de actas + botones Imprimir / Solicitar Imprimir
    - Print area + función `imprimirDetalle()`
    - Modal catálogo bonito reemplaza prompts nativos + edición
    - Modal acta nuevo + botón “Nueva Acta”
    - Auditoría con resumen agrupado por usuario
    - Confirmación crítica con `prettyConfirm` referenciando flujo de actas

---

## 🔑 Funciones clave del frontend (mapa rápido)

| Función | Línea aprox. | Qué hace |
|---|---|---|
| `prettyAlert/Confirm/Prompt` | 1198 | Reemplazan dialogs nativos |
| `openModalDispositivo(device)` | 1620 | Abre modal en modo nuevo o edición; bloquea campos sensibles |
| `saveDispositivo(e)` | 1685 | Envía payload con garantía/acta inline; pide confirmación crítica |
| `darBaja(id, cod)` | 1730 | Confirma con prettyConfirm y hace DELETE |
| `verDetalle(id)` | 1745 | Pinta detalle + decide qué botón de impresión mostrar |
| `_buildPrintArea(d)` | 1815 | Construye HTML limpio para impresión |
| `imprimirDetalle()` | 1865 | Lanza `window.print()` con datos del dispositivo |
| `solicitarImprimir()` | 1870 | Pide motivo y crea solicitud_impresion |
| `openModalActa(acta)` | 2020 | Modal nueva/editar acta, carga dispositivos del backend |
| `saveActa(e)` | 2050 | Crea/actualiza acta |
| `openModalCatalogoItem(tipo, item)` | 1985 | Modal bonito de catálogo (reemplaza prompts) |
| `saveCatalogoItem(e)` | 2010 | Persiste tipo/propietario/estado |
| `editCatalogoItem(tipo, id)` | 2020 | Carga item y abre modal en edición |
| `verCatalogoItem(tipo, id)` | 2030 | Muestra detalle con prettyAlert |
| `loadAuditoria()` | 2260 | Pinta resumen por usuario + tabla completa |
| `devolverPrestamo(id)` | 1965 | Confirma con prettyConfirm |

---

## 🧪 Smoke test (probado en este turno)

```
✅ GET  /api/catalogos/tipos-dispositivo  → 200, 14 tipos
✅ PUT  /api/dispositivos/1 con cambio de sala → genera novedad 'Movimiento: Sala 1 → Sala 2'
✅ POST /api/actas → crea acta vinculada a dispositivo
✅ POST /api/actas/solicitudes-impresion → crea solicitud
✅ PUT  /api/catalogos/propietarios/1 → edita propietario
✅ Build vite → 237.95 kB (sin errores)
✅ Migración 0003 aplicada correctamente
✅ PM2 inventario-escolar online en puerto 3000
✅ Playwright: página carga sin errores JS
```

---

## 🔮 Pendientes y próximos pasos sugeridos

- [ ] **UI para solicitudes de impresión**: actualmente el endpoint existe pero la página del Tesorero para aprobar/rechazar las solicitudes aún no está construida (sólo se crea la solicitud y queda en BD).
- [ ] **Página de notificaciones / bandeja** para que el Tesorero vea todo lo pendiente (reportes, impresiones).
- [ ] **Subida de archivos** real para `archivo_url` (hoy es solo enlace externo); requeriría Cloudflare R2.
- [ ] **Filtros avanzados en Actas**: por tipo, fecha, dispositivo (endpoint ya soporta `?tipo_acta=`).
- [ ] **Internacionalización**: hoy es Spanish-only.
- [ ] **2FA / contraseñas hasheadas más robustamente** (bcrypt vía Web Crypto).
- [ ] **PWA / offline** para uso en aulas sin internet estable.
- [ ] **Tests automáticos** (Vitest + supertest contra wrangler).
- [ ] **Deploy a Cloudflare Pages** (con el botón “Deploy” del sandbox usando el skill `gsk-hosted-deploy` o un token propio con `cf-byok-deploy`).

---

## 📝 Convenciones del proyecto

- **Idioma**: todo en **español** (UI, mensajes de error, descripciones de novedades).
- **Moneda**: COP (Colombia) — se formatea con `Intl.NumberFormat('es-CO', { style:'currency', currency:'COP' })`.
- **Fechas**: ISO en DB (`YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS`), pero se muestran en formato local con `Intl.DateTimeFormat('es-CO')`.
- **Roles** siempre nombrados con la primera mayúscula: `Tesorero`, `Rector`, `Contador`, `Profesor`.
- **Datos sensibles** se bloquean tanto en frontend (`readonly` + hint) como en backend (campos ignorados en la query UPDATE).

---

## 📦 Estado actual del despliegue

- **Plataforma**: Cloudflare Pages (configuración lista; deploy pendiente de configurar credenciales)
- **DB**: Cloudflare D1 (local funcionando; producción pendiente de `wrangler d1 create`)
- **Stack**: Hono 4 + TypeScript + Vite 6 + TailwindCSS + Font Awesome + Chart.js + Axios
- **Estado del servicio local**: ✅ Activo (`pm2 list` → `inventario-escolar` online)
- **Versión actual**: **v4** (migración 0004 — doble propietario + actas obligatorias + PDFs + bajas inmutables)
- **Última actualización**: 2026-06-09

---

## 📞 Soporte

Si encuentras un bug o quieres pedir una mejora, abre un issue o contacta al equipo de desarrollo.

> **Filosofía del proyecto**: que el Tesorero, los Profesores y la Rectoría tengan **una sola herramienta confiable** que les diga *dónde está cada dispositivo, quién lo cuida, cuánto vale, qué garantía tiene, qué le ha pasado, y bajo qué acta firmada se movió*. Nada de Excel sueltos, nada de información en cabezas.

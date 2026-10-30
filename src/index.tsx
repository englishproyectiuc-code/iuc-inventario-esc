import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import dispositivos from './routes/dispositivos'
import catalogos from './routes/catalogos'
import novedades from './routes/novedades'
import prestamos from './routes/prestamos'
import reportes from './routes/reportes'
import actas from './routes/actas'
import bajas from './routes/bajas'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))
app.route('/api/dispositivos', dispositivos)
app.route('/api/catalogos', catalogos)
app.route('/api/novedades', novedades)
app.route('/api/prestamos', prestamos)
app.route('/api/reportes', reportes)
app.route('/api/actas', actas)
app.route('/api/bajas', bajas)

// Auth login
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    const user = await c.env.DB.prepare(`
      SELECT u.*, r.nombre_rol FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.email = ? AND u.password_hash = ? AND u.activo = 1`).bind(email, password).first() as any
    if (!user) return c.json({ success: false, error: 'Credenciales incorrectas o usuario inactivo' }, 401)
    // Si es profesor, obtener su id de profesor y salas asignadas
    let profesor_id = null
    let salas_ids: number[] = []
    if (user.nombre_rol === 'Profesor') {
      const prof = await c.env.DB.prepare('SELECT id FROM profesores WHERE usuario_id=?').bind(user.id).first() as any
      if (prof) {
        profesor_id = prof.id
        const salas = await c.env.DB.prepare('SELECT id FROM salas WHERE profesor_custodio_id=?').bind(prof.id).all()
        salas_ids = (salas.results as any[]).map((s: any) => s.id)
      }
    }
    return c.json({ success: true, data: { id: user.id, nombre: user.nombre_completo, email: user.email, rol: user.nombre_rol, rol_id: user.rol_id, profesor_id, salas_ids } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.use('/static/*', serveStatic({ root: './' }))

app.get('*', async (c) => c.html(getHTML()))

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inventario Tecnológico Escolar</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;overflow:hidden}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#f1f5f9;display:flex;flex-direction:column}
    :root{--primary:#1e40af;--primary-dark:#1e3a8a;--accent:#3b82f6;--success:#16a34a;--warning:#d97706;--danger:#dc2626}
    /* Layout */
    #app-shell{display:flex;height:100vh;overflow:hidden}
    .sidebar{width:260px;min-width:260px;height:100vh;background:linear-gradient(180deg,#1e3a8a 0%,#1e40af 50%,#1d4ed8 100%);display:flex;flex-direction:column;transition:width .3s;overflow:hidden}
    .sidebar.collapsed{width:0;min-width:0}
    .sidebar-inner{min-width:260px;display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .main-area{flex:1;display:flex;flex-direction:column;height:100vh;overflow:hidden}
    .topbar{background:white;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(0,0,0,.08);flex-shrink:0;z-index:10}
    .content-area{flex:1;overflow-y:auto;padding:24px}
    /* Sidebar links */
    .sidebar-link{display:flex;align-items:center;gap:10px;padding:10px 20px;color:#bfdbfe;border-radius:8px;margin:2px 8px;cursor:pointer;transition:all .2s;text-decoration:none;white-space:nowrap}
    .sidebar-link:hover,.sidebar-link.active{background:rgba(255,255,255,.15);color:#fff}
    .sidebar-link i{width:20px;text-align:center}
    .sidebar-section{font-size:10px;font-weight:700;letter-spacing:1.5px;color:#60a5fa;padding:16px 20px 4px;text-transform:uppercase;white-space:nowrap}
    /* Cards */
    .card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:24px}
    .stat-card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:20px;border-left:4px solid}
    /* Badges */
    .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}.badge-red{background:#fee2e2;color:#991b1b}
    .badge-yellow{background:#fef9c3;color:#92400e}.badge-blue{background:#dbeafe;color:#1e40af}
    .badge-gray{background:#f1f5f9;color:#475569}.badge-purple{background:#ede9fe;color:#5b21b6}
    .badge-teal{background:#ccfbf1;color:#065f46}
    /* Buttons */
    .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;border:none;transition:all .2s}
    .btn-primary{background:#1e40af;color:white}.btn-primary:hover{background:#1e3a8a}
    .btn-success{background:#16a34a;color:white}.btn-success:hover{background:#15803d}
    .btn-warning{background:#d97706;color:white}.btn-warning:hover{background:#b45309}
    .btn-danger{background:#dc2626;color:white}.btn-danger:hover{background:#b91c1c}
    .btn-outline{background:white;color:#374151;border:1px solid #d1d5db}.btn-outline:hover{background:#f9fafb}
    .btn-sm{padding:5px 10px;font-size:12px}
    /* Form */
    input,select,textarea{width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;transition:border .2s;background:white}
    input:focus,select:focus,textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th{background:#f8fafc;padding:10px 14px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #e2e8f0}
    td{padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#374151}
    tr:hover td{background:#f8fafc}
    /* Modal */
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center}
    .modal-overlay.show{display:flex}
    .modal{background:white;border-radius:16px;padding:28px;width:90%;max-width:600px;max-height:90vh;overflow-y:auto;position:relative}
    .modal-lg{max-width:850px}
    /* Login */
    #login-screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 50%,#3b82f6 100%);z-index:2000}
    /* Pages */
    .page{display:none}.page.active{display:block}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px}
    .tab-btn{padding:8px 16px;border:none;background:transparent;cursor:pointer;border-bottom:3px solid transparent;font-size:14px;font-weight:500;color:#6b7280;transition:all .2s}
    .tab-btn.active{color:#1e40af;border-bottom-color:#1e40af}
    .empty-state{text-align:center;padding:60px 20px;color:#9ca3af}
    .empty-state i{font-size:48px;margin-bottom:16px;display:block}
    /* Toast */
    #toast-container{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
    .toast{background:white;border-radius:10px;padding:14px 20px;box-shadow:0 4px 20px rgba(0,0,0,.15);display:flex;align-items:center;gap:10px;min-width:280px;animation:slideIn .3s ease;border-left:4px solid}
    .toast-success{border-left-color:#16a34a}.toast-error{border-left-color:#dc2626}.toast-info{border-left-color:#3b82f6}
    @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    .spinner{width:20px;height:20px;border:2px solid #e2e8f0;border-top:2px solid #3b82f6;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .chart-container{position:relative;height:260px}
    ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#f1f5f9}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
    .garantia-vence{background:#fef9c3}.garantia-vencida{background:#fee2e2}
    /* Access denied */
    .access-denied{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;color:#9ca3af;text-align:center}
    .access-denied i{font-size:64px;margin-bottom:20px;color:#d1d5db}
    /* Solicitud card */
    .solicitud-card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;background:white}
    /* Role badge colors */
    .role-tesorero{background:#dbeafe;color:#1e40af}
    .role-rector{background:#ede9fe;color:#5b21b6}
    .role-contador{background:#ccfbf1;color:#065f46}
    .role-profesor{background:#fef9c3;color:#92400e}
    @media(max-width:768px){.sidebar{position:fixed;left:-260px;z-index:100}.sidebar.mobile-open{left:0}}
    /* ===== Diálogos bonitos (reemplazan alert/confirm/prompt) ===== */
    .pretty-dialog-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);z-index:5000;align-items:center;justify-content:center;animation:fadeIn .2s}
    .pretty-dialog-overlay.show{display:flex}
    .pretty-dialog{background:white;border-radius:16px;padding:0;width:92%;max-width:480px;max-height:90vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:popIn .25s ease}
    .pretty-dialog-header{padding:24px 24px 0;text-align:center}
    .pretty-dialog-icon{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:30px}
    .pd-icon-info{background:#dbeafe;color:#1e40af}
    .pd-icon-warn{background:#fef3c7;color:#b45309}
    .pd-icon-danger{background:#fee2e2;color:#dc2626}
    .pd-icon-success{background:#dcfce7;color:#16a34a}
    .pretty-dialog-title{font-weight:700;font-size:19px;color:#1e3a8a;margin-bottom:8px}
    .pretty-dialog-body{padding:0 24px 8px;color:#4b5563;font-size:14px;line-height:1.55;text-align:center}
    .pretty-dialog-explain{background:#f0f9ff;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 14px;margin:14px 24px 8px;font-size:13px;color:#1e40af;text-align:left}
    .pretty-dialog-input{padding:0 24px 8px}
    .pretty-dialog-input input,.pretty-dialog-input textarea{margin-top:8px}
    .pretty-dialog-footer{padding:18px 24px 24px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes popIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
    /* Read-only field con estilo */
    input[readonly],input:disabled,select:disabled,textarea[readonly]{background:#f1f5f9!important;color:#475569!important;cursor:not-allowed}
    .readonly-hint{font-size:11px;color:#94a3b8;font-style:italic;margin-top:2px}
    /* Sección colapsable en modales */
    .collapsible{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;background:#f8fafc}
    .collapsible-head{display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none}
    .collapsible-head h5{font-weight:700;font-size:14px;color:#1e3a8a;margin:0}
    .collapsible-body{margin-top:12px;display:none}
    .collapsible.open .collapsible-body{display:block}
    /* Vista de detalle imprimible */
    .print-only{display:none}
    @media print{
      body *{visibility:hidden}
      #print-area,#print-area *{visibility:visible}
      #print-area{position:absolute;left:0;top:0;width:100%;padding:24px;background:white}
      .no-print{display:none!important}
      .print-only{display:block!important}
    }
    /* Estilos para impresion del detalle */
    .print-block{margin-bottom:18px;padding:14px;border:1px solid #e2e8f0;border-radius:8px}
    .print-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .print-grid .pf-label{font-size:11px;color:#64748b;text-transform:uppercase}
    .print-grid .pf-val{font-weight:600;color:#111827}
  </style>
</head>
<body>
<div id="toast-container"></div>

<!-- LOGIN -->
<div id="login-screen">
  <div class="card" style="width:440px;max-width:95vw;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:52px;margin-bottom:12px;">🏫</div>
      <h1 style="font-size:22px;font-weight:700;color:#1e3a8a;margin-bottom:4px;">Sistema de Inventario</h1>
      <p style="color:#64748b;font-size:14px;">Tecnológico Escolar</p>
    </div>
    <div class="form-group">
      <label>Correo Electrónico</label>
      <input type="email" id="login-email" placeholder="usuario@colegio.edu.co">
    </div>
    <div class="form-group">
      <label>Contraseña</label>
      <input type="password" id="login-pass" placeholder="••••••••">
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="login()">
      <i class="fas fa-sign-in-alt"></i> Ingresar al Sistema
    </button>
    <div style="margin-top:20px;padding:14px;background:#f0f9ff;border-radius:8px;font-size:12px;color:#1e40af;line-height:1.8;">
      <strong>Usuarios de demostración:</strong><br>
      🔑 Tesorero: admin@colegio.edu.co / admin123<br>
      📊 Contador: contador@colegio.edu.co / contador123<br>
      🏛️ Rector: rector@colegio.edu.co / rector123<br>
      👩‍🏫 Profesor: jgarcia@colegio.edu.co / prof123
    </div>
  </div>
</div>

<!-- APP SHELL -->
<div id="app-shell" style="display:none;">
  <!-- SIDEBAR -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-inner">
      <div style="padding:20px;border-bottom:1px solid rgba(255,255,255,.1);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:28px;">🖥️</span>
          <div>
            <div style="color:white;font-weight:700;font-size:14px;">Inventario Tec.</div>
            <div style="color:#93c5fd;font-size:11px;" id="sidebar-user-role">Sistema Escolar</div>
          </div>
        </div>
      </div>
      <nav style="padding:12px 0;flex:1;" id="sidebar-nav">
        <!-- Se renderiza dinámicamente según el rol -->
      </nav>
      <div style="padding:16px;border-top:1px solid rgba(255,255,255,.1);">
        <div style="color:#93c5fd;font-size:11px;margin-bottom:8px;padding:0 4px;" id="sidebar-user-name"></div>
        <button class="btn btn-outline" style="width:100%;justify-content:center;font-size:13px;" onclick="logout()">
          <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
        </button>
      </div>
    </div>
  </aside>

  <!-- MAIN AREA -->
  <div class="main-area">
    <header class="topbar">
      <div style="display:flex;align-items:center;gap:16px;">
        <button onclick="toggleSidebar()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#64748b;">
          <i class="fas fa-bars"></i>
        </button>
        <h2 style="font-size:18px;font-weight:700;color:#1e3a8a;" id="page-title">Dashboard</h2>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:13px;color:#64748b;" id="user-display"></span>
        <span class="badge" id="role-badge"></span>
      </div>
    </header>

    <div class="content-area" id="content-area">

      <!-- =============================== -->
      <!--  DASHBOARD TESORERO/RECTOR      -->
      <!-- =============================== -->
      <section id="page-dashboard" class="page">
        <div id="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-chart-pie"></i> Dispositivos por Tipo</h3>
            <div class="chart-container"><canvas id="chart-tipo"></canvas></div>
          </div>
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-chart-bar"></i> Dispositivos por Sala</h3>
            <div class="chart-container"><canvas id="chart-sala"></canvas></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-bell"></i> Novedades Recientes</h3>
            <div id="novedades-recientes-list"></div>
          </div>
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Garantías por Vencer</h3>
            <div id="garantias-vencer-list"></div>
          </div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  DASHBOARD CONTADOR             -->
      <!-- =============================== -->
      <section id="page-dashboard-contador" class="page">
        <div style="margin-bottom:24px;">
          <h3 style="font-weight:700;color:#1e3a8a;margin-bottom:4px;"><i class="fas fa-calculator"></i> Resumen Financiero del Inventario</h3>
          <p style="color:#64748b;font-size:14px;">Vista de solo lectura — Valores del inventario tecnológico</p>
        </div>
        <div id="stats-contador" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-chart-pie"></i> Distribución por Tipo</h3>
            <div class="chart-container"><canvas id="chart-tipo-cont"></canvas></div>
          </div>
          <div class="card">
            <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-chart-bar"></i> Dispositivos por Sala</h3>
            <div class="chart-container"><canvas id="chart-sala-cont"></canvas></div>
          </div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  DASHBOARD PROFESOR             -->
      <!-- =============================== -->
      <section id="page-dashboard-profesor" class="page">
        <div style="margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-chalkboard-teacher"></i> Mi Sala Asignada</h3>
          <p style="color:#64748b;font-size:14px;" id="prof-sala-info">Cargando información de sala...</p>
        </div>
        <div id="stats-profesor" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;"></div>
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:16px;color:#1e3a8a;"><i class="fas fa-chart-pie"></i> Distribución de Dispositivos en mi Sala</h3>
          <div class="chart-container"><canvas id="chart-tipo-prof"></canvas></div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  DISPOSITIVOS                   -->
      <!-- =============================== -->
      <section id="page-dispositivos" class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;gap:10px;flex:1;flex-wrap:wrap;">
            <input type="text" id="search-dispositivos" placeholder="🔍 Buscar código, marca, modelo, serie..." style="max-width:300px;" oninput="loadDispositivos()">
            <select id="filter-estado" onchange="loadDispositivos()" style="max-width:170px;"><option value="">Todos los estados</option></select>
            <select id="filter-sala" onchange="loadDispositivos()" style="max-width:190px;"><option value="">Todas las salas</option></select>
          </div>
          <button class="btn btn-primary" onclick="openModalDispositivo()" id="btn-nuevo-disp" style="display:none;">
            <i class="fas fa-plus"></i> Nuevo Dispositivo
          </button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>Código</th><th>Tipo</th><th>Marca / Modelo</th><th>Estado</th><th>Sala</th><th>Custodio</th><th>Valor</th><th>Acciones</th></tr></thead>
              <tbody id="dispositivos-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  SALAS                          -->
      <!-- =============================== -->
      <section id="page-salas" class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;">Salas y Ubicaciones</h3>
          <button class="btn btn-primary" onclick="openModalSala()" id="btn-nueva-sala" style="display:none;"><i class="fas fa-plus"></i> Nueva Sala</button>
        </div>
        <div id="salas-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;"></div>
      </section>

      <!-- =============================== -->
      <!--  PROFESORES                     -->
      <!-- =============================== -->
      <section id="page-profesores" class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;">Profesores Custodios</h3>
          <button class="btn btn-primary" onclick="openModalProfesor()"><i class="fas fa-plus"></i> Nuevo Profesor</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>#</th><th>Nombre</th><th>Documento</th><th>Depto.</th><th>Email</th><th>Salas</th><th>Acciones</th></tr></thead>
            <tbody id="profesores-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  USUARIOS (solo tesorero)       -->
      <!-- =============================== -->
      <section id="page-usuarios" class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div>
            <h3 style="font-weight:700;color:#1e3a8a;">Gestión de Usuarios del Sistema</h3>
            <p style="color:#64748b;font-size:13px;margin-top:4px;">Crea y administra las cuentas de acceso. La contraseña inicial es la que defines aquí.</p>
          </div>
          <button class="btn btn-primary" onclick="openModalUsuario()"><i class="fas fa-user-plus"></i> Nuevo Usuario</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>#</th><th>Nombre</th><th>Email / Contraseña ingreso</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody id="usuarios-body"></tbody>
          </table>
        </div>
        <div style="margin-top:20px;padding:16px;background:#f0f9ff;border-radius:12px;font-size:13px;color:#1e40af;">
          <strong><i class="fas fa-info-circle"></i> ¿Cómo agregar usuarios al sistema?</strong><br><br>
          1. Haz clic en <strong>"Nuevo Usuario"</strong> e ingresa el nombre, correo y contraseña.<br>
          2. Selecciona el rol: <strong>Tesorero</strong> (acceso total), <strong>Rector</strong> (dashboard + solicitudes), <strong>Contador</strong> (solo financiero), <strong>Profesor</strong> (su sala).<br>
          3. Para profesores, también debes ir a <strong>Profesores</strong> y crear el registro vinculando el usuario.<br>
          4. El usuario puede ingresar con el correo y contraseña que definiste.<br>
          5. Puedes cambiar la contraseña o desactivar el usuario desde esta misma pantalla.
        </div>
      </section>

      <!-- =============================== -->
      <!--  NOVEDADES                      -->
      <!-- =============================== -->
      <section id="page-novedades" class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;">Historial de Novedades</h3>
          <button class="btn btn-primary" onclick="openModalNovedad()" id="btn-nueva-novedad" style="display:none;"><i class="fas fa-plus"></i> Registrar Novedad</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>Fecha</th><th>Dispositivo</th><th>Tipo Novedad</th><th>Descripción</th><th>Acta</th><th>Usuario</th></tr></thead>
              <tbody id="novedades-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  ACTAS                          -->
      <!-- =============================== -->
      <section id="page-actas" class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="font-weight:700;color:#1e3a8a;">Registro de Actas</h3>
            <p style="color:#64748b;font-size:14px;">Documentación formal de novedades, movimientos, entradas, salidas y bajas</p>
          </div>
          <button class="btn btn-primary" id="btn-nueva-acta" onclick="openModalActa()" style="display:none;"><i class="fas fa-plus"></i> Nueva Acta</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>N° Acta</th><th>Tipo</th><th>Dispositivo</th><th>Vinculado a</th><th>Fecha Emisión</th><th>Firmantes</th><th>URL</th><th>PDF</th><th>Acciones</th></tr></thead>
            <tbody id="actas-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  GARANTÍAS                      -->
      <!-- =============================== -->
      <section id="page-garantias" class="page">
        <div style="margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;">Control de Garantías</h3>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>Dispositivo</th><th>Sala</th><th>Proveedor</th><th>Vigencia</th><th>Estado</th><th>Días Restantes</th><th>Contacto</th></tr></thead>
            <tbody id="garantias-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  BAJAS                          -->
      <!-- =============================== -->
      <section id="page-bajas" class="page">
        <div style="margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-archive"></i> Dispositivos Dados de Baja / Salidos</h3>
          <p style="color:#64748b;font-size:14px;">Registro inmutable de cada dispositivo que ha salido del colegio, con su acta firmada y el nuevo propietario.</p>
        </div>
        <div id="bajas-resumen" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;"></div>
        <div class="card" style="margin-bottom:16px;padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div style="flex:1;min-width:160px;">
            <label style="font-size:12px;color:#64748b;font-weight:600;">Filtrar por tipo de baja</label>
            <select id="filtro-bajas-tipo" onchange="loadBajas()">
              <option value="">Todos los tipos de baja</option>
              <option>Baja</option>
              <option>Donación</option>
              <option>Venta</option>
              <option>Devolución</option>
              <option>Pérdida</option>
              <option>Obsolescencia</option>
              <option>Otro</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px;">
            <label style="font-size:12px;color:#64748b;font-weight:600;">Filtrar por tipo de dispositivo</label>
            <select id="filtro-bajas-tipo-disp" onchange="loadBajas()">
              <option value="">Todos los tipos de dispositivo</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:#64748b;font-weight:600;">Desde</label>
            <input type="date" id="filtro-bajas-desde" onchange="loadBajas()">
          </div>
          <div>
            <label style="font-size:12px;color:#64748b;font-weight:600;">Hasta</label>
            <input type="date" id="filtro-bajas-hasta" onchange="loadBajas()">
          </div>
          <button class="btn btn-outline btn-sm" onclick="$('filtro-bajas-tipo').value='';$('filtro-bajas-tipo-disp').value='';$('filtro-bajas-desde').value='';$('filtro-bajas-hasta').value='';loadBajas();"><i class="fas fa-times"></i> Limpiar</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>Fecha</th><th>Dispositivo</th><th>Tipo Disp.</th><th>Tipo Baja</th><th>Propietario Anterior</th><th>Nuevo Propietario</th><th>Acta</th><th>Acciones</th></tr></thead>
            <tbody id="bajas-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  PRÉSTAMOS (solo profesores)    -->
      <!-- =============================== -->
      <section id="page-prestamos" class="page">
        <div style="margin-bottom:16px;">
          <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-handshake"></i> Préstamos Internos</h3>
          <p style="color:#64748b;font-size:13px;margin-top:4px;">Registros de préstamo de dispositivos de tu sala. Esta información es privada.</p>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid #e2e8f0;">
          <button class="tab-btn active" onclick="filterPrestamos('',this)">Todos</button>
          <button class="tab-btn" onclick="filterPrestamos('Activo',this)">Activos</button>
          <button class="tab-btn" onclick="filterPrestamos('Devuelto',this)">Devueltos</button>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
          <button class="btn btn-primary" onclick="openModalPrestamo()"><i class="fas fa-plus"></i> Nuevo Préstamo</button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>Fecha</th><th>Dispositivo</th><th>Estudiante / Persona</th><th>Autoriza</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody id="prestamos-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  REPORTES TESORERO              -->
      <!-- =============================== -->
      <section id="page-reportes" class="page">
        <div style="margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-chart-bar"></i> Centro de Reportes</h3>
          <p style="color:#64748b;font-size:14px;">Genera reportes detallados del inventario. Puedes filtrar por sala o exportar en CSV.</p>
        </div>
        <!-- Filtros de reporte -->
        <div class="card" style="margin-bottom:20px;">
          <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
            <div style="flex:1;min-width:220px;">
              <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Tipo de Reporte</label>
              <select id="tipo-reporte" onchange="onTipoReporteChange()" style="width:100%;">
                <optgroup label="📋 Generales">
                  <option value="inventario">Inventario Completo</option>
                  <option value="garantias">Reporte de Garantías</option>
                  <option value="por-sala">Reporte por Sala</option>
                  <option value="financiero">Reporte Financiero (valores)</option>
                  <option value="novedades">Reporte de Novedades</option>
                  <option value="prestamos">Reporte de Préstamos</option>
                  <option value="profesores">Reporte de Profesores</option>
                  <option value="auditoria">Log de Auditoría</option>
                </optgroup>
                <optgroup label="💻 Por Tipo de Dispositivo" id="optgroup-tipos"></optgroup>
                <optgroup label="🔄 Por Estado" id="optgroup-estados"></optgroup>
                <optgroup label="🏢 Por Propietario" id="optgroup-propietarios"></optgroup>
              </select>
            </div>
            <div style="flex:1;min-width:200px;" id="filtro-sala-reporte-wrap">
              <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Filtrar por Sala (opcional)</label>
              <select id="filtro-sala-reporte" style="width:100%;">
                <option value="">Todas las salas</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="generarReporte()"><i class="fas fa-search"></i> Generar Reporte</button>
            <button class="btn btn-outline" onclick="exportCSV()" id="btn-export-csv" style="display:none;"><i class="fas fa-download"></i> Exportar CSV</button>
          </div>
        </div>
        <!-- Solicitudes de reporte pendientes -->
        <div class="card" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h4 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-inbox"></i> Solicitudes de Reporte Pendientes</h4>
            <button class="btn btn-outline btn-sm" onclick="loadSolicitudesReporte()"><i class="fas fa-refresh"></i> Actualizar</button>
          </div>
          <div id="solicitudes-list"></div>
        </div>
        <!-- Resultado del reporte -->
        <div class="card" id="reporte-resultado" style="display:none;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="font-weight:700;color:#1e3a8a;" id="reporte-titulo">Resultado</h3>
            <button class="btn btn-outline btn-sm" onclick="exportCSV()"><i class="fas fa-download"></i> Exportar CSV</button>
          </div>
          <div style="overflow-x:auto;"><table id="tabla-reporte"><thead id="reporte-head"></thead><tbody id="reporte-body"></tbody></table></div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  SOLICITAR REPORTE (rector/cont)-->
      <!-- =============================== -->
      <section id="page-solicitar-reporte" class="page">
        <div style="max-width:600px;margin:0 auto;">
          <div style="margin-bottom:24px;">
            <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-file-signature"></i> Solicitar Reporte de Inventario</h3>
            <p style="color:#64748b;font-size:14px;margin-top:4px;">Completa el formulario para solicitar la información que necesitas. El tesorero recibirá tu solicitud y la procesará.</p>
          </div>
          <div class="card">
            <form onsubmit="enviarSolicitudReporte(event)">
              <div class="form-group">
                <label>Tipo de información solicitada *</label>
                <select id="sol-tipo" required>
                  <option value="">-- Seleccione --</option>
                  <optgroup label="📋 Reportes Generales">
                    <option value="Inventario completo de dispositivos">Inventario completo de dispositivos</option>
                    <option value="Reporte por sala específica">Reporte por sala específica</option>
                    <option value="Reporte de garantías">Reporte de garantías</option>
                    <option value="Reporte financiero / valor inventario">Reporte financiero / valor inventario</option>
                    <option value="Reporte de novedades recientes">Reporte de novedades recientes</option>
                    <option value="Reporte de préstamos">Reporte de préstamos</option>
                    <option value="Reporte de profesores">Reporte de profesores</option>
                  </optgroup>
                  <optgroup label="🔄 Por Estado del Dispositivo">
                    <option value="Reporte de dispositivos activos">Reporte de dispositivos activos</option>
                    <option value="Reporte de dispositivos en mantenimiento">Reporte de dispositivos en mantenimiento</option>
                    <option value="Reporte de dispositivos dados de baja">Reporte de dispositivos dados de baja</option>
                  </optgroup>
                  <optgroup label="💻 Por Tipo de Dispositivo" id="sol-optgroup-tipos"></optgroup>
                  <optgroup label="📝 Otro">
                    <option value="Otro (especificar abajo)">Otro (especificar abajo)</option>
                  </optgroup>
                </select>
              </div>
              <div class="form-group">
                <label>Sala específica (si aplica)</label>
                <select id="sol-sala">
                  <option value="">No aplica / Todas las salas</option>
                </select>
              </div>
              <div class="form-group">
                <label>Descripción detallada de lo que necesita *</label>
                <textarea id="sol-descripcion" rows="4" required placeholder="Explique con detalle qué información necesita, para qué periodo, con qué finalidad, etc."></textarea>
              </div>
              <div class="form-group">
                <label>Urgencia</label>
                <select id="sol-urgencia">
                  <option value="Normal">Normal</option>
                  <option value="Urgente">Urgente</option>
                  <option value="Alta prioridad">Alta prioridad</option>
                </select>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
                <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar Solicitud</button>
              </div>
            </form>
          </div>
          <!-- Historial de solicitudes propias -->
          <div style="margin-top:24px;">
            <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:12px;"><i class="fas fa-history"></i> Mis Solicitudes</h4>
            <div id="mis-solicitudes-list"></div>
          </div>
        </div>
      </section>

      <!-- =============================== -->
      <!--  AUDITORÍA                      -->
      <!-- =============================== -->
      <section id="page-auditoria" class="page">
        <div style="margin-bottom:20px;">
          <h3 style="font-weight:700;color:#1e3a8a;">Log de Auditoría</h3>
          <p style="color:#64748b;font-size:14px;">Registro inmutable de todas las acciones críticas del sistema</p>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Tabla</th><th>ID Reg.</th><th>Detalle</th></tr></thead>
            <tbody id="auditoria-body"></tbody>
          </table>
        </div>
      </section>

      <!-- =============================== -->
      <!--  CATÁLOGOS                      -->
      <!-- =============================== -->
      <section id="page-catalogos" class="page">
        <div style="margin-bottom:16px;">
          <h3 style="font-weight:700;color:#1e3a8a;"><i class="fas fa-tags"></i> Catálogos del Sistema</h3>
          <p style="color:#64748b;font-size:13px;margin-top:4px;" id="catalogos-subtitle"></p>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
          <button class="tab-btn active" onclick="showCatalogo('tipos',this)">Tipos de Dispositivo</button>
          <button class="tab-btn" onclick="showCatalogo('propietarios',this)">Propietarios</button>
          <button class="tab-btn" onclick="showCatalogo('estados',this)">Estados</button>
          <button class="tab-btn" onclick="showCatalogo('roles',this)">Roles</button>
        </div>
        <div id="catalogo-content"></div>
        <!-- Modal solicitud borrar -->
        <div id="solicitud-borrar-info" style="display:none;margin-top:16px;padding:16px;background:#fef9c3;border-radius:12px;border:1px solid #fde68a;">
          <h4 style="font-weight:700;color:#92400e;margin-bottom:8px;"><i class="fas fa-lock"></i> Permiso de Eliminación</h4>
          <p style="font-size:13px;color:#92400e;">Solo el <strong>Tesorero</strong> puede eliminar registros de los catálogos. Si eres Tesorero, el sistema pedirá confirmación antes de eliminar. La eliminación solo es posible si el registro <strong>no está siendo utilizado</strong> por ningún dispositivo.</p>
        </div>
      </section>

      <!-- =============================== -->
      <!--  ACCESS DENIED                  -->
      <!-- =============================== -->
      <section id="page-acceso-denegado" class="page">
        <div class="access-denied">
          <i class="fas fa-lock"></i>
          <h3 style="font-size:22px;font-weight:700;color:#374151;margin-bottom:8px;">Acceso Restringido</h3>
          <p style="font-size:15px;max-width:400px;">No tienes permiso para ver esta sección. Contacta al administrador (Tesorero) si necesitas acceso.</p>
        </div>
      </section>

    </div><!-- /content-area -->
  </div><!-- /main-area -->
</div><!-- /app-shell -->

<!-- ========== MODALES ========== -->

<!-- Modal Dispositivo -->
<div class="modal-overlay" id="modal-dispositivo">
  <div class="modal modal-lg">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;" id="modal-disp-title">Nuevo Dispositivo</h3>
      <button onclick="closeModal('modal-dispositivo')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <!-- Aviso modo edición (campos sensibles bloqueados) -->
    <div id="disp-edit-warning" style="display:none;padding:12px 14px;background:#fef9c3;border-left:4px solid #d97706;border-radius:8px;margin-bottom:16px;font-size:13px;color:#92400e;">
      <i class="fas fa-lock"></i> <strong>Modo edición:</strong> Por seguridad, los campos sensibles
      (<strong>código patrimonial</strong>, <strong>número de serie</strong>, <strong>modelo</strong>,
      <strong>fecha y valor de adquisición</strong>) <strong>no pueden modificarse</strong>.
      Si necesitas cambiar uno de estos datos, debes solicitarlo formalmente y dar de baja el dispositivo.
    </div>
    <form id="form-dispositivo" onsubmit="saveDispositivo(event)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group">
          <label>Código Patrimonial *</label>
          <input type="text" id="disp-codigo" placeholder="INV-2024-001" required>
          <div class="readonly-hint" id="disp-codigo-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
        <div class="form-group">
          <label>Número de Serie</label>
          <input type="text" id="disp-serie" placeholder="SN-XXXX-001">
          <div class="readonly-hint" id="disp-serie-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
        <div class="form-group"><label>Tipo de Dispositivo *</label><select id="disp-tipo" required></select></div>
        <div class="form-group">
          <label>Propietario actual (en posesión) *</label>
          <select id="disp-propietario" required></select>
          <div class="readonly-hint">A quién pertenece actualmente. Suele ser el colegio una vez recibido.</div>
        </div>
        <div class="form-group">
          <label>Propietario de origen (quien lo entregó) *</label>
          <select id="disp-propietario-origen" required></select>
          <div class="readonly-hint">Persona/entidad que entregó el dispositivo al colegio. Queda bloqueado de por vida.</div>
          <div class="readonly-hint" id="disp-propietario-origen-hint" style="display:none;">Bloqueado: el propietario de origen no se puede modificar</div>
        </div>
        <div class="form-group"><label>Estado *</label><select id="disp-estado" required></select></div>
        <div class="form-group"><label>Sala Actual *</label><select id="disp-sala" required></select></div>
        <div class="form-group"><label>Marca</label><input type="text" id="disp-marca" placeholder="HP, Dell, Samsung..."></div>
        <div class="form-group">
          <label>Modelo</label>
          <input type="text" id="disp-modelo" placeholder="ProBook 450 G9...">
          <div class="readonly-hint" id="disp-modelo-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
        <div class="form-group">
          <label>Fecha Adquisición</label>
          <input type="date" id="disp-fecha">
          <div class="readonly-hint" id="disp-fecha-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
        <div class="form-group">
          <label>Valor del Dispositivo (COP)</label>
          <input type="number" id="disp-valor-dispositivo" placeholder="3500000" step="1000">
          <div class="readonly-hint">Valor real del aparato (referencia de mercado).</div>
          <div class="readonly-hint" id="disp-valor-dispositivo-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
        <div class="form-group">
          <label>Costo de Adquisición (COP)</label>
          <input type="number" id="disp-costo-adquisicion" placeholder="0 si fue donación" step="1000">
          <div class="readonly-hint">Cuánto pagó el colegio. Si fue donado, ponga 0.</div>
          <div class="readonly-hint" id="disp-costo-hint" style="display:none;">Bloqueado: dato sensible</div>
        </div>
      </div>

      <!-- Sección: Acta de movimiento (solo en MODO EDICIÓN cuando hay cambios de sala/propietario) -->
      <div class="collapsible" id="disp-acta-mov-section" style="display:none;">
        <div class="collapsible-head" onclick="this.parentElement.classList.toggle('open')">
          <h5><i class="fas fa-file-signature"></i> ¿Vincular un acta a este movimiento? (opcional)</h5>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div class="collapsible-body">
          <div style="background:#dbeafe;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#1e40af;">
            <i class="fas fa-info-circle"></i> Si ya tienes un acta de movimiento creada en <strong>Actas</strong>, escribe aquí su número para vincularla. Si aún no la tienes, primero ve a <strong>Actas → Nueva Acta</strong> y luego regresa aquí.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label>N° Acta</label>
              <input type="text" id="disp-mov-acta-num" placeholder="ACT-2024-XXX">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Tipo de Acta</label>
              <select id="disp-mov-acta-tipo">
                <option value="Movimiento">Movimiento</option>
                <option value="Cambio de Custodia">Cambio de Custodia</option>
                <option value="Cambio de Propietario">Cambio de Propietario</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label>Firmantes</label>
            <input type="text" id="disp-mov-acta-firmantes" placeholder="Tesorero, Rector...">
          </div>
        </div>
      </div>

      <!-- Sección: ¿Agregar Garantía? (solo en MODO NUEVO) -->
      <div class="collapsible" id="disp-garantia-section" style="display:none;">
        <div class="collapsible-head" onclick="this.parentElement.classList.toggle('open')">
          <h5><i class="fas fa-shield-alt"></i> ¿Agregar una garantía? (opcional)</h5>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div class="collapsible-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label>Proveedor</label>
              <input type="text" id="disp-gar-proveedor" placeholder="Nombre del proveedor / fabricante">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Contacto Soporte</label>
              <input type="text" id="disp-gar-contacto" placeholder="Tel / Email / Web">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Fecha Inicio</label>
              <input type="date" id="disp-gar-inicio">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Fecha Fin</label>
              <input type="date" id="disp-gar-fin">
            </div>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label>Observaciones de la Garantía</label>
            <textarea id="disp-gar-obs" rows="2" placeholder="Cobertura, condiciones..."></textarea>
          </div>
        </div>
      </div>

      <!-- Sección: ACTA DE ENTRADA *OBLIGATORIA* (solo en MODO NUEVO) -->
      <div id="disp-acta-entrada-section" style="display:none;border:2px solid #dc2626;border-radius:10px;padding:14px;margin-top:16px;background:#fef2f2;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <h5 style="font-weight:700;color:#7f1d1d;margin:0;"><i class="fas fa-file-signature"></i> Acta de Entrada * <span style="font-size:11px;font-weight:500;color:#991b1b;">(obligatoria — no se puede registrar el dispositivo sin acta)</span></h5>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" id="disp-acta-modo-nueva" onclick="dispActaSetModo('nueva')"><i class="fas fa-plus"></i> Crear acta nueva</button>
            <button type="button" class="btn btn-outline btn-sm" id="disp-acta-modo-vincular" onclick="dispActaSetModo('vincular')"><i class="fas fa-link"></i> Vincular existente</button>
          </div>
        </div>

        <!-- MODO: VINCULAR ACTA EXISTENTE -->
        <div id="disp-acta-modo-vincular-wrap" style="display:none;">
          <div class="form-group" style="margin:0;">
            <label>Acta existente</label>
            <select id="disp-acta-existente"></select>
            <div class="readonly-hint">Selecciona un acta ya registrada en el sistema.</div>
          </div>
        </div>

        <!-- MODO: CREAR ACTA NUEVA -->
        <div id="disp-acta-modo-nueva-wrap">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label>N° Acta *</label>
              <input type="text" id="disp-acta-num" placeholder="ACT-2024-001">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Tipo</label>
              <select id="disp-acta-tipo">
                <option value="Entrada">Entrada / Alta</option>
                <option value="Donación">Donación</option>
                <option value="Compra">Compra</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label>Firmantes</label>
            <input type="text" id="disp-acta-firmantes" placeholder="Tesorero, Rector...">
          </div>
          <div class="form-group">
            <label>URL/Enlace al documento (opcional)</label>
            <input type="url" id="disp-acta-archivo" placeholder="https://drive.google.com/...">
          </div>
          <div class="form-group">
            <label>Archivo PDF del acta (opcional)</label>
            <input type="file" id="disp-acta-pdf" accept="application/pdf">
            <div class="readonly-hint" id="disp-acta-pdf-info">Sube el PDF firmado (máx ~5 MB).</div>
          </div>
          <div class="form-group">
            <label>Observaciones</label>
            <textarea id="disp-acta-obs" rows="2" placeholder="Detalles, contexto..."></textarea>
          </div>
        </div>
      </div>

      <input type="hidden" id="disp-id">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-dispositivo')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Novedad -->
<div class="modal-overlay" id="modal-novedad">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;">Registrar Novedad</h3>
      <button onclick="closeModal('modal-novedad')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form onsubmit="saveNovedad(event)">
      <div class="form-group"><label>Dispositivo *</label><select id="nov-dispositivo" required></select></div>
      <div class="form-group"><label>Tipo de Novedad *</label><select id="nov-tipo" required onchange="checkNovedadTipo()"></select></div>
      <div class="form-group" id="nov-sala-group" style="display:none;"><label>Nueva Sala (Movimiento)</label><select id="nov-nueva-sala"></select></div>
      <div class="form-group" id="nov-estado-group" style="display:none;"><label>Nuevo Estado</label><select id="nov-nuevo-estado"></select></div>
      <div class="form-group"><label>Descripción *</label><textarea id="nov-descripcion" rows="3" required placeholder="Describa detalladamente la novedad..."></textarea></div>
      <div style="padding:12px;background:#fffbeb;border-radius:8px;margin-bottom:16px;">
        <strong style="font-size:13px;color:#92400e;"><i class="fas fa-file-alt"></i> Datos del Acta (opcional)</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
          <div class="form-group" style="margin:0;"><label>N° Acta</label><input type="text" id="nov-acta" placeholder="ACT-2024-001"></div>
          <div class="form-group" style="margin:0;"><label>Firmantes</label><input type="text" id="nov-firmantes" placeholder="Rector, Tesorero..."></div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-novedad')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Registrar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Préstamo -->
<div class="modal-overlay" id="modal-prestamo">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;">Nuevo Préstamo Interno</h3>
      <button onclick="closeModal('modal-prestamo')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form onsubmit="savePrestamo(event)">
      <div class="form-group"><label>Dispositivo *</label><select id="pres-dispositivo" required></select></div>
      <div class="form-group"><label>Profesor que Autoriza *</label><select id="pres-profesor" required></select></div>
      <div class="form-group"><label>Estudiante / Persona Solicitante *</label><input type="text" id="pres-estudiante" placeholder="Nombre - Grado" required></div>
      <div class="form-group"><label>Fecha Devolución Esperada *</label><input type="date" id="pres-fecha-dev" required></div>
      <div class="form-group"><label>Observaciones</label><textarea id="pres-obs" rows="2" placeholder="Condición del equipo, motivo del préstamo..."></textarea></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-prestamo')">Cancelar</button>
        <button type="submit" class="btn btn-success"><i class="fas fa-handshake"></i> Registrar Préstamo</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Sala -->
<div class="modal-overlay" id="modal-sala">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;" id="modal-sala-title">Nueva Sala</h3>
      <button onclick="closeModal('modal-sala')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form id="form-sala" onsubmit="saveSala(event)">
      <div class="form-group"><label>Nombre de la Sala *</label><input type="text" id="sala-nombre" required placeholder="Sala de Informática 1"></div>
      <div class="form-group"><label>Ubicación Física</label><input type="text" id="sala-ubicacion" placeholder="Bloque A - Piso 1"></div>
      <div class="form-group"><label>Profesor Custodio *</label><select id="sala-profesor" required></select></div>
      <input type="hidden" id="sala-id">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-sala')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Profesor -->
<div class="modal-overlay" id="modal-profesor">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;" id="modal-prof-title">Nuevo Profesor</h3>
      <button onclick="closeModal('modal-profesor')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form onsubmit="saveProfesor(event)">
      <div style="padding:12px;background:#f0f9ff;border-radius:8px;margin-bottom:16px;font-size:13px;color:#1e40af;">
        <i class="fas fa-info-circle"></i> Al crear un profesor aquí, también se crea automáticamente su cuenta de acceso al sistema con contraseña <strong>prof123</strong> (puedes cambiarla luego en Usuarios).
      </div>
      <div class="form-group"><label>Nombre Completo *</label><input type="text" id="prof-nombre" required placeholder="Juan García Pérez"></div>
      <div class="form-group"><label>Email Institucional *</label><input type="email" id="prof-email" required placeholder="jgarcia@colegio.edu.co"></div>
      <div class="form-group"><label>Documento de Identidad *</label><input type="text" id="prof-doc" required placeholder="12345678"></div>
      <div class="form-group"><label>Departamento / Área</label><input type="text" id="prof-dep" placeholder="Tecnología e Informática"></div>
      <div class="form-group"><label>Contraseña inicial</label><input type="text" id="prof-pass" placeholder="prof123 (por defecto)" value="prof123"></div>
      <input type="hidden" id="prof-id">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-profesor')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Usuario -->
<div class="modal-overlay" id="modal-usuario">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;">Nuevo Usuario del Sistema</h3>
      <button onclick="closeModal('modal-usuario')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form onsubmit="saveUsuario(event)">
      <div class="form-group"><label>Nombre Completo *</label><input type="text" id="usu-nombre" required placeholder="María Torres González"></div>
      <div class="form-group"><label>Email (será el usuario de ingreso) *</label><input type="email" id="usu-email" required placeholder="mtorres@colegio.edu.co"></div>
      <div class="form-group"><label>Contraseña *</label><input type="text" id="usu-pass" required placeholder="contraseña123"></div>
      <div class="form-group">
        <label>Rol *</label>
        <select id="usu-rol" required>
          <option value="1">Tesorero (acceso total)</option>
          <option value="2">Contador (solo financiero)</option>
          <option value="3">Rector (dashboard + solicitudes)</option>
          <option value="5">Profesor (su sala asignada)</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-usuario')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Crear Usuario</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal Cambiar Contraseña -->
<div class="modal-overlay" id="modal-cambiar-pass">
  <div class="modal" style="max-width:400px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;">Cambiar Contraseña</h3>
      <button onclick="closeModal('modal-cambiar-pass')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <input type="hidden" id="cp-user-id">
    <div class="form-group"><label>Nueva Contraseña *</label><input type="text" id="cp-nueva-pass" required placeholder="nuevaContraseña123"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
      <button class="btn btn-outline" onclick="closeModal('modal-cambiar-pass')">Cancelar</button>
      <button class="btn btn-primary" onclick="cambiarPassword()"><i class="fas fa-key"></i> Cambiar</button>
    </div>
  </div>
</div>

<!-- Modal Detalle Dispositivo -->
<div class="modal-overlay" id="modal-detalle">
  <div class="modal modal-lg">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;" class="no-print">
      <h3 style="font-weight:700;color:#1e3a8a;" id="detalle-title">Detalle del Dispositivo</h3>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" id="btn-imprimir-detalle" onclick="imprimirDetalle()"><i class="fas fa-print"></i> Imprimir</button>
        <button class="btn btn-outline btn-sm" id="btn-solicitar-imprimir" onclick="solicitarImprimir()" style="display:none;"><i class="fas fa-print"></i> Solicitar Imprimir</button>
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-detalle')">✕</button>
      </div>
    </div>
    <div id="detalle-content"></div>
  </div>
</div>

<!-- Área de impresión limpia (solo se muestra al imprimir) -->
<div id="print-area" class="print-only"></div>

<!-- Modal Confirmar Borrar Catálogo (solo Tesorero) -->
<div class="modal-overlay" id="modal-confirm-delete">
  <div class="modal" style="max-width:420px;">
    <div style="text-align:center;padding:10px 0 20px;">
      <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc2626;margin-bottom:16px;display:block;"></i>
      <h3 style="font-weight:700;color:#1e3a8a;margin-bottom:8px;">Confirmar Eliminación</h3>
      <p style="color:#64748b;font-size:14px;" id="confirm-delete-msg">¿Estás seguro? Esta acción solo puede realizarla el Tesorero y requiere confirmación.</p>
    </div>
    <input type="hidden" id="confirm-delete-type">
    <input type="hidden" id="confirm-delete-id">
    <div style="display:flex;justify-content:center;gap:12px;margin-top:8px;">
      <button class="btn btn-outline" onclick="closeModal('modal-confirm-delete')">Cancelar</button>
      <button class="btn btn-danger" onclick="confirmarBorrarCatalogo()"><i class="fas fa-trash"></i> Confirmar Eliminación</button>
    </div>
  </div>
</div>

<!-- ====== Pretty Dialog (reemplaza alert/confirm/prompt nativos) ====== -->
<div class="pretty-dialog-overlay" id="pretty-dialog">
  <div class="pretty-dialog">
    <div class="pretty-dialog-header">
      <div class="pretty-dialog-icon" id="pd-icon"><i class="fas fa-info-circle"></i></div>
      <div class="pretty-dialog-title" id="pd-title">Aviso</div>
    </div>
    <div class="pretty-dialog-body" id="pd-message">¿Estás seguro?</div>
    <div class="pretty-dialog-explain" id="pd-explain" style="display:none;"></div>
    <div class="pretty-dialog-input" id="pd-input-wrap" style="display:none;">
      <input type="text" id="pd-input" />
    </div>
    <div class="pretty-dialog-input" id="pd-input2-wrap" style="display:none;">
      <input type="text" id="pd-input2" />
    </div>
    <div class="pretty-dialog-footer">
      <button class="btn btn-outline" id="pd-cancel">Cancelar</button>
      <button class="btn btn-primary" id="pd-confirm">Aceptar</button>
    </div>
  </div>
</div>

<!-- ====== Modal Catálogo (Crear/Editar tipo/propietario/estado, bonito) ====== -->
<div class="modal-overlay" id="modal-catalogo-item">
  <div class="modal" style="max-width:480px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-weight:700;color:#1e3a8a;" id="modal-catalogo-title">Nuevo elemento</h3>
      <button onclick="closeModal('modal-catalogo-item')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form id="form-catalogo" onsubmit="saveCatalogoItem(event)">
      <input type="hidden" id="cat-tipo-key">
      <input type="hidden" id="cat-id">
      <div class="form-group">
        <label id="cat-label-1">Nombre *</label>
        <input type="text" id="cat-campo-1" required>
      </div>
      <div class="form-group" id="cat-campo-2-wrap" style="display:none;">
        <label id="cat-label-2">Campo 2</label>
        <input type="text" id="cat-campo-2">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-catalogo-item')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- ====== Modal Baja (dar de baja / sacar dispositivo) ====== -->
<div class="modal-overlay" id="modal-baja">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-weight:700;color:#7f1d1d;"><i class="fas fa-archive"></i> Dar de baja / Sacar dispositivo</h3>
      <button onclick="closeModal('modal-baja')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <div style="background:#fee2e2;border-left:4px solid #dc2626;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:13px;color:#7f1d1d;">
      <i class="fas fa-exclamation-triangle"></i> <strong>Acción crítica.</strong> Al sacar el dispositivo es OBLIGATORIO: indicar el nuevo propietario al que va, especificar el tipo de baja, y vincular o crear un acta firmada. Quedará registrado en la <strong>Lista de Bajas</strong> de forma inmutable.
    </div>
    <form id="form-baja" onsubmit="saveBaja(event)">
      <input type="hidden" id="baja-dispositivo-id">
      <div style="background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:14px;font-size:13px;">
        <div><strong>Dispositivo:</strong> <span id="baja-disp-info">-</span></div>
        <div><strong>Propietario actual:</strong> <span id="baja-disp-actual">-</span></div>
        <div><strong>Propietario de origen:</strong> <span id="baja-disp-origen">-</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="form-group">
          <label>Tipo de baja *</label>
          <select id="baja-tipo" required>
            <option value="Baja">Baja (descarte definitivo)</option>
            <option value="Donación">Donación</option>
            <option value="Venta">Venta</option>
            <option value="Devolución">Devolución</option>
            <option value="Pérdida">Pérdida</option>
            <option value="Obsolescencia">Obsolescencia</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nuevo propietario (existente)</label>
          <select id="baja-prop-existente">
            <option value="">— Seleccionar o escribir abajo —</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Nuevo propietario (texto libre, si no está en la lista) *</label>
        <input type="text" id="baja-prop-nombre" placeholder="Ej: Alcaldía de Medellín / Familia Pérez / Gestores Ambientales SAS">
        <div class="readonly-hint">Si seleccionaste un propietario arriba, este campo se autocompleta. Si va a alguien externo, escríbelo aquí.</div>
      </div>
      <div class="form-group">
        <label>Motivo</label>
        <textarea id="baja-motivo" rows="2" placeholder="Razón del retiro / baja..."></textarea>
      </div>

      <!-- ACTA OBLIGATORIA -->
      <div style="border:2px solid #dc2626;border-radius:10px;padding:14px;margin-top:6px;background:#fef2f2;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <h5 style="font-weight:700;color:#7f1d1d;margin:0;"><i class="fas fa-file-signature"></i> Acta de Salida * <span style="font-size:11px;font-weight:500;color:#991b1b;">(obligatoria)</span></h5>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" id="baja-acta-modo-nueva" onclick="bajaActaSetModo('nueva')"><i class="fas fa-plus"></i> Crear acta nueva</button>
            <button type="button" class="btn btn-outline btn-sm" id="baja-acta-modo-vincular" onclick="bajaActaSetModo('vincular')"><i class="fas fa-link"></i> Vincular existente</button>
          </div>
        </div>
        <div id="baja-acta-modo-vincular-wrap" style="display:none;">
          <div class="form-group" style="margin:0;">
            <label>Acta existente</label>
            <select id="baja-acta-existente"></select>
          </div>
        </div>
        <div id="baja-acta-modo-nueva-wrap">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label>N° Acta *</label>
              <input type="text" id="baja-acta-num" placeholder="ACT-2024-XXX">
            </div>
            <div class="form-group" style="margin:0;">
              <label>Tipo</label>
              <select id="baja-acta-tipo">
                <option value="Salida">Salida</option>
                <option value="Baja">Baja</option>
                <option value="Donación">Donación</option>
                <option value="Venta">Venta</option>
                <option value="Devolución">Devolución</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label>Firmantes</label>
            <input type="text" id="baja-acta-firmantes" placeholder="Tesorero, Rector, Receptor...">
          </div>
          <div class="form-group">
            <label>URL/Enlace al documento (opcional)</label>
            <input type="url" id="baja-acta-archivo" placeholder="https://drive.google.com/...">
          </div>
          <div class="form-group">
            <label>Archivo PDF del acta (opcional, máx ~5 MB)</label>
            <input type="file" id="baja-acta-pdf" accept="application/pdf">
          </div>
          <div class="form-group">
            <label>Observaciones del acta</label>
            <textarea id="baja-acta-obs" rows="2" placeholder="Detalles, contexto..."></textarea>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-top:14px;">
        <label>Observaciones adicionales de la baja</label>
        <textarea id="baja-obs" rows="2" placeholder="Notas internas..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-baja')">Cancelar</button>
        <button type="submit" class="btn btn-danger"><i class="fas fa-archive"></i> Confirmar baja</button>
      </div>
    </form>
  </div>
</div>

<!-- ====== Modal Acta (crear acta independiente) ====== -->
<div class="modal-overlay" id="modal-acta">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-weight:700;color:#1e3a8a;" id="modal-acta-title">Registrar Acta</h3>
      <button onclick="closeModal('modal-acta')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
    </div>
    <form onsubmit="saveActa(event)">
      <input type="hidden" id="acta-id">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="form-group">
          <label>N° Acta *</label>
          <input type="text" id="acta-numero" placeholder="ACT-2024-001" required>
        </div>
        <div class="form-group">
          <label>Tipo de Acta *</label>
          <select id="acta-tipo" required>
            <option value="Entrada">Acta de Entrada / Alta</option>
            <option value="Movimiento">Acta de Movimiento</option>
            <option value="Salida">Acta de Salida</option>
            <option value="Mantenimiento">Acta de Mantenimiento</option>
            <option value="Baja">Acta de Baja</option>
            <option value="Cambio de Custodia">Acta de Cambio de Custodia</option>
            <option value="Cambio de Propietario">Acta de Cambio de Propietario</option>
            <option value="General">General / Otro</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Dispositivo asociado *</label>
        <select id="acta-dispositivo" required></select>
      </div>
      <div class="form-group">
        <label>Firmantes</label>
        <input type="text" id="acta-firmantes" placeholder="Tesorero, Rector, Profesor X...">
      </div>
      <div class="form-group">
        <label>URL/Enlace del documento (opcional)</label>
        <input type="url" id="acta-archivo" placeholder="https://drive.google.com/... o ruta interna">
        <div class="readonly-hint">Pega el enlace al PDF o documento escaneado externo. Si vas a subir el archivo directamente, usa el campo de abajo.</div>
      </div>
      <div class="form-group">
        <label>Archivo PDF del acta firmada (opcional, máx ~5 MB)</label>
        <input type="file" id="acta-pdf" accept="application/pdf">
        <div class="readonly-hint" id="acta-pdf-info">Sube el PDF escaneado y firmado del acta.</div>
        <div id="acta-pdf-actual" style="display:none;margin-top:8px;padding:10px;background:#dcfce7;border-left:4px solid #16a34a;border-radius:8px;font-size:13px;">
          <i class="fas fa-file-pdf" style="color:#dc2626;"></i> <strong>Hay un PDF guardado:</strong> <span id="acta-pdf-actual-nombre">-</span>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            <a id="acta-pdf-actual-link" href="#" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-download"></i> Descargar / Ver</a>
            <button type="button" class="btn btn-danger btn-sm" onclick="marcarEliminarPdfActa()"><i class="fas fa-trash"></i> Eliminar PDF</button>
          </div>
          <input type="hidden" id="acta-pdf-eliminar" value="0">
        </div>
      </div>
      <div class="form-group">
        <label>Observaciones</label>
        <textarea id="acta-obs" rows="3" placeholder="Detalles del acta, motivo, contexto..."></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-acta')">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Acta</button>
      </div>
    </form>
  </div>
</div>

<script>
// ======================================================
// ESTADO GLOBAL
// ======================================================
let currentUser = null;
let catalogData = { tipos: [], propietarios: [], estados: [], salas: [], profesores: [], tiposNovedad: [] };
let chartTipo = null, chartSala = null, chartTipoCont = null, chartSalaCont = null, chartTipoProf = null;
let inventarioData = [];
let currentPrestamosFilter = '';

// ======================================================
// PERMISOS POR ROL
// ======================================================
const PERMISOS = {
  Tesorero: {
    nav: [
      { section: 'Principal', items: [{ id: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' }] },
      { section: 'Inventario', items: [
        { id: 'dispositivos', icon: 'fa-laptop', label: 'Dispositivos' },
        { id: 'salas', icon: 'fa-door-open', label: 'Salas' },
        { id: 'profesores', icon: 'fa-chalkboard-teacher', label: 'Profesores' },
      ]},
      { section: 'Trazabilidad', items: [
        { id: 'novedades', icon: 'fa-history', label: 'Novedades' },
        { id: 'actas', icon: 'fa-file-alt', label: 'Actas' },
        { id: 'garantias', icon: 'fa-shield-alt', label: 'Garantías' },
        { id: 'bajas', icon: 'fa-archive', label: 'Bajas' },
      ]},
      { section: 'Reportes', items: [
        { id: 'reportes', icon: 'fa-chart-bar', label: 'Reportes' },
        { id: 'auditoria', icon: 'fa-search', label: 'Auditoría' },
      ]},
      { section: 'Catálogos', items: [
        { id: 'catalogos', icon: 'fa-tags', label: 'Catálogos' },
        { id: 'usuarios', icon: 'fa-users', label: 'Usuarios del Sistema' },
      ]},
    ],
    defaultPage: 'dashboard',
    puedeEditar: true,
    puedeBorrarCatalogos: true,
  },
  Rector: {
    nav: [
      { section: 'Principal', items: [{ id: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard General' }] },
      { section: 'Reportes', items: [
        { id: 'solicitar-reporte', icon: 'fa-file-signature', label: 'Solicitar Reporte' },
        { id: 'garantias', icon: 'fa-shield-alt', label: 'Ver Garantías' },
        { id: 'bajas', icon: 'fa-archive', label: 'Ver Bajas' },
        { id: 'auditoria', icon: 'fa-search', label: 'Auditoría' },
      ]},
    ],
    defaultPage: 'dashboard',
    puedeEditar: false,
    puedeBorrarCatalogos: false,
  },
  Contador: {
    nav: [
      { section: 'Principal', items: [{ id: 'dashboard-contador', icon: 'fa-calculator', label: 'Resumen Financiero' }] },
      { section: 'Reportes', items: [
        { id: 'solicitar-reporte', icon: 'fa-file-signature', label: 'Solicitar Reporte' },
        { id: 'bajas', icon: 'fa-archive', label: 'Bajas (Financiero)' },
      ]},
    ],
    defaultPage: 'dashboard-contador',
    puedeEditar: false,
    puedeBorrarCatalogos: false,
  },
  Profesor: {
    nav: [
      { section: 'Mi Sala', items: [{ id: 'dashboard-profesor', icon: 'fa-tachometer-alt', label: 'Mi Dashboard' }] },
      { section: 'Inventario', items: [
        { id: 'dispositivos', icon: 'fa-laptop', label: 'Dispositivos de mi Sala' },
        { id: 'garantias', icon: 'fa-shield-alt', label: 'Garantías' },
      ]},
      { section: 'Operación', items: [
        { id: 'prestamos', icon: 'fa-handshake', label: 'Préstamos (Privado)' },
        { id: 'auditoria', icon: 'fa-search', label: 'Mi Auditoría' },
      ]},
      { section: 'Reportes', items: [
        { id: 'solicitar-reporte', icon: 'fa-file-signature', label: 'Solicitar Reporte' },
      ]},
    ],
    defaultPage: 'dashboard-profesor',
    puedeEditar: false,
    puedeBorrarCatalogos: false,
  },
};

// ======================================================
// UTILS
// ======================================================
const $ = id => document.getElementById(id);
const fmt = n => n ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '-';
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtDateTime = d => d ? new Date(d).toLocaleString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';

function toast(msg, type='success') {
  const tc = $('toast-container');
  const t = document.createElement('div');
  const icons = {success:'fas fa-check-circle',error:'fas fa-times-circle',info:'fas fa-info-circle'};
  const colors = {success:'#16a34a',error:'#dc2626',info:'#3b82f6'};
  t.className = \`toast toast-\${type}\`;
  t.innerHTML = \`<i class="\${icons[type]}" style="color:\${colors[type]};font-size:18px;"></i><span style="font-size:14px;">\${msg}</span>\`;
  tc.appendChild(t);
  setTimeout(()=>t.remove(),4200);
}
function showLoading(id){ const el=$(id); if(el) el.innerHTML='<tr><td colspan="20" style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>'; }
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }

// ======================================================
// PRETTY DIALOG (reemplaza alert/confirm/prompt)
// ======================================================
function _pdReset(){
  $('pd-input-wrap').style.display='none';
  $('pd-input2-wrap').style.display='none';
  $('pd-explain').style.display='none';
  $('pd-input').value=''; $('pd-input2').value='';
  $('pd-cancel').style.display='inline-flex';
  $('pd-confirm').textContent='Aceptar';
  $('pd-cancel').textContent='Cancelar';
  $('pd-confirm').className='btn btn-primary';
}
function _pdSetIcon(kind){
  const el=$('pd-icon');
  const iconMap={info:'fa-info-circle',warn:'fa-exclamation-triangle',danger:'fa-times-circle',success:'fa-check-circle',question:'fa-question-circle'};
  const colorMap={info:'#3b82f6',warn:'#d97706',danger:'#dc2626',success:'#16a34a',question:'#7c3aed'};
  const bgMap={info:'#dbeafe',warn:'#fef3c7',danger:'#fee2e2',success:'#dcfce7',question:'#ede9fe'};
  el.style.background=bgMap[kind]||bgMap.info;
  el.style.color=colorMap[kind]||colorMap.info;
  el.innerHTML=\`<i class="fas \${iconMap[kind]||iconMap.info}"></i>\`;
}
// Lee un File como base64 (devuelve un dataURL completo: "data:application/pdf;base64,...")
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;}
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}
function prettyAlert(opts){
  return new Promise(resolve=>{
    _pdReset();
    opts=opts||{};
    _pdSetIcon(opts.kind||'info');
    $('pd-title').textContent=opts.title||'Aviso';
    $('pd-message').textContent=opts.message||'';
    if(opts.explain){$('pd-explain').textContent=opts.explain;$('pd-explain').style.display='block';}
    $('pd-cancel').style.display='none';
    $('pd-confirm').textContent=opts.okText||'Entendido';
    openModal('pretty-dialog');
    const cleanup=()=>{$('pd-confirm').onclick=null;closeModal('pretty-dialog');resolve();};
    $('pd-confirm').onclick=cleanup;
  });
}
function prettyConfirm(opts){
  return new Promise(resolve=>{
    _pdReset();
    opts=opts||{};
    _pdSetIcon(opts.kind||'question');
    $('pd-title').textContent=opts.title||'¿Confirmar?';
    $('pd-message').textContent=opts.message||'¿Estás seguro?';
    if(opts.explain){$('pd-explain').textContent=opts.explain;$('pd-explain').style.display='block';}
    $('pd-confirm').textContent=opts.okText||'Confirmar';
    $('pd-cancel').textContent=opts.cancelText||'Cancelar';
    if(opts.danger){ $('pd-confirm').className='btn btn-danger'; }
    openModal('pretty-dialog');
    const cleanup=v=>{$('pd-confirm').onclick=null;$('pd-cancel').onclick=null;closeModal('pretty-dialog');resolve(v);};
    $('pd-confirm').onclick=()=>cleanup(true);
    $('pd-cancel').onclick=()=>cleanup(false);
  });
}
function prettyPrompt(opts){
  return new Promise(resolve=>{
    _pdReset();
    opts=opts||{};
    _pdSetIcon(opts.kind||'info');
    $('pd-title').textContent=opts.title||'Ingrese un valor';
    $('pd-message').textContent=opts.message||'';
    if(opts.explain){$('pd-explain').textContent=opts.explain;$('pd-explain').style.display='block';}
    $('pd-input-wrap').style.display='block';
    $('pd-input').type=opts.inputType||'text';
    $('pd-input').placeholder=opts.placeholder||'';
    $('pd-input').value=opts.defaultValue||'';
    $('pd-confirm').textContent=opts.okText||'Aceptar';
    openModal('pretty-dialog');
    setTimeout(()=>$('pd-input').focus(),100);
    const cleanup=v=>{$('pd-confirm').onclick=null;$('pd-cancel').onclick=null;closeModal('pretty-dialog');resolve(v);};
    $('pd-confirm').onclick=()=>cleanup($('pd-input').value);
    $('pd-cancel').onclick=()=>cleanup(null);
  });
}
function statusBadge(estado){
  const map={'Activo':'green','En Mantenimiento':'yellow','Dado de Baja':'red','En Préstamo':'blue','En Reparación':'yellow','Perdido':'red','Devuelto':'green','Vigente':'green','Vencida':'red','Sin garantía':'gray'};
  return \`<span class="badge badge-\${map[estado]||'gray'}">\${estado||'-'}</span>\`;
}
function roleBadge(rol){
  const map={'Tesorero':'role-tesorero','Rector':'role-rector','Contador':'role-contador','Profesor':'role-profesor'};
  return \`<span class="badge \${map[rol]||'badge-gray'}">\${rol||'-'}</span>\`;
}
function toggleSidebar(){ $('sidebar').classList.toggle('collapsed'); }

// ======================================================
// AUTH
// ======================================================
async function login(){
  const email=$('login-email').value.trim();
  const pass=$('login-pass').value;
  if(!email||!pass){toast('Ingresa correo y contraseña','error');return;}
  try{
    const res=await axios.post('/api/auth/login',{email,password:pass});
    currentUser=res.data.data;
    $('login-screen').style.display='none';
    $('app-shell').style.display='flex';
    setupUI();
    await loadCatalogs();
    const perms = PERMISOS[currentUser.rol] || PERMISOS.Tesorero;
    navigate(perms.defaultPage);
    toast(\`Bienvenido/a, \${currentUser.nombre.split(' ')[0]}! 👋\`);
  } catch(e){
    toast(e.response?.data?.error||'Error de autenticación','error');
  }
}

function logout(){
  currentUser=null;
  [chartTipo,chartSala,chartTipoCont,chartSalaCont,chartTipoProf].forEach(c=>{if(c)c.destroy()});
  chartTipo=chartSala=chartTipoCont=chartSalaCont=chartTipoProf=null;
  $('login-screen').style.display='flex';
  $('app-shell').style.display='none';
  $('login-email').value='';
  $('login-pass').value='';
}

// ======================================================
// SETUP UI POR ROL
// ======================================================
function setupUI(){
  const rol=currentUser.rol;
  const perms=PERMISOS[rol]||PERMISOS.Tesorero;
  // Topbar
  $('user-display').textContent=currentUser.nombre;
  const rolBadgeEl=$('role-badge');
  const rolColors={'Tesorero':'role-tesorero','Rector':'role-rector','Contador':'role-contador','Profesor':'role-profesor'};
  rolBadgeEl.className=\`badge \${rolColors[rol]||'badge-gray'}\`;
  rolBadgeEl.textContent=rol;
  $('sidebar-user-role').textContent=rol;
  $('sidebar-user-name').textContent=currentUser.nombre;
  // Build sidebar nav
  let navHTML='';
  perms.nav.forEach(sec=>{
    navHTML+=\`<div class="sidebar-section">\${sec.section}</div>\`;
    sec.items.forEach(item=>{
      navHTML+=\`<a class="sidebar-link" onclick="navigate('\${item.id}')" id="nav-\${item.id}"><i class="fas \${item.icon}"></i> \${item.label}</a>\`;
    });
  });
  $('sidebar-nav').innerHTML=navHTML;
  // Botones condicionales
  const canEdit = perms.puedeEditar;
  setTimeout(()=>{
    const btnDisp=$('btn-nuevo-disp');
    if(btnDisp) btnDisp.style.display=canEdit?'inline-flex':'none';
    const btnSala=$('btn-nueva-sala');
    if(btnSala) btnSala.style.display=canEdit?'inline-flex':'none';
    const btnNovedad=$('btn-nueva-novedad');
    if(btnNovedad) btnNovedad.style.display=canEdit?'inline-flex':'none';
  },100);
  // Subtítulo catálogos
  if($('catalogos-subtitle')){
    $('catalogos-subtitle').textContent=canEdit?'Solo el Tesorero puede eliminar entradas. Se requiere confirmación antes de borrar.':'Solo lectura. No tienes permisos para modificar catálogos.';
    const sbi=$('solicitud-borrar-info');
    if(sbi) sbi.style.display=canEdit?'none':'block';
  }
}

// ======================================================
// NAVIGATION
// ======================================================
function navigate(page){
  // Verificar permisos
  const perms=PERMISOS[currentUser?.rol]||PERMISOS.Tesorero;
  const allowedPages=perms.nav.flatMap(s=>s.items.map(i=>i.id));
  if(!allowedPages.includes(page)){
    page='acceso-denegado';
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.remove('active'));
  const pageEl=$('page-'+page);
  if(pageEl) pageEl.classList.add('active');
  const navEl=$('nav-'+page);
  if(navEl) navEl.classList.add('active');
  const titles={
    'dashboard':'Dashboard','dashboard-contador':'Resumen Financiero','dashboard-profesor':'Mi Dashboard',
    'dispositivos':'Dispositivos','salas':'Salas','profesores':'Profesores','usuarios':'Usuarios del Sistema',
    'novedades':'Novedades','actas':'Actas','garantias':'Garantías','prestamos':'Préstamos Internos',
    'reportes':'Reportes','solicitar-reporte':'Solicitar Reporte','auditoria':'Auditoría','catalogos':'Catálogos',
    'bajas':'Registro de Bajas',
    'acceso-denegado':'Acceso Restringido'
  };
  $('page-title').textContent=titles[page]||page;
  // Loaders
  const loaders={
    'dashboard':loadDashboard,
    'dashboard-contador':loadDashboardContador,
    'dashboard-profesor':loadDashboardProfesor,
    'dispositivos':loadDispositivos,
    'salas':loadSalas,
    'profesores':loadProfesores,
    'usuarios':loadUsuarios,
    'novedades':loadNovedades,
    'actas':loadActas,
    'garantias':loadGarantias,
    'prestamos':()=>loadPrestamos(''),
    'reportes':()=>{loadSolicitudesReporte();populateFiltroSalaReporte();},
    'solicitar-reporte':()=>{loadMisSolicitudes();populateSolSalas();},
    'auditoria':loadAuditoria,
    'catalogos':()=>showCatalogo('tipos',document.querySelector('.tab-btn')),
    'bajas':loadBajas,
  };
  if(loaders[page]) loaders[page]();
  // Mobile: close sidebar
  $('sidebar').classList.remove('mobile-open');
}

// ======================================================
// CATALOGOS (datos internos)
// ======================================================
async function loadCatalogs(){
  try{
    const [tipos,propietarios,estados,salas,profesores,tiposNov]=await Promise.all([
      axios.get('/api/catalogos/tipos-dispositivo'),
      axios.get('/api/catalogos/propietarios'),
      axios.get('/api/catalogos/estados'),
      axios.get('/api/catalogos/salas'),
      axios.get('/api/catalogos/profesores'),
      axios.get('/api/catalogos/tipos-novedad'),
    ]);
    catalogData.tipos=tipos.data.data;
    catalogData.propietarios=propietarios.data.data;
    catalogData.estados=estados.data.data;
    catalogData.salas=salas.data.data;
    catalogData.profesores=profesores.data.data;
    catalogData.tiposNovedad=tiposNov.data.data;
    // Filtros
    const se=$('filter-estado');
    if(se){se.innerHTML='<option value="">Todos los estados</option>';catalogData.estados.forEach(e=>se.innerHTML+=\`<option value="\${e.id}">\${e.estado}</option>\`);}
    const ss=$('filter-sala');
    if(ss){ss.innerHTML='<option value="">Todas las salas</option>';catalogData.salas.forEach(s=>ss.innerHTML+=\`<option value="\${s.id}">\${s.nombre_sala}</option>\`);}
  }catch(e){console.error('Error loading catalogs',e);}
}

// ======================================================
// DASHBOARD TESORERO / RECTOR
// ======================================================
async function loadDashboard(){
  try{
    const res=await axios.get('/api/reportes/dashboard');
    const d=res.data.data;
    const r=d.resumen;
    const isRector=currentUser.rol==='Rector';
    // Stats — rector no ve préstamos
    let statsArr=[
      {label:'Total Dispositivos',value:r.total_dispositivos,icon:'fas fa-laptop',color:'#1e40af',bg:'#dbeafe'},
      {label:'Activos',value:r.activos,icon:'fas fa-check-circle',color:'#16a34a',bg:'#dcfce7'},
      {label:'En Mantenimiento',value:r.en_mantenimiento,icon:'fas fa-tools',color:'#d97706',bg:'#fef9c3'},
      {label:'Dados de Baja',value:r.dados_de_baja,icon:'fas fa-times-circle',color:'#dc2626',bg:'#fee2e2'},
      {label:'Salas',value:r.total_salas,icon:'fas fa-door-open',color:'#7c3aed',bg:'#ede9fe'},
      {label:'Profesores',value:r.total_profesores,icon:'fas fa-chalkboard-teacher',color:'#0891b2',bg:'#cffafe'},
    ];
    if(!isRector){
      statsArr.push({label:'Préstamos Activos',value:r.prestamos_activos,icon:'fas fa-handshake',color:'#be185d',bg:'#fce7f3'});
    }
    // Valor inventario activo vs costo total
    statsArr.push({label:'Valor Inventario Activo',value:fmt(r.valor_total_inventario),icon:'fas fa-dollar-sign',color:'#065f46',bg:'#d1fae5',isText:true});
    if(!isRector){
      statsArr.push({label:'Costo Total Adquisición',value:fmt(r.valor_costo_total),icon:'fas fa-money-bill-alt',color:'#78350f',bg:'#fef3c7',isText:true});
    }
    $('stats-grid').innerHTML=statsArr.map(s=>\`
      <div class="stat-card" style="border-left-color:\${s.color};">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">\${s.label}</div>
            <div style="font-size:\${s.isText?'18px':'32px'};font-weight:700;color:\${s.color};margin-top:4px;">\${s.value}</div>
          </div>
          <div style="background:\${s.bg};padding:10px;border-radius:10px;">
            <i class="\${s.icon}" style="color:\${s.color};font-size:20px;"></i>
          </div>
        </div>
      </div>\`).join('');
    // Charts
    const colors=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316'];
    if(chartTipo) chartTipo.destroy();
    chartTipo=new Chart($('chart-tipo'),{type:'doughnut',data:{labels:d.por_tipo.map(t=>t.nombre_tipo),datasets:[{data:d.por_tipo.map(t=>t.cantidad),backgroundColor:colors,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:14}}}}});
    if(chartSala) chartSala.destroy();
    chartSala=new Chart($('chart-sala'),{type:'bar',data:{labels:d.por_sala.map(s=>s.nombre_sala),datasets:[{label:'Dispositivos',data:d.por_sala.map(s=>s.cantidad),backgroundColor:'#3b82f6',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true},x:{ticks:{font:{size:10}}}}}});
    // Novedades recientes (rector ve todo, tesorero también)
    const nl=$('novedades-recientes-list');
    if(d.novedades_recientes.length===0){nl.innerHTML='<div class="empty-state"><i class="fas fa-inbox"></i><p>Sin novedades recientes</p></div>';}
    else{nl.innerHTML=d.novedades_recientes.map(n=>\`
      <div style="display:flex;align-items:start;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div style="background:#dbeafe;padding:6px;border-radius:8px;min-width:32px;text-align:center;"><i class="fas fa-bell" style="color:#1e40af;font-size:12px;"></i></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#1e293b;">\${n.tipo_novedad}</div>
          <div style="font-size:12px;color:#64748b;">\${n.codigo_patrimonial} \${n.marca?'· '+n.marca:''} — \${(n.descripcion||'').substring(0,55)}...</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">\${fmtDateTime(n.fecha_novedad)}</div>
        </div>
      </div>\`).join('');}
    // Garantías por vencer
    const gl=$('garantias-vencer-list');
    if(d.garantias_por_vencer.length===0){gl.innerHTML='<div style="text-align:center;padding:20px;color:#9ca3af;"><i class="fas fa-check-circle" style="font-size:32px;color:#16a34a;margin-bottom:8px;display:block;"></i><p>No hay garantías por vencer en 90 días</p></div>';}
    else{gl.innerHTML=d.garantias_por_vencer.map(g=>{
      const dias=Math.ceil((new Date(g.fecha_fin)-new Date())/86400000);
      return \`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div><div style="font-size:13px;font-weight:600;">\${g.codigo_patrimonial} — \${g.marca} \${g.modelo}</div><div style="font-size:12px;color:#64748b;">\${g.proveedor||'-'} · Vence: \${fmtDate(g.fecha_fin)}</div></div>
        <span class="badge \${dias<=30?'badge-red':'badge-yellow'}">\${dias}d</span>
      </div>\`}).join('');}
  }catch(e){toast('Error cargando dashboard: '+(e.response?.data?.error||e.message),'error');}
}

// ======================================================
// DASHBOARD CONTADOR
// ======================================================
async function loadDashboardContador(){
  try{
    const res=await axios.get('/api/reportes/dashboard');
    const d=res.data.data;
    const r=d.resumen;
    const stats=[
      {label:'Total Dispositivos',value:r.total_dispositivos,icon:'fas fa-laptop',color:'#1e40af',bg:'#dbeafe'},
      {label:'Activos',value:r.activos,icon:'fas fa-check-circle',color:'#16a34a',bg:'#dcfce7'},
      {label:'En Mantenimiento',value:r.en_mantenimiento,icon:'fas fa-tools',color:'#d97706',bg:'#fef9c3'},
      {label:'Dados de Baja',value:r.dados_de_baja,icon:'fas fa-times-circle',color:'#dc2626',bg:'#fee2e2'},
      {label:'Valor Inventario Activo',value:fmt(r.valor_total_inventario),icon:'fas fa-dollar-sign',color:'#065f46',bg:'#d1fae5',isText:true},
      {label:'Costo Total Adquisición',value:fmt(r.valor_costo_total),icon:'fas fa-money-bill-alt',color:'#78350f',bg:'#fef3c7',isText:true},
    ];
    $('stats-contador').innerHTML=stats.map(s=>\`
      <div class="stat-card" style="border-left-color:\${s.color};">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">\${s.label}</div>
            <div style="font-size:\${s.isText?'18px':'32px'};font-weight:700;color:\${s.color};margin-top:4px;">\${s.value}</div>
          </div>
          <div style="background:\${s.bg};padding:10px;border-radius:10px;"><i class="\${s.icon}" style="color:\${s.color};font-size:20px;"></i></div>
        </div>
      </div>\`).join('');
    const colors=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316'];
    if(chartTipoCont) chartTipoCont.destroy();
    chartTipoCont=new Chart($('chart-tipo-cont'),{type:'doughnut',data:{labels:d.por_tipo.map(t=>t.nombre_tipo),datasets:[{data:d.por_tipo.map(t=>t.cantidad),backgroundColor:colors,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:14}}}}});
    if(chartSalaCont) chartSalaCont.destroy();
    chartSalaCont=new Chart($('chart-sala-cont'),{type:'bar',data:{labels:d.por_sala.map(s=>s.nombre_sala),datasets:[{label:'Dispositivos',data:d.por_sala.map(s=>s.cantidad),backgroundColor:'#10b981',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true},x:{ticks:{font:{size:10}}}}}});
  }catch(e){toast('Error cargando resumen financiero','error');}
}

// ======================================================
// DASHBOARD PROFESOR
// ======================================================
async function loadDashboardProfesor(){
  try{
    if(!currentUser.salas_ids||currentUser.salas_ids.length===0){
      $('prof-sala-info').textContent='No tienes ninguna sala asignada. Contacta al tesorero.';
      $('stats-profesor').innerHTML='<div class="access-denied"><i class="fas fa-door-closed"></i><p>Sin sala asignada</p></div>';
      return;
    }
    const salaId=currentUser.salas_ids[0];
    const sala=catalogData.salas.find(s=>s.id===salaId);
    $('prof-sala-info').textContent=sala?\`Sala: \${sala.nombre_sala} · \${sala.ubicacion_fisica||''}\`:'Sala asignada';
    const res=await axios.get(\`/api/reportes/dashboard-profesor?sala_id=\${salaId}\`);
    const d=res.data.data;
    const r=d.resumen;
    const stats=[
      {label:'Total Dispositivos',value:r.total_dispositivos,icon:'fas fa-laptop',color:'#1e40af',bg:'#dbeafe'},
      {label:'Activos',value:r.activos,icon:'fas fa-check-circle',color:'#16a34a',bg:'#dcfce7'},
      {label:'En Mantenimiento',value:r.en_mantenimiento,icon:'fas fa-tools',color:'#d97706',bg:'#fef9c3'},
    ];
    $('stats-profesor').innerHTML=stats.map(s=>\`
      <div class="stat-card" style="border-left-color:\${s.color};">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div><div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">\${s.label}</div>
          <div style="font-size:32px;font-weight:700;color:\${s.color};margin-top:4px;">\${s.value}</div></div>
          <div style="background:\${s.bg};padding:10px;border-radius:10px;"><i class="\${s.icon}" style="color:\${s.color};font-size:20px;"></i></div>
        </div>
      </div>\`).join('');
    const colors=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
    if(chartTipoProf) chartTipoProf.destroy();
    if(d.por_tipo.length>0){
      chartTipoProf=new Chart($('chart-tipo-prof'),{type:'doughnut',data:{labels:d.por_tipo.map(t=>t.nombre_tipo),datasets:[{data:d.por_tipo.map(t=>t.cantidad),backgroundColor:colors,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:14}}}}});
    } else {
      $('chart-tipo-prof').parentElement.innerHTML='<div class="empty-state"><i class="fas fa-inbox"></i><p>Sin dispositivos en tu sala</p></div>';
    }
  }catch(e){toast('Error cargando dashboard','error');}
}

// ======================================================
// DISPOSITIVOS
// ======================================================
async function loadDispositivos(){
  showLoading('dispositivos-body');
  try{
    const search=$('search-dispositivos').value;
    const estado=$('filter-estado').value;
    const sala=$('filter-sala').value;
    const params=new URLSearchParams();
    if(search) params.set('search',search);
    if(estado) params.set('estado',estado);
    if(sala) params.set('sala',sala);
    // Profesor: forzar filtro por su sala
    if(currentUser.rol==='Profesor'&&currentUser.salas_ids?.length>0){
      if(!sala) params.set('sala',currentUser.salas_ids[0]);
      // Bloquear filtro de sala si no es del profesor
    }
    const res=await axios.get('/api/dispositivos?'+params);
    const items=res.data.data;
    inventarioData=items;
    const canEdit=PERMISOS[currentUser.rol]?.puedeEditar;
    const profSalas=currentUser.salas_ids||[];
    $('dispositivos-body').innerHTML=items.length===0
      ?'<tr><td colspan="8" class="empty-state"><i class="fas fa-inbox"></i><br>No se encontraron dispositivos</td></tr>'
      :items.map(d=>{
        const puedeVer=canEdit||(currentUser.rol==='Profesor'&&profSalas.includes(d.sala_actual_id));
        const puedeEditarFila=canEdit;
        return \`<tr>
          <td><span style="font-family:monospace;font-weight:600;color:#1e40af;">\${d.codigo_patrimonial}</span></td>
          <td><span style="font-size:12px;">\${d.nombre_tipo||'-'}</span></td>
          <td><strong>\${d.marca||''}</strong> \${d.modelo||''}</td>
          <td>\${statusBadge(d.estado_nombre)}</td>
          <td>\${d.nombre_sala||'-'}</td>
          <td style="font-size:12px;">\${d.profesor_nombre||'-'}</td>
          <td style="font-size:13px;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'-'}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-outline btn-sm" onclick="verDetalle(\${d.id})" title="Ver detalle"><i class="fas fa-eye"></i></button>
              \${puedeEditarFila?\`
                <button class="btn btn-primary btn-sm" onclick="editDispositivo(\${d.id})" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="darBaja(\${d.id},'\${d.codigo_patrimonial}')" title="Dar de baja"><i class="fas fa-trash"></i></button>
              \`:''}
            </div>
          </td>
        </tr>\`;
      }).join('');
    // Mostrar/ocultar btn nuevo según rol
    const btnDisp=$('btn-nuevo-disp');
    if(btnDisp) btnDisp.style.display=canEdit?'inline-flex':'none';
  }catch(e){toast('Error cargando dispositivos','error');}
}

let _currentDeviceDetalle=null;
let _originalDispositivoSnapshot=null;

// Alterna modo de la sección Acta de Entrada (obligatoria) en el modal de dispositivo
function dispActaSetModo(modo){
  const nueva=$('disp-acta-modo-nueva-wrap');
  const vinc=$('disp-acta-modo-vincular-wrap');
  const btnN=$('disp-acta-modo-nueva');
  const btnV=$('disp-acta-modo-vincular');
  if(modo==='vincular'){
    nueva.style.display='none'; vinc.style.display='block';
    btnN.classList.remove('btn-primary'); btnN.classList.add('btn-outline');
    btnV.classList.remove('btn-outline'); btnV.classList.add('btn-primary');
  } else {
    nueva.style.display='block'; vinc.style.display='none';
    btnV.classList.remove('btn-primary'); btnV.classList.add('btn-outline');
    btnN.classList.remove('btn-outline'); btnN.classList.add('btn-primary');
  }
  $('disp-acta-modo-actual')&&($('disp-acta-modo-actual').value=modo);
}

async function _cargarActasDisponibles(selectId){
  try{
    const r=await axios.get('/api/actas');
    const list=r.data.data||[];
    $(selectId).innerHTML='<option value="">— Seleccione un acta existente —</option>'+
      list.map(a=>\`<option value="\${a.id}">\${a.numero_acta} · \${a.tipo_acta||'General'} · \${fmtDate(a.fecha_emision)}\${a.codigo_patrimonial?' · '+a.codigo_patrimonial:''}</option>\`).join('');
  }catch(e){$(selectId).innerHTML='<option value="">(no se pudieron cargar actas)</option>';}
}

function openModalDispositivo(device){
  $('disp-id').value='';
  $('form-dispositivo').reset();
  $('modal-disp-title').textContent='Nuevo Dispositivo';
  $('disp-edit-warning').style.display='none';
  const sel=(id,data,vf,tf,empty)=>{$(id).innerHTML=(empty?\`<option value="">\${empty}</option>\`:'')+data.map(i=>\`<option value="\${i[vf]}">\${i[tf]}</option>\`).join('');};
  sel('disp-tipo',catalogData.tipos,'id','nombre_tipo');
  sel('disp-propietario',catalogData.propietarios,'id','nombre_propietario');
  sel('disp-propietario-origen',catalogData.propietarios,'id','nombre_propietario','— Selecciona el propietario de origen —');
  sel('disp-estado',catalogData.estados,'id','estado');
  sel('disp-sala',catalogData.salas,'id','nombre_sala');
  // IDs de hints sensibles
  const sensitive=['disp-codigo','disp-serie','disp-modelo','disp-fecha','disp-valor-dispositivo','disp-costo-adquisicion'];
  const hintIds={'disp-codigo':'disp-codigo-hint','disp-serie':'disp-serie-hint','disp-modelo':'disp-modelo-hint','disp-fecha':'disp-fecha-hint','disp-valor-dispositivo':'disp-valor-dispositivo-hint','disp-costo-adquisicion':'disp-costo-hint'};
  // Reset propietario de origen visualmente
  const origenSel=$('disp-propietario-origen');
  origenSel.disabled=false; origenSel.style.background=''; origenSel.style.cursor='';
  $('disp-propietario-origen-hint').style.display='none';

  if(device){
    // MODO EDICIÓN
    $('modal-disp-title').textContent='Editar Dispositivo';
    $('disp-edit-warning').style.display='block';
    $('disp-id').value=device.id;
    $('disp-codigo').value=device.codigo_patrimonial;
    $('disp-serie').value=device.numero_serie||'';
    $('disp-tipo').value=device.tipo_id;
    $('disp-propietario').value=device.propietario_id;
    // Origen bloqueado de por vida en edición
    const origenId=device.propietario_origen_id||device.propietario_id;
    if(origenId) origenSel.value=origenId;
    origenSel.disabled=true; origenSel.style.background='#f1f5f9'; origenSel.style.cursor='not-allowed';
    $('disp-propietario-origen-hint').style.display='block';
    $('disp-estado').value=device.estado_id;
    $('disp-sala').value=device.sala_actual_id;
    $('disp-marca').value=device.marca||'';
    $('disp-modelo').value=device.modelo||'';
    $('disp-fecha').value=device.fecha_adquisicion||'';
    $('disp-valor-dispositivo').value=device.valor_dispositivo||device.valor_adquisicion||'';
    $('disp-costo-adquisicion').value=device.valor_adquisicion||'';
    // Bloquear campos sensibles
    sensitive.forEach(fid=>{ $(fid).readOnly=true; $(fid).style.background='#f1f5f9'; $(fid).style.cursor='not-allowed'; const h=$(hintIds[fid]); if(h) h.style.display='block'; });
    // Mostrar sección acta movimiento (en edición)
    $('disp-acta-mov-section').style.display='block';
    $('disp-acta-mov-section').classList.remove('open');
    $('disp-garantia-section').style.display='none';
    $('disp-acta-entrada-section').style.display='none';
    // Limpiar campos collapsible movimiento
    $('disp-mov-acta-num').value=''; $('disp-mov-acta-firmantes').value='';
    // Snapshot para detectar cambios críticos
    _originalDispositivoSnapshot={
      sala_actual_id:String(device.sala_actual_id||''),
      propietario_id:String(device.propietario_id||''),
      estado_id:String(device.estado_id||''),
      tipo_id:String(device.tipo_id||'')
    };
  }else{
    // MODO NUEVO
    sensitive.forEach(fid=>{ $(fid).readOnly=false; $(fid).style.background=''; $(fid).style.cursor=''; const h=$(hintIds[fid]); if(h) h.style.display='none'; });
    $('disp-acta-mov-section').style.display='none';
    $('disp-garantia-section').style.display='block';
    $('disp-garantia-section').classList.remove('open');
    $('disp-acta-entrada-section').style.display='block';
    // Limpiar collapsibles nuevos
    ['disp-gar-proveedor','disp-gar-contacto','disp-gar-inicio','disp-gar-fin','disp-gar-obs',
     'disp-acta-num','disp-acta-firmantes','disp-acta-archivo','disp-acta-obs'].forEach(fid=>{const el=$(fid);if(el)el.value='';});
    const pdfIn=$('disp-acta-pdf'); if(pdfIn) pdfIn.value='';
    // Acta obligatoria → arrancar en modo "nueva"
    dispActaSetModo('nueva');
    // Cargar actas existentes en background para el modo vincular
    _cargarActasDisponibles('disp-acta-existente');
    _originalDispositivoSnapshot=null;
  }
  openModal('modal-dispositivo');
}
async function editDispositivo(id){
  try{const res=await axios.get('/api/dispositivos/'+id);openModalDispositivo(res.data.data);}
  catch(e){toast('Error cargando dispositivo','error');}
}
async function saveDispositivo(e){
  e.preventDefault();
  const id=$('disp-id').value;
  const valorDisp=$('disp-valor-dispositivo').value||null;
  const costoAdq=$('disp-costo-adquisicion').value||null;
  
  if(id){
    // === EDICIÓN ===
    const newSala=String($('disp-sala').value||'');
    const newProp=String($('disp-propietario').value||'');
    const newEst=String($('disp-estado').value||'');
    const snap=_originalDispositivoSnapshot||{};
    const cambioSala=newSala!==snap.sala_actual_id;
    const cambioProp=newProp!==snap.propietario_id;
    const cambioEstado=newEst!==snap.estado_id;
    const cambioCritico=cambioSala||cambioProp;
    
    if(cambioCritico){
      const cambios=[];
      if(cambioSala) cambios.push('movimiento de sala');
      if(cambioProp) cambios.push('cambio de propietario');
      const ok=await prettyConfirm({
        kind:'warn',
        title:'¿Estás seguro de guardar este movimiento?',
        message:'Vas a realizar: '+cambios.join(' y ')+'. Esta es una acción crítica que se registrará en el historial.',
        explain:'Se generará automáticamente una novedad en el historial del dispositivo. Si tienes un acta firmada de este movimiento, vincúlala en la sección "¿Vincular un acta a este movimiento?" antes de guardar. Si no la tienes, primero créala en Actas → Nueva Acta.',
        okText:'Sí, guardar movimiento',
        cancelText:'Cancelar'
      });
      if(!ok) return;
    }
    
    const body={
      // Campos NO sensibles que sí se pueden modificar:
      tipo_id:$('disp-tipo').value,
      propietario_id:$('disp-propietario').value,
      estado_id:$('disp-estado').value,
      sala_actual_id:$('disp-sala').value,
      marca:$('disp-marca').value,
      usuario_id:currentUser?.id
    };
    const actaNum=$('disp-mov-acta-num').value.trim();
    if(actaNum && cambioCritico){
      body.acta_movimiento={
        numero_acta:actaNum,
        tipo_acta:$('disp-mov-acta-tipo').value,
        firmantes:$('disp-mov-acta-firmantes').value
      };
    }
    try{
      await axios.put('/api/dispositivos/'+id,body);
      toast(cambioCritico?'Dispositivo actualizado y novedad registrada':'Dispositivo actualizado');
      closeModal('modal-dispositivo');loadDispositivos();await loadCatalogs();
    }catch(err){toast(err.response?.data?.error||'Error guardando dispositivo','error');}
  }else{
    // === NUEVO ===
    // Validar campos básicos
    if(!$('disp-propietario-origen').value){
      await prettyAlert({kind:'warn',title:'Propietario de origen requerido',message:'Debes indicar quién entregó el dispositivo. Este dato queda bloqueado de por vida una vez creado.'});
      return;
    }
    // Validar acta obligatoria
    const modoActa=($('disp-acta-modo-nueva-wrap').style.display!=='none')?'nueva':'vincular';
    let actaPayload=null;
    if(modoActa==='vincular'){
      const actaId=$('disp-acta-existente').value;
      if(!actaId){
        await prettyAlert({kind:'warn',title:'Acta obligatoria',message:'Selecciona un acta existente para vincular o crea una nueva. No se puede registrar el dispositivo sin acta.'});
        return;
      }
      actaPayload={id:Number(actaId)};
    } else {
      const actaNum=$('disp-acta-num').value.trim();
      if(!actaNum){
        await prettyAlert({kind:'warn',title:'Acta obligatoria',message:'Debes indicar el N° de Acta para crear una nueva, o cambia a "Vincular existente" si ya está registrada.'});
        return;
      }
      // Leer PDF (opcional)
      let pdfBase64=null,pdfNombre=null,pdfMime=null;
      const pdfEl=$('disp-acta-pdf');
      const file=pdfEl?.files?.[0];
      if(file){
        if(file.size>5*1024*1024){
          await prettyAlert({kind:'warn',title:'PDF demasiado grande',message:'El PDF supera los 5 MB. Sube uno más pequeño o déjalo vacío.'});
          return;
        }
        try{ pdfBase64=await fileToBase64(file); pdfNombre=file.name; pdfMime=file.type||'application/pdf'; }
        catch(err){ toast('No se pudo leer el PDF','error'); return; }
      }
      actaPayload={
        numero_acta:actaNum,
        tipo_acta:$('disp-acta-tipo').value,
        firmantes:$('disp-acta-firmantes').value,
        archivo_url:$('disp-acta-archivo').value,
        archivo_pdf_base64:pdfBase64,
        archivo_pdf_nombre:pdfNombre,
        archivo_pdf_mime:pdfMime,
        observaciones:$('disp-acta-obs').value
      };
    }
    const body={
      codigo_patrimonial:$('disp-codigo').value,
      numero_serie:$('disp-serie').value,
      tipo_id:$('disp-tipo').value,
      propietario_id:$('disp-propietario').value,
      propietario_origen_id:$('disp-propietario-origen').value,
      estado_id:$('disp-estado').value,
      sala_actual_id:$('disp-sala').value,
      marca:$('disp-marca').value,
      modelo:$('disp-modelo').value,
      fecha_adquisicion:$('disp-fecha').value,
      valor_adquisicion:costoAdq,
      valor_dispositivo:valorDisp,
      acta:actaPayload,
      usuario_id:currentUser?.id
    };
    // Garantía inline (si proveedor llenado)
    const garProv=$('disp-gar-proveedor').value.trim();
    if(garProv){
      body.garantia={
        proveedor:garProv,
        contacto_soporte:$('disp-gar-contacto').value,
        fecha_inicio:$('disp-gar-inicio').value,
        fecha_fin:$('disp-gar-fin').value,
        observaciones:$('disp-gar-obs').value
      };
    }
    try{
      await axios.post('/api/dispositivos',body);
      toast('Dispositivo registrado'+(body.garantia?' + garantía':'')+' + acta '+(modoActa==='nueva'?'creada':'vinculada'));
      closeModal('modal-dispositivo');loadDispositivos();await loadCatalogs();
    }catch(err){toast(err.response?.data?.error||'Error guardando dispositivo','error');}
  }
}
// Reemplaza el viejo darBaja(): ahora abre el modal-baja con acta y propietario nuevo OBLIGATORIOS.
function darBaja(id,codigo){
  openModalBaja(id,codigo);
}

// Alterna modo de la sección Acta en el modal de Baja
function bajaActaSetModo(modo){
  const nueva=$('baja-acta-modo-nueva-wrap');
  const vinc=$('baja-acta-modo-vincular-wrap');
  const btnN=$('baja-acta-modo-nueva');
  const btnV=$('baja-acta-modo-vincular');
  if(modo==='vincular'){
    nueva.style.display='none'; vinc.style.display='block';
    btnN.classList.remove('btn-primary'); btnN.classList.add('btn-outline');
    btnV.classList.remove('btn-outline'); btnV.classList.add('btn-primary');
  } else {
    nueva.style.display='block'; vinc.style.display='none';
    btnV.classList.remove('btn-primary'); btnV.classList.add('btn-outline');
    btnN.classList.remove('btn-outline'); btnN.classList.add('btn-primary');
  }
}

async function openModalBaja(dispositivoId,codigo){
  // Cargar info del dispositivo
  let d=null;
  try{
    const r=await axios.get('/api/dispositivos/'+dispositivoId);
    d=r.data.data;
  }catch(e){ toast('No se pudo cargar el dispositivo','error'); return; }
  $('baja-dispositivo-id').value=dispositivoId;
  $('baja-disp-info').textContent=\`\${d.codigo_patrimonial} — \${d.marca||''} \${d.modelo||''} (\${d.nombre_tipo||'-'})\`;
  $('baja-disp-actual').textContent=d.nombre_propietario||'-';
  $('baja-disp-origen').textContent=d.nombre_propietario_origen||d.nombre_propietario||'-';
  // Reset campos
  $('baja-tipo').value='Baja';
  $('baja-prop-existente').innerHTML='<option value="">— Seleccionar o escribir abajo —</option>'+
    (catalogData.propietarios||[]).map(p=>\`<option value="\${p.id}">\${p.nombre_propietario}</option>\`).join('');
  $('baja-prop-existente').value='';
  $('baja-prop-nombre').value='';
  $('baja-motivo').value='';
  $('baja-obs').value='';
  ['baja-acta-num','baja-acta-firmantes','baja-acta-archivo','baja-acta-obs'].forEach(fid=>{const el=$(fid);if(el)el.value='';});
  const pdf=$('baja-acta-pdf'); if(pdf) pdf.value='';
  $('baja-acta-tipo').value='Salida';
  // Cargar actas para vincular
  await _cargarActasDisponibles('baja-acta-existente');
  bajaActaSetModo('nueva');
  // Listener: cuando seleccionan propietario existente, autocompletar nombre
  $('baja-prop-existente').onchange=function(){
    const opt=this.options[this.selectedIndex];
    if(this.value) $('baja-prop-nombre').value=opt.textContent;
  };
  openModal('modal-baja');
}

async function saveBaja(e){
  e.preventDefault();
  const dispositivoId=$('baja-dispositivo-id').value;
  const tipoBaja=$('baja-tipo').value;
  const propId=$('baja-prop-existente').value||null;
  const propNombre=$('baja-prop-nombre').value.trim();
  if(!propId && !propNombre){
    await prettyAlert({kind:'warn',title:'Nuevo propietario obligatorio',message:'Indica a quién va el dispositivo: selecciona un propietario existente o escribe el nombre del nuevo destinatario.'});
    return;
  }
  // Validar acta obligatoria
  const modo=($('baja-acta-modo-nueva-wrap').style.display!=='none')?'nueva':'vincular';
  let acta=null;
  if(modo==='vincular'){
    const aId=$('baja-acta-existente').value;
    if(!aId){
      await prettyAlert({kind:'warn',title:'Acta obligatoria',message:'Selecciona un acta existente o crea una nueva. No se puede dar de baja sin acta.'});
      return;
    }
    acta={id:Number(aId)};
  } else {
    const num=$('baja-acta-num').value.trim();
    if(!num){
      await prettyAlert({kind:'warn',title:'Acta obligatoria',message:'Debes indicar el N° de Acta para crear una nueva, o cambia a "Vincular existente".'});
      return;
    }
    let pdfBase64=null,pdfNombre=null,pdfMime=null;
    const file=$('baja-acta-pdf')?.files?.[0];
    if(file){
      if(file.size>5*1024*1024){
        await prettyAlert({kind:'warn',title:'PDF demasiado grande',message:'El PDF supera los 5 MB.'});
        return;
      }
      try{ pdfBase64=await fileToBase64(file); pdfNombre=file.name; pdfMime=file.type||'application/pdf'; }
      catch(err){ toast('No se pudo leer el PDF','error'); return; }
    }
    acta={
      numero_acta:num,
      tipo_acta:$('baja-acta-tipo').value,
      firmantes:$('baja-acta-firmantes').value,
      archivo_url:$('baja-acta-archivo').value,
      archivo_pdf_base64:pdfBase64,
      archivo_pdf_nombre:pdfNombre,
      archivo_pdf_mime:pdfMime,
      observaciones:$('baja-acta-obs').value
    };
  }
  // Confirmación final
  const ok=await prettyConfirm({
    kind:'danger',
    title:'¿Confirmar la baja del dispositivo?',
    message:\`Tipo: \${tipoBaja}. Nuevo propietario: \${propNombre||'(seleccionado)'}.\`,
    explain:'Esta acción es definitiva. Quedará un registro inmutable en la Lista de Bajas. El dispositivo pasará a estado "Dado de Baja" y se cambiará el propietario actual si seleccionaste uno del catálogo.',
    okText:'Sí, dar de baja',
    danger:true
  });
  if(!ok) return;
  const body={
    dispositivo_id:Number(dispositivoId),
    tipo_baja:tipoBaja,
    motivo:$('baja-motivo').value,
    observaciones:$('baja-obs').value,
    propietario_nuevo_id:propId?Number(propId):null,
    propietario_nuevo_nombre:propNombre,
    acta:acta,
    usuario_id:currentUser?.id
  };
  try{
    await axios.post('/api/bajas',body);
    toast('Baja registrada correctamente');
    closeModal('modal-baja');
    loadDispositivos();
  }catch(err){
    toast(err.response?.data?.error||'Error al dar de baja','error');
  }
}
async function verDetalle(id){
  try{
    const res=await axios.get('/api/dispositivos/'+id);
    const d=res.data.data;
    _currentDeviceDetalle=d;
    const canPrint=PERMISOS[currentUser.rol]?.puedeEditar; // solo Tesorero
    $('btn-imprimir-detalle').style.display=canPrint?'inline-flex':'none';
    $('btn-solicitar-imprimir').style.display=canPrint?'none':'inline-flex';
    $('detalle-title').textContent=\`\${d.codigo_patrimonial} — \${d.marca||''} \${d.modelo||''}\`;
    const novedades=d.novedades||[];
    const garantias=d.garantias||[];
    const actas=d.actas||[];
    $('detalle-content').innerHTML=\`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div><span style="font-size:12px;color:#64748b;">CÓDIGO PATRIMONIAL</span><div style="font-weight:700;font-family:monospace;color:#1e40af;">\${d.codigo_patrimonial}</div></div>
        <div><span style="font-size:12px;color:#64748b;">N° SERIE</span><div style="font-family:monospace;">\${d.numero_serie||'-'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">TIPO</span><div style="font-weight:600;">\${d.nombre_tipo||'-'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">ESTADO</span><div>\${statusBadge(d.estado_nombre)}</div></div>
        <div><span style="font-size:12px;color:#64748b;">MARCA / MODELO</span><div>\${d.marca||'-'} \${d.modelo||''}</div></div>
        <div><span style="font-size:12px;color:#64748b;">PROPIETARIO DE ORIGEN <i class="fas fa-lock" style="font-size:10px;color:#dc2626;" title="Bloqueado de por vida"></i></span><div style="font-weight:600;color:#7c3aed;">\${d.nombre_propietario_origen||d.nombre_propietario||'-'}</div><div style="font-size:10px;color:#94a3b8;">Quien entregó originalmente</div></div>
        <div><span style="font-size:12px;color:#64748b;">PROPIETARIO ACTUAL</span><div>\${d.nombre_propietario||'-'}</div><div style="font-size:10px;color:#94a3b8;">Quien lo posee ahora</div></div>
        <div><span style="font-size:12px;color:#64748b;">SALA ACTUAL</span><div>\${d.nombre_sala||'-'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">CUSTODIO</span><div>\${d.profesor_nombre||'-'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">FECHA ADQUISICIÓN</span><div>\${fmtDate(d.fecha_adquisicion)}</div></div>
        <div><span style="font-size:12px;color:#64748b;">VALOR DISPOSITIVO</span><div style="font-weight:700;color:#1e40af;">\${d.valor_dispositivo?fmt(d.valor_dispositivo):'-'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">COSTO ADQUISICIÓN</span><div style="font-weight:700;color:#16a34a;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'(donado / sin costo)'}</div></div>
        <div><span style="font-size:12px;color:#64748b;">FECHA INVENTARIO</span><div>\${fmtDate(d.fecha_creacion?d.fecha_creacion.split('T')[0]:null)||fmtDate(d.fecha_adquisicion)}</div></div>
      </div>

      <div style="margin-bottom:16px;">
        <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:10px;"><i class="fas fa-history"></i> Historial de Novedades (\${novedades.length})</h4>
        \${novedades.length===0?'<p style="color:#9ca3af;font-size:14px;">Sin novedades</p>':novedades.map(n=>\`
          <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span class="badge badge-blue" style="font-size:11px;white-space:nowrap;">\${n.tipo_novedad}</span>
            <div style="flex:1;"><div style="font-size:13px;">\${n.descripcion||'-'}</div>
            <div style="font-size:11px;color:#94a3b8;">\${fmtDateTime(n.fecha_novedad)} · \${n.usuario_nombre||'-'}</div></div>
          </div>\`).join('')}
      </div>

      \${garantias.length>0?\`<div style="margin-bottom:16px;">
        <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:10px;"><i class="fas fa-shield-alt"></i> Garantías (\${garantias.length})</h4>
        \${garantias.map(g=>\`<div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:8px;">
          <div style="font-weight:600;">\${g.proveedor}</div>
          <div style="font-size:13px;color:#64748b;">\${fmtDate(g.fecha_inicio)} → \${fmtDate(g.fecha_fin)} · \${g.contacto_soporte||''}</div>
          \${g.observaciones?\`<div style="font-size:12px;color:#475569;margin-top:4px;">\${g.observaciones}</div>\`:''}
        </div>\`).join('')}
      </div>\`:''}

      \${actas.length>0?\`<div>
        <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:10px;"><i class="fas fa-file-signature"></i> Actas Vinculadas (\${actas.length})</h4>
        \${actas.map(a=>\`<div style="padding:10px;background:#fef9c3;border-left:4px solid #d97706;border-radius:8px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;color:#92400e;">\${a.numero_acta} · \${a.tipo_acta||'General'}</div>
              <div style="font-size:12px;color:#78350f;">Emitida: \${fmtDate(a.fecha_emision)} · Firmantes: \${a.firmantes||'-'}</div>
              \${a.observaciones?\`<div style="font-size:12px;color:#475569;margin-top:4px;">\${a.observaciones}</div>\`:''}
            </div>
            \${a.archivo_url?\`<a href="\${a.archivo_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-external-link-alt"></i> Ver</a>\`:''}
          </div>
        </div>\`).join('')}
      </div>\`:''}
    \`;
    openModal('modal-detalle');
  }catch(e){toast('Error cargando detalle','error');}
}

function _buildPrintArea(d){
  const novedades=d.novedades||[]; const garantias=d.garantias||[]; const actas=d.actas||[];
  const hoy=new Date().toLocaleString('es-CO');
  $('print-area').innerHTML=\`
    <div style="font-family:Arial,sans-serif;color:#1e293b;">
      <h1 style="text-align:center;color:#1e3a8a;border-bottom:3px solid #1e3a8a;padding-bottom:10px;">
        Ficha de Inventario · \${d.codigo_patrimonial}
      </h1>
      <p style="text-align:right;font-size:11px;color:#64748b;">Impreso: \${hoy}</p>
      <h3 style="background:#dbeafe;padding:8px;border-radius:4px;">Datos Generales</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:6px;font-weight:bold;width:30%;">Código Patrimonial:</td><td>\${d.codigo_patrimonial}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Número de Serie:</td><td>\${d.numero_serie||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Tipo:</td><td>\${d.nombre_tipo||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Marca / Modelo:</td><td>\${d.marca||'-'} \${d.modelo||''}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Estado actual:</td><td>\${d.estado_nombre||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Propietario de origen:</td><td>\${d.nombre_propietario_origen||d.nombre_propietario||'-'} <em style="color:#64748b;font-size:11px;">(bloqueado de por vida)</em></td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Propietario actual:</td><td>\${d.nombre_propietario||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Sala actual:</td><td>\${d.nombre_sala||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Profesor custodio:</td><td>\${d.profesor_nombre||'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Fecha adquisición:</td><td>\${fmtDate(d.fecha_adquisicion)}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Valor del dispositivo:</td><td>\${d.valor_dispositivo?fmt(d.valor_dispositivo):'-'}</td></tr>
        <tr><td style="padding:6px;font-weight:bold;">Costo adquisición:</td><td>\${d.valor_adquisicion?fmt(d.valor_adquisicion):'(donado / sin costo)'}</td></tr>
      </table>

      <h3 style="background:#dbeafe;padding:8px;border-radius:4px;margin-top:16px;">Historial de Novedades (\${novedades.length})</h3>
      \${novedades.length===0?'<p>Sin novedades registradas.</p>':\`<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Fecha</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Tipo</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Descripción</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Usuario</th></tr></thead>
        <tbody>\${novedades.map(n=>\`<tr><td style="padding:6px;border:1px solid #cbd5e1;">\${fmtDateTime(n.fecha_novedad)}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${n.tipo_novedad}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${n.descripcion||'-'}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${n.usuario_nombre||'-'}</td></tr>\`).join('')}</tbody>
      </table>\`}

      <h3 style="background:#dbeafe;padding:8px;border-radius:4px;margin-top:16px;">Garantías (\${garantias.length})</h3>
      \${garantias.length===0?'<p>Sin garantías registradas.</p>':\`<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Proveedor</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Inicio</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Fin</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Contacto</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Observaciones</th></tr></thead>
        <tbody>\${garantias.map(g=>\`<tr><td style="padding:6px;border:1px solid #cbd5e1;">\${g.proveedor}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${fmtDate(g.fecha_inicio)}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${fmtDate(g.fecha_fin)}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${g.contacto_soporte||'-'}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${g.observaciones||'-'}</td></tr>\`).join('')}</tbody>
      </table>\`}

      <h3 style="background:#dbeafe;padding:8px;border-radius:4px;margin-top:16px;">Actas Vinculadas (\${actas.length})</h3>
      \${actas.length===0?'<p>Sin actas vinculadas.</p>':\`<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">N° Acta</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Tipo</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Emisión</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Firmantes</th><th style="text-align:left;padding:6px;border:1px solid #cbd5e1;">Observaciones</th></tr></thead>
        <tbody>\${actas.map(a=>\`<tr><td style="padding:6px;border:1px solid #cbd5e1;">\${a.numero_acta}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${a.tipo_acta||'-'}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${fmtDate(a.fecha_emision)}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${a.firmantes||'-'}</td><td style="padding:6px;border:1px solid #cbd5e1;">\${a.observaciones||'-'}</td></tr>\`).join('')}</tbody>
      </table>\`}

      <div style="margin-top:30px;border-top:1px solid #cbd5e1;padding-top:10px;font-size:11px;color:#64748b;text-align:center;">
        Sistema de Inventario Tecnológico Escolar · Documento generado automáticamente
      </div>
    </div>
  \`;
}

function imprimirDetalle(){
  if(!_currentDeviceDetalle){toast('No hay dispositivo cargado','error');return;}
  _buildPrintArea(_currentDeviceDetalle);
  setTimeout(()=>window.print(),120);
}

async function solicitarImprimir(){
  if(!_currentDeviceDetalle){toast('No hay dispositivo cargado','error');return;}
  const motivo=await prettyPrompt({
    kind:'info',
    title:'Solicitar Impresión',
    message:'Indica el motivo de tu solicitud. Será enviada al Tesorero para aprobación.',
    placeholder:'Ej: Necesito ficha para reunión con padres...',
    okText:'Enviar solicitud'
  });
  if(motivo===null) return;
  try{
    await axios.post('/api/actas/solicitudes-impresion',{
      dispositivo_id:_currentDeviceDetalle.id,
      usuario_solicitante_id:currentUser.id,
      motivo:motivo||'(sin motivo)'
    });
    await prettyAlert({kind:'success',title:'Solicitud enviada',message:'Tu solicitud fue enviada al Tesorero. Recibirás notificación cuando sea aprobada.'});
  }catch(e){toast(e.response?.data?.error||'Error enviando solicitud','error');}
}

// ======================================================
// SALAS
// ======================================================
async function loadSalas(){
  try{
    const canEdit=PERMISOS[currentUser.rol]?.puedeEditar;
    let url='/api/catalogos/salas';
    const res=await axios.get(url);
    const salas=res.data.data;
    $('salas-grid').innerHTML=salas.length===0
      ?'<div class="empty-state"><i class="fas fa-door-closed"></i><p>No hay salas registradas</p></div>'
      :salas.map(s=>{
        const esMiSala=currentUser.rol==='Profesor'&&currentUser.salas_ids?.includes(s.id);
        const bloqueada=currentUser.rol==='Profesor'&&!esMiSala;
        return \`<div class="card" style="position:relative;\${bloqueada?'opacity:.5;':''}">
          \${bloqueada?'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.8);border-radius:12px;z-index:1;"><i class="fas fa-lock" style="font-size:28px;color:#9ca3af;"></i></div>':''}
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
            <div>
              <h3 style="font-weight:700;font-size:16px;color:#1e3a8a;">\${s.nombre_sala}</h3>
              <p style="color:#64748b;font-size:13px;margin-top:2px;"><i class="fas fa-map-marker-alt"></i> \${s.ubicacion_fisica||'Sin ubicación'}</p>
            </div>
            <div style="background:#dbeafe;padding:8px 12px;border-radius:10px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1e40af;">\${s.total_dispositivos||0}</div>
              <div style="font-size:11px;color:#64748b;">dispositivos</div>
            </div>
          </div>
          <div style="padding:10px;background:#f8fafc;border-radius:8px;display:flex;align-items:center;gap:8px;">
            <i class="fas fa-chalkboard-teacher" style="color:#7c3aed;"></i>
            <div><div style="font-size:12px;color:#64748b;">Profesor Custodio</div>
            <div style="font-size:13px;font-weight:600;">\${s.profesor_nombre||'Sin asignar'}</div></div>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px;">
            \${canEdit?\`<button class="btn btn-primary btn-sm" onclick="editSala(\${s.id})"><i class="fas fa-edit"></i> Editar</button>\`:''}
            \${!bloqueada?\`<button class="btn btn-outline btn-sm" onclick="filterByRoom(\${s.id})"><i class="fas fa-eye"></i> Ver dispositivos</button>\`:''}
          </div>
        </div>\`;
      }).join('');
    const btnNuevaSala=$('btn-nueva-sala');
    if(btnNuevaSala) btnNuevaSala.style.display=canEdit?'inline-flex':'none';
  }catch(e){toast('Error cargando salas','error');}
}
function filterByRoom(id){navigate('dispositivos');setTimeout(()=>{$('filter-sala').value=id;loadDispositivos();},100);}
function openModalSala(sala){
  $('sala-id').value='';
  $('form-sala')?.reset();
  $('modal-sala-title').textContent='Nueva Sala';
  $('sala-profesor').innerHTML=catalogData.profesores.map(p=>\`<option value="\${p.id}">\${p.nombre_completo}</option>\`).join('');
  if(sala){
    $('modal-sala-title').textContent='Editar Sala';
    $('sala-id').value=sala.id;
    $('sala-nombre').value=sala.nombre_sala;
    $('sala-ubicacion').value=sala.ubicacion_fisica||'';
    $('sala-profesor').value=sala.profesor_custodio_id;
  }
  openModal('modal-sala');
}
async function editSala(id){
  const res=await axios.get('/api/catalogos/salas');
  const sala=res.data.data.find(s=>s.id===id);
  if(sala) openModalSala(sala);
}
async function saveSala(e){
  e.preventDefault();
  const id=$('sala-id').value;
  const body={nombre_sala:$('sala-nombre').value,ubicacion_fisica:$('sala-ubicacion').value,profesor_custodio_id:$('sala-profesor').value};
  try{
    if(id) await axios.put('/api/catalogos/salas/'+id,body);
    else await axios.post('/api/catalogos/salas',body);
    toast('Sala guardada');closeModal('modal-sala');loadSalas();await loadCatalogs();
  }catch(e){toast('Error guardando sala','error');}
}

// ======================================================
// PROFESORES
// ======================================================
async function loadProfesores(){
  try{
    const res=await axios.get('/api/catalogos/profesores');
    $('profesores-body').innerHTML=res.data.data.map((p,i)=>\`
      <tr>
        <td>\${i+1}</td>
        <td><strong>\${p.nombre_completo}</strong></td>
        <td style="font-family:monospace;">\${p.documento_identidad}</td>
        <td>\${p.departamento||'-'}</td>
        <td style="font-size:13px;">\${p.email}</td>
        <td><span class="badge badge-blue">\${p.salas_a_cargo} sala(s)</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="editProfesor(\${p.id})"><i class="fas fa-edit"></i></button></td>
      </tr>\`).join('');
  }catch(e){toast('Error cargando profesores','error');}
}
function openModalProfesor(){
  $('prof-id').value='';
  $('prof-nombre').value='';$('prof-email').value='';$('prof-doc').value='';$('prof-dep').value='';$('prof-pass').value='prof123';
  $('modal-prof-title').textContent='Nuevo Profesor';
  openModal('modal-profesor');
}
async function editProfesor(id){
  const res=await axios.get('/api/catalogos/profesores');
  const p=res.data.data.find(x=>x.id===id);
  if(!p) return;
  $('prof-id').value=p.id;
  $('prof-nombre').value=p.nombre_completo;
  $('prof-email').value=p.email;
  $('prof-doc').value=p.documento_identidad;
  $('prof-dep').value=p.departamento||'';
  $('prof-pass').value='';
  $('modal-prof-title').textContent='Editar Profesor';
  openModal('modal-profesor');
}
async function saveProfesor(e){
  e.preventDefault();
  const id=$('prof-id').value;
  try{
    if(id){
      await axios.put('/api/catalogos/profesores/'+id,{nombre_completo:$('prof-nombre').value,email:$('prof-email').value,documento_identidad:$('prof-doc').value,departamento:$('prof-dep').value});
      toast('Profesor actualizado');
    }else{
      await axios.post('/api/catalogos/profesores',{nombre_completo:$('prof-nombre').value,email:$('prof-email').value,documento_identidad:$('prof-doc').value,departamento:$('prof-dep').value,password:$('prof-pass').value||'prof123'});
      toast('Profesor registrado. Contraseña: '+($('prof-pass').value||'prof123'));
    }
    closeModal('modal-profesor');loadProfesores();await loadCatalogs();
  }catch(e){toast('Error: '+(e.response?.data?.error||e.message),'error');}
}

// ======================================================
// USUARIOS
// ======================================================
async function loadUsuarios(){
  try{
    const res=await axios.get('/api/catalogos/usuarios');
    $('usuarios-body').innerHTML=res.data.data.map((u,i)=>\`
      <tr>
        <td>\${i+1}</td>
        <td><strong>\${u.nombre_completo}</strong></td>
        <td>
          <span style="font-size:13px;">\${u.email}</span><br>
          <span style="font-size:11px;color:#94a3b8;font-family:monospace;">Contraseña: [oculta]</span>
        </td>
        <td>\${roleBadge(u.nombre_rol)}</td>
        <td>\${u.activo?'<span class="badge badge-green">Activo</span>':'<span class="badge badge-red">Inactivo</span>'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="openCambiarPass(\${u.id})" title="Cambiar contraseña"><i class="fas fa-key"></i></button>
            <button class="btn \${u.activo?'btn-warning':'btn-success'} btn-sm" onclick="toggleUsuario(\${u.id})" title="\${u.activo?'Desactivar':'Activar'}">
              <i class="fas \${u.activo?'fa-ban':'fa-check'}"></i>
            </button>
          </div>
        </td>
      </tr>\`).join('');
  }catch(e){toast('Error cargando usuarios','error');}
}
function openModalUsuario(){ openModal('modal-usuario'); $('usu-nombre').value='';$('usu-email').value='';$('usu-pass').value='';$('usu-rol').value='1'; }
async function saveUsuario(e){
  e.preventDefault();
  try{
    await axios.post('/api/catalogos/usuarios',{nombre_completo:$('usu-nombre').value,email:$('usu-email').value,password_hash:$('usu-pass').value,rol_id:parseInt($('usu-rol').value),activo:1});
    toast('Usuario creado exitosamente');closeModal('modal-usuario');loadUsuarios();
  }catch(e){toast('Error: '+(e.response?.data?.error||e.message),'error');}
}
function openCambiarPass(id){ $('cp-user-id').value=id;$('cp-nueva-pass').value='';openModal('modal-cambiar-pass'); }
async function cambiarPassword(){
  const id=$('cp-user-id').value;const pass=$('cp-nueva-pass').value;
  if(!pass){toast('Ingresa la nueva contraseña','error');return;}
  try{await axios.put('/api/catalogos/usuarios/'+id+'/password',{password_hash:pass});toast('Contraseña actualizada');closeModal('modal-cambiar-pass');}
  catch(e){toast('Error cambiando contraseña','error');}
}
async function toggleUsuario(id){
  try{await axios.put('/api/catalogos/usuarios/'+id+'/toggle');toast('Estado del usuario actualizado');loadUsuarios();}
  catch(e){toast('Error','error');}
}

// ======================================================
// NOVEDADES
// ======================================================
async function loadNovedades(){
  showLoading('novedades-body');
  try{
    const res=await axios.get('/api/novedades?limit=100');
    $('novedades-body').innerHTML=res.data.data.map(n=>\`
      <tr>
        <td style="font-size:12px;">\${fmtDateTime(n.fecha_novedad)}</td>
        <td><span style="font-family:monospace;font-size:13px;color:#1e40af;">\${n.codigo_patrimonial||'-'}</span><br><span style="font-size:11px;color:#64748b;">\${n.marca||''}</span></td>
        <td><span class="badge badge-blue" style="font-size:11px;">\${n.tipo_novedad||'-'}</span></td>
        <td style="font-size:13px;max-width:250px;">\${n.descripcion||'-'}</td>
        <td>\${n.acta_id?\`<span class="badge badge-green" style="font-size:11px;"><i class="fas fa-file-alt"></i> \${n.numero_acta}</span>\`:'<span class="badge badge-gray" style="font-size:11px;">Sin acta</span>'}</td>
        <td style="font-size:12px;">\${n.usuario_nombre||'-'}</td>
      </tr>\`).join('');
  }catch(e){toast('Error cargando novedades','error');}
}
function openModalNovedad(){
  axios.get('/api/dispositivos?limit=500').then(res=>{
    $('nov-dispositivo').innerHTML=res.data.data.map(d=>\`<option value="\${d.id}">\${d.codigo_patrimonial} — \${d.marca||''} \${d.modelo||''}</option>\`).join('');
  });
  $('nov-tipo').innerHTML=catalogData.tiposNovedad.map(t=>\`<option value="\${t.id}">\${t.tipo_novedad}</option>\`).join('');
  $('nov-nueva-sala').innerHTML=catalogData.salas.map(s=>\`<option value="\${s.id}">\${s.nombre_sala}</option>\`).join('');
  $('nov-nuevo-estado').innerHTML=catalogData.estados.map(e=>\`<option value="\${e.id}">\${e.estado}</option>\`).join('');
  openModal('modal-novedad');
}
function checkNovedadTipo(){
  const tipo=$('nov-tipo');const selected=tipo.options[tipo.selectedIndex].text;
  $('nov-sala-group').style.display=selected.includes('Movimiento')?'block':'none';
  $('nov-estado-group').style.display=(selected.includes('Mantenimiento')||selected.includes('Baja')||selected.includes('Reparación'))?'block':'none';
}
async function saveNovedad(e){
  e.preventDefault();
  try{
    const tipo=$('nov-tipo');const tipoText=tipo.options[tipo.selectedIndex].text;
    const body={dispositivo_id:$('nov-dispositivo').value,tipo_novedad_id:$('nov-tipo').value,descripcion:$('nov-descripcion').value,numero_acta:$('nov-acta').value||null,firmantes:$('nov-firmantes').value||null,nueva_sala_id:tipoText.includes('Movimiento')?$('nov-nueva-sala').value:null,nuevo_estado_id:$('nov-estado-group').style.display!=='none'?$('nov-nuevo-estado').value:null};
    await axios.post('/api/novedades',body);
    toast('Novedad registrada');closeModal('modal-novedad');loadNovedades();
  }catch(e){toast('Error: '+(e.response?.data?.error||e.message),'error');}
}

// ======================================================
// ACTAS
// ======================================================
async function loadActas(){
  try{
    const canEdit=PERMISOS[currentUser.rol]?.puedeEditar;
    $('btn-nueva-acta').style.display=canEdit?'inline-flex':'none';
    const res=await axios.get('/api/actas');
    const actas=res.data.data||[];
    $('actas-body').innerHTML=actas.length===0
      ?'<tr><td colspan="9" class="empty-state"><i class="fas fa-file-alt"></i><br>No hay actas registradas</td></tr>'
      :actas.map(a=>\`
        <tr>
          <td><strong style="color:#1e40af;">\${a.numero_acta}</strong></td>
          <td><span class="badge badge-yellow" style="font-size:11px;">\${a.tipo_acta||a.tipo_novedad||'General'}</span></td>
          <td style="font-size:13px;">\${a.codigo_patrimonial?\`<strong>\${a.codigo_patrimonial}</strong> \${a.marca||''} \${a.modelo||''}\`:'<em style="color:#94a3b8;">(sin dispositivo)</em>'}</td>
          <td style="font-size:12px;color:#475569;">\${a.tipo_novedad||'-'}</td>
          <td style="font-size:12px;">\${fmtDate(a.fecha_emision)}</td>
          <td style="font-size:13px;">\${a.firmantes||'-'}</td>
          <td>\${a.archivo_url?\`<a href="\${a.archivo_url}" target="_blank" class="btn btn-outline btn-sm" title="URL externa"><i class="fas fa-external-link-alt"></i></a>\`:'<span style="color:#94a3b8;font-size:12px;">-</span>'}</td>
          <td>\${a.tiene_pdf?\`<a href="/api/actas/\${a.id}/pdf" target="_blank" class="btn btn-outline btn-sm" title="\${a.archivo_pdf_nombre||'Descargar PDF'}" style="color:#dc2626;border-color:#dc2626;"><i class="fas fa-file-pdf"></i></a>\`:'<span style="color:#94a3b8;font-size:12px;">-</span>'}</td>
          <td>\${canEdit?\`
            <button class="btn btn-primary btn-sm" onclick="editActa(\${a.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm" onclick="eliminarActa(\${a.id},'\${(a.numero_acta||'').replace(/'/g,'')}')" title="Eliminar"><i class="fas fa-trash"></i></button>
          \`:'<span style="font-size:11px;color:#94a3b8;">Solo lectura</span>'}</td>
        </tr>\`).join('');
  }catch(e){toast('Error cargando actas','error');}
}

async function editActa(id){
  try{
    const res=await axios.get('/api/actas/'+id);
    openModalActa(res.data.data);
  }catch(e){toast('Error cargando acta','error');}
}

// ======================================================
// GARANTÍAS
// ======================================================
async function loadGarantias(){
  try{
    let url='/api/reportes/garantias';
    if(currentUser.rol==='Profesor'&&currentUser.salas_ids?.length>0) url+=\`?sala_id=\${currentUser.salas_ids[0]}\`;
    const res=await axios.get(url);
    $('garantias-body').innerHTML=res.data.data.length===0
      ?'<tr><td colspan="7" class="empty-state">Sin garantías registradas</td></tr>'
      :res.data.data.map(g=>{
        const dc=g.dias_restantes<=0?'garantia-vencida':g.dias_restantes<=90?'garantia-vence':'';
        return \`<tr class="\${dc}">
          <td><strong>\${g.codigo_patrimonial}</strong><br><span style="font-size:12px;color:#64748b;">\${g.marca} \${g.modelo} · \${g.nombre_tipo}</span></td>
          <td style="font-size:12px;">\${g.nombre_sala||'-'}</td>
          <td>\${g.proveedor||'-'}</td>
          <td style="font-size:13px;">\${fmtDate(g.fecha_inicio)} → \${fmtDate(g.fecha_fin)}</td>
          <td>\${statusBadge(g.estado_garantia)}</td>
          <td><span class="badge \${g.dias_restantes<=0?'badge-red':g.dias_restantes<=90?'badge-yellow':'badge-green'}">\${g.dias_restantes<=0?'Vencida':g.dias_restantes+' días'}</span></td>
          <td style="font-size:12px;">\${g.contacto_soporte||'-'}</td>
        </tr>\`;
      }).join('');
  }catch(e){toast('Error cargando garantías','error');}
}

// ======================================================
// PRÉSTAMOS
// ======================================================
function filterPrestamos(estado,btn){
  currentPrestamosFilter=estado;
  document.querySelectorAll('#page-prestamos .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  loadPrestamos(estado);
}
async function loadPrestamos(estado){
  showLoading('prestamos-body');
  try{
    let url='/api/prestamos';
    const params=new URLSearchParams();
    if(estado) params.set('estado',estado);
    if(currentUser.rol==='Profesor'&&currentUser.profesor_id) params.set('profesor_id',currentUser.profesor_id);
    const q=params.toString();
    const res=await axios.get(url+(q?'?'+q:''));
    $('prestamos-body').innerHTML=res.data.data.length===0
      ?'<tr><td colspan="7" class="empty-state"><i class="fas fa-inbox"></i><br>Sin préstamos registrados</td></tr>'
      :res.data.data.map(p=>{
        const vencido=p.estado==='Activo'&&new Date(p.fecha_devolucion_esperada)<new Date();
        return \`<tr \${vencido?'style="background:#fee2e2;"':''}>
          <td style="font-size:12px;">\${fmtDateTime(p.fecha_prestamo)}</td>
          <td><strong>\${p.codigo_patrimonial}</strong><br><span style="font-size:12px;color:#64748b;">\${p.marca||''} \${p.modelo||''}</span></td>
          <td>\${p.estudiante_solicitante}</td>
          <td style="font-size:13px;">\${p.profesor_nombre||'-'}</td>
          <td>\${fmtDate(p.fecha_devolucion_esperada)} \${vencido?'<span class="badge badge-red" style="font-size:10px;">VENCIDO</span>':''}</td>
          <td>\${statusBadge(p.estado)}</td>
          <td>\${p.estado==='Activo'?\`<button class="btn btn-success btn-sm" onclick="devolverPrestamo(\${p.id})"><i class="fas fa-undo"></i> Devolver</button>\`:\`<span style="font-size:12px;color:#64748b;">\${fmtDate(p.fecha_devolucion_real)}</span>\`}</td>
        </tr>\`;
      }).join('');
  }catch(e){toast('Error cargando préstamos','error');}
}
async function devolverPrestamo(id){
  const ok=await prettyConfirm({
    kind:'question',
    title:'Confirmar devolución',
    message:'¿Confirmar la devolución del dispositivo? Se registrará la fecha de hoy como devolución real.',
    okText:'Sí, registrar devolución'
  });
  if(!ok) return;
  try{await axios.put(\`/api/prestamos/\${id}/devolver\`,{});toast('Devolución registrada');loadPrestamos(currentPrestamosFilter);}
  catch(e){toast('Error registrando devolución','error');}
}
function openModalPrestamo(){
  let salaFilter=undefined;
  if(currentUser.rol==='Profesor'&&currentUser.salas_ids?.length>0) salaFilter=currentUser.salas_ids[0];
  let url='/api/dispositivos';
  if(salaFilter) url+=\`?sala=\${salaFilter}\`;
  axios.get(url).then(res=>{
    $('pres-dispositivo').innerHTML=res.data.data.filter(d=>d.estado_nombre==='Activo').map(d=>\`<option value="\${d.id}">\${d.codigo_patrimonial} — \${d.marca||''} \${d.modelo||''} (\${d.nombre_sala})</option>\`).join('');
  });
  $('pres-profesor').innerHTML=catalogData.profesores.map(p=>\`<option value="\${p.id}">\${p.nombre_completo}</option>\`).join('');
  const tom=new Date();tom.setDate(tom.getDate()+1);
  $('pres-fecha-dev').value=tom.toISOString().split('T')[0];
  openModal('modal-prestamo');
}
async function savePrestamo(e){
  e.preventDefault();
  try{
    await axios.post('/api/prestamos',{dispositivo_id:$('pres-dispositivo').value,profesor_autoriza_id:$('pres-profesor').value,estudiante_solicitante:$('pres-estudiante').value,fecha_devolucion_esperada:$('pres-fecha-dev').value,observaciones:$('pres-obs').value});
    toast('Préstamo registrado');closeModal('modal-prestamo');loadPrestamos('');
  }catch(e){toast('Error: '+(e.response?.data?.error||e.message),'error');}
}

// ======================================================
// REPORTES (Tesorero)
// ======================================================
let reporteData=[];
function onTipoReporteChange(){
  const tipo=$('tipo-reporte').value;
  const wrap=$('filtro-sala-reporte-wrap');
  // Reportes que NO usan filtro por sala
  const sinSala=['auditoria','financiero','profesores','prestamos','novedades'];
  const esPorPropietario=tipo.startsWith('propietario:');
  const esPorEstado=tipo.startsWith('estado:');
  if(sinSala.includes(tipo)||esPorPropietario||esPorEstado) wrap.style.display='none';
  else wrap.style.display='block';
}
function populateFiltroSalaReporte(){
  const sel=$('filtro-sala-reporte');
  if(!sel) return;
  sel.innerHTML='<option value="">Todas las salas</option>';
  catalogData.salas.forEach(s=>sel.innerHTML+=\`<option value="\${s.id}">\${s.nombre_sala}</option>\`);
  // Poblar optgroups dinámicos con tipos / estados / propietarios
  const ogTipos=$('optgroup-tipos');
  if(ogTipos){
    ogTipos.innerHTML=catalogData.tipos.map(t=>\`<option value="tipo:\${t.id}">Reporte de \${t.nombre_tipo}</option>\`).join('');
  }
  const ogEstados=$('optgroup-estados');
  if(ogEstados){
    ogEstados.innerHTML=catalogData.estados.map(e=>\`<option value="estado:\${e.id}">Dispositivos \${e.estado}</option>\`).join('');
  }
  const ogProp=$('optgroup-propietarios');
  if(ogProp){
    ogProp.innerHTML=catalogData.propietarios.map(p=>\`<option value="propietario:\${p.id}">Propietario: \${p.nombre_propietario}</option>\`).join('');
  }
}
async function generarReporte(){
  const tipo=$('tipo-reporte').value;
  const sala=$('filtro-sala-reporte').value;
  $('reporte-resultado').style.display='none';
  $('btn-export-csv').style.display='none';
  try{
    let url,titulo,headers;
    // ----- Reportes dinámicos: por tipo de dispositivo / estado / propietario -----
    if(tipo.startsWith('tipo:')){
      const tipoId=tipo.split(':')[1];
      const t=catalogData.tipos.find(x=>x.id==tipoId);
      url='/api/reportes/por-tipo/'+tipoId+(sala?'?sala_id='+sala:'');
      titulo='Reporte de '+(t?t.nombre_tipo:'Tipo '+tipoId);
      headers='<tr><th>Código</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Estado</th><th>Sala</th><th>Custodio</th><th>F. Adquisición</th><th>Valor</th><th>Garantía</th></tr>';
    }else if(tipo.startsWith('estado:')){
      const estadoId=tipo.split(':')[1];
      const e=catalogData.estados.find(x=>x.id==estadoId);
      url='/api/reportes/por-estado/'+estadoId;
      titulo='Dispositivos '+(e?e.estado:'Estado '+estadoId);
      headers='<tr><th>Código</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>Sala</th><th>Custodio</th><th>F. Adquisición</th><th>Valor</th></tr>';
    }else if(tipo.startsWith('propietario:')){
      const propId=tipo.split(':')[1];
      const p=catalogData.propietarios.find(x=>x.id==propId);
      url='/api/reportes/por-propietario/'+propId;
      titulo='Dispositivos de '+(p?p.nombre_propietario:'Propietario '+propId);
      headers='<tr><th>Código</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>Estado</th><th>Sala</th><th>F. Adquisición</th><th>Valor</th></tr>';
    }else if(tipo==='inventario'){
      url='/api/reportes/inventario-completo'+(sala?'?sala_id='+sala:'');
      titulo='Inventario Completo';
      headers='<tr><th>Código</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>Estado</th><th>Sala</th><th>Custodio</th><th>F. Adquisición</th><th>Valor</th><th>Garantía</th></tr>';
    }else if(tipo==='garantias'){
      url='/api/reportes/garantias'+(sala?'?sala_id='+sala:'');
      titulo='Reporte de Garantías';
      headers='<tr><th>Dispositivo</th><th>Sala</th><th>Proveedor</th><th>Vigencia</th><th>Estado</th><th>Días Rest.</th><th>Contacto</th></tr>';
    }else if(tipo==='por-sala'&&sala){
      url='/api/reportes/por-sala/'+sala;
      titulo='Reporte por Sala';
    }else if(tipo==='financiero'){
      url='/api/reportes/financiero';
      titulo='Reporte Financiero del Inventario';
      headers='<tr><th>Categoría</th><th>Concepto</th><th>Cantidad</th><th>Valor Total</th><th>Valor Promedio</th></tr>';
    }else if(tipo==='novedades'){
      url='/api/reportes/novedades';
      titulo='Reporte de Novedades';
      headers='<tr><th>Fecha</th><th>Tipo Novedad</th><th>Dispositivo</th><th>Tipo Disp.</th><th>Sala</th><th>Registró</th><th>Descripción</th></tr>';
    }else if(tipo==='prestamos'){
      url='/api/reportes/prestamos';
      titulo='Reporte de Préstamos';
      headers='<tr><th>Dispositivo</th><th>Tipo</th><th>Estudiante</th><th>Profesor Autoriza</th><th>F. Préstamo</th><th>F. Dev. Esperada</th><th>F. Dev. Real</th><th>Estado</th></tr>';
    }else if(tipo==='profesores'){
      url='/api/reportes/profesores';
      titulo='Reporte de Profesores';
      headers='<tr><th>Nombre</th><th>Documento</th><th>Email</th><th>Departamento</th><th>Salas a Cargo</th><th>Dispositivos</th><th>Salas</th><th>Activo</th></tr>';
    }else if(tipo==='auditoria'){
      url='/api/reportes/auditoria?limit=500';
      titulo='Log de Auditoría';
      headers='<tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Tabla</th><th>Detalle</th></tr>';
    }else{
      toast('Selecciona una sala para el reporte por sala','info');return;
    }
    const res=await axios.get(url);
    let data=res.data.data;
    if(tipo==='por-sala') data=data.dispositivos;
    reporteData=data;
    $('reporte-titulo').textContent=titulo+\` (\${data.length} registros)\`;
    let bodyHTML='';
    if(tipo.startsWith('tipo:')){
      bodyHTML=data.map(d=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${d.codigo_patrimonial}</td>
        <td>\${d.marca||'-'}</td><td>\${d.modelo||'-'}</td>
        <td style="font-size:12px;">\${d.numero_serie||'-'}</td>
        <td>\${statusBadge(d.estado_nombre)}</td>
        <td style="font-size:12px;">\${d.nombre_sala||'-'}</td>
        <td style="font-size:12px;">\${d.profesor_custodio||'-'}</td>
        <td style="font-size:12px;">\${fmtDate(d.fecha_adquisicion)}</td>
        <td style="font-size:12px;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'-'}</td>
        <td>\${statusBadge(d.estado_garantia)}</td></tr>\`).join('');
    }else if(tipo.startsWith('estado:')){
      bodyHTML=data.map(d=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${d.codigo_patrimonial}</td>
        <td style="font-size:12px;">\${d.nombre_tipo||'-'}</td>
        <td>\${d.marca||'-'}</td><td>\${d.modelo||'-'}</td>
        <td style="font-size:12px;">\${d.nombre_sala||'-'}</td>
        <td style="font-size:12px;">\${d.profesor_custodio||'-'}</td>
        <td style="font-size:12px;">\${fmtDate(d.fecha_adquisicion)}</td>
        <td style="font-size:12px;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'-'}</td></tr>\`).join('');
    }else if(tipo.startsWith('propietario:')){
      bodyHTML=data.map(d=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${d.codigo_patrimonial}</td>
        <td style="font-size:12px;">\${d.nombre_tipo||'-'}</td>
        <td>\${d.marca||'-'}</td><td>\${d.modelo||'-'}</td>
        <td>\${statusBadge(d.estado_nombre)}</td>
        <td style="font-size:12px;">\${d.nombre_sala||'-'}</td>
        <td style="font-size:12px;">\${fmtDate(d.fecha_adquisicion)}</td>
        <td style="font-size:12px;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'-'}</td></tr>\`).join('');
    }else if(tipo==='financiero'){
      bodyHTML=data.map(r=>\`<tr>
        <td><span class="badge badge-blue">\${r.categoria}</span></td>
        <td><strong>\${r.concepto}</strong></td>
        <td>\${r.cantidad}</td>
        <td style="font-weight:600;">\${fmt(r.valor_total)}</td>
        <td>\${r.valor_promedio?fmt(r.valor_promedio):'-'}</td></tr>\`).join('');
    }else if(tipo==='novedades'){
      bodyHTML=data.map(n=>\`<tr>
        <td style="font-size:12px;white-space:nowrap;">\${fmtDateTime(n.fecha_novedad)}</td>
        <td><span class="badge badge-blue">\${n.tipo_novedad||'-'}</span></td>
        <td style="font-family:monospace;font-size:12px;">\${n.codigo_patrimonial||'-'}<br><span style="font-size:11px;color:#64748b;">\${n.marca||''} \${n.modelo||''}</span></td>
        <td style="font-size:12px;">\${n.nombre_tipo||'-'}</td>
        <td style="font-size:12px;">\${n.nombre_sala||'-'}</td>
        <td style="font-size:12px;">\${n.registrado_por||'-'}</td>
        <td style="font-size:12px;">\${(n.descripcion||'-').substring(0,80)}</td></tr>\`).join('');
    }else if(tipo==='prestamos'){
      bodyHTML=data.map(p=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${p.codigo_patrimonial||'-'}<br><span style="font-size:11px;color:#64748b;">\${p.marca||''} \${p.modelo||''}</span></td>
        <td style="font-size:12px;">\${p.nombre_tipo||'-'}</td>
        <td>\${p.estudiante_solicitante}</td>
        <td style="font-size:12px;">\${p.profesor_autoriza||'-'}</td>
        <td style="font-size:12px;">\${fmtDateTime(p.fecha_prestamo)}</td>
        <td style="font-size:12px;">\${fmtDate(p.fecha_devolucion_esperada)}</td>
        <td style="font-size:12px;">\${p.fecha_devolucion_real?fmtDate(p.fecha_devolucion_real):'-'}</td>
        <td>\${statusBadge(p.estado)}</td></tr>\`).join('');
    }else if(tipo==='profesores'){
      bodyHTML=data.map(p=>\`<tr>
        <td><strong>\${p.nombre_completo}</strong></td>
        <td style="font-size:12px;">\${p.documento_identidad||'-'}</td>
        <td style="font-size:12px;">\${p.email||'-'}</td>
        <td style="font-size:12px;">\${p.departamento||'-'}</td>
        <td>\${p.salas_a_cargo||0}</td>
        <td>\${p.dispositivos_a_cargo||0}</td>
        <td style="font-size:12px;">\${p.salas||'-'}</td>
        <td>\${p.activo?'<span class="badge badge-green">Activo</span>':'<span class="badge badge-red">Inactivo</span>'}</td></tr>\`).join('');
    }else if(tipo==='inventario'){
      bodyHTML=data.map(d=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${d.codigo_patrimonial}</td>
        <td style="font-size:12px;">\${d.nombre_tipo||'-'}</td><td>\${d.marca||'-'}</td><td>\${d.modelo||'-'}</td>
        <td>\${statusBadge(d.estado_nombre)}</td><td style="font-size:12px;">\${d.nombre_sala||'-'}</td>
        <td style="font-size:12px;">\${d.profesor_custodio||'-'}</td><td style="font-size:12px;">\${fmtDate(d.fecha_adquisicion)}</td>
        <td style="font-size:12px;">\${d.valor_adquisicion?fmt(d.valor_adquisicion):'-'}</td>
        <td>\${statusBadge(d.estado_garantia)}</td></tr>\`).join('');
    }else if(tipo==='garantias'){
      bodyHTML=data.map(g=>\`<tr>
        <td><strong>\${g.codigo_patrimonial}</strong><br><span style="font-size:12px;color:#64748b;">\${g.marca} \${g.modelo}</span></td>
        <td style="font-size:12px;">\${g.nombre_sala||'-'}</td>
        <td>\${g.proveedor||'-'}</td><td style="font-size:12px;">\${fmtDate(g.fecha_inicio)} → \${fmtDate(g.fecha_fin)}</td>
        <td>\${statusBadge(g.estado_garantia)}</td>
        <td><span class="badge \${g.dias_restantes<=0?'badge-red':g.dias_restantes<=90?'badge-yellow':'badge-green'}">\${g.dias_restantes<=0?'Vencida':g.dias_restantes+' días'}</span></td>
        <td style="font-size:12px;">\${g.contacto_soporte||'-'}</td></tr>\`).join('');
    }else if(tipo==='auditoria'){
      const actionColors={'ALTA_DISPOSITIVO':'green','BAJA_DISPOSITIVO':'red','EDITAR_DISPOSITIVO':'blue','REGISTRAR_NOVEDAD':'blue','PRESTAMO_CREADO':'yellow','PRESTAMO_DEVUELTO':'green','SISTEMA_INICIADO':'gray'};
      bodyHTML=data.map(l=>\`<tr>
        <td style="font-size:12px;white-space:nowrap;">\${fmtDateTime(l.fecha_accion)}</td>
        <td style="font-size:13px;">\${l.usuario_nombre||'Sistema'}</td>
        <td><span class="badge badge-gray" style="font-size:11px;">\${l.nombre_rol||'-'}</span></td>
        <td><span class="badge badge-\${actionColors[l.accion]||'blue'}" style="font-size:11px;">\${l.accion}</span></td>
        <td style="font-size:12px;font-family:monospace;">\${l.tabla_afectada||'-'}</td>
        <td style="font-size:12px;">\${l.detalle||'-'}</td></tr>\`).join('');
    }else if(tipo==='por-sala'){
      headers='<tr><th>Código</th><th>Tipo</th><th>Marca/Modelo</th><th>Estado</th><th>Propietario</th></tr>';
      bodyHTML=data.map(d=>\`<tr>
        <td style="font-family:monospace;font-size:12px;">\${d.codigo_patrimonial}</td>
        <td style="font-size:12px;">\${d.nombre_tipo||'-'}</td>
        <td>\${d.marca||'-'} \${d.modelo||''}</td>
        <td>\${statusBadge(d.estado_nombre)}</td>
        <td style="font-size:12px;">\${d.nombre_propietario||'-'}</td></tr>\`).join('');
    }
    $('reporte-head').innerHTML=headers;
    $('reporte-body').innerHTML=bodyHTML;
    $('reporte-resultado').style.display='block';
    $('btn-export-csv').style.display='inline-flex';
  }catch(e){toast('Error generando reporte: '+(e.response?.data?.error||e.message),'error');}
}
function exportCSV(){
  if(!reporteData.length) return;
  const headers=Object.keys(reporteData[0]).join(',');
  const rows=reporteData.map(r=>Object.values(r).map(v=>\`"\${v??''}"\`).join(','));
  const csv=[headers,...rows].join('\\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='reporte_inventario.csv';a.click();
  toast('CSV exportado correctamente');
}

// ======================================================
// SOLICITUDES DE REPORTE (para Rector / Contador)
// ======================================================
function populateSolSalas(){
  const sel=$('sol-sala');if(!sel) return;
  sel.innerHTML='<option value="">No aplica / Todas las salas</option>';
  catalogData.salas.forEach(s=>sel.innerHTML+=\`<option value="\${s.nombre_sala}">\${s.nombre_sala}</option>\`);
  // Poblar dinámicamente las opciones de TIPO de dispositivo en el formulario de solicitud
  const og=$('sol-optgroup-tipos');
  if(og){
    og.innerHTML=catalogData.tipos.map(t=>\`<option value="Reporte de \${t.nombre_tipo}">Reporte de \${t.nombre_tipo}</option>\`).join('');
  }
}
async function enviarSolicitudReporte(e){
  e.preventDefault();
  const tipo=$('sol-tipo').value;
  const sala=$('sol-sala').value;
  const desc=$('sol-descripcion').value;
  const urgencia=$('sol-urgencia').value;
  const parametros=JSON.stringify({tipo,sala:sala||null,descripcion:desc,urgencia,solicitante_nombre:currentUser.nombre,fecha:new Date().toISOString()});
  try{
    await axios.post('/api/catalogos/solicitudes-reporte',{usuario_solicitante_id:currentUser.id,parametros_reporte:parametros});
    toast('Solicitud enviada al Tesorero. Será procesada a la brevedad.','success');
    $('sol-tipo').value='';$('sol-descripcion').value='';$('sol-urgencia').value='Normal';
    loadMisSolicitudes();
  }catch(e){toast('Error enviando solicitud','error');}
}
async function loadMisSolicitudes(){
  try{
    const res=await axios.get('/api/catalogos/solicitudes-reporte');
    const data=res.data.data.filter(s=>s.usuario_solicitante_id===currentUser.id);
    const el=$('mis-solicitudes-list');if(!el) return;
    if(data.length===0){el.innerHTML='<p style="color:#9ca3af;font-size:14px;">Aún no has enviado solicitudes.</p>';return;}
    el.innerHTML=data.slice(0,5).map(s=>{
      const params=JSON.parse(s.parametros_reporte||'{}');
      const estadoColor={Pendiente:'badge-yellow',Aprobada:'badge-green',Rechazada:'badge-red'};
      return \`<div class="solicitud-card">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <div style="font-weight:600;font-size:14px;">\${params.tipo||'-'}</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">\${params.descripcion?.substring(0,80)||'-'}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">\${fmtDateTime(s.fecha_solicitud)}</div>
          </div>
          <span class="badge \${estadoColor[s.estado]||'badge-gray'}">\${s.estado}</span>
        </div>
      </div>\`;
    }).join('');
  }catch(e){console.error(e);}
}
// Solicitudes pendientes para Tesorero (en página reportes)
async function loadSolicitudesReporte(){
  try{
    const res=await axios.get('/api/catalogos/solicitudes-reporte');
    const pendientes=res.data.data.filter(s=>s.estado==='Pendiente');
    const el=$('solicitudes-list');if(!el) return;
    if(pendientes.length===0){el.innerHTML='<p style="color:#9ca3af;font-size:14px;"><i class="fas fa-check-circle" style="color:#16a34a;"></i> No hay solicitudes pendientes.</p>';return;}
    el.innerHTML=pendientes.map(s=>{
      const params=JSON.parse(s.parametros_reporte||'{}');
      return \`<div class="solicitud-card" style="border-color:#fde68a;background:#fffbeb;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;color:#92400e;"><i class="fas fa-inbox"></i> \${s.solicitante_nombre} (\${s.nombre_rol})</div>
            <div style="font-weight:600;font-size:13px;margin-top:4px;">\${params.tipo||'-'}</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">\${params.descripcion?.substring(0,100)||'-'}</div>
            \${params.urgencia&&params.urgencia!=='Normal'?\`<span class="badge badge-red" style="margin-top:6px;">\${params.urgencia}</span>\`:''}
            <div style="font-size:12px;color:#94a3b8;margin-top:6px;">\${fmtDateTime(s.fecha_solicitud)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:120px;">
            <button class="btn btn-success btn-sm" onclick="aprobarSolicitud(\${s.id})"><i class="fas fa-check"></i> Aprobar</button>
            <button class="btn btn-danger btn-sm" onclick="rechazarSolicitud(\${s.id})"><i class="fas fa-times"></i> Rechazar</button>
          </div>
        </div>
      </div>\`;
    }).join('');
  }catch(e){console.error(e);}
}
async function aprobarSolicitud(id){
  try{await axios.put('/api/catalogos/solicitudes-reporte/'+id+'/aprobar',{usuario_aprueba_id:currentUser.id});toast('Solicitud aprobada');loadSolicitudesReporte();}
  catch(e){toast('Error','error');}
}
async function rechazarSolicitud(id){
  try{await axios.put('/api/catalogos/solicitudes-reporte/'+id+'/rechazar',{usuario_aprueba_id:currentUser.id});toast('Solicitud rechazada','info');loadSolicitudesReporte();}
  catch(e){toast('Error','error');}
}

// ======================================================
// AUDITORÍA
// ======================================================
async function loadAuditoria(){
  try{
    let url='/api/reportes/auditoria?limit=500';
    if(currentUser.rol==='Profesor') url+='&usuario_id='+currentUser.id;
    const res=await axios.get(url);
    const logs=res.data.data||[];
    const actionColors={'ALTA_DISPOSITIVO':'green','BAJA_DISPOSITIVO':'red','EDITAR_DISPOSITIVO':'blue','REGISTRAR_NOVEDAD':'blue','PRESTAMO_CREADO':'yellow','PRESTAMO_DEVUELTO':'green','SISTEMA_INICIADO':'gray','CREAR_ACTA':'yellow','EDITAR_ACTA':'blue','ELIMINAR_ACTA':'red','ALTA_CATALOGO':'green','EDITAR_CATALOGO':'blue','BORRAR_CATALOGO':'red'};
    
    // Agrupar por usuario para resumen
    const porUsuario={};
    logs.forEach(l=>{
      const k=(l.usuario_nombre||'Sistema');
      if(!porUsuario[k]){porUsuario[k]={nombre:k,rol:l.nombre_rol||'-',total:0,acciones:{},ultima:l.fecha_accion};}
      porUsuario[k].total++;
      porUsuario[k].acciones[l.accion]=(porUsuario[k].acciones[l.accion]||0)+1;
      if(l.fecha_accion>porUsuario[k].ultima) porUsuario[k].ultima=l.fecha_accion;
    });
    const resumenHtml=Object.values(porUsuario).sort((a,b)=>b.total-a.total).map(u=>\`
      <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:6px;">
        <div style="width:42px;height:42px;border-radius:50%;background:#dbeafe;color:#1e40af;display:flex;align-items:center;justify-content:center;font-weight:700;">\${(u.nombre[0]||'?').toUpperCase()}</div>
        <div style="flex:1;">
          <div style="font-weight:600;">\${u.nombre} <span class="badge badge-gray" style="font-size:10px;">\${u.rol}</span></div>
          <div style="font-size:11px;color:#64748b;">Última acción: \${fmtDateTime(u.ultima)} · Total: \${u.total} acciones</div>
          <div style="font-size:11px;color:#475569;margin-top:3px;">\${Object.entries(u.acciones).map(([k,v])=>\`<span style="display:inline-block;margin-right:6px;"><span class="badge badge-\${actionColors[k]||'blue'}" style="font-size:10px;">\${k}</span> ×\${v}</span>\`).join('')}</div>
        </div>
      </div>\`).join('');
    
    // Inyectar resumen + tabla
    const cont=$('auditoria-body').closest('.card')?.parentElement;
    // Buscar/crear div resumen
    let resumenDiv=document.getElementById('auditoria-resumen');
    if(!resumenDiv && cont){
      resumenDiv=document.createElement('div');
      resumenDiv.id='auditoria-resumen';
      resumenDiv.style.marginBottom='16px';
      cont.insertBefore(resumenDiv,cont.firstChild.nextSibling);
    }
    if(resumenDiv){
      resumenDiv.innerHTML=\`<div class="card" style="margin-bottom:16px;">
        <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:12px;"><i class="fas fa-users"></i> Resumen por Usuario (\${Object.keys(porUsuario).length} usuarios · \${logs.length} acciones)</h4>
        \${resumenHtml||'<p style="color:#9ca3af;">Sin actividad registrada</p>'}
      </div>\`;
    }
    
    $('auditoria-body').innerHTML=logs.map(l=>\`
      <tr>
        <td style="font-size:12px;white-space:nowrap;">\${fmtDateTime(l.fecha_accion)}</td>
        <td style="font-size:13px;"><strong>\${l.usuario_nombre||'Sistema'}</strong></td>
        <td><span class="badge badge-gray" style="font-size:11px;">\${l.nombre_rol||'-'}</span></td>
        <td><span class="badge badge-\${actionColors[l.accion]||'blue'}" style="font-size:11px;">\${l.accion}</span></td>
        <td style="font-size:12px;font-family:monospace;">\${l.tabla_afectada||'-'}</td>
        <td style="font-size:13px;">\${l.registro_id||'-'}</td>
        <td style="font-size:12px;">\${l.detalle||'-'}</td>
      </tr>\`).join('');
  }catch(e){toast('Error cargando auditoría','error');}
}

// ======================================================
// CATÁLOGOS
// ======================================================
let currentCatTab='tipos';
async function showCatalogo(tipo,btn){
  currentCatTab=tipo;
  document.querySelectorAll('#page-catalogos .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const canEdit=PERMISOS[currentUser?.rol]?.puedeEditar||false;
  const canDelete=PERMISOS[currentUser?.rol]?.puedeBorrarCatalogos||false;
  let html='';
  const acciones=(tipo,id,nombre)=>{
    let h='';
    h+=\`<button class="btn btn-outline btn-sm" onclick="verCatalogoItem('\${tipo}',\${id})" title="Ver detalle"><i class="fas fa-eye"></i></button> \`;
    if(canEdit) h+=\`<button class="btn btn-primary btn-sm" onclick="editCatalogoItem('\${tipo}',\${id})" title="Editar"><i class="fas fa-edit"></i></button> \`;
    if(canDelete){
      const ep=tipo==='tipos'?'tipos-dispositivo':tipo;
      h+=\`<button class="btn btn-danger btn-sm" onclick="solicitarBorrarCatalogo('\${ep}',\${id},'\${nombre.replace(/'/g,'')}')" title="Eliminar"><i class="fas fa-trash"></i></button>\`;
    }
    return h;
  };
  if(tipo==='tipos'){
    const res=await axios.get('/api/catalogos/tipos-dispositivo');
    html=\`\${canEdit?\`<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" onclick="addCatalogo('tipos')"><i class="fas fa-plus"></i> Agregar Tipo</button></div>\`:''}
    <div class="card" style="padding:0;overflow:hidden;">
      <table><thead><tr><th>#</th><th>Nombre Tipo</th><th>Vida Útil (meses)</th><th>Años</th><th>Acciones</th></tr></thead>
      <tbody>\${res.data.data.map(t=>\`
        <tr><td>\${t.id}</td><td><strong>\${t.nombre_tipo}</strong></td><td>\${t.vida_util_meses} meses</td><td>\${(t.vida_util_meses/12).toFixed(1)} años</td>
        <td>\${acciones('tipos',t.id,t.nombre_tipo)}</td>
        </tr>\`).join('')}
      </tbody></table></div>\`;
  }else if(tipo==='propietarios'){
    const res=await axios.get('/api/catalogos/propietarios');
    html=\`\${canEdit?\`<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" onclick="addCatalogo('propietarios')"><i class="fas fa-plus"></i> Agregar Propietario</button></div>\`:''}
    <div class="card" style="padding:0;overflow:hidden;">
      <table><thead><tr><th>#</th><th>Propietario</th><th>NIT</th><th>Acciones</th></tr></thead>
      <tbody>\${res.data.data.map(p=>\`
        <tr><td>\${p.id}</td><td><strong>\${p.nombre_propietario}</strong></td><td>\${p.nit||'-'}</td>
        <td>\${acciones('propietarios',p.id,p.nombre_propietario)}</td>
        </tr>\`).join('')}
      </tbody></table></div>\`;
  }else if(tipo==='estados'){
    const res=await axios.get('/api/catalogos/estados');
    html=\`\${canEdit?\`<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" onclick="addCatalogo('estados')"><i class="fas fa-plus"></i> Agregar Estado</button></div>\`:''}
    <div class="card" style="padding:0;overflow:hidden;">
      <table><thead><tr><th>#</th><th>Estado</th><th>Indicador</th><th>Acciones</th></tr></thead>
      <tbody>\${res.data.data.map(e=>\`
        <tr><td>\${e.id}</td><td><strong>\${e.estado}</strong></td><td>\${statusBadge(e.estado)}</td>
        <td>\${acciones('estados',e.id,e.estado)}</td>
        </tr>\`).join('')}
      </tbody></table></div>\`;
  }else if(tipo==='roles'){
    const res=await axios.get('/api/catalogos/roles');
    html=\`<div class="card" style="padding:0;overflow:hidden;">
      <table><thead><tr><th>#</th><th>Rol</th><th>Descripción</th></tr></thead>
      <tbody>\${res.data.data.map(r=>\`
        <tr><td>\${r.id}</td><td><strong>\${r.nombre_rol}</strong></td><td>\${r.descripcion||'-'}</td></tr>\`).join('')}
      </tbody></table></div>\`;
  }
  $('catalogo-content').innerHTML=html;
}

function addCatalogo(tipo){ openModalCatalogoItem(tipo,null); }

function openModalCatalogoItem(tipo,item){
  $('cat-tipo-key').value=tipo;
  $('cat-id').value=item?item.id:'';
  $('cat-campo-1').value='';
  $('cat-campo-2').value='';
  $('cat-campo-2-wrap').style.display='none';
  if(tipo==='tipos'){
    $('modal-catalogo-title').textContent=item?'Editar Tipo de Dispositivo':'Nuevo Tipo de Dispositivo';
    $('cat-label-1').textContent='Nombre del Tipo *';
    $('cat-label-2').textContent='Vida útil (meses)';
    $('cat-campo-1').placeholder='Ej: Laptop, Tablet, Impresora...';
    $('cat-campo-2').placeholder='60';
    $('cat-campo-2').type='number';
    $('cat-campo-2-wrap').style.display='block';
    if(item){ $('cat-campo-1').value=item.nombre_tipo||''; $('cat-campo-2').value=item.vida_util_meses||60; }
  }else if(tipo==='propietarios'){
    $('modal-catalogo-title').textContent=item?'Editar Propietario':'Nuevo Propietario';
    $('cat-label-1').textContent='Nombre del Propietario *';
    $('cat-label-2').textContent='NIT (opcional)';
    $('cat-campo-1').placeholder='Ej: Colegio Santa María, Donación Familia X...';
    $('cat-campo-2').placeholder='900.123.456-7';
    $('cat-campo-2').type='text';
    $('cat-campo-2-wrap').style.display='block';
    if(item){ $('cat-campo-1').value=item.nombre_propietario||''; $('cat-campo-2').value=item.nit||''; }
  }else if(tipo==='estados'){
    $('modal-catalogo-title').textContent=item?'Editar Estado':'Nuevo Estado';
    $('cat-label-1').textContent='Nombre del Estado *';
    $('cat-campo-1').placeholder='Ej: Activo, En Mantenimiento...';
    if(item){ $('cat-campo-1').value=item.estado||''; }
  }
  openModal('modal-catalogo-item');
}

async function saveCatalogoItem(e){
  e.preventDefault();
  const tipo=$('cat-tipo-key').value;
  const id=$('cat-id').value;
  const v1=$('cat-campo-1').value.trim();
  const v2=$('cat-campo-2').value.trim();
  if(!v1){ toast('El nombre es obligatorio','error'); return; }
  let body={};
  let endpoint=tipo;
  if(tipo==='tipos'){ body={nombre_tipo:v1,vida_util_meses:parseInt(v2)||60}; endpoint='tipos-dispositivo'; }
  else if(tipo==='propietarios'){ body={nombre_propietario:v1,nit:v2}; }
  else if(tipo==='estados'){ body={estado:v1}; }
  try{
    if(id){ await axios.put('/api/catalogos/'+endpoint+'/'+id,body); toast('Catálogo actualizado'); }
    else{ await axios.post('/api/catalogos/'+tipo,body); toast('Catálogo agregado'); }
    closeModal('modal-catalogo-item');
    showCatalogo(currentCatTab,null);
    await loadCatalogs();
  }catch(err){ toast('Error: '+(err.response?.data?.error||err.message),'error'); }
}

async function editCatalogoItem(tipo,id){
  try{
    const endpoint=tipo==='tipos'?'tipos-dispositivo':tipo;
    const res=await axios.get('/api/catalogos/'+endpoint);
    const item=res.data.data.find(x=>x.id===id);
    if(!item){ toast('No se encontró el registro','error'); return; }
    openModalCatalogoItem(tipo,item);
  }catch(e){ toast('Error cargando elemento','error'); }
}

async function verCatalogoItem(tipo,id){
  try{
    const endpoint=tipo==='tipos'?'tipos-dispositivo':tipo;
    const res=await axios.get('/api/catalogos/'+endpoint);
    const item=res.data.data.find(x=>x.id===id);
    if(!item){ toast('No se encontró','error'); return; }
    let msg='';
    if(tipo==='tipos'){
      msg=\`Nombre: \${item.nombre_tipo}\\nVida útil: \${item.vida_util_meses} meses (\${(item.vida_util_meses/12).toFixed(1)} años)\\nID interno: \${item.id}\`;
    }else if(tipo==='propietarios'){
      msg=\`Nombre: \${item.nombre_propietario}\\nNIT: \${item.nit||'(sin NIT)'}\\nID interno: \${item.id}\`;
    }else if(tipo==='estados'){
      msg=\`Estado: \${item.estado}\\nID interno: \${item.id}\`;
    }
    await prettyAlert({kind:'info',title:'Detalle del elemento',message:msg});
  }catch(e){ toast('Error','error'); }
}

// ======================================================
// ACTAS – CRUD modal
// ======================================================
function marcarEliminarPdfActa(){
  $('acta-pdf-eliminar').value='1';
  $('acta-pdf-actual').style.display='none';
  toast('El PDF se eliminará al guardar','info');
}

async function openModalActa(acta){
  $('acta-id').value='';
  $('acta-numero').value='';
  $('acta-firmantes').value='';
  $('acta-archivo').value='';
  $('acta-obs').value='';
  $('modal-acta-title').textContent='Registrar Acta';
  const pdfIn=$('acta-pdf'); if(pdfIn) pdfIn.value='';
  $('acta-pdf-eliminar').value='0';
  $('acta-pdf-actual').style.display='none';
  // Cargar dispositivos de forma asíncrona
  try{
    const res=await axios.get('/api/dispositivos');
    const list=res.data.data||[];
    $('acta-dispositivo').innerHTML='<option value="">(Sin vincular a dispositivo)</option>'+
      list.map(d=>\`<option value="\${d.id}">\${d.codigo_patrimonial} — \${d.marca||''} \${d.modelo||''}</option>\`).join('');
  }catch(e){ $('acta-dispositivo').innerHTML='<option value="">(Sin vincular)</option>'; }
  if(acta){
    $('modal-acta-title').textContent='Editar Acta';
    $('acta-id').value=acta.id;
    $('acta-numero').value=acta.numero_acta||'';
    $('acta-tipo').value=acta.tipo_acta||'General';
    $('acta-firmantes').value=acta.firmantes||'';
    $('acta-archivo').value=acta.archivo_url||'';
    $('acta-obs').value=acta.observaciones||'';
    if(acta.dispositivo_id) $('acta-dispositivo').value=acta.dispositivo_id;
    if(acta.tiene_pdf){
      $('acta-pdf-actual').style.display='block';
      $('acta-pdf-actual-nombre').textContent=acta.archivo_pdf_nombre||('acta-'+(acta.numero_acta||acta.id)+'.pdf');
      $('acta-pdf-actual-link').href='/api/actas/'+acta.id+'/pdf';
    }
  }
  openModal('modal-acta');
}

async function saveActa(e){
  e.preventDefault();
  const id=$('acta-id').value;
  const body={
    numero_acta:$('acta-numero').value.trim(),
    tipo_acta:$('acta-tipo').value,
    firmantes:$('acta-firmantes').value,
    archivo_url:$('acta-archivo').value,
    observaciones:$('acta-obs').value,
    dispositivo_id:$('acta-dispositivo').value||null,
    usuario_id:currentUser.id
  };
  if(!body.numero_acta){toast('El número de acta es obligatorio','error');return;}
  // PDF
  const pdfFile=$('acta-pdf')?.files?.[0];
  if(pdfFile){
    if(pdfFile.size>5*1024*1024){toast('El PDF supera los 5 MB','error');return;}
    try{
      const b64=await fileToBase64(pdfFile);
      body.archivo_pdf_base64=b64;
      body.archivo_pdf_nombre=pdfFile.name;
      body.archivo_pdf_mime=pdfFile.type||'application/pdf';
    }catch(err){ toast('No se pudo leer el PDF','error'); return; }
  } else if(id && $('acta-pdf-eliminar').value==='1'){
    body.eliminar_pdf=true;
  }
  try{
    if(id) await axios.put('/api/actas/'+id,body);
    else await axios.post('/api/actas',body);
    toast('Acta guardada'+(body.archivo_pdf_base64?' + PDF subido':'')+(body.eliminar_pdf?' (PDF eliminado)':''));
    closeModal('modal-acta');
    loadActas();
  }catch(err){toast(err.response?.data?.error||'Error guardando acta','error');}
}

async function eliminarActa(id,numero){
  const ok=await prettyConfirm({
    kind:'danger',
    title:'¿Eliminar acta?',
    message:\`Vas a eliminar el acta \${numero}.\`,
    explain:'Solo se eliminará el registro del acta (no las novedades vinculadas). Esta acción solo es posible para el Tesorero.',
    okText:'Sí, eliminar',
    danger:true
  });
  if(!ok) return;
  try{ await axios.delete('/api/actas/'+id); toast('Acta eliminada'); loadActas(); }
  catch(e){ toast(e.response?.data?.error||'Error eliminando','error'); }
}

function solicitarBorrarCatalogo(tipo,id,nombre){
  $('confirm-delete-type').value=tipo;
  $('confirm-delete-id').value=id;
  $('confirm-delete-msg').textContent=\`¿Eliminar "\${nombre}"? Solo es posible si no está siendo usado por ningún dispositivo. Esta acción no se puede deshacer.\`;
  openModal('modal-confirm-delete');
}

async function confirmarBorrarCatalogo(){
  const tipo=$('confirm-delete-type').value;
  const id=$('confirm-delete-id').value;
  closeModal('modal-confirm-delete');
  try{
    await axios.delete(\`/api/catalogos/\${tipo}/\${id}\`);
    toast('Registro eliminado del catálogo');
    showCatalogo(currentCatTab,null);
    await loadCatalogs();
  }catch(e){toast(e.response?.data?.error||'No se puede eliminar: está en uso','error');}
}

// ======================================================
// BAJAS – lista, resumen, detalle
// ======================================================
async function loadBajas(){
  try{
    // Poblar select de tipo de dispositivo
    const selTd=$('filtro-bajas-tipo-disp');
    if(selTd && selTd.options.length<=1){
      selTd.innerHTML='<option value="">Todos los tipos de dispositivo</option>'+
        (catalogData.tipos||[]).map(t=>\`<option value="\${t.id}">\${t.nombre_tipo}</option>\`).join('');
    }
    const tb=$('filtro-bajas-tipo').value;
    const td=$('filtro-bajas-tipo-disp').value;
    const desde=$('filtro-bajas-desde').value;
    const hasta=$('filtro-bajas-hasta').value;
    const params=new URLSearchParams();
    if(tb) params.set('tipo_baja',tb);
    if(td) params.set('tipo_dispositivo_id',td);
    if(desde) params.set('desde',desde);
    if(hasta) params.set('hasta',hasta);
    const q=params.toString();
    showLoading('bajas-body');
    const [rRes,rResumen]=await Promise.all([
      axios.get('/api/bajas'+(q?'?'+q:'')),
      axios.get('/api/bajas/resumen')
    ]);
    const bajas=rRes.data.data||[];
    const resumen=rResumen.data.data||{};
    // Tarjetas de resumen
    const colores={'Baja':'#dc2626','Donación':'#16a34a','Venta':'#3b82f6','Devolución':'#7c3aed','Pérdida':'#f59e0b','Obsolescencia':'#64748b','Otro':'#94a3b8'};
    const tarjetas=[];
    tarjetas.push(\`<div class="card" style="padding:14px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#1e3a8a;">\${resumen.total||0}</div><div style="font-size:12px;color:#64748b;">Total bajas</div></div>\`);
    (resumen.por_tipo_baja||[]).forEach(t=>{
      const c=colores[t.tipo_baja]||'#64748b';
      tarjetas.push(\`<div class="card" style="padding:14px;text-align:center;border-top:3px solid \${c};"><div style="font-size:22px;font-weight:700;color:\${c};">\${t.total}</div><div style="font-size:12px;color:#64748b;">\${t.tipo_baja}</div></div>\`);
    });
    $('bajas-resumen').innerHTML=tarjetas.join('');
    // Tabla
    $('bajas-body').innerHTML=bajas.length===0
      ?'<tr><td colspan="8" class="empty-state"><i class="fas fa-archive"></i><br>No hay bajas registradas con esos filtros</td></tr>'
      :bajas.map(b=>{
        const c=colores[b.tipo_baja]||'#64748b';
        return \`<tr>
          <td style="font-size:12px;">\${fmtDateTime(b.fecha_baja)}</td>
          <td><strong>\${b.codigo_patrimonial||'-'}</strong><br><span style="font-size:11px;color:#64748b;">\${b.marca||''} \${b.modelo||''}</span></td>
          <td style="font-size:12px;">\${b.nombre_tipo||'-'}</td>
          <td><span class="badge" style="background:\${c}1f;color:\${c};font-weight:700;">\${b.tipo_baja}</span></td>
          <td style="font-size:12px;">\${b.propietario_anterior||'-'}</td>
          <td style="font-size:12px;font-weight:600;color:#7c3aed;">\${b.propietario_nuevo_nombre||'-'}</td>
          <td style="font-size:12px;">\${b.numero_acta?\`<strong>\${b.numero_acta}</strong>\${b.acta_tiene_pdf?\` <a href="/api/actas/\${b.acta_id}/pdf" target="_blank" title="Descargar PDF" style="color:#dc2626;"><i class="fas fa-file-pdf"></i></a>\`:''}\`:'<em style="color:#94a3b8;">-</em>'}</td>
          <td><button class="btn btn-outline btn-sm" onclick="verBajaDetalle(\${b.id})"><i class="fas fa-eye"></i></button></td>
        </tr>\`;
      }).join('');
  }catch(e){toast('Error cargando bajas','error');}
}

async function verBajaDetalle(id){
  try{
    const r=await axios.get('/api/bajas/'+id);
    const b=r.data.data;
    const colores={'Baja':'#dc2626','Donación':'#16a34a','Venta':'#3b82f6','Devolución':'#7c3aed','Pérdida':'#f59e0b','Obsolescencia':'#64748b','Otro':'#94a3b8'};
    const c=colores[b.tipo_baja]||'#64748b';
    const html=\`
DISPOSITIVO: \${b.codigo_patrimonial||'-'} \${b.marca||''} \${b.modelo||''}
TIPO: \${b.nombre_tipo||'-'} · Serie: \${b.numero_serie||'-'}
SALA ORIGEN: \${b.sala_origen||'-'}

PROPIETARIO ORIGEN: \${b.propietario_origen||'-'}
PROPIETARIO ANTERIOR (al momento de salir): \${b.propietario_anterior||'-'}
NUEVO PROPIETARIO: \${b.propietario_nuevo_nombre||'-'}

TIPO DE BAJA: \${b.tipo_baja}
MOTIVO: \${b.motivo||'-'}
OBSERVACIONES: \${b.observaciones||'-'}

ACTA: \${b.numero_acta||'-'} (\${b.acta_tipo||'-'})
FIRMANTES: \${b.acta_firmantes||'-'}
\${b.acta_tiene_pdf?'📎 Hay PDF firmado adjunto. Descargar abajo.':'(sin PDF adjunto)'}

REGISTRADO: \${fmtDateTime(b.fecha_baja)} por \${b.usuario_nombre||'-'}\`;
    await prettyAlert({kind:'info',title:'Detalle de Baja · '+b.tipo_baja,message:html});
    if(b.acta_tiene_pdf){
      // Abrir PDF en nueva pestaña
      window.open('/api/actas/'+b.acta_id+'/pdf','_blank');
    }
  }catch(e){ toast('Error cargando detalle','error'); }
}

// ======================================================
// EVENTS
// ======================================================
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',function(e){if(e.target===this)closeModal(this.id);});
});
$('login-pass').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('login-email').addEventListener('keydown',e=>{if(e.key==='Enter')$('login-pass').focus();});
</script>
</body>
</html>`
}

export default app

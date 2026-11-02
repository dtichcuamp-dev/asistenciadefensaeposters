# 🩺 XIV Congreso Pineda - PWA de Control de Asistencia y Quórum de E-Pósters
### Hospital Central Universitario "Dr. Antonio María Pineda" (HCUAMP)

PWA médica de alto rendimiento para el registro de ponentes, validación de quórum oficial, control de aforo en sala y consulta del cronograma de los 56 trabajos científicos de la jornada.

Desarrollada con arquitectura Serverless desacoplada: **Frontend en Vercel** (Single Page Application con PWA y persistencia offline) y **Backend en Google Apps Script (GAS) conectado a Google Sheets**.

---

## 📸 Identidad Institucional
- **Colores Oficiales**:
  - Azul Quirúrgico: `#0070BA`
  - Azul Profundo HCUAMP: `#004C87`
  - Turquesa Médico: `#00A8B5`
  - Dark Teal: `#008C99`
  - Alerta / Quórum: `#E11D48` / `#059669`
- **Isotipo Oficial**: Logotipo institucional del Congreso Pineda incorporado en el encabezado, tarjetas, credenciales impresas y favicon vectorial de alta fidelidad.

---

## 🚀 Arquitectura y Módulos

```
                                  +------------------------------+
                                  |   PWA (Vercel Frontend)      |
                                  |  HTML5 + Tailwind + ES6 SPA  |
                                  +--------------+---------------+
                                                 |
                       [fetch doGet/doPost]      |   [Offline Fallback]
                                                 v
                                  +------------------------------+
                                  | Google Apps Script (Web App) |
                                  |    LockService + REST API    |
                                  +--------------+---------------+
                                                 |
                                                 v
                                  +------------------------------+
                                  |   Google Sheets Database     |
                                  |  - Catalogo_Posters (56)     |
                                  |  - Registro_Asistencia       |
                                  +------------------------------+
```

### Módulos del Sistema:
1. **📊 Dashboard Operativo en Tiempo Real**:
   - KPIs automáticos: Total de pósters (56), Ponentes Presentes, % de Quórum con barra de progreso, Total de Acompañantes y Aforo Total en Sala.
   - Desglose por salas: **Salón 1** (48 trabajos: 28 Lunes + 20 Martes) vs **Salón 2** (8 trabajos: 8 Lunes).
   - Ranking interactivo de las especialidades médicas más presentadas.
2. **📝 Formulario de Registro Rápido**:
   - Selector en cascada filtrado por Día (`Lun 2 nov` / `Mar 3 nov`) y Salón (`Salón 1` / `Salón 2`).
   - Autocompletado del trabajo con validación anti-duplicados (evita registrar dos veces el mismo póster).
   - Datos del ponente: Nombre, Especialidad Médica sugerida, Teléfono/WhatsApp y Correo.
   - Acordeón expansible para registrar 1 o 2 acompañantes con Nombre y Cédula/ID.
   - Cálculo automático del aforo (`+1`, `+2` o `+3` personas).
3. **📑 Spreadsheet Interactivo (Data-Table)**:
   - Vista tabular enriquecida tipo hoja de cálculo con scroll suave.
   - Búsqueda en tiempo real por autor, título, cédula, horario o especialidad.
   - Filtros inmediatos por Estado (`PRESENTE` / `PENDIENTE`), Salón y Día.
   - Acciones por fila: Registro rápido, generación de credencial o revocación de presencia.
   - Exportación con un clic a **CSV UTF-8** (con BOM para acentos en Excel) y a **Excel (.xls)**.
4. **📋 Catálogo y Cronograma de Trabajos**:
   - Vista en tarjetas de los 56 trabajos organizados en bloques de 15 minutos (11:00 AM a 06:00 PM).
   - Filtros por franja horaria: `11:00 AM - 01:00 PM`, `01:00 PM - 03:00 PM` y `03:00 PM - 06:00 PM`.
5. **🪪 Credencial Oficial de Asistencia**:
   - Modal con diseño institucional que certifica la defensa del e-póster, aforo y código hash único.
   - Botón directo para impresión física (`window.print()`).
6. **📱 Modo Offline y PWA Mobile-First**:
   - Instalable en smartphones Android / iOS con menú flotante inferior adaptado al pulgar.
   - Service Worker (`sw.js`) y cola de sincronización offline (LocalStorage): los registros se guardan localmente y se suben a Google Sheets en cuanto se recupera la conexión a internet.

---

## 📁 Estructura del Proyecto

```
Wep App Asistencia Defensa E-Posters/
├── index.html            # Interfaz Single Page Application semántica
├── styles.css            # Estilos personalizados, safe areas y glassmorphism
├── app.js                # Lógica reactiva, offline queue, exportadores y API sync
├── manifest.json         # Manifiesto PWA para instalación en móviles
├── sw.js                 # Service Worker con soporte offline y caché
├── vercel.json           # Configuración serverless para Vercel
├── assets/
│   ├── logo.png          # Logotipo oficial del XIV Congreso Pineda
│   └── favicon.svg       # Favicon e icono vectorial de alta resolución
├── data/
│   └── posters.js        # Catálogo maestro con los 56 pósters transcritos
└── backend/
    ├── Code.gs           # Código completo para Google Apps Script
    └── README.md         # Instrucciones paso a paso para el backend
```

---

## ⚡ Despliegue en Vercel (Frontend)

1. Sube este repositorio a **GitHub**.
2. Ingresa a [Vercel](https://vercel.com/) e inicia sesión.
3. Haz clic en **Add New...** ➔ **Project**.
4. Importa tu repositorio de GitHub.
5. Vercel detectará automáticamente que es un proyecto estático (`Other` / `HTML`).
6. Haz clic en **Deploy**.
7. En menos de 30 segundos tu aplicación estará disponible globalmente en una URL segura HTTPS (ej. `https://congreso-pineda-posters.vercel.app`).

---

## 📊 Conexión con Google Sheets (Backend)

Sigue la guía detallada en [`backend/README.md`](backend/README.md):
1. Abre tu hoja de Google Sheets con ID: `1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI`.
2. En **Extensiones ➔ Apps Script**, pega el código de [`backend/Code.gs`](backend/Code.gs).
3. Ejecuta la función `setupDatabase()` para crear automáticamente las pestañas y cargar los 56 pósters.
4. Despliega como **Aplicación Web** ("Ejecutar como: Yo", "Acceso: Cualquier usuario").
5. Pega la URL en la sección **Ajustes ⚙️** de la PWA.

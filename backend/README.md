# 🚀 Guía de Despliegue de Backend: Google Apps Script + Google Sheets
**XIV Congreso Pineda - Hospital Central Universitario "Dr. Antonio María Pineda" (HCUAMP)**

## 📋 Información de la Base de Datos
- **ID de la Hoja de Cálculo**: `1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI`
- **URL de Google Sheets**: [https://docs.google.com/spreadsheets/d/1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI](https://docs.google.com/spreadsheets/d/1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI)

---

## 🛠️ Paso 1: Configurar el Script en Google Apps Script
1. Abre tu hoja de cálculo en el navegador con tu cuenta de Google.
2. En el menú superior, haz clic en **Extensiones** ➔ **Apps Script**.
3. Borra el código predeterminado que aparece en el editor (`myFunction`).
4. Abre el archivo local [`backend/Code.gs`](Code.gs), copia todo su contenido y pégalo en el editor de Apps Script.
5. Haz clic en el botón **Guardar proyecto** (icono de disquete 💾 o `Ctrl + S`).

---

## ⚡ Paso 2: Inicializar la Base de Datos (1 solo clic)
Este paso crea automáticamente las pestañas con estilo corporativo y carga los 56 pósters de la jornada:
1. En la barra de herramientas del editor de Apps Script, busca el desplegable de funciones que dice `doGet` o `myFunction`.
2. Selecciona la función: **`setupDatabase`**.
3. Haz clic en el botón **Ejecutar** (icono de Reproducir ▶️).
4. **Permisos de Autorización** (solo la primera vez):
   - Google te pedirá "Revisar permisos". Haz clic en **Revisar permisos**.
   - Elige tu cuenta de Google.
   - Si aparece la pantalla *"Google no ha verificado esta aplicación"*, haz clic en **Configuración avanzada** (o *Advanced*) en la parte inferior izquierda.
   - Haz clic en **Ir a Proyecto (no seguro)**.
   - Haz clic en **Permitir**.
5. Verás en el registro de ejecución: `✅ Inicialización completada con éxito en Google Sheets`.
6. Si vas a tu Google Sheets, verás creadas las pestañas:
   - `Catalogo_Posters`: Con los 56 trabajos científicos catalogados por hora, salón y especialidad.
   - `Registro_Asistencia`: Con las cabeceras institucionales para ponentes, acompañantes y aforo.

---

## 🌐 Paso 3: Desplegar como Web App (API REST)
1. En la esquina superior derecha de Apps Script, haz clic en el botón azul **Implementar** (Deploy) ➔ **Nueva implementación** (New deployment).
2. Haz clic en el icono de engranaje ⚙️ junto a "Seleccionar tipo" y elige **Aplicación web** (Web app).
3. Configura los siguientes campos:
   - **Descripción**: `API XIV Congreso Pineda v1`
   - **Ejecutar como** (Execute as): **`Yo (tu_correo@gmail.com)`**  *(¡Muy importante!)*
   - **Quién tiene acceso** (Who has access): **`Cualquier usuario`** (Anyone) *(¡Imprescindible para que la PWA pueda enviar datos sin pedir login de Google!)*
4. Haz clic en **Implementar**.
5. Google te mostrará una ventana con la **URL de la aplicación web**. Tendrá un formato similar a:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```
6. Copia esa URL completa.

---

## 📱 Paso 4: Conectar la PWA con la API
1. Abre tu aplicación web o PWA del Congreso Pineda.
2. Ve a la pestaña **Configuración** ⚙️ en el menú inferior.
3. Pega la URL de Apps Script en el campo **URL de la API de Google Apps Script**.
4. Haz clic en **Probar Conexión y Guardar**.
5. ¡Listo! La PWA quedará sincronizada en tiempo real con Google Sheets. Si estás sin conexión Wi-Fi, la PWA guardará los registros localmente y los subirá automáticamente cuando vuelvas a tener red.

---

## ✉️ Paso 5: Emisión de Certificados Digitales (Servicio MailApp)
El script incluye la función `handleSendCertificateEmail` que envía directamente al correo del ponente el **Certificado Oficial de Participación** con diseño institucional y las 3 firmas digitales autorizadas:
- **Dra. Adriana Barreto** (Presidenta del Comité Organizador del XIV Congreso Pineda Año 2026).
- **Dra. Linda Amaro** (Directora General del HCUAMP).
- **Dra. Marisol Balabú** (Directora Adjunta de Investigación y Docencia del HCUAMP).

Al autorizar la ejecución por primera vez en Apps Script, Google solicitará permisos para enviar correos en tu nombre a través del servicio nativo `MailApp`. Esto permite que la PWA despache los diplomas con solo presionar el botón "Enviar al Correo del Ponente".


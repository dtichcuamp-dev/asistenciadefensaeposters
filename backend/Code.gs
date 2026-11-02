/**
 * =========================================================================
 * BACKEND SERVERLESS - GOOGLE APPS SCRIPT (WEB APP API)
 * XIV CONGRESO PINEDA - HOSPITAL CENTRAL UNIVERSITARIO "DR. ANTONIO MARÍA PINEDA"
 * =========================================================================
 * ID Hoja de Cálculo: 1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI
 * Pestañas requeridas:
 *   1. Catalogo_Posters (Matriz con los 56 trabajos)
 *   2. Registro_Asistencia (Log transaccional de ponentes y acompañantes)
 * =========================================================================
 */

// ID OFICIAL DE LA HOJA DE CÁLCULO
const SPREADSHEET_ID = "1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI";

const SHEET_NAMES = {
  CATALOGO: "Catalogo_Posters",
  REGISTRO: "Registro_Asistencia"
};

/**
 * Helper para obtener la hoja de cálculo activa o por ID
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    // Si se ejecuta como contenedor vinculado (bound script)
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * RESPUESTA JSON ESTANDARIZADA
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * CONTROLADOR HTTP GET
 * Endpoints:
 * - action=getPosters : Retorna catálogo unificado con estado de asistencia en tiempo real
 * - action=getStats   : Retorna KPIs agregados (quórum, salas, aforo, especialidades)
 * - action=ping       : Comprobación de salud de la API
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "getPosters";

    if (action === "ping") {
      return createJsonResponse({
        success: true,
        status: "ONLINE",
        timestamp: new Date().toISOString(),
        message: "API del XIV Congreso Pineda operativa y conectada a Google Sheets"
      });
    }

    if (action === "getStats") {
      const stats = computeStatistics();
      return createJsonResponse({ success: true, data: stats });
    }

    // Default: getPosters
    const postersData = fetchPostersWithStatus();
    return createJsonResponse({
      success: true,
      count: postersData.length,
      data: postersData
    });

  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * CONTROLADOR HTTP POST
 * Endpoints:
 * - action=register : Registra un ponente y sus acompañantes con validación de duplicidad
 * - action=revoke   : Revoca o anula un registro para rectificación
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  
  try {
    // Bloqueo concurrente de hasta 15 segundos para evitar escrituras simultáneas en la misma fila
    lock.waitLock(15000);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || "register";

    if (action === "register") {
      const result = handleRegisterAttendance(payload);
      return createJsonResponse(result);
    } else if (action === "revoke") {
      const result = handleRevokeAttendance(payload);
      return createJsonResponse(result);
    } else if (action === "sendCertificateEmail") {
      const result = handleSendCertificateEmail(payload);
      return createJsonResponse(result);
    } else {
      return createJsonResponse({
        success: false,
        error: "Acción no reconocida. Acciones válidas: 'register', 'revoke', 'sendCertificateEmail'"
      });
    }

  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.message
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/**
 * Obtiene el catálogo de los 56 pósters y cruza con las asistencias registradas
 */
function fetchPostersWithStatus() {
  const ss = getSpreadsheet();
  let catalogoSheet = ss.getSheetByName(SHEET_NAMES.CATALOGO);
  let registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);

  if (!catalogoSheet || !registroSheet) {
    setupDatabase(); // Auto-reparación si aún no se ha inicializado
    catalogoSheet = ss.getSheetByName(SHEET_NAMES.CATALOGO);
    registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);
  }

  // 1. Leer Registros de Asistencia
  const registroData = registroSheet.getDataRange().getValues();
  const asistenciaMap = {};

  if (registroData.length > 1) {
    // Cabecera: Fila 0
    for (let i = 1; i < registroData.length; i++) {
      const row = registroData[i];
      const posterId = String(row[1] || "").trim(); // Col B: ID_Poster
      const estado = String(row[15] || "PENDIENTE").trim().toUpperCase(); // Col P: Estado

      if (posterId && estado === "PRESENTE") {
        asistenciaMap[posterId] = {
          idRegistro: row[0],
          posterId: posterId,
          salon: row[2],
          diaHora: row[3],
          titulo: row[4],
          nombrePonente: row[5],
          especialidad: row[6],
          email: row[7],
          telefonoWhatsApp: row[8],
          nombreAcomp1: row[9],
          cedulaAcomp1: row[10],
          nombreAcomp2: row[11],
          cedulaAcomp2: row[12],
          totalAforo: Number(row[13]) || 1,
          timestamp: row[14],
          estado: estado,
          dispositivo: row[16],
          rowIndex: i + 1
        };
      }
    }
  }

  // 2. Leer Catálogo
  const catalogoData = catalogoSheet.getDataRange().getValues();
  const postersList = [];

  for (let j = 1; j < catalogoData.length; j++) {
    const row = catalogoData[j];
    const posterId = String(row[0] || "").trim();
    if (!posterId) continue;

    const registro = asistenciaMap[posterId] || null;

    postersList.push({
      id: posterId,
      numero: Number(row[1]) || j,
      salon: String(row[2] || "").trim(),
      dia: String(row[3] || "").trim(),
      horario: String(row[4] || "").trim(),
      titulo: String(row[5] || "").trim(),
      especialidadSugerida: String(row[6] || "").trim(),
      estado: registro ? "PRESENTE" : "PENDIENTE",
      registro: registro
    });
  }

  return postersList;
}

/**
 * Calcula métricas y KPIs agregados en el servidor
 */
function computeStatistics() {
  const posters = fetchPostersWithStatus();
  const total = posters.length;
  let presentes = 0;
  let acompanantes = 0;
  let aforoTotal = 0;

  let s1Total = 0, s1Present = 0, s1Aforo = 0;
  let s2Total = 0, s2Present = 0, s2Aforo = 0;

  let lunTotal = 0, lunPresent = 0;
  let marTotal = 0, marPresent = 0;

  const especialidadesMap = {};

  posters.forEach(p => {
    const isSalon1 = p.salon.indexOf("1") !== -1;
    const isSalon2 = p.salon.indexOf("2") !== -1;
    const isLun = p.dia.indexOf("Lun") !== -1;
    const isMar = p.dia.indexOf("Mar") !== -1;

    if (isSalon1) s1Total++;
    if (isSalon2) s2Total++;
    if (isLun) lunTotal++;
    if (isMar) marTotal++;

    if (p.estado === "PRESENTE" && p.registro) {
      presentes++;
      const aforoReg = Number(p.registro.totalAforo) || 1;
      const acompReg = Math.max(0, aforoReg - 1);

      acompanantes += acompReg;
      aforoTotal += aforoReg;

      if (isSalon1) {
        s1Present++;
        s1Aforo += aforoReg;
      }
      if (isSalon2) {
        s2Present++;
        s2Aforo += aforoReg;
      }
      if (isLun) lunPresent++;
      if (isMar) marPresent++;

      const esp = (p.registro.especialidad || p.especialidadSugerida || "Otra").trim();
      especialidadesMap[esp] = (especialidadesMap[esp] || 0) + 1;
    }
  });

  const topEspecialidades = Object.keys(especialidadesMap)
    .map(key => ({ especialidad: key, total: especialidadesMap[key] }))
    .sort((a, b) => b.total - a.total);

  const quorum = total > 0 ? ((presentes / total) * 100).toFixed(1) : "0.0";

  return {
    totalPosters: total,
    ponentesRegistrados: presentes,
    postersPendientes: total - presentes,
    quorumPorcentaje: Number(quorum),
    totalAcompanantes: acompanantes,
    aforoTotalSala: aforoTotal,
    salon1: {
      total: s1Total,
      presentes: s1Present,
      pendientes: s1Total - s1Present,
      aforo: s1Aforo
    },
    salon2: {
      total: s2Total,
      presentes: s2Present,
      pendientes: s2Total - s2Present,
      aforo: s2Aforo
    },
    diaLunes: { total: lunTotal, presentes: lunPresent },
    diaMartes: { total: marTotal, presentes: marPresent },
    topEspecialidades: topEspecialidades,
    actualizadoEn: new Date().toISOString()
  };
}

/**
 * Transacción de registro de asistencia con validación de no duplicidad
 */
function handleRegisterAttendance(payload) {
  const posterId = String(payload.id_poster || payload.posterId || "").trim();
  const nombrePonente = String(payload.nombre_ponente || payload.nombrePonente || "").trim();

  if (!posterId || !nombrePonente) {
    return {
      success: false,
      code: "INVALID_DATA",
      message: "El ID del póster y el nombre del ponente son obligatorios."
    };
  }

  const ss = getSpreadsheet();
  const registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);
  if (!registroSheet) {
    setupDatabase();
  }

  // Validar si ya existe registro en estado PRESENTE para este póster
  const data = registroSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowPosterId = String(data[i][1] || "").trim();
    const rowEstado = String(data[i][15] || "").trim().toUpperCase();

    if (rowPosterId === posterId && rowEstado === "PRESENTE") {
      return {
        success: false,
        code: "ALREADY_REGISTERED",
        message: "El póster ya ha sido registrado previamente como PRESENTE por: " + (data[i][5] || "otro usuario"),
        data: {
          idRegistro: data[i][0],
          nombrePonente: data[i][5],
          timestamp: data[i][14]
        }
      };
    }
  }

  // Calcular aforo (1 ponente + acompañantes válidos)
  let aforo = 1;
  const nombreAcomp1 = String(payload.nombre_acomp1 || "").trim();
  const cedulaAcomp1 = String(payload.cedula_acomp1 || "").trim();
  const nombreAcomp2 = String(payload.nombre_acomp2 || "").trim();
  const cedulaAcomp2 = String(payload.cedula_acomp2 || "").trim();

  if (nombreAcomp1) aforo++;
  if (nombreAcomp2) aforo++;

  const idRegistro = "REG-" + Utilities.formatDate(new Date(), "GMT-4", "yyyyMMdd-HHmmss") + "-" + posterId;
  const timestamp = Utilities.formatDate(new Date(), "GMT-4", "yyyy-MM-dd HH:mm:ss");

  const newRow = [
    idRegistro,                                      // Col A: ID_Registro
    posterId,                                        // Col B: ID_Poster
    payload.salon || "",                             // Col C: Salon
    payload.dia_hora || "",                          // Col D: Dia_Hora
    payload.titulo_poster || "",                     // Col E: Titulo_Poster
    nombrePonente,                                   // Col F: Nombre_Ponente
    payload.especialidad || "",                      // Col G: Especialidad
    payload.email || "",                             // Col H: Email
    payload.telefono || payload.whatsapp || "",      // Col I: Telefono_WhatsApp
    nombreAcomp1,                                    // Col J: Nombre_Acomp1
    cedulaAcomp1,                                    // Col K: Cedula_Acomp1
    nombreAcomp2,                                    // Col L: Nombre_Acomp2
    cedulaAcomp2,                                    // Col M: Cedula_Acomp2
    aforo,                                           // Col N: Total_Aforo
    timestamp,                                       // Col O: Timestamp
    "PRESENTE",                                      // Col P: Estado
    payload.dispositivo || "Web PWA"                 // Col Q: Dispositivo_Usuario
  ];

  registroSheet.appendRow(newRow);

  return {
    success: true,
    message: "Asistencia registrada exitosamente en Google Sheets",
    data: {
      idRegistro: idRegistro,
      posterId: posterId,
      nombrePonente: nombrePonente,
      aforo: aforo,
      timestamp: timestamp,
      estado: "PRESENTE"
    }
  };
}

/**
 * Revocar o anular asistencia registrada
 */
function handleRevokeAttendance(payload) {
  const posterId = String(payload.id_poster || payload.posterId || "").trim();
  if (!posterId) {
    return { success: false, message: "ID del póster requerido para revocación" };
  }

  const ss = getSpreadsheet();
  const registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);
  if (!registroSheet) return { success: false, message: "Hoja de registro no encontrada" };

  const data = registroSheet.getDataRange().getValues();
  let rowFound = -1;

  for (let i = 1; i < data.length; i++) {
    const rowPosterId = String(data[i][1] || "").trim();
    if (rowPosterId === posterId && String(data[i][15] || "").toUpperCase() === "PRESENTE") {
      rowFound = i + 1; // 1-based index
      break;
    }
  }

  if (rowFound === -1) {
    return { success: false, message: "No se encontró registro activo para revocar" };
  }

  // Marcar estado como PENDIENTE / REVOCADO
  registroSheet.getRange(rowFound, 16).setValue("PENDIENTE");
  registroSheet.getRange(rowFound, 15).setValue(Utilities.formatDate(new Date(), "GMT-4", "yyyy-MM-dd HH:mm:ss") + " [REVOCADO]");

  return {
    success: true,
    message: "Asistencia del póster " + posterId + " revocada exitosamente."
  };
}

/**
 * ENVÍO DEL CERTIFICADO OFICIAL POR CORREO ELECTRÓNICO (MailApp)
 * Incluye las 3 firmas digitales institucionales requeridas:
 * 1. Dra. Adriana Barreto (Presidenta del Comité Organizador del XIV Congreso Pineda Año 2026)
 * 2. Dra. Linda Amaro (Directora General del Hospital Central Universitario Dr. Antonio María Pineda)
 * 3. Dra. Marisol Balabú (Directora Adjunta de Investigación y Docencia del HCUAMP)
 */
function handleSendCertificateEmail(payload) {
  const posterId = String(payload.id_poster || payload.posterId || "").trim();
  let email = String(payload.email || "").trim();
  let nombrePonente = String(payload.nombre_ponente || payload.nombrePonente || "").trim();
  let tituloPoster = String(payload.titulo_poster || payload.tituloPoster || "").trim();
  let salon = String(payload.salon || "Salón 1").trim();
  let diaHora = String(payload.dia_hora || payload.diaHora || "").trim();
  let especialidad = String(payload.especialidad || "").trim();

  // Si no se proporcionaron datos completos, buscarlos en la hoja de Registro
  const ss = getSpreadsheet();
  const registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);
  
  if (registroSheet && posterId) {
    const data = registroSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === posterId && String(data[i][15]).trim().toUpperCase() === "PRESENTE") {
        if (!email) email = String(data[i][7] || "").trim();
        if (!nombrePonente) nombrePonente = String(data[i][5] || "").trim();
        if (!tituloPoster) tituloPoster = String(data[i][4] || "").trim();
        if (!salon) salon = String(data[i][2] || "").trim();
        if (!diaHora) diaHora = String(data[i][3] || "").trim();
        if (!especialidad) especialidad = String(data[i][6] || "").trim();
        break;
      }
    }
  }

  if (!email || email.indexOf("@") === -1) {
    return {
      success: false,
      message: "No se encontró una dirección de correo electrónico válida para el ponente."
    };
  }

  const subject = "🏅 Certificado Oficial de Ponente - XIV Congreso Pineda (HCUAMP)";
  const fechaEmision = Utilities.formatDate(new Date(), "GMT-4", "dd 'de' MMMM 'de' yyyy");
  const codigoCertificado = "CERT-PINEDA-2026-" + posterId;

  // Plantilla HTML del Certificado Digital para Correo
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
        .cert-card { max-width: 720px; margin: 0 auto; background: #ffffff; border: 8px solid #004c87; border-radius: 12px; padding: 36px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); }
        .header { text-align: center; border-bottom: 2px solid #00a8b5; padding-bottom: 18px; margin-bottom: 24px; }
        .inst-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: bold; margin: 0; }
        .cong-title { font-size: 22px; font-weight: 800; color: #004c87; margin: 6px 0 2px 0; }
        .sub-title { font-size: 13px; color: #008c99; font-weight: 600; margin: 0; }
        .cert-badge { display: inline-block; background: #0070ba; color: #ffffff; font-size: 12px; font-weight: bold; padding: 6px 16px; border-radius: 20px; margin: 18px 0; letter-spacing: 1px; }
        .grant-text { font-size: 14px; color: #475569; text-align: center; margin: 0 0 10px 0; }
        .recipient-name { font-size: 24px; font-weight: 800; color: #002d54; text-align: center; margin: 5px 0 18px 0; text-transform: uppercase; border-bottom: 1px dashed #cbd5e1; padding-bottom: 10px; }
        .participation-text { font-size: 13px; line-height: 1.6; text-align: center; color: #334155; margin: 0 20px 24px 20px; }
        .poster-title { font-weight: 700; color: #004c87; font-style: italic; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 0 10px 28px 10px; font-size: 12px; }
        .details-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .details-label { font-weight: bold; color: #64748b; }
        .details-val { font-weight: 600; color: #0f172a; }
        .signatures-grid { width: 100%; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 24px; }
        .sig-col { width: 33.33%; text-align: center; vertical-align: top; padding: 0 8px; }
        .sig-line { width: 85%; margin: 0 auto 8px auto; border-top: 1.5px solid #004c87; }
        .sig-name { font-size: 11px; font-weight: bold; color: #0f172a; margin: 0; line-height: 1.2; }
        .sig-title { font-size: 9px; color: #64748b; margin-top: 3px; line-height: 1.3; }
        .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 28px; padding-top: 14px; border-top: 1px dashed #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="cert-card">
        <div class="header">
          <p class="inst-title">República Bolivariana de Venezuela • MPPS</p>
          <p class="inst-title">Hospital Central Universitario "Dr. Antonio María Pineda" (HCUAMP)</p>
          <h1 class="cong-title">XIV CONGRESO PINEDA</h1>
          <p class="sub-title">Jornada Científica de Evaluación de E-Pósters • Año 2026</p>
        </div>

        <div style="text-align: center;">
          <div class="cert-badge">CERTIFICADO OFICIAL DE PARTICIPACIÓN</div>
        </div>

        <p class="grant-text">El Comité Científico y Académico del XIV Congreso Pineda hace constar que:</p>
        
        <div class="recipient-name">${nombrePonente}</div>

        <p class="participation-text">
          Participó con éxito en calidad de <strong>PONENTE OFICIAL</strong> en la defensa y presentación del trabajo científico titulado:<br>
          <span class="poster-title">"${tituloPoster}"</span>
        </p>

        <div class="details-box">
          <table width="100%" cellspacing="0" cellpadding="0" style="font-size: 12px;">
            <tr>
              <td style="padding: 3px 0; color: #64748b; font-weight: bold;">ID Póster / Código:</td>
              <td style="padding: 3px 0; color: #004c87; font-weight: bold; text-align: right;">${posterId}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #64748b; font-weight: bold;">Salón y Sesión:</td>
              <td style="padding: 3px 0; color: #0f172a; text-align: right;">${salon} (${diaHora})</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #64748b; font-weight: bold;">Especialidad Médica:</td>
              <td style="padding: 3px 0; color: #0f172a; text-align: right;">${especialidad || 'Área Clínica'}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #64748b; font-weight: bold;">Código de Validación:</td>
              <td style="padding: 3px 0; font-family: monospace; color: #008c99; font-weight: bold; text-align: right;">${codigoCertificado}</td>
            </tr>
          </table>
        </div>

        <!-- 3 FIRMAS DIGITALES INSTITUCIONALES -->
        <table class="signatures-grid" cellspacing="0" cellpadding="0">
          <tr>
            <!-- Firma 1: Dra. Adriana Barreto -->
            <td class="sig-col">
              <div style="font-family: 'Brush Script MT', cursive, serif; font-size: 20px; color: #004c87; margin-bottom: 4px;">A. Barreto</div>
              <div class="sig-line"></div>
              <p class="sig-name">Dra. Adriana Barreto</p>
              <p class="sig-title">Presidenta del Comité Organizador<br>XIV Congreso Pineda Año 2026</p>
            </td>

            <!-- Firma 2: Dra. Linda Amaro -->
            <td class="sig-col">
              <div style="font-family: 'Brush Script MT', cursive, serif; font-size: 20px; color: #004c87; margin-bottom: 4px;">L. Amaro</div>
              <div class="sig-line"></div>
              <p class="sig-name">Dra. Linda Amaro</p>
              <p class="sig-title">Directora General<br>HCU "Dr. Antonio María Pineda"</p>
            </td>

            <!-- Firma 3: Dra. Marisol Balabú -->
            <td class="sig-col">
              <div style="font-family: 'Brush Script MT', cursive, serif; font-size: 20px; color: #004c87; margin-bottom: 4px;">M. Balabú</div>
              <div class="sig-line"></div>
              <p class="sig-name">Dra. Marisol Balabú</p>
              <p class="sig-title">Directora Adjunta de Investigación y Docencia<br>HCU "Dr. Antonio María Pineda"</p>
            </td>
          </tr>
        </table>

        <div class="footer">
          <p>Barquisimeto, Estado Lara • Expedido electrónicamente el ${fechaEmision}</p>
          <p>Diseño y Desarrollo Tecnológico: <strong>Departamento de Tecnología, Información y Comunicación (DTIC) - HCUAMP</strong></p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody,
      name: "XIV Congreso Pineda - HCUAMP"
    });

    return {
      success: true,
      message: "Certificado oficial enviado con éxito a la dirección: " + email,
      recipient: email,
      posterId: posterId
    };
  } catch (mailErr) {
    return {
      success: false,
      message: "Error al enviar el correo con MailApp: " + mailErr.message
    };
  }
}

/**
 * =========================================================================
 * SCRIPT DE INICIALIZACIÓN AUTOMÁTICA (EJECUTAR UNA VEZ EN EL EDITOR DE GAS)
 * =========================================================================
 * Crea y formatea las pestañas 'Catalogo_Posters' y 'Registro_Asistencia',
 * aplicando estilo visual médico HCUAMP e insertando los 56 pósters exactos.
 */
function setupDatabase() {
  const ss = getSpreadsheet();
  
  // 1. Pestaña: Catalogo_Posters
  let catalogoSheet = ss.getSheetByName(SHEET_NAMES.CATALOGO);
  if (!catalogoSheet) {
    catalogoSheet = ss.insertSheet(SHEET_NAMES.CATALOGO);
  }

  const catalogoHeaders = [
    "ID_Poster", "Numero", "Salon", "Dia", "Horario", "Titulo_Oficial", "Especialidad_Sugerida"
  ];

  if (catalogoSheet.getLastRow() === 0) {
    catalogoSheet.appendRow(catalogoHeaders);
    formatSheetHeader(catalogoSheet, catalogoHeaders.length, "#004C87"); // Azul Profundo
  }

  // Si no tiene los pósters, poblarlos
  if (catalogoSheet.getLastRow() <= 1) {
    const catalogoRows = get56PostersData();
    catalogoSheet.getRange(2, 1, catalogoRows.length, catalogoRows[0].length).setValues(catalogoRows);
    catalogoSheet.autoResizeColumns(1, catalogoHeaders.length);
    catalogoSheet.setFrozenRows(1);
  }

  // 2. Pestaña: Registro_Asistencia
  let registroSheet = ss.getSheetByName(SHEET_NAMES.REGISTRO);
  if (!registroSheet) {
    registroSheet = ss.insertSheet(SHEET_NAMES.REGISTRO);
  }

  const registroHeaders = [
    "ID_Registro",
    "ID_Poster",
    "Salon",
    "Dia_Hora",
    "Titulo_Poster",
    "Nombre_Ponente",
    "Especialidad",
    "Email",
    "Telefono_WhatsApp",
    "Nombre_Acomp1",
    "Cedula_Acomp1",
    "Nombre_Acomp2",
    "Cedula_Acomp2",
    "Total_Aforo",
    "Timestamp",
    "Estado",
    "Dispositivo_Usuario"
  ];

  if (registroSheet.getLastRow() === 0) {
    registroSheet.appendRow(registroHeaders);
    formatSheetHeader(registroSheet, registroHeaders.length, "#0070BA"); // Azul Quirúrgico
    registroSheet.setFrozenRows(1);
    registroSheet.autoResizeColumns(1, registroHeaders.length);
  }

  Logger.log("✅ Inicialización completada con éxito en Google Sheets ID: " + SPREADSHEET_ID);
  return "Base de datos inicializada correctamente con 56 pósters y registros transaccionales.";
}

/**
 * Da formato profesional médico a las cabeceras
 */
function formatSheetHeader(sheet, numColumns, hexColor) {
  const headerRange = sheet.getRange(1, 1, 1, numColumns);
  headerRange.setBackground(hexColor);
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 36);
}

/**
 * Matriz estática con los 56 pósters científicos transcritos del documento oficial
 */
function get56PostersData() {
  return [
    // Salón 1 | Lun 2 nov (1 al 28)
    ["P-01", 1, "Salón 1", "Lun 2 nov", "11:00 AM – 11:15 AM", "Efectividad quimioradioterapéutica como estrategia de preservación facial en pacientes con carcinoma de células escamosas no queratinizante nasosinusal", "Otorrinolaringología / Oncología"],
    ["P-02", 2, "Salón 1", "Lun 2 nov", "11:15 AM – 11:30 AM", "Alternativas terapéuticas para la optimización de la cicatrización y prevención de complicaciones en traumatismos nasales complejos: a propósito de un caso", "Otorrinolaringología / Cirugía Plástica"],
    ["P-03", 3, "Salón 1", "Lun 2 nov", "11:30 AM – 11:45 AM", "Atresia de coanas: del obstáculo a la permeabilidad: a propósito de un caso", "Otorrinolaringología / Pediatría"],
    ["P-04", 4, "Salón 1", "Lun 2 nov", "11:45 AM – 12:00 PM", "Cuando lo benigno simula malignidad: adenoma pleomórfico con extensa metaplasia escamosa: a propósito de un caso", "Otorrinolaringología / Anatomía Patológica"],
    ["P-05", 5, "Salón 1", "Lun 2 nov", "12:00 PM – 12:15 PM", "Estiloidectomía transoral en el tratamiento del síndrome de Eagle: a propósito de un caso", "Otorrinolaringología / Cirugía de Cabeza y Cuello"],
    ["P-06", 6, "Salón 1", "Lun 2 nov", "12:15 PM – 12:30 PM", "Papiloma escamoso conjuntival con invasión corneal: presentación atípica", "Oftalmología"],
    ["P-07", 7, "Salón 1", "Lun 2 nov", "12:30 PM – 12:45 PM", "Hallazgos en fondo de Ojo en adultos con Hipertensión Arterial Sistémica y/o Diabetes tipo 2", "Oftalmología / Medicina Interna"],
    ["P-08", 8, "Salón 1", "Lun 2 nov", "12:45 PM – 01:00 PM", "Pesca accidental: un reto quirúrgico en la urgencia oftalmológica", "Oftalmología"],
    ["P-09", 9, "Salón 1", "Lun 2 nov", "01:00 PM – 01:15 PM", "Escleritis nodular anterior como primera presentación de enfermedad inmunológica: una serie de casos", "Oftalmología / Reumatología"],
    ["P-10", 10, "Salón 1", "Lun 2 nov", "01:15 PM – 01:30 PM", "Toxoplasmosis ocular en el embarazo: retos terapéuticos en un caso con compromiso macular", "Oftalmología / Obstetricia"],
    ["P-11", 11, "Salón 1", "Lun 2 nov", "01:30 PM – 01:45 PM", "Trauma perianal por empalamiento: a propósito de un caso", "Cirugía General / Coloproctología"],
    ["P-12", 12, "Salón 1", "Lun 2 nov", "01:45 PM – 02:00 PM", "Manejo quirúrgico de traumatismo perianal avulsivo grado II en paciente politraumatizado por accidente de tránsito: a propósito de un caso", "Cirugía General / Cirugía de Trauma"],
    ["P-13", 13, "Salón 1", "Lun 2 nov", "02:00 PM – 02:15 PM", "STUMP con metástasis de presentación rápida: a propósito de un caso", "Ginecología y Obstetricia / Oncología"],
    ["P-14", 14, "Salón 1", "Lun 2 nov", "02:15 PM – 02:30 PM", "Síndrome de Leriche avanzado con compromiso neurológico en paciente con Lupus Eritematoso Sistémico y Síndrome de Sjogren", "Medicina Interna / Reumatología"],
    ["P-15", 15, "Salón 1", "Lun 2 nov", "02:30 PM – 02:45 PM", "Invaginación intestinal por adenocarcinoma yeyunal a 10 cm de asa fija: reporte de un caso", "Cirugía General / Oncología"],
    ["P-16", 16, "Salón 1", "Lun 2 nov", "02:45 PM – 03:00 PM", "Rol del cierre diferido y sutura barbada en cirugía de control de daños: a propósito de un caso", "Cirugía General / Cirugía de Trauma"],
    ["P-17", 17, "Salón 1", "Lun 2 nov", "03:00 PM – 03:15 PM", "Manejo anestésico combinado y estabilidad hemodinámica en la resección quirúrgica de tumor suprarrenal", "Anestesiología / Endocrinología"],
    ["P-18", 18, "Salón 1", "Lun 2 nov", "03:15 PM – 03:30 PM", "Manejo perioperatorio y rescate en exéresis de tumor de fosa posterior en paciente pediátrico", "Anestesiología / Neurocirugía Pediátrica"],
    ["P-19", 19, "Salón 1", "Lun 2 nov", "03:30 PM – 03:45 PM", "Manejo neuroanestésico multimodal en paciente con esclerosis múltiple sometido a artrodesis cervical anterior: a propósito de un caso", "Anestesiología / Neurocirugía"],
    ["P-20", 20, "Salón 1", "Lun 2 nov", "03:45 PM – 04:00 PM", "Manejo anestésico combinado en reconstrucción microquirúrgica de plexo braquial total de larga duración en un paciente joven", "Anestesiología / Traumatología"],
    ["P-21", 21, "Salón 1", "Lun 2 nov", "04:00 PM – 04:15 PM", "Anestesia general balanceada y ventilación protectora en linfangioleiomiomatosis pulmonar para explantación mamaria", "Anestesiología / Neumonología"],
    ["P-22", 22, "Salón 1", "Lun 2 nov", "04:15 PM – 04:30 PM", "Anestesia total intravenosa ahorradora de opioides en resección de tumor de fosa posterior y monitoreo neurofisiológico", "Anestesiología / Neurocirugía"],
    ["P-23", 23, "Salón 1", "Lun 2 nov", "04:30 PM – 04:45 PM", "Ventilación espontánea y anestesia en endoscopia digestiva superior en lactante con artrogriposis múltiple congénita", "Anestesiología / Gastroenterología Pediátrica"],
    ["P-24", 24, "Salón 1", "Lun 2 nov", "04:45 PM – 05:00 PM", "Vía aérea difícil adquirida por estenosis traqueal postintubación: a propósito de un caso", "Anestesiología / Medicina Crítica"],
    ["P-25", 25, "Salón 1", "Lun 2 nov", "05:00 PM – 05:15 PM", "Anestesia epidural titulada y seguridad neuroaxial en paciente cardiópata sometida a tromboembolectomía de emergencia", "Anestesiología / Cardiología"],
    ["P-26", 26, "Salón 1", "Lun 2 nov", "05:15 PM – 05:30 PM", "Niveles de Depresión en Pacientes con Síndrome Metabólico, Edad Comprendida entre 35-60 años, Hospital Dr. José María Bengoa, Sanare-Lara. Mayo-Julio 2025", "Psiquiatría / Medicina Interna"],
    ["P-27", 27, "Salón 1", "Lun 2 nov", "05:30 PM – 05:45 PM", "Caracterización Epidemiológica y Clínica de pacientes con Hemorragia Intracerebral en Cuidados Intermedios", "Neurología / Medicina Crítica"],
    ["P-28", 28, "Salón 1", "Lun 2 nov", "05:45 PM – 06:00 PM", "Impacto de programa educativo sobre hipoglucemia en diabéticos y cuidadores en El Ujano, Lara", "Medicina Interna / Salud Pública"],

    // Salón 2 | Lun 2 nov (1 al 8)
    ["P-29", 1, "Salón 2", "Lun 2 nov", "11:00 AM – 11:15 AM", "Síndrome de Herlyn-Werner-Wünderlich complicado con piometra y enfermedad inflamatoria pélvica: reporte de caso", "Ginecología y Obstetricia"],
    ["P-30", 2, "Salón 2", "Lun 2 nov", "11:15 AM – 11:30 AM", "Ideación suicida y factores de riesgo en estudiantes del área clínica de pregrado de Medicina de la Universidad Centroccidental Lisandro Alvarado", "Psiquiatría / Educación Médica"],
    ["P-31", 3, "Salón 2", "Lun 2 nov", "11:30 AM – 11:45 AM", "Foliculitis decalvante: desafío diagnóstico y terapéutico: a propósito de un caso", "Dermatología"],
    ["P-32", 4, "Salón 2", "Lun 2 nov", "11:45 AM – 12:00 PM", "De la cama a la bipedestación: fisioterapia osteomuscular y estabilidad hemodinámica", "Fisiatría y Rehabilitación"],
    ["P-33", 5, "Salón 2", "Lun 2 nov", "12:00 PM – 12:15 PM", "Estado nutricional y factores determinantes en trabajadores administrativos y obreros de la Universidad Centroccidental Lisandro Alvarado", "Nutrición / Salud Ocupacional"],
    ["P-34", 6, "Salón 2", "Lun 2 nov", "12:15 PM – 12:30 PM", "Artrodesis Dinámica del Tobillo por Condroblastoma", "Traumatología y Ortopedia"],
    ["P-35", 7, "Salón 2", "Lun 2 nov", "12:30 PM – 12:45 PM", "Acortamiento Agudo y Corticotomía en Pacientes pediátricos como técnica de salvamento de miembros inferiores posterior a Emponzoñamiento Ofídico", "Traumatología / Cirugía Pediátrica"],
    ["P-36", 8, "Salón 2", "Lun 2 nov", "12:45 PM – 01:00 PM", "Colgajo Plantar Medial como opción en la cirugía reconstructiva de pie y tobillo", "Cirugía Plástica / Traumatología"],

    // Salón 1 | Mar 3 nov (1 al 20)
    ["P-37", 1, "Salón 1", "Mar 3 nov", "01:00 PM – 01:15 PM", "Síndrome de encefalopatía posterior reversible en el puerperio tardío de una adolescente: reporte de caso", "Ginecología y Obstetricia / Neurología"],
    ["P-38", 2, "Salón 1", "Mar 3 nov", "01:15 PM – 01:30 PM", "Tormenta microangiopática oculta: cuando el PLASMIC score descifra el enigma de la púrpura trombocitopénica trombótica", "Hematología / Medicina Interna"],
    ["P-39", 3, "Salón 1", "Mar 3 nov", "01:30 PM – 01:45 PM", "Mimetismo linfoproliferativo por criptococosis ganglionar diseminada y visceral masiva en huésped inmunocompetente", "Infectología / Medicina Interna"],
    ["P-40", 4, "Salón 1", "Mar 3 nov", "01:45 PM – 02:00 PM", "Síndrome de Moyamoya en adolescente con trombofilia MTHFR y aracnodactilia contractural congénita: tríada inédita", "Neurología / Genética Médica"],
    ["P-41", 5, "Salón 1", "Mar 3 nov", "02:00 PM – 02:15 PM", "Reconstrucción compleja de defecto gigante en cuero cabelludo posterior a descarga eléctrica de alto voltaje", "Cirugía Plástica y Reconstructiva"],
    ["P-42", 6, "Salón 1", "Mar 3 nov", "02:15 PM – 02:30 PM", "Aplicación de Pentoxifilina Intradérmica para mejorar la viabilidad de colgajos: A propósito de un caso", "Cirugía Plástica y Reconstructiva"],
    ["P-43", 7, "Salón 1", "Mar 3 nov", "02:30 PM – 02:45 PM", "Reconstrucción infraorbitaria con colgajo pediculado frontoglabelar tras resección oncológica por carcinoma epidermoide: reporte de caso", "Cirugía Plástica / Cirugía Oncológica"],
    ["P-44", 8, "Salón 1", "Mar 3 nov", "02:45 PM – 03:00 PM", "Trauma toracoabdominal secundario a herida precordial: correlación entre trayectoria del impacto y lesiones viscerales: a propósito de un caso", "Cirugía de Trauma / Cirugía General"],
    ["P-45", 9, "Salón 1", "Mar 3 nov", "03:00 PM – 03:15 PM", "Traslocación útero-cecal por dispositivo intrauterino: a propósito de un caso", "Ginecología y Obstetricia / Cirugía General"],
    ["P-46", 10, "Salón 1", "Mar 3 nov", "03:15 PM – 03:30 PM", "Divertículo de Meckel con páncreas ectópico como causa infrecuente de abdomen agudo obstructivo simulando patología ginecológica: a propósito de un caso", "Cirugía General / Cirugía Pediátrica"],
    ["P-47", 11, "Salón 1", "Mar 3 nov", "03:30 PM – 03:45 PM", "Intususcepción ileal postactínica: a propósito de un caso", "Cirugía General / Oncología"],
    ["P-48", 12, "Salón 1", "Mar 3 nov", "03:45 PM – 04:00 PM", "Manejo del trauma laringotraqueal: a propósito de un caso", "Otorrinolaringología / Cirugía de Trauma"],
    ["P-49", 13, "Salón 1", "Mar 3 nov", "04:00 PM – 04:15 PM", "Terapia de presión negativa asistida por vacío (VAC) en cirugía abdominal: revisión de la literatura publicada en 2026", "Cirugía General / Coloproctología"],
    ["P-50", 14, "Salón 1", "Mar 3 nov", "04:15 PM – 04:30 PM", "Trauma diafragmático como hallazgo incidental: a propósito de un caso", "Cirugía de Trauma / Cirugía General"],
    ["P-51", 15, "Salón 1", "Mar 3 nov", "04:30 PM – 04:45 PM", "Adenocarcinoma de colon metacrónico y metástasis de pared abdominal: desafío clínico a propósito de un caso", "Cirugía Oncológica / Cirugía General"],
    ["P-52", 16, "Salón 1", "Mar 3 nov", "04:45 PM – 05:00 PM", "Adenocarcinoma pulmonar primario como hallazgo incidental posterior a trauma torácico: a propósito de un caso", "Cirugía de Tórax / Neumonología"],
    ["P-53", 17, "Salón 1", "Mar 3 nov", "05:00 PM – 05:15 PM", "Caracterización epidemiológica y clínico-quirúrgica de pacientes intervenidos por apendicitis aguda en el HCUAMP, enero–junio 2026", "Cirugía General / Epidemiología"],
    ["P-54", 18, "Salón 1", "Mar 3 nov", "05:15 PM – 05:30 PM", "Obstrucción intestinal de origen poco frecuente: síndrome de Rapunzel: a propósito de un caso", "Cirugía General / Pediatría"],
    ["P-55", 19, "Salón 1", "Mar 3 nov", "05:30 PM – 05:45 PM", "Tumor neuroendocrino como presentación de obstrucción intestinal de asa delgada: a propósito de un caso", "Cirugía General / Oncología"],
    ["P-56", 20, "Salón 1", "Mar 3 nov", "05:45 PM – 06:00 PM", "Torsión testicular intraabdominal como inusual diagnóstico diferencial de plastrón apendicular: a propósito de un caso", "Cirugía Pediátrica / Urología"]
  ];
}

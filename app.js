/**
 * =========================================================================
 * APLICACIÓN PRINCIPAL (PWA) - XIV CONGRESO PINEDA
 * Hospital Central Universitario "Dr. Antonio María Pineda" (HCUAMP)
 * Arquitectura Serverless Frontend para Vercel + Backend Google Apps Script
 * =========================================================================
 */

// ESTADO GLOBAL DE LA APLICACIÓN
const AppState = {
  posters: [],            // 56 trabajos científicos con su estado actual
  attendanceMap: {},      // Mapeo posterId -> datos de asistencia
  apiUrl: "",             // URL del Web App de Google Apps Script
  offlineQueue: [],       // Cola de registros pendientes de enviar a Google Sheets
  activeTab: "dashboard", // Pestaña activa
  catalogFilterTime: "ALL", // Filtro de horario en catálogo
  isOnline: navigator.onLine,
  isSyncing: false
};

// STORAGE KEYS
const STORAGE_KEYS = {
  ATTENDANCE: "PINEDA_ATTENDANCE_DATA",
  API_URL: "PINEDA_GAS_API_URL",
  OFFLINE_QUEUE: "PINEDA_OFFLINE_QUEUE"
};

/**
 * =========================================================================
 * INICIALIZACIÓN DE LA APLICACIÓN
 * =========================================================================
 */
document.addEventListener("DOMContentLoaded", () => {
  initLucide();
  initPWA();
  loadStoredSettings();
  initCatalogData();
  populateSpecialtiesDatalist();
  filterPostersSelector();
  
  // Render inicial de vistas
  updateDashboard();
  renderSpreadsheetTable();
  renderCatalogGrid();
  updateSyncIndicator();

  // Escuchar eventos de red
  window.addEventListener("online", handleNetworkOnline);
  window.addEventListener("offline", handleNetworkOffline);

  // Intentar sincronización inicial con Google Apps Script si hay URL
  if (AppState.apiUrl) {
    syncWithBackend(false);
  }
});

/**
 * Inicializa Lucide Icons
 */
function initLucide() {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

/**
 * Registro de Service Worker para PWA
 */
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registrado exitosamente:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Error registrando Service Worker:", err);
        });
    });
  }
}

/**
 * Carga configuraciones y persistencia previa desde LocalStorage
 */
function loadStoredSettings() {
  // 1. URL de la API
  const savedApiUrl = localStorage.getItem(STORAGE_KEYS.API_URL);
  if (savedApiUrl) {
    AppState.apiUrl = savedApiUrl.trim();
    const input = document.getElementById("api-url-input");
    if (input) input.value = AppState.apiUrl;
  }

  // 2. Registros de Asistencia locales
  try {
    const savedAttendance = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (savedAttendance) {
      AppState.attendanceMap = JSON.parse(savedAttendance);
    }
  } catch (e) {
    console.error("Error parseando asistencia local:", e);
    AppState.attendanceMap = {};
  }

  // 3. Cola Offline
  try {
    const savedQueue = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    if (savedQueue) {
      AppState.offlineQueue = JSON.parse(savedQueue);
    }
  } catch (e) {
    AppState.offlineQueue = [];
  }
  updateQueueCountUI();
}

/**
 * Inicializa el catálogo con los 56 pósters y cruza con las asistencias
 */
function initCatalogData() {
  const baseCatalog = window.POSTERS_CATALOG || [];
  
  AppState.posters = baseCatalog.map(item => {
    const registro = AppState.attendanceMap[item.id] || null;
    return {
      ...item,
      estado: (registro && registro.estado === "PRESENTE") ? "PRESENTE" : "PENDIENTE",
      registro: registro
    };
  });
}

/**
 * Llena el datalist con las especialidades médicas
 */
function populateSpecialtiesDatalist() {
  const datalist = document.getElementById("lista-especialidades");
  if (!datalist) return;
  datalist.innerHTML = "";

  const specialties = window.ESPECIALIDADES_MEDICAS || [];
  specialties.forEach(esp => {
    const opt = document.createElement("option");
    opt.value = esp;
    datalist.appendChild(opt);
  });
}

/**
 * =========================================================================
 * NAVEGACIÓN ENTRE PESTAÑAS (SPA)
 * =========================================================================
 */
function navigateToTab(tabName) {
  AppState.activeTab = tabName;

  // Ocultar todas las pestañas
  const tabContents = document.querySelectorAll(".tab-content");
  tabContents.forEach(el => el.classList.remove("active"));

  // Mostrar la pestaña seleccionada
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) {
    targetView.classList.add("active");
  }

  // Actualizar estado en barra de navegación inferior (Mobile)
  const mobileBtns = document.querySelectorAll(".mobile-nav-btn");
  mobileBtns.forEach(btn => {
    const isCurrent = btn.dataset.tab === tabName;
    if (isCurrent) {
      btn.classList.add("text-pineda-surgical");
      btn.classList.remove("text-slate-500");
    } else {
      btn.classList.remove("text-pineda-surgical");
      btn.classList.add("text-slate-500");
    }
  });

  // Actualizar estado en navegación desktop
  const desktopBtns = document.querySelectorAll(".nav-desktop-btn");
  desktopBtns.forEach(btn => {
    const isCurrent = btn.dataset.tab === tabName;
    if (isCurrent) {
      btn.classList.add("bg-white/20", "text-white");
    } else {
      btn.classList.remove("bg-white/20");
    }
  });

  // Acciones contextuales al entrar a una pestaña
  if (tabName === "dashboard") updateDashboard();
  if (tabName === "spreadsheet") renderSpreadsheetTable();
  if (tabName === "catalogo") renderCatalogGrid();

  window.scrollTo({ top: 0, behavior: "smooth" });
  initLucide();
}

/**
 * =========================================================================
 * MÓDULO 1: DASHBOARD OPERATIVO Y KPIS EN TIEMPO REAL
 * =========================================================================
 */
function updateDashboard() {
  const total = AppState.posters.length; // 56
  let presentes = 0;
  let totalAcomps = 0;
  let totalAforo = 0;

  let s1Total = 0, s1Presentes = 0, s1Aforo = 0;
  let s2Total = 0, s2Presentes = 0, s2Aforo = 0;

  const specialtiesCount = {};

  AppState.posters.forEach(p => {
    const isS1 = p.salon.indexOf("1") !== -1;
    const isS2 = p.salon.indexOf("2") !== -1;

    if (isS1) s1Total++;
    if (isS2) s2Total++;

    if (p.estado === "PRESENTE" && p.registro) {
      presentes++;
      const regAforo = Number(p.registro.totalAforo) || 1;
      const acomps = Math.max(0, regAforo - 1);
      
      totalAcomps += acomps;
      totalAforo += regAforo;

      if (isS1) {
        s1Presentes++;
        s1Aforo += regAforo;
      }
      if (isS2) {
        s2Presentes++;
        s2Aforo += regAforo;
      }

      const esp = (p.registro.especialidad || p.especialidad || "Otra").trim();
      specialtiesCount[esp] = (specialtiesCount[esp] || 0) + 1;
    }
  });

  const quorum = total > 0 ? ((presentes / total) * 100).toFixed(1) : "0.0";

  // KPIs Principales
  setElementText("kpi-total-posters", total);
  setElementText("kpi-present-count", presentes);
  setElementText("kpi-pending-fraction", `de ${total}`);
  setElementText("kpi-quorum-percent", `${quorum}%`);
  setElementText("header-quorum-text", `${quorum}%`);
  setElementText("kpi-total-companions", totalAcomps);
  setElementText("kpi-total-aforo", totalAforo);

  // Barra de Quórum
  const bar = document.getElementById("kpi-quorum-bar");
  if (bar) bar.style.width = `${quorum}%`;

  // Salón 1
  setElementText("s1-presentes", s1Presentes);
  setElementText("s1-pendientes", s1Total - s1Presentes);
  setElementText("s1-aforo", s1Aforo);
  const s1Quorum = s1Total > 0 ? ((s1Presentes / s1Total) * 100).toFixed(1) : "0.0";
  setElementText("s1-progress-text", `${s1Quorum}%`);
  const s1Bar = document.getElementById("s1-progress-bar");
  if (s1Bar) s1Bar.style.width = `${s1Quorum}%`;

  // Salón 2
  setElementText("s2-presentes", s2Presentes);
  setElementText("s2-pendientes", s2Total - s2Presentes);
  setElementText("s2-aforo", s2Aforo);
  const s2Quorum = s2Total > 0 ? ((s2Presentes / s2Total) * 100).toFixed(1) : "0.0";
  setElementText("s2-progress-text", `${s2Quorum}%`);
  const s2Bar = document.getElementById("s2-progress-bar");
  if (s2Bar) s2Bar.style.width = `${s2Quorum}%`;

  // Render Ranking Especialidades
  renderSpecialtiesRanking(specialtiesCount, presentes);
}

/**
 * Renderiza el ranking visual de especialidades
 */
function renderSpecialtiesRanking(specialtiesCount, totalPresentes) {
  const container = document.getElementById("specialties-ranking-container");
  if (!container) return;

  const sorted = Object.keys(specialtiesCount)
    .map(key => ({ name: key, count: specialtiesCount[key] }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-xs text-slate-400">
        Aún no hay ponentes registrados. Las especialidades se clasificarán automáticamente a medida que se confirme asistencia.
      </div>
    `;
    return;
  }

  const badge = document.getElementById("specialties-count-badge");
  if (badge) badge.innerText = `${sorted.length} Áreas Representadas`;

  let html = "";
  const maxCount = sorted[0].count || 1;

  sorted.slice(0, 6).forEach((item, index) => {
    const percentage = ((item.count / maxCount) * 100).toFixed(0);
    const colorClass = index === 0 ? "bg-pineda-surgical" : index === 1 ? "bg-pineda-teal" : "bg-pineda-deep";

    html += `
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-semibold text-slate-700">
          <span class="truncate pr-2">${item.name}</span>
          <span class="font-bold text-slate-900">${item.count} ${item.count === 1 ? 'trabajo' : 'trabajos'}</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="${colorClass} h-2 rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * =========================================================================
 * MÓDULO 2: FORMULARIO DE REGISTRO RÁPIDO
 * =========================================================================
 */

/**
 * Filtra los pósters disponibles en el select según Día y Salón
 */
function filterPostersSelector() {
  const diaFilter = document.getElementById("filter-form-dia")?.value || "TODOS";
  const salonFilter = document.getElementById("filter-form-salon")?.value || "TODOS";
  const select = document.getElementById("select-poster");
  if (!select) return;

  const currentSelection = select.value;
  select.innerHTML = '<option value="">-- Elige un póster de la lista (56 disponibles) --</option>';

  const filtered = AppState.posters.filter(p => {
    const matchDia = (diaFilter === "TODOS" || p.dia.indexOf(diaFilter) !== -1);
    const matchSalon = (salonFilter === "TODOS" || p.salon.indexOf(salonFilter) !== -1);
    return matchDia && matchSalon;
  });

  filtered.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    const statusIcon = p.estado === "PRESENTE" ? "✓ [PRESENTE]" : "○ [PENDIENTE]";
    opt.textContent = `${statusIcon} ${p.codigo || p.id} | ${p.horario} | ${p.titulo.substring(0, 75)}...`;
    select.appendChild(opt);
  });

  if (currentSelection) {
    select.value = currentSelection;
  }
}

/**
 * Al seleccionar un póster en el dropdown
 */
function onPosterSelected(posterIdParam) {
  const select = document.getElementById("select-poster");
  const posterId = posterIdParam || (select ? select.value : "");
  if (!posterId) {
    hideElement("selected-poster-preview");
    return;
  }

  if (select && select.value !== posterId) {
    select.value = posterId;
  }

  const poster = AppState.posters.find(p => p.id === posterId);
  if (!poster) return;

  // Actualizar Preview Card
  setElementText("preview-poster-id", poster.codigo || poster.id);
  setElementText("preview-poster-salon", poster.salon);
  setElementText("preview-poster-dia", poster.dia);
  setElementText("preview-poster-horario", poster.horario);
  setElementText("preview-poster-titulo", poster.titulo);
  setElementText("preview-poster-especialidad", poster.especialidad);
  showElement("selected-poster-preview");

  // Autocompletar especialidad si el input está vacío
  const espInput = document.getElementById("ponente-especialidad");
  if (espInput && !espInput.value.trim() && poster.especialidad) {
    const mainSpecialty = poster.especialidad.split("/")[0].trim();
    espInput.value = mainSpecialty;
  }

  // Verificar si ya está registrado
  const alreadyAlert = document.getElementById("preview-poster-already-registered");
  const submitBtn = document.getElementById("btn-submit-attendance");

  if (poster.estado === "PRESENTE" && poster.registro) {
    const reg = poster.registro;
    setElementText("preview-already-msg", `⚠️ Este póster ya fue registrado como PRESENTE por ${reg.nombrePonente || 'un ponente'} (${reg.timestamp || 'previamente'}).`);
    if (alreadyAlert) alreadyAlert.classList.remove("hidden");
    if (submitBtn) {
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
      submitBtn.disabled = true;
    }
  } else {
    if (alreadyAlert) alreadyAlert.classList.add("hidden");
    if (submitBtn) {
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
      submitBtn.disabled = false;
    }
  }
}

/**
 * Abre el formulario con un póster preseleccionado desde cualquier vista
 */
function openRegisterForPoster(posterId) {
  navigateToTab("registro");
  // Resetear filtros para que el póster aparezca en el select
  const diaSelect = document.getElementById("filter-form-dia");
  const salonSelect = document.getElementById("filter-form-salon");
  if (diaSelect) diaSelect.value = "TODOS";
  if (salonSelect) salonSelect.value = "TODOS";
  filterPostersSelector();

  onPosterSelected(posterId);
  const nameInput = document.getElementById("ponente-nombre");
  if (nameInput) nameInput.focus();
}

/**
 * Toggle para los campos de acompañantes en el formulario
 */
function toggleAcompFields(num) {
  const check = document.getElementById(`check-acomp1`);
  const check2 = document.getElementById(`check-acomp2`);
  const fields1 = document.getElementById(`fields-acomp1`);
  const fields2 = document.getElementById(`fields-acomp2`);

  if (fields1 && check) {
    if (check.checked) fields1.classList.remove("hidden");
    else {
      fields1.classList.add("hidden");
      clearInput("acomp1-nombre");
      clearInput("acomp1-cedula");
    }
  }

  if (fields2 && check2) {
    if (check2.checked) fields2.classList.remove("hidden");
    else {
      fields2.classList.add("hidden");
      clearInput("acomp2-nombre");
      clearInput("acomp2-cedula");
    }
  }

  // Recalcular aforo estimado
  let aforoCount = 1;
  if (check && check.checked) aforoCount++;
  if (check2 && check2.checked) aforoCount++;

  const labelAforo = document.getElementById("label-aforo-calculado");
  if (labelAforo) {
    const plural = aforoCount === 1 ? "Persona (Ponente)" : "Personas (Ponente + Acompañantes)";
    labelAforo.innerText = `+${aforoCount} ${plural}`;
  }
}

/**
 * Manejo del envío del formulario de asistencia
 */
async function handleAttendanceSubmit(event) {
  event.preventDefault();

  const posterId = document.getElementById("select-poster")?.value;
  const nombrePonente = document.getElementById("ponente-nombre")?.value.trim();
  const especialidad = document.getElementById("ponente-especialidad")?.value.trim();
  const telefono = document.getElementById("ponente-telefono")?.value.trim();
  const email = document.getElementById("ponente-email")?.value.trim();

  if (!posterId || !nombrePonente || !especialidad || !telefono || !email) {
    showToast("Por favor completa todos los campos requeridos (*)", "warning");
    return;
  }

  const poster = AppState.posters.find(p => p.id === posterId);
  if (!poster) {
    showToast("Póster no encontrado en el catálogo", "error");
    return;
  }

  // Validar si ya está presente
  if (poster.estado === "PRESENTE") {
    showToast("Este póster ya tiene una asistencia confirmada", "warning");
    return;
  }

  // Datos de Acompañantes
  const checkAcomp1 = document.getElementById("check-acomp1")?.checked;
  const acomp1Nombre = checkAcomp1 ? document.getElementById("acomp1-nombre")?.value.trim() : "";
  const acomp1Cedula = checkAcomp1 ? document.getElementById("acomp1-cedula")?.value.trim() : "";

  const checkAcomp2 = document.getElementById("check-acomp2")?.checked;
  const acomp2Nombre = checkAcomp2 ? document.getElementById("acomp2-nombre")?.value.trim() : "";
  const acomp2Cedula = checkAcomp2 ? document.getElementById("acomp2-cedula")?.value.trim() : "";

  let aforo = 1;
  if (acomp1Nombre) aforo++;
  if (acomp2Nombre) aforo++;

  const timestamp = formatDateTime(new Date());
  const idRegistro = "REG-" + Date.now().toString(36).toUpperCase() + "-" + posterId;

  // Registro Transaccional
  const registro = {
    idRegistro: idRegistro,
    posterId: posterId,
    salon: poster.salon,
    diaHora: `${poster.dia} • ${poster.horario}`,
    tituloPoster: poster.titulo,
    nombrePonente: nombrePonente,
    especialidad: especialidad,
    email: email,
    telefonoWhatsApp: telefono,
    nombreAcomp1: acomp1Nombre,
    cedulaAcomp1: acomp1Cedula,
    nombreAcomp2: acomp2Nombre,
    cedulaAcomp2: acomp2Cedula,
    totalAforo: aforo,
    timestamp: timestamp,
    estado: "PRESENTE",
    dispositivo: navigator.userAgent
  };

  // 1. Guardar de inmediato localmente (Optimistic UI)
  AppState.attendanceMap[posterId] = registro;
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(AppState.attendanceMap));

  // Actualizar póster en memoria
  poster.estado = "PRESENTE";
  poster.registro = registro;

  // 2. Intentar enviar a Google Apps Script
  const submitBtn = document.getElementById("btn-submit-attendance");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i><span>Guardando en Google Sheets...</span>`;
    initLucide();
  }

  let sentSuccessfully = false;
  if (AppState.apiUrl && navigator.onLine) {
    try {
      sentSuccessfully = await sendRecordToGAS(registro);
    } catch (e) {
      console.warn("Fallo al enviar a Google Apps Script, pasando a cola offline:", e);
      sentSuccessfully = false;
    }
  }

  if (!sentSuccessfully) {
    // Encolar offline
    AppState.offlineQueue.push(registro);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(AppState.offlineQueue));
    updateQueueCountUI();
    showToast("Guardado localmente. Se enviará a Google Sheets al recuperar conexión.", "info");
  } else {
    showToast("¡Asistencia registrada y sincronizada con Google Sheets!", "success");
  }

  // 3. Resetear formulario y botón
  document.getElementById("attendance-form")?.reset();
  toggleAcompFields(1);
  hideElement("selected-poster-preview");
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5"></i><span>Confirmar y Guardar Asistencia</span>`;
    initLucide();
  }

  // 4. Actualizar vistas
  filterPostersSelector();
  updateDashboard();
  renderSpreadsheetTable();
  renderCatalogGrid();

  // 5. Mostrar Credencial Oficial Digital
  showCredentialModal(registro);
}

/**
 * =========================================================================
 * MÓDULO 3: SPREADSHEET INTERACTIVO (DATA-TABLE)
 * =========================================================================
 */
function renderSpreadsheetTable() {
  const tbody = document.getElementById("spreadsheet-tbody");
  if (!tbody) return;

  const searchQuery = (document.getElementById("table-search-input")?.value || "").toLowerCase().trim();
  const estadoFilter = document.getElementById("table-filter-estado")?.value || "TODOS";
  const salonFilter = document.getElementById("table-filter-salon")?.value || "TODOS";

  const filtered = AppState.posters.filter(p => {
    // Filtro Estado
    if (estadoFilter !== "TODOS" && p.estado !== estadoFilter) return false;
    // Filtro Salón
    if (salonFilter !== "TODOS" && p.salon.indexOf(salonFilter) === -1) return false;

    // Filtro Búsqueda
    if (searchQuery) {
      const matchId = (p.id.toLowerCase().includes(searchQuery) || (p.codigo && p.codigo.toLowerCase().includes(searchQuery)));
      const matchTitulo = p.titulo.toLowerCase().includes(searchQuery);
      const matchEsp = (p.especialidad && p.especialidad.toLowerCase().includes(searchQuery));
      const matchPonente = p.registro && p.registro.nombrePonente && p.registro.nombrePonente.toLowerCase().includes(searchQuery);
      const matchCedula = p.registro && (
        (p.registro.cedulaAcomp1 && p.registro.cedulaAcomp1.toLowerCase().includes(searchQuery)) ||
        (p.registro.cedulaAcomp2 && p.registro.cedulaAcomp2.toLowerCase().includes(searchQuery))
      );
      if (!matchId && !matchTitulo && !matchEsp && !matchPonente && !matchCedula) {
        return false;
      }
    }

    return true;
  });

  setElementText("table-results-counter", `Mostrando ${filtered.length} de ${AppState.posters.length} trabajos`);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-400">
          <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          <p class="font-medium text-xs">No se encontraron trabajos con los filtros actuales.</p>
        </td>
      </tr>
    `;
    initLucide();
    return;
  }

  let rowsHtml = "";
  filtered.forEach(p => {
    const isPresent = p.estado === "PRESENTE";
    const reg = p.registro;

    const statusBadge = isPresent
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i data-lucide="check" class="w-3 h-3 mr-0.5"></i>PRESENTE</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">PENDIENTE</span>`;

    const ponenteCell = isPresent && reg
      ? `<div>
           <div class="font-bold text-slate-900">${reg.nombrePonente}</div>
           <div class="text-[11px] text-slate-500 truncate max-w-[150px]">${reg.especialidad}</div>
         </div>`
      : `<span class="text-slate-400 italic">Sin registro</span>`;

    const aforoBadge = isPresent && reg
      ? `<span class="font-bold text-pineda-deep bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">+${reg.totalAforo}</span>`
      : `<span class="text-slate-300">—</span>`;

    const actions = isPresent && reg
      ? `<div class="flex items-center justify-center space-x-1">
           <button onclick="viewCredentialForPoster('${p.id}')" class="p-1.5 rounded-lg text-pineda-surgical hover:bg-sky-50 transition" title="Ver Credencial">
             <i data-lucide="badge-check" class="w-4 h-4"></i>
           </button>
           <button onclick="revokeAttendance('${p.id}')" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition" title="Revocar Asistencia">
             <i data-lucide="undo-2" class="w-4 h-4"></i>
           </button>
         </div>`
      : `<div class="flex items-center justify-center">
           <button onclick="openRegisterForPoster('${p.id}')" class="px-2.5 py-1 rounded-lg bg-pineda-surgical/10 hover:bg-pineda-surgical hover:text-white text-pineda-surgical font-bold text-[11px] transition flex items-center space-x-1">
             <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
             <span>Registrar</span>
           </button>
         </div>`;

    rowsHtml += `
      <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
        <td class="py-3 px-3.5 text-center font-mono font-bold text-slate-700">${p.codigo || p.id}</td>
        <td class="py-3 px-3.5 whitespace-nowrap">
          <span class="font-semibold text-slate-900">${p.salon}</span>
          <div class="text-[10px] text-slate-500">${p.dia}</div>
        </td>
        <td class="py-3 px-3.5 font-semibold text-slate-600 whitespace-nowrap">${p.horario}</td>
        <td class="py-3 px-4 font-medium text-slate-900 leading-snug">${p.titulo}</td>
        <td class="py-3 px-3.5">${ponenteCell}</td>
        <td class="py-3 px-3.5 text-center">${aforoBadge}</td>
        <td class="py-3 px-3.5 text-center whitespace-nowrap">${statusBadge}</td>
        <td class="py-3 px-3.5 text-center">${actions}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  initLucide();
}

/**
 * Revocar asistencia registrada
 */
async function revokeAttendance(posterId) {
  const poster = AppState.posters.find(p => p.id === posterId);
  if (!poster) return;

  const confirmMsg = `¿Estás seguro de revocar la presencia del póster ${poster.codigo || poster.id} (${poster.registro?.nombrePonente || 'Ponente'})? El póster volverá al estado PENDIENTE.`;
  if (!confirm(confirmMsg)) return;

  // Actualizar estado local
  delete AppState.attendanceMap[posterId];
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(AppState.attendanceMap));

  poster.estado = "PENDIENTE";
  poster.registro = null;

  // Notificar al backend si hay URL
  if (AppState.apiUrl && navigator.onLine) {
    try {
      await fetch(AppState.apiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", id_poster: posterId })
      });
    } catch (e) {
      console.warn("No se pudo notificar revocación a GAS:", e);
    }
  }

  showToast("Asistencia revocada. El póster ha retornado a estado PENDIENTE.", "info");
  updateDashboard();
  renderSpreadsheetTable();
  renderCatalogGrid();
  filterPostersSelector();
}

/**
 * Exportación a CSV
 */
function exportTableToCSV() {
  const headers = [
    "ID_Poster", "Codigo", "Salon", "Dia", "Horario", "Titulo_Oficial",
    "Estado", "Nombre_Ponente", "Especialidad", "Email", "Telefono_WhatsApp",
    "Nombre_Acomp1", "Cedula_Acomp1", "Nombre_Acomp2", "Cedula_Acomp2", "Total_Aforo", "Timestamp_Registro"
  ];

  const rows = AppState.posters.map(p => {
    const reg = p.registro || {};
    return [
      p.id,
      p.codigo || "",
      p.salon,
      p.dia,
      p.horario,
      `"${p.titulo.replace(/"/g, '""')}"`,
      p.estado,
      reg.nombrePonente ? `"${reg.nombrePonente.replace(/"/g, '""')}"` : "",
      reg.especialidad ? `"${reg.especialidad.replace(/"/g, '""')}"` : "",
      reg.email || "",
      reg.telefonoWhatsApp || "",
      reg.nombreAcomp1 ? `"${reg.nombreAcomp1.replace(/"/g, '""')}"` : "",
      reg.cedulaAcomp1 || "",
      reg.nombreAcomp2 ? `"${reg.nombreAcomp2.replace(/"/g, '""')}"` : "",
      reg.cedulaAcomp2 || "",
      reg.totalAforo || (p.estado === "PRESENTE" ? 1 : 0),
      reg.timestamp || ""
    ];
  });

  let csvContent = "\uFEFF" + headers.join(",") + "\n";
  rows.forEach(row => {
    csvContent += row.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Reporte_Asistencia_Congreso_Pineda_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Archivo CSV generado y descargado.", "success");
}

/**
 * Exportación a Excel (formato HTML Table compatible con .xls)
 */
function exportTableToExcel() {
  let tableHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/></head>
    <body>
      <h2>XIV CONGRESO PINEDA - REPORTE DE ASISTENCIA Y AFORO E-PÓSTERS</h2>
      <p>Hospital Central Universitario "Dr. Antonio María Pineda" (HCUAMP)</p>
      <table border="1">
        <tr style="background-color: #004C87; color: #FFFFFF; font-weight: bold;">
          <th>ID</th>
          <th>Código</th>
          <th>Salón</th>
          <th>Día</th>
          <th>Horario</th>
          <th>Título del Póster</th>
          <th>Estado</th>
          <th>Ponente</th>
          <th>Especialidad</th>
          <th>Email</th>
          <th>Teléfono</th>
          <th>Acomp 1</th>
          <th>Cédula 1</th>
          <th>Acomp 2</th>
          <th>Cédula 2</th>
          <th>Aforo</th>
          <th>Timestamp</th>
        </tr>
  `;

  AppState.posters.forEach(p => {
    const reg = p.registro || {};
    tableHtml += `
      <tr>
        <td>${p.id}</td>
        <td>${p.codigo || ""}</td>
        <td>${p.salon}</td>
        <td>${p.dia}</td>
        <td>${p.horario}</td>
        <td>${escapeHtml(p.titulo)}</td>
        <td style="font-weight: bold; color: ${p.estado === 'PRESENTE' ? '#059669' : '#D97706'}">${p.estado}</td>
        <td>${escapeHtml(reg.nombrePonente || "")}</td>
        <td>${escapeHtml(reg.especialidad || "")}</td>
        <td>${reg.email || ""}</td>
        <td>${reg.telefonoWhatsApp || ""}</td>
        <td>${escapeHtml(reg.nombreAcomp1 || "")}</td>
        <td>${reg.cedulaAcomp1 || ""}</td>
        <td>${escapeHtml(reg.nombreAcomp2 || "")}</td>
        <td>${reg.cedulaAcomp2 || ""}</td>
        <td>${reg.totalAforo || (p.estado === "PRESENTE" ? 1 : 0)}</td>
        <td>${reg.timestamp || ""}</td>
      </tr>
    `;
  });

  tableHtml += "</table></body></html>";

  const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Reporte_Asistencia_Congreso_Pineda_${new Date().toISOString().split("T")[0]}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Planilla Excel exportada con éxito.", "success");
}

/**
 * =========================================================================
 * MÓDULO 4: CATÁLOGO Y CRONOGRAMA DE TRABAJOS (CARDS)
 * =========================================================================
 */
function renderCatalogGrid() {
  const container = document.getElementById("catalog-cards-grid");
  if (!container) return;

  const timeFilter = AppState.catalogFilterTime;

  const filtered = AppState.posters.filter(p => {
    if (timeFilter === "ALL") return true;
    
    const startHour = parseInt(p.horaInicio.split(":")[0], 10);
    if (timeFilter === "11-13") return startHour >= 11 && startHour < 13;
    if (timeFilter === "13-15") return startHour >= 13 && startHour < 15;
    if (timeFilter === "15-18") return startHour >= 15 && startHour <= 18;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-slate-400">
        <i data-lucide="calendar-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        <p class="text-xs">No hay trabajos en este bloque horario.</p>
      </div>
    `;
    initLucide();
    return;
  }

  let html = "";
  filtered.forEach(p => {
    const isPresent = p.estado === "PRESENTE";
    const reg = p.registro;

    const badgeClass = isPresent
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-700 border-amber-200";

    const badgeLabel = isPresent ? "✓ PRESENTE" : "PENDIENTE";

    const salonColor = p.salon.indexOf("1") !== -1 ? "text-pineda-deep bg-blue-50 border-blue-200" : "text-pineda-teal bg-teal-50 border-teal-200";

    const actionBtn = isPresent
      ? `<button onclick="viewCredentialForPoster('${p.id}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center space-x-1.5">
           <i data-lucide="badge-check" class="w-4 h-4 text-emerald-600"></i>
           <span>Ver Credencial</span>
         </button>`
      : `<button onclick="openRegisterForPoster('${p.id}')" class="w-full py-2 px-3 rounded-xl bg-pineda-deep hover:bg-pineda-navy text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 shadow-sm active:scale-95">
           <i data-lucide="user-plus" class="w-4 h-4"></i>
           <span>Registrar Asistencia</span>
         </button>`;

    html += `
      <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
        
        <div class="space-y-2">
          <!-- Header de Tarjeta -->
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-extrabold text-white bg-pineda-deep px-2 py-0.5 rounded-lg shadow-sm">
              ${p.codigo || p.id}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">
              ${badgeLabel}
            </span>
          </div>

          <!-- Horario y Salón -->
          <div class="flex items-center space-x-2 text-xs">
            <span class="px-2 py-0.5 rounded border font-semibold ${salonColor}">${p.salon}</span>
            <span class="text-slate-500 font-medium">${p.dia}</span>
          </div>

          <div class="flex items-center space-x-1 text-xs font-bold text-pineda-surgical">
            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
            <span>${p.horario}</span>
          </div>

          <!-- Título del Póster -->
          <h4 class="text-xs font-bold text-slate-900 leading-snug line-clamp-3" title="${escapeHtml(p.titulo)}">
            ${p.titulo}
          </h4>

          <!-- Especialidad -->
          <div class="text-[11px] text-slate-500 flex items-center space-x-1">
            <i data-lucide="tag" class="w-3 h-3 text-pineda-teal flex-shrink-0"></i>
            <span class="truncate">${p.especialidad}</span>
          </div>

          <!-- Si está presente, mostrar nombre del ponente -->
          ${isPresent && reg ? `
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs mt-2">
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Ponente Registrado:</span>
              <div class="font-bold text-slate-800 truncate">${reg.nombrePonente}</div>
              <div class="text-[11px] text-slate-500 flex justify-between mt-0.5">
                <span>Aforo: +${reg.totalAforo} pers.</span>
                <span>${reg.timestamp ? reg.timestamp.split(" ")[1] : ""}</span>
              </div>
            </div>
          ` : ""}
        </div>

        <!-- Botón de Acción -->
        <div>
          ${actionBtn}
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
  initLucide();
}

/**
 * Filtro de horario en catálogo
 */
function filterCatalogByTime(timeKey) {
  AppState.catalogFilterTime = timeKey;
  const filterBtns = document.querySelectorAll(".catalog-time-filter");
  filterBtns.forEach(btn => {
    if (btn.dataset.time === timeKey) {
      btn.classList.add("bg-pineda-deep", "text-white");
      btn.classList.remove("bg-slate-100", "text-slate-700");
    } else {
      btn.classList.remove("bg-pineda-deep", "text-white");
      btn.classList.add("bg-slate-100", "text-slate-700");
    }
  });
  renderCatalogGrid();
}

/**
 * =========================================================================
 * MÓDULO 5: SINCRONIZACIÓN Y COMUNICACIÓN CON GOOGLE APPS SCRIPT
 * =========================================================================
 */

/**
 * Envía un registro transaccional hacia el endpoint doPost de GAS
 */
async function sendRecordToGAS(registro) {
  if (!AppState.apiUrl) return false;

  const payload = {
    action: "register",
    id_poster: registro.posterId,
    nombre_ponente: registro.nombrePonente,
    especialidad: registro.especialidad,
    email: registro.email,
    telefono: registro.telefonoWhatsApp,
    nombre_acomp1: registro.nombreAcomp1,
    cedula_acomp1: registro.cedulaAcomp1,
    nombre_acomp2: registro.nombreAcomp2,
    cedula_acomp2: registro.cedulaAcomp2,
    salon: registro.salon,
    dia_hora: registro.diaHora,
    titulo_poster: registro.tituloPoster,
    dispositivo: registro.dispositivo
  };

  // Google Apps Script Web App soporta peticiones vía POST (mode: no-cors para evitar bloqueo CORS)
  const response = await fetch(AppState.apiUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return true;
}

/**
 * Sincroniza catálogo y asistencias desde Google Apps Script (doGet: action=getPosters)
 */
async function syncWithBackend(isManual = false) {
  if (AppState.isSyncing) return;
  if (!AppState.apiUrl) {
    if (isManual) {
      showToast("Configura primero la URL de Google Apps Script en Ajustes", "info");
      navigateToTab("config");
    }
    return;
  }

  AppState.isSyncing = true;
  updateSyncIndicator(true);

  try {
    const url = `${AppState.apiUrl}?action=getPosters&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const result = await res.json();
    if (result && result.success && Array.isArray(result.data)) {
      
      // Actualizar mapa local con la información remota
      result.data.forEach(item => {
        if (item.estado === "PRESENTE" && item.registro) {
          AppState.attendanceMap[item.id] = item.registro;
        }
      });

      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(AppState.attendanceMap));
      initCatalogData();

      // Procesar cola offline si existen elementos pendientes
      await syncOfflineQueue();

      updateDashboard();
      renderSpreadsheetTable();
      renderCatalogGrid();
      filterPostersSelector();

      if (isManual) {
        showToast("Sincronización completada con Google Sheets", "success");
      }
    } else {
      throw new Error(result.error || "Respuesta inválida del servidor");
    }
  } catch (err) {
    console.warn("Aviso de sincronización:", err.message);
    if (isManual) {
      showToast("No se pudo conectar a Google Sheets. Comprueba tu conexión o URL del script.", "warning");
    }
  } finally {
    AppState.isSyncing = false;
    updateSyncIndicator(false);
  }
}

/**
 * Procesa la cola de registros generados sin conexión
 */
async function syncOfflineQueue() {
  if (AppState.offlineQueue.length === 0 || !AppState.apiUrl || !navigator.onLine) {
    updateQueueCountUI();
    return;
  }

  showToast(`Sincronizando ${AppState.offlineQueue.length} registros pendientes...`, "info");
  const remaining = [];

  for (const item of AppState.offlineQueue) {
    try {
      const ok = await sendRecordToGAS(item);
      if (!ok) remaining.push(item);
    } catch (e) {
      remaining.push(item);
    }
  }

  AppState.offlineQueue = remaining;
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(AppState.offlineQueue));
  updateQueueCountUI();

  if (remaining.length === 0) {
    showToast("¡Todos los registros offline fueron enviados a Google Sheets!", "success");
  }
}

/**
 * Manejadores de red online/offline
 */
function handleNetworkOnline() {
  AppState.isOnline = true;
  const banner = document.getElementById("offline-banner");
  if (banner) banner.classList.add("hidden");
  updateSyncIndicator();
  showToast("Conexión restablecida", "success");
  syncWithBackend(false);
}

function handleNetworkOffline() {
  AppState.isOnline = false;
  const banner = document.getElementById("offline-banner");
  if (banner) banner.classList.remove("hidden");
  updateSyncIndicator();
  showToast("Has pasado a modo sin conexión (Offline)", "warning");
}

function updateSyncIndicator(isSpinning = false) {
  const label = document.getElementById("sync-status-label");
  const indicator = document.getElementById("sync-status-indicator");
  const icon = document.getElementById("sync-icon");

  if (icon) {
    if (isSpinning) icon.classList.add("animate-spin");
    else icon.classList.remove("animate-spin");
  }

  if (!indicator || !label) return;

  if (!AppState.isOnline) {
    label.innerText = "Offline";
    indicator.className = "flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30";
  } else if (isSpinning) {
    label.innerText = "Sincronizando...";
    indicator.className = "flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/20 text-sky-300 border border-sky-400/30";
  } else {
    label.innerText = AppState.apiUrl ? "Online (Sheets)" : "Modo Local";
    indicator.className = "flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30";
  }
}

function updateQueueCountUI() {
  const el = document.getElementById("config-queue-count");
  if (el) {
    const count = AppState.offlineQueue.length;
    el.innerText = `${count} ${count === 1 ? 'pendiente' : 'pendientes'}`;
    el.className = count > 0
      ? "px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"
      : "px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700";
  }
}

/**
 * =========================================================================
 * MODAL: CREDENCIAL OFICIAL DIGITAL
 * =========================================================================
 */
function showCredentialModal(registro) {
  const modal = document.getElementById("credential-modal");
  if (!modal) return;

  setElementText("cred-id", registro.posterId);
  setElementText("cred-salon", registro.salon);
  setElementText("cred-horario", registro.diaHora);
  setElementText("cred-titulo", registro.tituloPoster);
  setElementText("cred-ponente", registro.nombrePonente);
  setElementText("cred-especialidad", registro.especialidad);
  setElementText("cred-timestamp", registro.timestamp);
  setElementText("cred-aforo", `+${registro.totalAforo} persona${registro.totalAforo > 1 ? 's' : ''}`);
  setElementText("cred-hash", registro.idRegistro);

  // Acompañantes
  const acompList = [];
  if (registro.nombreAcomp1) acompList.push(`1. ${registro.nombreAcomp1} (${registro.cedulaAcomp1 || 'S/D'})`);
  if (registro.nombreAcomp2) acompList.push(`2. ${registro.nombreAcomp2} (${registro.cedulaAcomp2 || 'S/D'})`);

  const acompContainer = document.getElementById("cred-acomps-container");
  const acompEl = document.getElementById("cred-acomps-list");
  if (acompContainer && acompEl) {
    if (acompList.length > 0) {
      acompContainer.classList.remove("hidden");
      acompEl.innerHTML = acompList.join("<br>");
    } else {
      acompContainer.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  initLucide();
}

function closeCredentialModal() {
  const modal = document.getElementById("credential-modal");
  if (modal) modal.classList.add("hidden");
}

function viewCredentialForPoster(posterId) {
  const poster = AppState.posters.find(p => p.id === posterId);
  if (poster && poster.registro) {
    showCredentialModal(poster.registro);
  } else {
    showToast("Este póster aún no tiene registro de asistencia", "info");
  }
}

/**
 * =========================================================================
 * VISTA CONFIGURACIÓN: ACCIONES
 * =========================================================================
 */
async function saveAndTestApiUrl() {
  const input = document.getElementById("api-url-input");
  const url = input ? input.value.trim() : "";

  if (!url) {
    showToast("Por favor introduce una URL válida", "warning");
    return;
  }

  showToast("Probando conexión con Google Apps Script...", "info");

  try {
    const pingUrl = `${url}?action=ping&t=${Date.now()}`;
    const res = await fetch(pingUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data && data.success) {
      AppState.apiUrl = url;
      localStorage.setItem(STORAGE_KEYS.API_URL, url);
      showToast("¡Conexión establecida con éxito con Google Sheets!", "success");
      updateSyncIndicator();
      syncWithBackend(true);
    } else {
      throw new Error("Respuesta no válida de la API");
    }
  } catch (e) {
    showToast(`Error al conectar: ${e.message}. Verifica los permisos del Web App.`, "error");
  }
}

function useDemoMode() {
  AppState.apiUrl = "";
  localStorage.removeItem(STORAGE_KEYS.API_URL);
  const input = document.getElementById("api-url-input");
  if (input) input.value = "";
  updateSyncIndicator();
  showToast("Modo Local / Demo activado.", "info");
}

function downloadLocalBackup() {
  const data = {
    version: "1.0",
    congreso: "XIV Congreso Pineda - HCUAMP",
    exportedAt: new Date().toISOString(),
    attendance: AppState.attendanceMap,
    offlineQueue: AppState.offlineQueue
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Backup_Congreso_Pineda_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  showToast("Backup local descargado", "success");
}

function clearLocalCache() {
  if (!confirm("¿Deseas vaciar la caché de asistencias locales? Los datos no sincronizados se perderán.")) return;
  localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
  localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
  AppState.attendanceMap = {};
  AppState.offlineQueue = [];
  initCatalogData();
  updateDashboard();
  renderSpreadsheetTable();
  renderCatalogGrid();
  updateQueueCountUI();
  showToast("Caché local reiniciada", "info");
}

/**
 * =========================================================================
 * HELPERS Y UTILIDADES
 * =========================================================================
 */
function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function clearInput(id) {
  const el = document.getElementById(id);
  if (el) el.value = "";
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${pad(hours)}:${pad(d.getMinutes())} ${ampm}`;
  return `${dateStr} ${timeStr}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Notificaciones Flotantes (Toasts)
 */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const colorMap = {
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
    warning: "bg-amber-500 text-slate-900",
    info: "bg-pineda-deep text-white"
  };

  const iconMap = {
    success: "check-circle",
    error: "alert-circle",
    warning: "alert-triangle",
    info: "info"
  };

  const bgClass = colorMap[type] || colorMap.info;
  const icon = iconMap[type] || "info";

  toast.className = `pointer-events-auto p-3.5 rounded-2xl shadow-xl flex items-center space-x-3 text-xs font-semibold ${bgClass} animate-in fade-in slide-in-from-top-4 duration-300`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);
  initLucide();

  setTimeout(() => {
    toast.classList.add("opacity-0", "transition-opacity", "duration-300");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

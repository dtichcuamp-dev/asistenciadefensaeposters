/**
 * =========================================================================
 * VARIABLES DE ENTORNO Y CONFIGURACIÓN CENTRALIZADA
 * XIV CONGRESO PINEDA - HOSPITAL CENTRAL UNIVERSITARIO "DR. ANTONIO MARÍA PINEDA"
 * =========================================================================
 * Este archivo centraliza todas las variables de entorno institucionales,
 * identificadores de bases de datos y endpoints de conexión del sistema.
 */

const ENV = {
  // Identificador de la Base de Datos Central Institucional
  SPREADSHEET_ID: "1WcUhQ5DaZbiiKY0HWnj9uUR5_TQ9cpy8TTWNNV0sXKI",

  // URL del Servidor Central Institucional (Google Apps Script Web App API)
  // Puede ser sobreescrita dinámicamente desde el panel de ajustes o persistida en LocalStorage
  API_ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbz_REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec",

  // Metadatos Institucionales
  CONGRESO_NOMBRE: "XIV Congreso Pineda",
  CONGRESO_EDICION: "Año 2026",
  CONGRESO_EVENTO: "Jornada Científica de Evaluación de E-Pósters",
  HOSPITAL_NOMBRE: "Hospital Central Universitario \"Dr. Antonio María Pineda\"",
  HOSPITAL_SIGLAS: "HCUAMP",
  HOSPITAL_UBICACION: "Barquisimeto, Estado Lara, Venezuela",
  
  // Parámetros de Operación
  TOTAL_POSTERS: 56,
  FECHAS_JORNADA: ["Lunes 2 de Noviembre, 2026", "Martes 3 de Noviembre, 2026"],
  HORARIO_JORNADA: "11:00 AM – 06:00 PM",
  
  // Autoridades Médicas y Académicas
  AUTORIDADES: {
    PRESIDENTA_COMITE: {
      nombre: "Dra. Adriana Barreto",
      cargo: "Presidenta del Comité Organizador del XIV Congreso Pineda Año 2026"
    },
    DIRECTORA_GENERAL: {
      nombre: "Dra. Linda Amaro",
      cargo: "Directora General del Hospital Central Universitario Dr. Antonio María Pineda"
    },
    DIRECTORA_DOCENCIA: {
      nombre: "Dra. Marisol Balabú",
      cargo: "Directora Adjunta de Investigación y Docencia del Hospital Central Universitario Dr. Antonio María Pineda"
    }
  },

  // Unidad Técnica Responsable
  DEPARTAMENTO_TECNICO: "Departamento de Tecnología, Información y Comunicación (DTIC) - HCUAMP",

  // Contraseña de Acceso Restringido al Centro de Conexión / Configuración
  // Puede configurarse mediante variable de entorno (VITE_ADMIN_PASSWORD / NEXT_PUBLIC_ADMIN_PASSWORD)
  ADMIN_PASSWORD: (typeof process !== "undefined" && (process.env?.VITE_ADMIN_PASSWORD || process.env?.NEXT_PUBLIC_ADMIN_PASSWORD || process.env?.PINEDA_ADMIN_PASSWORD)) || "PINEDA2026"
};

// Exportar globalmente al entorno del navegador
if (typeof window !== "undefined") {
  window.ENV = ENV;
}

// Compatibilidad Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = ENV;
}

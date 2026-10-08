/*! LAZU standalone tracker v1 · sin dependencias · https://lazu.bio */
(function () {
  "use strict";

  // Configuración leída de las constantes que el diseñador declara antes de este bloque.
  var PROFILE = typeof LAZU_PROFILE_ID !== "undefined" ? String(LAZU_PROFILE_ID) : "";
  var ENDPOINT =
    typeof LAZU_ENDPOINT !== "undefined" ? String(LAZU_ENDPOINT) : "https://app.lazu.bio/api/track";
  var AUTO_PAGE_VIEW = typeof LAZU_AUTO_PAGE_VIEW !== "undefined" ? !!LAZU_AUTO_PAGE_VIEW : true;

  var STORAGE_KEY = "lazu_session_id";
  var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
  var EVENTS = [
    "page_view",
    "whatsapp_click",
    "phone_click",
    "maps_click",
    "social_click",
    "website_click",
    "contact_save",
    "catalog_view",
    "custom",
  ];

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "anon-" + window.crypto.randomUUID().replace(/-/g, "");
    }
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return "anon-" + Array.prototype.map.call(bytes, function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  // Identificador anónimo aleatorio. No contiene datos personales.
  // Se guarda en localStorage durante 30 días; si el navegador pide no ser
  // rastreado (Global Privacy Control / Do Not Track) o localStorage no está
  // disponible, se usa un id nuevo por cada carga de página.
  function sessionId() {
    var optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
    if (!optOut) {
      try {
        var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (stored && typeof stored.id === "string" && stored.exp > Date.now()) return stored.id;
        var fresh = { id: randomId(), exp: Date.now() + SESSION_TTL_MS };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh.id;
      } catch {
        /* localStorage bloqueado: seguimos con un id en memoria */
      }
    }
    if (!sessionId.memory) sessionId.memory = randomId();
    return sessionId.memory;
  }

  function cleanMetadata(metadata) {
    var out = {};
    if (!metadata || typeof metadata !== "object") return out;
    Object.keys(metadata).slice(0, 20).forEach(function (key) {
      var value = metadata[key];
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(key)) return;
      if (typeof value === "string") out[key] = value.slice(0, 200);
      else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    });
    return out;
  }

  function send(body) {
    // text/plain evita el preflight CORS y es compatible con sendBeacon.
    var payload = JSON.stringify(body);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch {
      /* continúa con fetch */
    }
    try {
      fetch(ENDPOINT, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      }).catch(function () {});
    } catch {
      /* el tracking nunca debe romper el perfil */
    }
  }

  /**
   * Envía un evento a LAZU.
   * @param {string} eventName uno de EVENTS
   * @param {Object} [metadata] valores simples (texto, número, booleano)
   */
  function lazuTrack(eventName, metadata) {
    if (!PROFILE) {
      if (window.console) console.warn("[LAZU] Falta LAZU_PROFILE_ID");
      return;
    }
    if (EVENTS.indexOf(eventName) === -1) {
      if (window.console) console.warn("[LAZU] Evento no soportado:", eventName);
      return;
    }
    var body = {
      profile: PROFILE,
      event: eventName,
      sessionId: sessionId(),
      metadata: cleanMetadata(metadata),
    };
    if (eventName === "page_view" && document.referrer) body.referrer = document.referrer;
    send(body);
  }

  // Delegación de eventos: cualquier elemento con data-lazu-event se registra al hacer clic,
  // sin que el diseñador escriba JavaScript. Opcional: data-lazu-label="instagram".
  function onClick(e) {
    if (e.type === "auxclick" && e.button !== 1) return;
    var target = e.target && e.target.closest ? e.target.closest("[data-lazu-event]") : null;
    if (!target) return;
    var metadata = {};
    var label = target.getAttribute("data-lazu-label");
    if (label) metadata.label = label;
    var href = target.getAttribute("href");
    if (href) {
      try {
        var url = new URL(href, location.href);
        metadata.target = url.protocol === "tel:" || url.protocol === "mailto:" ? url.protocol.slice(0, -1) : url.hostname;
      } catch {
        /* href no válido: se ignora */
      }
    }
    lazuTrack(target.getAttribute("data-lazu-event"), metadata);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);

  window.lazuTrack = lazuTrack;

  if (AUTO_PAGE_VIEW) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        lazuTrack("page_view");
      });
    } else {
      lazuTrack("page_view");
    }
  }
})();

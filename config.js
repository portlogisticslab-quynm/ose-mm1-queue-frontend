"use strict";

/*
  Local development:
    http://127.0.0.1:8000

  Online deployment:
    Replace the placeholder below with the actual Render URL,
    for example: https://ose-mm1-queue-backend.onrender.com
*/
window.OSE_API_BASE = window.OSE_API_BASE || (
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "https://REPLACE-WITH-YOUR-RENDER-URL.onrender.com"
);

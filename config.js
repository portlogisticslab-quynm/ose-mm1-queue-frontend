"use strict";

window.OSE_API_BASE = window.OSE_API_BASE || (
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8002"
    : "https://mm1-api.ose.vn"
);

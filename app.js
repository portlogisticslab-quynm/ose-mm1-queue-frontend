"use strict";

const STEP_DURATION_MS = 300;
const MAX_CHART_POINTS = 250;
const MAX_VISIBLE_CUSTOMERS = 20;

let sessionId = null;
let timerId = null;
let requestInProgress = false;
let latestSnapshot = null;

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const lambdaInput = document.getElementById("lambda");
const muInput = document.getElementById("mu");
const binCountInput = document.getElementById("binCount");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const backendBadge = document.getElementById("backendBadge");

const timeValue = document.getElementById("timeValue");
const queueValue = document.getElementById("queueValue");
const serverValue = document.getElementById("serverValue");
const systemValue = document.getElementById("systemValue");
const sampleValue = document.getElementById("sampleValue");
const averageWaitValue = document.getElementById("averageWaitValue");
const maximumWaitValue = document.getElementById("maximumWaitValue");
const message = document.getElementById("message");

const queueChart = new Chart(document.getElementById("queueChart").getContext("2d"), {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Customers in system",
      data: [],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.15
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: "index" },
    scales: {
      x: { title: { display: true, text: "Simulation time" } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        title: { display: true, text: "Number of customers" }
      }
    }
  }
});

const histogramChart = new Chart(document.getElementById("histogramChart").getContext("2d"), {
  type: "bar",
  data: {
    labels: [],
    datasets: [{
      label: "Estimated probability density",
      data: [],
      borderWidth: 1,
      barPercentage: 1.0,
      categoryPercentage: 1.0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { title: { display: true, text: "Waiting time" } },
      y: { beginAtZero: true, title: { display: true, text: "Probability density" } }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label(context) {
            return `Density: ${Number(context.raw).toFixed(4)}`;
          }
        }
      }
    }
  }
});

function validateInputs() {
  const lambda = Number(lambdaInput.value);
  const mu = Number(muInput.value);
  const binCount = Number(binCountInput.value);

  if (!Number.isFinite(lambda) || !Number.isFinite(mu) || lambda < 0 || mu < 0) {
    message.textContent = "λ and μ must be valid non-negative numbers.";
    return null;
  }

  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 30) {
    message.textContent = "Histogram bins must be an integer from 2 to 30.";
    return null;
  }

  message.textContent = lambda >= mu && mu > 0
    ? "Warning: λ ≥ μ. The queue may grow without limit."
    : "";

  return { lambda, mu, bin_count: binCount };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${window.OSE_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || detail;
    } catch (_) {
      // Keep the HTTP status when the response is not JSON.
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function setBackendStatus(status, text) {
  backendBadge.className = `backend-badge ${status}`;
  backendBadge.textContent = text;
}

async function checkBackend() {
  setBackendStatus("checking", "Backend: checking…");
  try {
    const health = await apiRequest("/api/health");
    setBackendStatus("online", `Backend: online (${health.version})`);
  } catch (error) {
    setBackendStatus("offline", "Backend: offline");
    message.textContent = `Cannot reach backend: ${error.message}`;
  }
}

function drawCustomer(x, y, fillStyle) {
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, 2 * Math.PI);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function draw(snapshot = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "15px Arial";
  ctx.fillStyle = "#222";
  ctx.fillText("Waiting queue", 45, 35);
  ctx.fillText("Server", 765, 35);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.strokeRect(740, 70, 100, 100);

  const queueLength = snapshot?.queue_length || 0;
  const visibleCustomers = Math.min(queueLength, MAX_VISIBLE_CUSTOMERS);

  for (let i = 0; i < visibleCustomers; i++) {
    const row = Math.floor(i / 10);
    const column = i % 10;
    drawCustomer(60 + column * 55, 90 + row * 60, "#3874d8");
  }

  if (queueLength > MAX_VISIBLE_CUSTOMERS) {
    ctx.fillStyle = "#222";
    ctx.fillText(`+${queueLength - MAX_VISIBLE_CUSTOMERS} more`, 585, 205);
  }

  if (snapshot?.server_busy) {
    drawCustomer(790, 120, "#d94343");
    ctx.fillStyle = "#333";
    ctx.fillText("Serving", 765, 155);
  } else {
    ctx.fillStyle = "#555";
    ctx.fillText("Idle", 777, 125);
  }
}

function updateStatus(snapshot) {
  latestSnapshot = snapshot;
  timeValue.textContent = Number(snapshot.simulation_time).toFixed(1);
  queueValue.textContent = snapshot.queue_length;
  serverValue.textContent = snapshot.server_busy ? "Busy" : "Idle";
  systemValue.textContent = snapshot.customers_in_system;
  sampleValue.textContent = snapshot.waiting_time_samples;
  averageWaitValue.textContent = Number(snapshot.average_waiting_time).toFixed(2);
  maximumWaitValue.textContent = Number(snapshot.maximum_waiting_time).toFixed(2);

  if (snapshot.warning) {
    message.textContent = snapshot.warning;
  }

  draw(snapshot);
}

function appendQueueChart(snapshot) {
  queueChart.data.labels.push(Number(snapshot.simulation_time).toFixed(1));
  queueChart.data.datasets[0].data.push(snapshot.customers_in_system);

  if (queueChart.data.labels.length > MAX_CHART_POINTS) {
    queueChart.data.labels.shift();
    queueChart.data.datasets[0].data.shift();
  }

  queueChart.update("none");
}

function updateHistogram(snapshot) {
  histogramChart.data.labels = snapshot.histogram.labels;
  histogramChart.data.datasets[0].data = snapshot.histogram.densities;
  histogramChart.update("none");
}

async function createSession(parameters) {
  const snapshot = await apiRequest("/api/sessions", {
    method: "POST",
    body: JSON.stringify(parameters)
  });
  sessionId = snapshot.session_id;
  updateStatus(snapshot);
  updateHistogram(snapshot);
  return snapshot;
}

async function stepSimulation() {
  if (timerId === null || requestInProgress) {
    return;
  }

  const parameters = validateInputs();
  if (!parameters) {
    pauseSimulation();
    return;
  }

  requestInProgress = true;
  try {
    if (!sessionId) {
      await createSession(parameters);
    }

    const snapshot = await apiRequest(`/api/sessions/${sessionId}/step`, {
      method: "POST",
      body: JSON.stringify(parameters)
    });

    updateStatus(snapshot);
    appendQueueChart(snapshot);
    updateHistogram(snapshot);
    setBackendStatus("online", "Backend: online");
  } catch (error) {
    pauseSimulation();
    setBackendStatus("offline", "Backend: offline");
    message.textContent = `Simulation stopped: ${error.message}`;
  } finally {
    requestInProgress = false;
  }
}

async function startSimulation() {
  const parameters = validateInputs();
  if (!parameters || timerId !== null) {
    return;
  }

  startButton.disabled = true;
  try {
    if (!sessionId) {
      await createSession(parameters);
    } else {
      const snapshot = await apiRequest(`/api/sessions/${sessionId}/parameters`, {
        method: "PUT",
        body: JSON.stringify(parameters)
      });
      updateStatus(snapshot);
      updateHistogram(snapshot);
    }

    timerId = window.setInterval(stepSimulation, STEP_DURATION_MS);
  } catch (error) {
    setBackendStatus("offline", "Backend: offline");
    message.textContent = `Could not start simulation: ${error.message}`;
  } finally {
    startButton.disabled = false;
  }
}

function pauseSimulation() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

async function resetSimulation() {
  pauseSimulation();
  requestInProgress = false;

  if (sessionId) {
    try {
      await apiRequest(`/api/sessions/${sessionId}`, { method: "DELETE" });
    } catch (error) {
      message.textContent = `Session reset locally; backend cleanup failed: ${error.message}`;
    }
  }

  sessionId = null;
  latestSnapshot = null;
  queueChart.data.labels = [];
  queueChart.data.datasets[0].data = [];
  queueChart.update("none");
  histogramChart.data.labels = [];
  histogramChart.data.datasets[0].data = [];
  histogramChart.update("none");

  timeValue.textContent = "0.0";
  queueValue.textContent = "0";
  serverValue.textContent = "Idle";
  systemValue.textContent = "0";
  sampleValue.textContent = "0";
  averageWaitValue.textContent = "0.00";
  maximumWaitValue.textContent = "0.00";
  message.textContent = "";
  draw();
}

async function refreshParameters() {
  const parameters = validateInputs();
  if (!parameters || !sessionId) {
    return;
  }

  try {
    const snapshot = await apiRequest(`/api/sessions/${sessionId}/parameters`, {
      method: "PUT",
      body: JSON.stringify(parameters)
    });
    updateStatus(snapshot);
    updateHistogram(snapshot);
  } catch (error) {
    message.textContent = `Could not update parameters: ${error.message}`;
  }
}

startButton.addEventListener("click", startSimulation);
pauseButton.addEventListener("click", pauseSimulation);
resetButton.addEventListener("click", resetSimulation);
binCountInput.addEventListener("change", refreshParameters);
lambdaInput.addEventListener("change", refreshParameters);
muInput.addEventListener("change", refreshParameters);
window.addEventListener("beforeunload", pauseSimulation);

draw();
checkBackend();

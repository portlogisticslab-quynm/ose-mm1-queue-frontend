"use strict";

/* M/M/1 Queue Simulation — UI. All computation runs in the browser (mm1-engine.js). */

const STEP_DURATION_MS = 300;
const MAX_CHART_POINTS = 250;
const MAX_VISIBLE_CUSTOMERS = 20;

const { MM1Simulation, validate, ENGINE_VERSION } = window.OSE_MM1;

let simulation = null;
let timerId = null;

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const lambdaInput = document.getElementById("lambda");
const muInput = document.getElementById("mu");
const binCountInput = document.getElementById("binCount");
const speedInput = document.getElementById("speed");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const engineBadge = document.getElementById("backendBadge");

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
  try {
    const parameters = validate({
      lambda: lambdaInput.value,
      mu: muInput.value,
      bin_count: Number(binCountInput.value)
    });
    message.textContent = parameters.lambda >= parameters.mu && parameters.mu > 0
      ? "Warning: λ ≥ μ. The queue may grow without limit."
      : "";
    return parameters;
  } catch (error) {
    message.textContent = error.message;
    return null;
  }
}

function stepsPerTick() {
  const n = Number(speedInput?.value || 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
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

  while (queueChart.data.labels.length > MAX_CHART_POINTS) {
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

function render(withChartPoint) {
  const snapshot = simulation.snapshot();
  updateStatus(snapshot);
  if (withChartPoint) appendQueueChart(snapshot);
  updateHistogram(snapshot);
}

function ensureSimulation(parameters) {
  if (!simulation) {
    simulation = new MM1Simulation(parameters);
  } else {
    simulation.setParameters(parameters);
  }
}

function stepSimulation() {
  if (timerId === null) return;

  const parameters = validateInputs();
  if (!parameters) {
    pauseSimulation();
    return;
  }

  try {
    ensureSimulation(parameters);
    simulation.run(stepsPerTick());
    render(true);
  } catch (error) {
    pauseSimulation();
    message.textContent = `Simulation stopped: ${error.message}`;
  }
}

function startSimulation() {
  const parameters = validateInputs();
  if (!parameters || timerId !== null) return;

  ensureSimulation(parameters);
  render(false);
  timerId = window.setInterval(stepSimulation, STEP_DURATION_MS);
}

function pauseSimulation() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function resetSimulation() {
  pauseSimulation();
  simulation = null;

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

function refreshParameters() {
  const parameters = validateInputs();
  if (!parameters || !simulation) return;
  simulation.setParameters(parameters);
  render(false);
}

startButton.addEventListener("click", startSimulation);
pauseButton.addEventListener("click", pauseSimulation);
resetButton.addEventListener("click", resetSimulation);
binCountInput.addEventListener("change", refreshParameters);
lambdaInput.addEventListener("change", refreshParameters);
muInput.addEventListener("change", refreshParameters);
window.addEventListener("beforeunload", pauseSimulation);

engineBadge.className = "backend-badge online";
engineBadge.textContent = `Engine: browser (${ENGINE_VERSION})`;

draw();

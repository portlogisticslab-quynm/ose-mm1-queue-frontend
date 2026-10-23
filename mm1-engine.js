/*
 * OSE M/M/1 queue engine — runs entirely in the browser (no backend).
 * Port of the former FastAPI backend (1.0.0-demo):
 *   - time-stepped simulation, DELTA_TIME = 0.2 per step
 *   - per step: service completion with p = 1 - exp(-mu*dt),
 *               at most one arrival with p = 1 - exp(-lambda*dt),
 *               idle server takes the next customer (FIFO)
 *   - waiting time = service start - arrival (multiples of dt)
 *   - histogram over [0, max wait] (or [0, dt] when max = 0), density = count / (n * width)
 * Snapshot fields keep the same names as the old API so app.js stays simple.
 */
(function (root) {
  "use strict";

  const ENGINE_VERSION = "2.0.0-browser";
  const DELTA_TIME = 0.2;
  const WARNING_TEXT = "Warning: λ ≥ μ. The queue may grow without limit.";

  function validate(p) {
    const lambda = Number(p.lambda);
    const mu = Number(p.mu);
    const binCount = Number(p.bin_count ?? 10);
    if (!Number.isFinite(lambda) || !Number.isFinite(mu) || lambda < 0 || mu < 0) {
      throw new Error("λ and μ must be valid non-negative numbers.");
    }
    if (!Number.isInteger(binCount) || binCount < 2 || binCount > 30) {
      throw new Error("Histogram bins must be an integer from 2 to 30.");
    }
    return { lambda, mu, bin_count: binCount };
  }

  class MM1Simulation {
    constructor(params, rng = Math.random) {
      this.rng = rng;
      this.setParameters(params);
      this.reset();
    }

    setParameters(params) {
      this.params = validate(params);
      this.pArrival = 1 - Math.exp(-this.params.lambda * DELTA_TIME);
      this.pService = 1 - Math.exp(-this.params.mu * DELTA_TIME);
    }

    reset() {
      this.stepNumber = 0;
      this.queue = [];          // arrival step numbers (FIFO); head index avoids O(n) shift
      this.queueHead = 0;
      this.serverBusy = false;
      this.waits = [];          // waiting times (time units)
      this.waitSum = 0;
      this.waitMax = 0;
    }

    get queueLength() { return this.queue.length - this.queueHead; }

    step() {
      this.stepNumber += 1;

      if (this.serverBusy && this.rng() < this.pService) {
        this.serverBusy = false;
      }
      if (this.rng() < this.pArrival) {
        this.queue.push(this.stepNumber);
      }
      if (!this.serverBusy && this.queueLength > 0) {
        const arrivalStep = this.queue[this.queueHead++];
        const wait = (this.stepNumber - arrivalStep) * DELTA_TIME;
        this.waits.push(wait);
        this.waitSum += wait;
        if (wait > this.waitMax) this.waitMax = wait;
        this.serverBusy = true;
      }
      // Compact the queue array occasionally
      if (this.queueHead > 4096 && this.queueHead * 2 > this.queue.length) {
        this.queue = this.queue.slice(this.queueHead);
        this.queueHead = 0;
      }
    }

    run(steps) {
      for (let i = 0; i < steps; i++) this.step();
    }

    histogram() {
      const n = this.waits.length;
      if (n === 0) return { labels: [], densities: [], counts: [], bin_width: 0 };
      const bins = this.params.bin_count;
      const upper = this.waitMax > 0 ? this.waitMax : DELTA_TIME;
      const width = upper / bins;
      const counts = new Array(bins).fill(0);
      for (let i = 0; i < n; i++) {
        let k = Math.floor(this.waits[i] / width + 1e-9);
        if (k >= bins) k = bins - 1;
        counts[k] += 1;
      }
      const labels = counts.map((_, k) =>
        `${(k * width).toFixed(2)}–${((k + 1) * width).toFixed(2)}`);
      const densities = counts.map((c) => c / (n * width));
      return { labels, densities, counts, bin_width: width };
    }

    snapshot(withHistogram = true) {
      const n = this.waits.length;
      const { lambda, mu } = this.params;
      return {
        simulation_time: this.stepNumber * DELTA_TIME,
        step_number: this.stepNumber,
        delta_time: DELTA_TIME,
        queue_length: this.queueLength,
        server_busy: this.serverBusy,
        customers_in_system: this.queueLength + (this.serverBusy ? 1 : 0),
        waiting_time_samples: n,
        average_waiting_time: n ? this.waitSum / n : 0,
        maximum_waiting_time: this.waitMax,
        histogram: withHistogram ? this.histogram() : null,
        warning: lambda >= mu && mu > 0 ? WARNING_TEXT : ""
      };
    }
  }

  const api = { MM1Simulation, validate, DELTA_TIME, ENGINE_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OSE_MM1 = api;
})(typeof window !== "undefined" ? window : globalThis);

const storage = require("Storage");
const PURGE_INTERVAL = 86400000; // 24 hours
const BUFFER_WRITE_INTERVAL = 300000; // 5 minutes
const MAX_BUFFER_SIZE = 20; // Maximum size for buffers
const CONFIG = {
  deepSleepThreshold: 0.05,
  lightSleepThreshold: 0.2,
  adverseEventThreshold: 1.5,
  pollInterval: 800,
};

let sleepBuffer = [];
let adverseEventBuffer = [];
let lastAdverseEventTime = 0;
let flushInterval;
let phaseDurations = { "Deep Sleep": 0, "Light Sleep": 0, "Awake": 0 };
let lastPhase = null;
let lastPhaseStartTime = null;

// Detect Sleep Phase
function detectSleepPhase(magnitude) {
  if (magnitude < CONFIG.deepSleepThreshold) return "Deep Sleep";
  if (magnitude < CONFIG.lightSleepThreshold) return "Light Sleep";
  return "Awake";
}

// Track Phase Duration
function trackPhase(phase) {
  const now = Date.now();
  if (lastPhase !== null) {
    const duration = (now - lastPhaseStartTime) / 1000;
    phaseDurations[lastPhase] += duration;
  }
  lastPhase = phase;
  lastPhaseStartTime = now;
}

// Write Consolidated Data to Sleep Log
function consolidateSleepData() {
  const now = Date.now();

  if (lastPhase !== null) {
    const duration = (now - lastPhaseStartTime) / 1000;
    phaseDurations[lastPhase] += duration;
    lastPhaseStartTime = now;
  }

  for (let phase in phaseDurations) {
    const duration = phaseDurations[phase];
    if (duration > 0) {
      sleepBuffer.push({ time: now, phase: phase, duration: duration });
    }
  }

  // Reset phase durations
  phaseDurations = { "Deep Sleep": 0, "Light Sleep": 0, "Awake": 0 };

  if (sleepBuffer.length > MAX_BUFFER_SIZE) sleepBuffer.shift();
}


// Buffer Adverse Event
function bufferAdverseEvent(magnitude) {
  const now = Date.now();
  if (now - lastAdverseEventTime < CONFIG.pollInterval * 2) return; // Debounce
  lastAdverseEventTime = now;

  adverseEventBuffer.push({ time: now, magnitude });
  if (adverseEventBuffer.length > MAX_BUFFER_SIZE) adverseEventBuffer.shift(); // Limit buffer size
}

// Detect Adverse Events
function detectAdverseEvents(magnitude) {
  if (magnitude > CONFIG.adverseEventThreshold) {
    bufferAdverseEvent(magnitude);
    console.log("Adverse event detected:", magnitude);
  }
}

// Flush Buffers to Storage
function flushBuffersToStorage() {
  try {
    // Save sleep data
    let savedSleepData = JSON.parse(storage.read("sleepLog.json") || "[]");
    savedSleepData = savedSleepData.concat(sleepBuffer);
    sleepBuffer = [];
    savedSleepData = savedSleepData.filter(entry => Date.now() - entry.time <= PURGE_INTERVAL);
    storage.write("sleepLog.json", JSON.stringify(savedSleepData));

    // Save adverse events
    let savedAdverseEvents = JSON.parse(storage.read("adverseEvents.json") || "[]");
    savedAdverseEvents = savedAdverseEvents.concat(adverseEventBuffer);
    adverseEventBuffer = [];
    storage.write("adverseEvents.json", JSON.stringify(savedAdverseEvents));
  } catch (error) {
    console.error("Failed to flush buffers to storage:", error);
  }
}

// Generate Report
function generateReport() {
  try {
    const savedData = JSON.parse(storage.read("sleepLog.json") || "[]");
    const adverseEvents = JSON.parse(storage.read("adverseEvents.json") || "[]");

    let deepSleepTime = 0,
      lightSleepTime = 0,
      awakeTime = 0;

    for (let i = 0; i < savedData.length; i++) {
      const entry = savedData[i];
      switch (entry.phase) {
        case "Deep Sleep":
          deepSleepTime += entry.duration;
          break;
        case "Light Sleep":
          lightSleepTime += entry.duration;
          break;
        case "Awake":
          awakeTime += entry.duration;
          break;
      }
    }

    g.clear();
    g.setFont("6x8", 2);
    g.setFontAlign(0, 0);
    g.drawString("SLEEP REPORT", g.getWidth() / 2, 20);
    g.setFont("6x8", 1);
    g.drawString(`Deep Sleep: ${(deepSleepTime / 60).toFixed(2)} mins`, g.getWidth() / 2, 60);
    g.drawString(`Light Sleep: ${(lightSleepTime / 60).toFixed(2)} mins`, g.getWidth() / 2, 80);
    g.drawString(`Awake Time: ${(awakeTime / 60).toFixed(2)} mins`, g.getWidth() / 2, 100);
    g.drawString(`Adverse Events: ${adverseEvents.length}`, g.getWidth() / 2, 140);

    setTimeout(() => {
      g.clear();
      g.drawString("Report cleared", g.getWidth() / 2, g.getHeight() / 2);
    }, 10000);
  } catch (error) {
    console.error("Failed to generate report:", error);
  }
}

// Event Listener for Accelerometer
Bangle.on("accel", (accel) => {
  const magnitude = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
  const phase = detectSleepPhase(magnitude);
  trackPhase(phase);
  detectAdverseEvents(magnitude);
});

// Poll Interval for Accelerometer
Bangle.setPollInterval(CONFIG.pollInterval);

// Flush Buffers Periodically
flushInterval = setInterval(() => {
  consolidateSleepData();
  flushBuffersToStorage();
}, BUFFER_WRITE_INTERVAL);

// Generate Report on Button Press
setWatch(() => {
  generateReport();
}, BTN2, { repeat: true, edge: "falling" });

// Cleanup on Exit
E.on("kill", () => {
  clearInterval(flushInterval);
  consolidateSleepData();
  flushBuffersToStorage();
  console.log("App exiting...");
});

console.log("Sleep tracking started...");
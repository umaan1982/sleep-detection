const storage = require("Storage");
const BUFFER_WRITE_INTERVAL = 120000;
const MAX_BUFFER_SIZE = 20;
const CONFIG = {
  deepSleepThreshold: 1.02,
  lightSleepThreshold: 1.1,
  adverseEventThreshold: 1.5,
  heartRateDeepSleep: 80,
  heartRateLightSleep: 95,
  pollInterval: 800
};

let sleepBuffer = { "Deep Sleep": 0, "Light Sleep": 0, "Awake": 0 };
let adverseEventBuffer = [];
let lastAdverseEventTime = 0;
let flushInterval;
let lastPhase = null;
let lastPhaseStartTime = null;
let lastHeartRate = null;

function detectSleepPhase(magnitude, heartRate) {
  if (heartRate !== null && heartRate < CONFIG.heartRateDeepSleep && magnitude < CONFIG.deepSleepThreshold) {
    return "Deep Sleep";
  }
  if (heartRate !== null && heartRate < CONFIG.heartRateLightSleep && magnitude < CONFIG.lightSleepThreshold) {
    return "Light Sleep";
  }
  return "Awake";
}

function trackPhase(phase) {
  const now = Date.now();
  if (lastPhase !== null) {
    const duration = (now - lastPhaseStartTime) / 1000;
    sleepBuffer[lastPhase] += duration;
  }
  lastPhase = phase;
  lastPhaseStartTime = now;
}

function bufferAdverseEvent(magnitude) {
  const now = Date.now();
  if (now - lastAdverseEventTime < CONFIG.pollInterval * 2) return;
  lastAdverseEventTime = now;

  adverseEventBuffer.push({ time: now, magnitude });
  if (adverseEventBuffer.length > MAX_BUFFER_SIZE) adverseEventBuffer.shift();
}

function detectAdverseEvents(magnitude) {
  if (magnitude > CONFIG.adverseEventThreshold) {
    bufferAdverseEvent(magnitude);
    console.log("Adverse event detected:", magnitude);
  }
}

function flushBuffersToStorage() {
  try {
    let savedSleepData = JSON.parse(storage.read("sleepLog.json") || "[]");

    if (savedSleepData.length === 0) {
      savedSleepData = [{
        time: Date.now(),
        "Deep Sleep": sleepBuffer["Deep Sleep"],
        "Light Sleep": sleepBuffer["Light Sleep"],
        "Awake": sleepBuffer["Awake"]
      }];
    } else {
      savedSleepData[0]["Deep Sleep"] += sleepBuffer["Deep Sleep"];
      savedSleepData[0]["Light Sleep"] += sleepBuffer["Light Sleep"];
      savedSleepData[0]["Awake"] += sleepBuffer["Awake"];
      savedSleepData[0].time = Date.now();
    }

    storage.write("sleepLog.json", JSON.stringify(savedSleepData));
    sleepBuffer = { "Deep Sleep": 0, "Light Sleep": 0, "Awake": 0 };

    let savedAdverseEvents = JSON.parse(storage.read("adverseEvents.json") || "[]");
    savedAdverseEvents = savedAdverseEvents.concat(adverseEventBuffer);
    storage.write("adverseEvents.json", JSON.stringify(savedAdverseEvents));
    adverseEventBuffer = [];
  } catch (error) {
    console.error("Failed to flush buffers to storage:", error);
  }
}

function generateReport() {
  try {
    const savedData = JSON.parse(storage.read("sleepLog.json") || "[]");
    const adverseEvents = JSON.parse(storage.read("adverseEvents.json") || "[]");

    let deepSleepTime = 0,
      lightSleepTime = 0,
      awakeTime = 0;

    if (savedData.length > 0) {
      deepSleepTime = savedData[0]["Deep Sleep"];
      lightSleepTime = savedData[0]["Light Sleep"];
      awakeTime = savedData[0]["Awake"];
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
      setTimeout(() => {
        g.clear();
      }, 3000);
    }, 5000);
  } catch (error) {
    console.error("Failed to generate report:", error);
  }
}

Bangle.setHRMPower(true, "app");

function displayBatteryLevel() {
  const batteryLevel = E.getBattery();
  g.setFont("6x8", 2);
  g.setFontAlign(-1, -1);
  g.clearRect(0, 0, 80, 20);
  g.drawString(`Battery: ${batteryLevel}%`, 10, 10);
}

setInterval(displayBatteryLevel, 60000);
displayBatteryLevel();

Bangle.on("accel", (accel) => {
  const magnitude = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
  const phase = detectSleepPhase(magnitude, lastHeartRate);
  trackPhase(phase);
  detectAdverseEvents(magnitude);
});

Bangle.on("HRM", (hrm) => {
  lastHeartRate = hrm.bpm;
});

Bangle.setPollInterval(CONFIG.pollInterval);

flushInterval = setInterval(() => {
  flushBuffersToStorage();
}, BUFFER_WRITE_INTERVAL);

setWatch(() => {
  generateReport();
}, BTN2, { repeat: true, edge: "falling" });

setWatch(() => {
  storage.erase("sleepLog.json");
  storage.erase("adverseEvents.json");
  sleepBuffer = { "Deep Sleep": 0, "Light Sleep": 0, "Awake": 0 };
  adverseEventBuffer = [];
  g.clear();
  g.setFont("6x8", 2);
  g.setFontAlign(0, 0);
  g.drawString("Data has been reset.", g.getWidth() / 2, g.getHeight() / 2);
}, BTN3, { repeat: true, edge: "falling" });

E.on("kill", () => {
  clearInterval(flushInterval);
  flushBuffersToStorage();
  console.log("App exiting...");
  Bangle.setHRMPower(false, "app");
  console.log("Heart Rate Sensor turned off.");
});

console.log("Sleep tracking started...");

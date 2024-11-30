const storage = require("Storage");
const PURGE_INTERVAL = 86400000;

function detectSleepPhase(magnitude) {
  if (magnitude < 0.05) return "Deep Sleep";
  if (magnitude < 0.2) return "Light Sleep";
  return "Awake";
}


function logSleepData(phase) {
  const now = Date.now();
  const entry = {
    time: now,
    phase: phase,
  };

  let savedData = JSON.parse(storage.read("sleepLog.json") || "[]");
  savedData.push(entry);
  storage.write("sleepLog.json", JSON.stringify(savedData));

  if (now - savedData[0].time > PURGE_INTERVAL) {
    savedData.shift();
    storage.write("sleepLog.json", JSON.stringify(savedData));
  }
}

function detectAdverseEvents(magnitude) {
  const eventThreshold = 1.5;
  let hasEvent = false;

  if (magnitude > eventThreshold) {
    hasEvent = true;
  }

  if (hasEvent) {
    const now = Date.now();
    const lastEventTime = storage.read("lastAdverseEvent") || 0;
    const deltaTime = now - lastEventTime;

    storage.write("lastAdverseEvent", now);
    storage.write("adverseEventDelta", deltaTime); 
  }
}

function generateReport() {
  const savedData = JSON.parse(storage.read("sleepLog.json") || "[]");
  const adverseEventsData = JSON.parse(storage.read("adverseEvents.json") || "[]");

  let deepSleepTime = 0,
      lightSleepTime = 0,
      awakeTime = 0;

  for (let i = 1; i < savedData.length; i++) {
    const currentEntry = savedData[i];
    const previousEntry = savedData[i - 1];
    const duration = (currentEntry.time - previousEntry.time) / 1000;

    switch (currentEntry.phase) {
      case "Deep Sleep":
        deepSleepTime += duration;
        break;
      case "Light Sleep":
        lightSleepTime += duration;
        break;
      case "Awake":
        awakeTime += duration;
        break;
    }
  }
  g.clear();
  g.setFont("6x8", 2);
  g.setFontAlign(0, 0);
  g.drawString("SLEEP REPORT", g.getWidth() / 2, 20);
  g.setFont("6x8", 1);
  g.drawString(
    `Deep Sleep: ${(deepSleepTime / 60).toFixed(2)} mins`,
    g.getWidth() / 2,
    60
  );
  g.drawString(
    `Light Sleep: ${(lightSleepTime / 60).toFixed(2)} mins`,
    g.getWidth() / 2,
    80
  );
  g.drawString(
    `Awake Time: ${(awakeTime / 60).toFixed(2)} mins`,
    g.getWidth() / 2,
    100
  );
  g.drawString(
    `Adverse Events: ${adverseEventsData.length}`,
    g.getWidth() / 2,
    140
  );

  setTimeout(() => {
    g.clear();
    g.drawString("Report cleared", g.getWidth() / 2, g.getHeight() / 2);
  }, 10000);
}

Bangle.on("accel", (accel) => {
  const magnitude = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);

  if (magnitude < 0.05) {
    logSleepData("Deep Sleep");
    return;
  }

  const phase = detectSleepPhase(magnitude);
  logSleepData(phase);
  detectAdverseEvents(magnitude);
});

Bangle.setPollInterval(800);

setWatch(() => {
  generateReport();
}, BTN2, { repeat: true, edge: "falling" });

E.on("kill", () => {
  console.log("App exiting...");
});

console.log("Sleep tracking started...");

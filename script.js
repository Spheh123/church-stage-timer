import { db, ref, set, onValue } from "./firebase.js";

let program = [];
let currentIndex = 0;
let timeLeft = 0;
let interval = null;
let isRunning = false;
let controlsLocked = localStorage.getItem("stageTimerLocked") === "true";

const elements = {
  serviceName: document.getElementById("serviceName"),
  title: document.getElementById("title"),
  speaker: document.getElementById("speaker"),
  duration: document.getElementById("duration"),
  liveMessage: document.getElementById("liveMessage"),
  programList: document.getElementById("programList"),
  timer: document.getElementById("timer"),
  speakerName: document.getElementById("speakerName"),
  currentTitle: document.getElementById("currentTitle"),
  serviceDisplay: document.getElementById("serviceDisplay"),
  messageBox: document.getElementById("messageBox"),
  itemCount: document.getElementById("itemCount"),
  currentSegmentLabel: document.getElementById("currentSegmentLabel"),
  lockToggle: document.getElementById("lockToggle"),
  lockText: document.getElementById("lockText"),
  lockIcon: document.getElementById("lockIcon"),
  lockBadge: document.getElementById("lockBadge")
};

const lockableButtons = Array.from(document.querySelectorAll("[data-lockable='true']"));

elements.lockToggle?.addEventListener("click", () => {
  setLockedState(!controlsLocked, { broadcast: true });
});

onValue(ref(db, "controlState"), (snapshot) => {
  const data = snapshot.val();
  if (!data || typeof data.locked !== "boolean") return;

  if (data.locked !== controlsLocked) {
    setLockedState(data.locked, { broadcast: false });
  }
});

setLockedState(controlsLocked, { broadcast: false });
refreshUi();
pushUpdate();

elements.serviceName?.addEventListener("input", () => {
  refreshUi();
  pushUpdate();
});

elements.liveMessage?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !controlsLocked) {
    window.showMessage();
  }
});

window.addItem = function () {
  const title = elements.title.value.trim();
  const speaker = elements.speaker.value.trim();
  const duration = parseInt(elements.duration.value, 10);

  if (!title || !duration) {
    alert("Add at least a segment title and duration.");
    return;
  }

  program.push({ title, speaker, duration });

  elements.title.value = "";
  elements.speaker.value = "";
  elements.duration.value = "";

  renderList();
  refreshUi();
};

window.startTimer = function () {
  if (program.length === 0) return;

  if (!isRunning && timeLeft === 0) {
    loadItem();
  }

  isRunning = true;
  clearInterval(interval);
  pushUpdate();

  interval = setInterval(() => {
    if (!isRunning) return;

    timeLeft -= 1;

    if (timeLeft < 0) {
      nextItem();
      return;
    }

    pushUpdate();
  }, 1000);

  refreshUi();
};

window.pauseTimer = function () {
  isRunning = false;
  refreshUi();
  pushUpdate();
};

window.resetTimer = function () {
  clearInterval(interval);
  currentIndex = 0;
  timeLeft = 0;
  isRunning = false;
  refreshUi();
  pushUpdate();
};

window.nextItem = function () {
  currentIndex += 1;

  if (currentIndex >= program.length) {
    clearInterval(interval);
    currentIndex = program.length;
    timeLeft = 0;
    isRunning = false;
    refreshUi();
    pushUpdate();
    return;
  }

  loadItem();
  refreshUi();
  pushUpdate();
};

window.showMessage = function () {
  elements.messageBox.innerText = elements.liveMessage.value.trim();
  pushUpdate();
};

window.clearMessage = function () {
  elements.liveMessage.value = "";
  elements.messageBox.innerText = "";
  pushUpdate();
};

window.saveProgram = function () {
  const serviceName = elements.serviceName.value.trim();

  set(ref(db, "program"), {
    program,
    serviceName
  });

  alert("Program saved.");
};

window.loadProgram = function () {
  onValue(ref(db, "program"), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      alert("No saved program found.");
      return;
    }

    program = data.program || [];
    elements.serviceName.value = data.serviceName || "";
    currentIndex = 0;
    timeLeft = 0;
    isRunning = false;

    renderList();
    refreshUi();
    pushUpdate();
  }, { onlyOnce: true });
};

window.clearProgram = function () {
  if (!confirm("Delete the full saved program?")) return;

  clearInterval(interval);
  program = [];
  currentIndex = 0;
  timeLeft = 0;
  isRunning = false;

  set(ref(db, "program"), null);

  renderList();
  refreshUi();
  pushUpdate();
};

function renderList() {
  elements.programList.innerHTML = "";

  if (program.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "program-empty";
    emptyState.innerText = "No segments yet. Add your first item to build the service flow.";
    elements.programList.appendChild(emptyState);
    return;
  }

  program.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "program-item";

    if (index === currentIndex && (timeLeft > 0 || isRunning)) {
      li.classList.add("active");
    }

    const indexBadge = document.createElement("span");
    indexBadge.className = "program-index";
    indexBadge.innerText = String(index + 1);

    const copy = document.createElement("div");
    copy.className = "program-copy";

    const title = document.createElement("strong");
    title.innerText = item.title;

    const speaker = document.createElement("span");
    speaker.innerText = item.speaker || "No speaker assigned";

    copy.append(title, speaker);

    const duration = document.createElement("span");
    duration.className = "program-duration";
    duration.innerText = `${item.duration} min`;

    li.append(indexBadge, copy, duration);

    elements.programList.appendChild(li);
  });
}

function loadItem() {
  const item = program[currentIndex];

  if (!item) {
    timeLeft = 0;
    return;
  }

  timeLeft = item.duration * 60;
}

function setLockedState(locked, options = {}) {
  const { broadcast = false } = options;

  controlsLocked = locked;
  localStorage.setItem("stageTimerLocked", String(locked));
  document.body.classList.toggle("controls-locked", locked);

  lockableButtons.forEach((button) => {
    button.disabled = locked;
  });

  if (elements.lockText) {
    elements.lockText.innerText = locked ? "Unlock Controls" : "Lock Controls";
  }

  if (elements.lockIcon) {
    elements.lockIcon.innerText = locked ? "Locked" : "Unlock";
  }

  if (elements.lockBadge) {
    elements.lockBadge.innerText = locked ? "Locked" : "Unlocked";
  }

  if (broadcast) {
    set(ref(db, "controlState"), { locked });
  }
}

function getTimerState() {
  const safeTimeLeft = Math.max(timeLeft, 0);
  const minutes = Math.floor(safeTimeLeft / 60);
  const seconds = safeTimeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let color = "white";
  if (safeTimeLeft <= 120 && safeTimeLeft > 0) color = "red";
  else if (safeTimeLeft <= 180 && safeTimeLeft > 0) color = "orange";

  return { formatted, color };
}

function refreshUi() {
  const current = program[currentIndex] || {};
  const { formatted, color } = getTimerState();

  elements.itemCount.innerText = String(program.length);
  elements.currentSegmentLabel.innerText = current.title || "Ready";
  elements.speakerName.innerText = current.speaker || "Awaiting Speaker";
  elements.currentTitle.innerText = current.title || "Ready";
  elements.serviceDisplay.innerText = elements.serviceName.value.trim() || "Service Not Named";
  elements.timer.innerText = formatted;
  elements.timer.className = `timer timer-preview ${color}`;

  renderList();
}

function pushUpdate() {
  const current = program[currentIndex] || {};
  const { formatted, color } = getTimerState();
  const message = elements.messageBox?.innerText || "";
  const service = elements.serviceName?.value.trim() || "";

  refreshUi();

  set(ref(db, "live"), {
    time: formatted,
    speaker: current.speaker || "",
    title: current.title || "",
    message,
    service,
    color
  });
}

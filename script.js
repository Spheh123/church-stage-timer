import { db, ref, set, onValue } from "./firebase.js";

let program = [];
let currentIndex = 0;
let timeLeft = 0;
let interval = null;
let isRunning = false;

// ADD ITEM
window.addItem = function () {
  const title = document.getElementById("title").value;
  const speaker = document.getElementById("speaker").value;
  const duration = parseInt(document.getElementById("duration").value);

  if (!title || !duration) {
    alert("Fill required fields");
    return;
  }

  program.push({ title, speaker, duration });

  renderList();
};

// RENDER LIST
function renderList() {
  const list = document.getElementById("programList");
  list.innerHTML = "";

  program.forEach((item, index) => {
    const li = document.createElement("li");
    li.innerText = `${index + 1}. ${item.title} (${item.speaker}) - ${item.duration} min`;
    list.appendChild(li);
  });
}

// START
window.startTimer = function () {
  if (program.length === 0) return;

  if (!isRunning && timeLeft === 0) {
    loadItem();
  }

  isRunning = true;

  clearInterval(interval);

  // 🔥 PUSH IMMEDIATE UPDATE
  pushUpdate();

  interval = setInterval(() => {
    if (!isRunning) return;

    timeLeft--;

    if (timeLeft < 0) {
      nextItem();
    }

    updateDisplay();
  }, 1000);
};

// PAUSE
window.pauseTimer = function () {
  isRunning = false;

  pushUpdate();
};

// RESET
window.resetTimer = function () {
  clearInterval(interval);
  currentIndex = 0;
  timeLeft = 0;
  isRunning = false;

  pushUpdate();
};

// NEXT
window.nextItem = function () {
  currentIndex++;

  if (currentIndex >= program.length) {
    isRunning = false;
    return;
  }

  loadItem();
  pushUpdate();
};
// LOAD ITEM
function loadItem() {
  const item = program[currentIndex];
  timeLeft = item.duration * 60;
}

// UPDATE DISPLAY
function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formatted =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  let color = "white";
  if (timeLeft <= 120) color = "red";
  else if (timeLeft <= 180) color = "orange";

  const current = program[currentIndex] || {};

  set(ref(db, "live"), {
    time: formatted,
    speaker: current.speaker || "",
    title: current.title || "",
    message: document.getElementById("messageBox")?.innerText || "",
    service: document.getElementById("serviceName")?.value || "",
    color
  });
}

// MESSAGE
window.showMessage = function () {
  const msg = document.getElementById("liveMessage").value;
  document.getElementById("messageBox").innerText = msg;

  pushUpdate();
};
window.clearMessage = function () {
  document.getElementById("messageBox").innerText = "";

  pushUpdate();
};

// 💾 SAVE
window.saveProgram = function () {
  const serviceName = document.getElementById("serviceName").value;

  set(ref(db, "program"), {
    program,
    serviceName
  });

  alert("Saved!");
};

// 📂 LOAD
window.loadProgram = function () {
  onValue(ref(db, "program"), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      alert("No saved program");
      return;
    }

    program = data.program || [];
    document.getElementById("serviceName").value = data.serviceName || "";

    renderList();
  }, { onlyOnce: true });
};

// 🗑 CLEAR
window.clearProgram = function () {
  if (!confirm("Delete everything?")) return;

  program = [];
  set(ref(db, "program"), null);

  renderList();
  document.getElementById("serviceName").value = "";
};
function pushUpdate() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formatted =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  let color = "white";
  if (timeLeft <= 120) color = "red";
  else if (timeLeft <= 180) color = "orange";

  const current = program[currentIndex] || {};

  set(ref(db, "live"), {
    time: formatted,
    speaker: current.speaker || "",
    title: current.title || "",
    message: document.getElementById("messageBox")?.innerText || "",
    service: document.getElementById("serviceName")?.value || "",
    color
  });
}
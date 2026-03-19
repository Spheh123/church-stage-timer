let program = [];
let currentIndex = 0;
let timeLeft = 0;
let interval = null;
let isRunning = false;

// ADD ITEM
function addItem() {
  const title = document.getElementById("title").value;
  const speaker = document.getElementById("speaker").value;
  const duration = parseInt(document.getElementById("duration").value);

  if (!title || !duration) return alert("Fill required fields");

  program.push({ title, speaker, duration });

  renderList();
  saveProgram();
}

// RENDER LIST
function renderList() {
  const list = document.getElementById("programList");
  list.innerHTML = "";

  program.forEach((item, index) => {
    const li = document.createElement("li");
    li.innerText = `${index + 1}. ${item.title} - ${item.duration} min (${item.speaker})`;
    list.appendChild(li);
  });
}

// START TIMER
function startTimer() {
  if (program.length === 0) return;

  if (!isRunning && timeLeft === 0) {
    loadItem();
  }

  isRunning = true;

  clearInterval(interval);

  interval = setInterval(() => {
    if (!isRunning) return;

    timeLeft--;

    if (timeLeft < 0) {
      currentIndex++;

      if (currentIndex >= program.length) {
        clearInterval(interval);
        isRunning = false;
        return;
      }

      loadItem();
    }

    updateDisplay();
  }, 1000);
}

// PAUSE
function pauseTimer() {
  isRunning = false;
}

// RESET
function resetTimer() {
  clearInterval(interval);
  currentIndex = 0;
  timeLeft = 0;
  isRunning = false;

  document.getElementById("timer").innerText = "00:00";
  document.getElementById("currentTitle").innerText = "Ready";
  document.getElementById("speakerName").innerText = "";
}

// LOAD ITEM
function loadItem() {
  const item = program[currentIndex];

  timeLeft = item.duration * 60;

  document.getElementById("currentTitle").innerText = item.title;
  document.getElementById("speakerName").innerText = item.speaker;
  document.getElementById("serviceDisplay").innerText =
    document.getElementById("serviceName").value;
}

// UPDATE DISPLAY
function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formatted =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  const timerEl = document.getElementById("timer");
  timerEl.innerText = formatted;

  // COLOR RULES
  if (timeLeft > 180) {
    timerEl.className = "timer white";
  } else if (timeLeft > 120) {
    timerEl.className = "timer orange";
  } else {
    timerEl.className = "timer red";
  }
}

// MESSAGE
function showMessage() {
  const msg = document.getElementById("liveMessage").value;
  document.getElementById("messageBox").innerText = msg;
}

function clearMessage() {
  document.getElementById("messageBox").innerText = "";
  document.getElementById("liveMessage").value = "";
}

// 💾 SAVE PROGRAM
function saveProgram() {
  const serviceName = document.getElementById("serviceName").value;

  localStorage.setItem("program", JSON.stringify(program));
  localStorage.setItem("serviceName", serviceName);
}

// 📂 LOAD PROGRAM
function loadProgram() {
  const saved = localStorage.getItem("program");
  const serviceName = localStorage.getItem("serviceName");

  if (saved) {
    program = JSON.parse(saved);
    renderList();
  }

  if (serviceName) {
    document.getElementById("serviceName").value = serviceName;
  }
}

// AUTO LOAD ON OPEN
window.onload = function () {
  loadProgram();
};
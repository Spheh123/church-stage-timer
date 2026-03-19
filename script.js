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

// START
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
      nextItem();
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

  updateLiveStorage("00:00", "", "Ready", "", "white");
}

// ⏭ NEXT ITEM (SKIP)
function nextItem() {
  currentIndex++;

  if (currentIndex >= program.length) {
    clearInterval(interval);
    isRunning = false;
    return;
  }

  loadItem();
}

// LOAD ITEM
function loadItem() {
  const item = program[currentIndex];

  timeLeft = item.duration * 60;
}

// UPDATE DISPLAY + SEND TO TV
function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formatted =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  let color = "white";

  if (timeLeft <= 120) {
    color = "red";
  } else if (timeLeft <= 180) {
    color = "orange";
  }

  const current = program[currentIndex] || {};

  updateLiveStorage(
    formatted,
    current.speaker || "",
    current.title || "",
    document.getElementById("messageBox").innerText,
    color
  );
}

// 💬 MESSAGE
function showMessage() {
  const msg = document.getElementById("liveMessage").value;
  document.getElementById("messageBox").innerText = msg;
}

function clearMessage() {
  document.getElementById("messageBox").innerText = "";
  document.getElementById("liveMessage").value = "";
}

// 💾 SAVE
function saveProgram() {
  const serviceName = document.getElementById("serviceName").value;

  localStorage.setItem("program", JSON.stringify(program));
  localStorage.setItem("serviceName", serviceName);
}

// 📂 LOAD
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

// 🔴 SEND DATA TO DISPLAY
function updateLiveStorage(time, speaker, title, message, color) {
  const service = document.getElementById("serviceName").value;

  localStorage.setItem(
    "liveData",
    JSON.stringify({
      time,
      speaker,
      title,
      message,
      color,
      service,
    })
  );
}

// AUTO LOAD
window.onload = function () {
  loadProgram();
};
function clearProgram() {
  if (!confirm("Are you sure you want to delete everything?")) return;

  program = [];
  localStorage.removeItem("program");
  localStorage.removeItem("serviceName");

  renderList();

  document.getElementById("serviceName").value = "";
}
import { db, ref, set } from "./firebase.js";

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

  if (!title || !duration) return alert("Fill required fields");

  program.push({ title, speaker, duration });
  renderList();
}

// RENDER
function renderList() {
  const list = document.getElementById("programList");
  list.innerHTML = "";

  program.forEach((item, i) => {
    const li = document.createElement("li");
    li.innerText = `${i + 1}. ${item.title} (${item.speaker})`;
    list.appendChild(li);
  });
}

// START
window.startTimer = function () {
  if (!isRunning && timeLeft === 0) loadItem();

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
};

// PAUSE
window.pauseTimer = function () {
  isRunning = false;
};

// RESET
window.resetTimer = function () {
  clearInterval(interval);
  currentIndex = 0;
  timeLeft = 0;
  isRunning = false;
};

// NEXT
window.nextItem = function () {
  currentIndex++;

  if (currentIndex >= program.length) {
    isRunning = false;
    return;
  }

  loadItem();
};

// LOAD ITEM
function loadItem() {
  const item = program[currentIndex];
  timeLeft = item.duration * 60;
}

// UPDATE + SEND TO FIREBASE
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
    message: document.getElementById("messageBox").innerText,
    service: document.getElementById("serviceName").value,
    color
  });
}

// MESSAGE
window.showMessage = function () {
  const msg = document.getElementById("liveMessage").value;
  document.getElementById("messageBox").innerText = msg;
};

window.clearMessage = function () {
  document.getElementById("messageBox").innerText = "";
};
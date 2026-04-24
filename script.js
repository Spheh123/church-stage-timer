import { db, ref, set, onValue } from "./firebase.js";

const SESSION_PATH = "sessionState";
const PROGRAM_PATH = "program";
const CONTROL_PATH = "controlState";

let state = createDefaultSession();
let controlsLocked = localStorage.getItem("stageTimerLocked") === "true";
let editingIndex = -1;
let advancingToNext = false;

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
  lockBadge: document.getElementById("lockBadge"),
  addItemBtn: document.getElementById("addItemBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn")
};

elements.lockToggle?.addEventListener("click", () => {
  setLockedState(!controlsLocked, { broadcast: true });
});

elements.serviceName?.addEventListener("input", () => {
  state.serviceName = elements.serviceName.value.trim();
  persistSession();
  refreshUi();
});

elements.liveMessage?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !controlsLocked) {
    window.showMessage();
  }
});

onValue(ref(db, CONTROL_PATH), (snapshot) => {
  const data = snapshot.val();
  if (!data || typeof data.locked !== "boolean") return;

  if (data.locked !== controlsLocked) {
    setLockedState(data.locked, { broadcast: false });
  }
});

onValue(ref(db, SESSION_PATH), (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  const incomingState = normalizeSession(data);

  if (incomingState.updatedAt && incomingState.updatedAt < state.updatedAt) {
    return;
  }

  state = incomingState;
  state.remainingMs = getRemainingMs(state);
  syncFormFromState();
  refreshUi();
});

setLockedState(controlsLocked, { broadcast: false });
refreshUi();

setInterval(() => {
  if (state.isRunning && getRemainingMs(state) <= 0) {
    autoAdvance();
    return;
  }

  refreshUi();
}, 1000);

window.addItem = function () {
  const title = elements.title.value.trim();
  const speaker = elements.speaker.value.trim();
  const duration = parseInt(elements.duration.value, 10);

  if (!title || !duration) {
    alert("Add at least a segment title and duration.");
    return;
  }

  const nextItem = { title, speaker, duration };
  const program = [...state.program];

  if (editingIndex >= 0) {
    const previousItem = program[editingIndex];
    program[editingIndex] = nextItem;
    applyCurrentItemDurationDelta(editingIndex, previousItem, nextItem);
  } else {
    program.push(nextItem);
    if (program.length === 1 && !state.isRunning) {
      state.currentIndex = 0;
      state.remainingMs = nextItem.duration * 60 * 1000;
    }
  }

  state.program = program;
  persistSession({ rebaseTimer: editingIndex === state.currentIndex });
  clearEditor();
  refreshUi();
};

window.cancelEdit = function () {
  clearEditor();
  refreshUi();
};

window.editItem = function (index) {
  const item = state.program[index];
  if (!item) return;

  editingIndex = index;
  elements.title.value = item.title;
  elements.speaker.value = item.speaker;
  elements.duration.value = item.duration;
  refreshUi();
};

window.deleteItem = function (index) {
  const item = state.program[index];
  if (!item) return;
  if (!confirm(`Delete "${item.title}" from the program?`)) return;

  const program = [...state.program];
  const wasCurrentItem = index === state.currentIndex;
  program.splice(index, 1);
  state.program = program;

  if (program.length === 0) {
    state.currentIndex = 0;
    state.remainingMs = 0;
    state.isRunning = false;
    state.endTime = null;
  } else if (index < state.currentIndex) {
    state.currentIndex -= 1;
  } else if (wasCurrentItem) {
    state.currentIndex = Math.min(index, program.length - 1);
    loadCurrentItemDuration();
  }

  if (editingIndex === index) {
    clearEditor();
  } else if (editingIndex > index) {
    editingIndex -= 1;
  }

  persistSession({ rebaseTimer: wasCurrentItem && state.isRunning });
  refreshUi();
};

window.adjustCurrentTime = function (minutesDelta) {
  const currentItem = getCurrentItem();
  if (!currentItem) return;

  const nextRemaining = Math.max(0, getRemainingMs(state) + minutesDelta * 60 * 1000);
  state.remainingMs = nextRemaining;

  if (state.isRunning) {
    state.endTime = Date.now() + nextRemaining;
  }

  persistSession({ rebaseTimer: state.isRunning });
  refreshUi();
};

window.startTimer = function () {
  if (state.program.length === 0) return;

  if (state.currentIndex >= state.program.length) {
    state.currentIndex = 0;
    loadCurrentItemDuration();
  }

  if (getRemainingMs(state) <= 0) {
    loadCurrentItemDuration();
  }

  state.isRunning = true;
  state.endTime = Date.now() + getRemainingMs(state);
  persistSession({ rebaseTimer: true });
  refreshUi();
};

window.pauseTimer = function () {
  state.remainingMs = getRemainingMs(state);
  state.isRunning = false;
  state.endTime = null;
  persistSession();
  refreshUi();
};

window.resetTimer = function () {
  state.currentIndex = 0;
  state.isRunning = false;
  state.endTime = null;
  state.remainingMs = state.program[0] ? state.program[0].duration * 60 * 1000 : 0;
  persistSession();
  refreshUi();
};

window.nextItem = function () {
  advanceToNextItem();
};

window.showMessage = function () {
  state.message = elements.liveMessage.value.trim();
  persistSession();
  refreshUi();
};

window.clearMessage = function () {
  elements.liveMessage.value = "";
  state.message = "";
  persistSession();
  refreshUi();
};

window.saveProgram = function () {
  set(ref(db, PROGRAM_PATH), {
    serviceName: state.serviceName,
    program: state.program
  });

  alert("Program saved.");
};

window.loadProgram = function () {
  onValue(ref(db, PROGRAM_PATH), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      alert("No saved program found.");
      return;
    }

    state = normalizeSession({
      ...state,
      serviceName: data.serviceName || "",
      program: data.program || [],
      currentIndex: 0,
      remainingMs: data.program?.[0] ? data.program[0].duration * 60 * 1000 : 0,
      isRunning: false,
      endTime: null,
      message: state.message
    });

    clearEditor();
    syncFormFromState();
    persistSession();
    refreshUi();
  }, { onlyOnce: true });
};

window.clearProgram = function () {
  if (!confirm("Delete the full saved program?")) return;

  set(ref(db, PROGRAM_PATH), null);
  state = createDefaultSession();
  clearEditor();
  syncFormFromState();
  persistSession();
  refreshUi();
};

function createDefaultSession() {
  return {
    serviceName: "",
    program: [],
    currentIndex: 0,
    remainingMs: 0,
    isRunning: false,
    endTime: null,
    message: "",
    updatedAt: 0
  };
}

function normalizeSession(data) {
  const program = Array.isArray(data.program)
    ? data.program
        .map((item) => ({
          title: String(item?.title || "").trim(),
          speaker: String(item?.speaker || "").trim(),
          duration: Number(item?.duration) > 0 ? Number(item.duration) : 0
        }))
        .filter((item) => item.title && item.duration > 0)
    : [];

  const maxIndex = program.length === 0 ? 0 : program.length;
  const currentIndex = Math.min(Math.max(Number(data.currentIndex) || 0, 0), maxIndex);

  return {
    serviceName: String(data.serviceName || "").trim(),
    program,
    currentIndex,
    remainingMs: Math.max(Number(data.remainingMs) || 0, 0),
    isRunning: Boolean(data.isRunning),
    endTime: Number.isFinite(data.endTime) ? Number(data.endTime) : null,
    message: String(data.message || ""),
    updatedAt: Math.max(Number(data.updatedAt) || 0, 0)
  };
}

function getCurrentItem(session = state) {
  return session.program[session.currentIndex] || null;
}

function getRemainingMs(session = state) {
  if (session.isRunning && session.endTime) {
    return Math.max(0, session.endTime - Date.now());
  }

  return Math.max(session.remainingMs || 0, 0);
}

function getTimerPresentation(session = state) {
  const safeMs = getRemainingMs(session);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let color = "white";
  if (safeMs > 0 && safeMs <= 120000) color = "red";
  else if (safeMs > 0 && safeMs <= 180000) color = "orange";

  return { formatted, color, remainingMs: safeMs };
}

function persistSession(options = {}) {
  const { rebaseTimer = false } = options;
  const remainingMs = getRemainingMs(state);
  const serviceInputIsActive = document.activeElement === elements.serviceName;
  const updatedAt = Date.now();

  state.remainingMs = remainingMs;
  state.serviceName = serviceInputIsActive
    ? elements.serviceName.value.trim()
    : state.serviceName;
  state.updatedAt = updatedAt;

  if (state.isRunning) {
    state.endTime = rebaseTimer ? Date.now() + remainingMs : state.endTime;
  } else {
    state.endTime = null;
  }

  set(ref(db, SESSION_PATH), {
    serviceName: state.serviceName,
    program: state.program,
    currentIndex: state.currentIndex,
    remainingMs,
    isRunning: state.isRunning,
    endTime: state.endTime,
    message: state.message,
    updatedAt
  });
}

function refreshUi() {
  const current = getCurrentItem();
  const { formatted, color } = getTimerPresentation();

  elements.itemCount.innerText = String(state.program.length);
  elements.currentSegmentLabel.innerText = current?.title || "Ready";
  elements.speakerName.innerText = current?.speaker || "Awaiting Speaker";
  elements.currentTitle.innerText = current?.title || "Ready";
  elements.serviceDisplay.innerText = state.serviceName || "Service Not Named";
  elements.messageBox.innerText = state.message || "";
  elements.timer.innerText = formatted;
  elements.timer.className = `timer timer-preview ${color}`;
  elements.serviceName.value = state.serviceName;

  document.body.classList.toggle("message-visible", Boolean(state.message.trim()));

  renderList();
  updateEditorState();
}

function renderList() {
  elements.programList.innerHTML = "";

  if (state.program.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "program-empty";
    emptyState.innerText = "No segments yet. Add your first item to build the service flow.";
    elements.programList.appendChild(emptyState);
    return;
  }

  state.program.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "program-item";

    if (index === state.currentIndex) {
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

    const actions = document.createElement("div");
    actions.className = "program-actions";

    const editButton = document.createElement("button");
    editButton.className = "mini-btn";
    editButton.type = "button";
    editButton.dataset.lockable = "true";
    editButton.innerText = "Edit";
    editButton.addEventListener("click", () => window.editItem(index));

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-btn mini-btn-danger";
    deleteButton.type = "button";
    deleteButton.dataset.lockable = "true";
    deleteButton.innerText = "Delete";
    deleteButton.addEventListener("click", () => window.deleteItem(index));

    actions.append(editButton, deleteButton);
    li.append(indexBadge, copy, duration, actions);
    elements.programList.appendChild(li);
  });

  applyLockStateToButtons();
}

function updateEditorState() {
  if (editingIndex >= 0) {
    elements.addItemBtn.innerText = "Save Item Changes";
    elements.cancelEditBtn.style.display = "block";
  } else {
    elements.addItemBtn.innerText = "Add Program Item";
    elements.cancelEditBtn.style.display = "none";
  }
}

function clearEditor() {
  editingIndex = -1;
  elements.title.value = "";
  elements.speaker.value = "";
  elements.duration.value = "";
}

function syncFormFromState() {
  elements.serviceName.value = state.serviceName;
  elements.liveMessage.value = state.message;
}

function loadCurrentItemDuration() {
  const current = getCurrentItem();
  state.remainingMs = current ? current.duration * 60 * 1000 : 0;

  if (state.isRunning) {
    state.endTime = Date.now() + state.remainingMs;
  } else {
    state.endTime = null;
  }
}

function applyCurrentItemDurationDelta(index, previousItem, nextItem) {
  if (index !== state.currentIndex || !previousItem) return;

  const deltaMs = (nextItem.duration - previousItem.duration) * 60 * 1000;
  const nextRemaining = Math.max(0, getRemainingMs(state) + deltaMs);
  state.remainingMs = nextRemaining;

  if (state.isRunning) {
    state.endTime = Date.now() + nextRemaining;
  }
}

function advanceToNextItem() {
  if (state.program.length === 0) return;

  const willKeepRunning = state.isRunning;
  const nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.program.length) {
    state.currentIndex = state.program.length;
    state.remainingMs = 0;
    state.isRunning = false;
    state.endTime = null;
    persistSession();
    refreshUi();
    return;
  }

  state.currentIndex = nextIndex;
  state.remainingMs = state.program[nextIndex].duration * 60 * 1000;
  state.isRunning = willKeepRunning;
  state.endTime = willKeepRunning ? Date.now() + state.remainingMs : null;
  persistSession({ rebaseTimer: willKeepRunning });
  refreshUi();
}

function autoAdvance() {
  if (advancingToNext) return;
  advancingToNext = true;
  advanceToNextItem();
  advancingToNext = false;
}

function applyLockStateToButtons() {
  document.querySelectorAll("[data-lockable='true']").forEach((button) => {
    button.disabled = controlsLocked;
  });
}

function setLockedState(locked, options = {}) {
  const { broadcast = false } = options;

  controlsLocked = locked;
  localStorage.setItem("stageTimerLocked", String(locked));
  document.body.classList.toggle("controls-locked", locked);
  applyLockStateToButtons();

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
    set(ref(db, CONTROL_PATH), { locked });
  }
}

import { applyTimerAction } from "./live-session.js";
import { getOverview, readProgramBackup } from "./console-model.js";
import { watchDisplaySettings } from "./display-settings.js";
import { db, ref, set, onValue, runTransaction } from "./firebase.js";

const SESSION_PATH = "sessionState";
const PROGRAMS_PATH = "programs";
const PROGRAM_PRESETS = [
  { id: "sunday", name: "Sunday Service" },
  { id: "midweek", name: "Midweek Wednesday Service" },
  { id: "warfare-night", name: "All Night Warfare Night Prayer" },
  { id: "special", name: "Special Service" }
];
const SELECTED_PROGRAM_KEY = "stageTimerSelectedProgram";
const CONTROL_PATH = "controlState";

let state = createDefaultSession();
let controlsLocked = localStorage.getItem("stageTimerLocked") === "true";
let editingIndex = -1;
let insertAfterIndex = -1;
let advancingToNext = false;
let sessionReady = false;
let connected = false;
let serverOffset = 0;
let syncedRevision = 0;
let hasConnected = false;
let renderedProgramKey = '';

const elements = {
  serviceName: document.getElementById("serviceName"),
  programPreset: document.getElementById("programPreset"),
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

populateProgramPresetOptions();

elements.lockToggle?.addEventListener("click", () => {
  setLockedState(!controlsLocked, { broadcast: true });
});

elements.serviceName?.addEventListener("change", () => {
  state.serviceName = elements.serviceName.value.trim();
  persistSession();
  refreshUi();
});

elements.programPreset?.addEventListener("change", () => {
  localStorage.setItem(SELECTED_PROGRAM_KEY, elements.programPreset.value);
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
  sessionReady = true;
  syncedRevision = data?.updatedAt || 0;
  if (!data) { applyLockStateToButtons(); return; }

  const incomingState = normalizeSession(data);

  state = incomingState;
  applyLockStateToButtons();
  state.remainingMs = getRemainingMs(state);
  syncFormFromState();
  refreshUi();
});

setLockedState(controlsLocked, { broadcast: false });
refreshUi();
onValue(ref(db, ".info/serverTimeOffset"), snapshot => { serverOffset = Number(snapshot.val()) || 0; });
onValue(ref(db, ".info/connected"), snapshot => {
  connected = snapshot.val() === true;
  if (connected) hasConnected = true;
  sessionReady = false;
  applyLockStateToButtons();
  if (connected) onValue(ref(db, SESSION_PATH), snapshot => {
    const data = snapshot.val();
    state = data ? normalizeSession(data) : createDefaultSession();
    syncedRevision = state.updatedAt;
    sessionReady = true;
    syncFormFromState();
    refreshUi();
    applyLockStateToButtons();
  }, { onlyOnce: true });
});

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

  if (!title || !Number.isFinite(duration) || duration <= 0 || duration > 1440) {
    alert("Add at least a segment title and duration.");
    return;
  }

  const nextItem = { title, speaker, duration };
  const program = [...state.program];

  if (editingIndex >= 0) {
    const previousItem = program[editingIndex];
    program[editingIndex] = nextItem;
    applyCurrentItemDurationDelta(editingIndex, previousItem, nextItem);
  } else if (insertAfterIndex >= 0) {
    const insertIndex = Math.min(insertAfterIndex + 1, program.length);
    program.splice(insertIndex, 0, nextItem);

    if (insertIndex <= state.currentIndex && program.length > 1) {
      state.currentIndex += 1;
    }
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
  insertAfterIndex = -1;
  elements.title.value = item.title;
  elements.speaker.value = item.speaker;
  elements.duration.value = item.duration;
  refreshUi();
};

window.prepareInsertAfter = function (index) {
  const item = state.program[index];
  if (!item) return;

  editingIndex = -1;
  insertAfterIndex = index;
  elements.title.value = "";
  elements.speaker.value = "";
  elements.duration.value = "";
  elements.title.focus();
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

  if (editingIndex === index || insertAfterIndex === index) {
    clearEditor();
  } else {
    if (editingIndex > index) editingIndex -= 1;
    if (insertAfterIndex > index) insertAfterIndex -= 1;
  }

  persistSession({ rebaseTimer: wasCurrentItem && state.isRunning });
  refreshUi();
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

window.saveProgram = async function () {
  if (!connected || !sessionReady || controlsLocked) return;
  const preset = getSelectedProgramPreset();

  try {
    await set(ref(db, getSelectedProgramPath()), {
      presetId: preset.id,
      presetName: preset.name,
      serviceName: state.serviceName || preset.name,
      program: state.program,
      savedAt: Date.now()
    });
    alert(`${preset.name} saved.`);
  } catch (error) { reportSyncError(error); }
};

window.loadProgram = function () {
  loadSelectedProgramSlot({ showEmptyAlert: true });
};

window.clearProgram = async function () {
  if (!connected || !sessionReady || controlsLocked) return;
  const preset = getSelectedProgramPreset();
  const path = getSelectedProgramPath();
  if (!confirm(`Clear ${preset.name} from the live screen and delete that saved program?`)) return;

  state = createDefaultSession();
  state.serviceName = preset.name;
  clearEditor();
  syncFormFromState();
  const committed = await persistSession();
  if (committed) {
    try { await set(ref(db, path), null); } catch (error) { reportSyncError(error); }
  }
  refreshUi();
};

function populateProgramPresetOptions() {
  if (!elements.programPreset) return;

  const savedSelection = localStorage.getItem(SELECTED_PROGRAM_KEY);
  elements.programPreset.innerHTML = "";

  PROGRAM_PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.innerText = preset.name;
    elements.programPreset.appendChild(option);
  });

  elements.programPreset.value = PROGRAM_PRESETS.some((preset) => preset.id === savedSelection)
    ? savedSelection
    : PROGRAM_PRESETS[0].id;
}

function getSelectedProgramPreset() {
  const selectedId = elements.programPreset?.value || PROGRAM_PRESETS[0].id;
  return PROGRAM_PRESETS.find((preset) => preset.id === selectedId) || PROGRAM_PRESETS[0];
}

function getSelectedProgramPath() {
  return `${PROGRAMS_PATH}/${getSelectedProgramPreset().id}`;
}

function loadSelectedProgramSlot(options = {}) {
  if (!connected || !sessionReady || controlsLocked) return;
  const { showEmptyAlert = false } = options;
  const preset = getSelectedProgramPreset();
  const expectedRevision = syncedRevision;

  onValue(ref(db, getSelectedProgramPath()), (snapshot) => {
    if (!connected || !sessionReady || controlsLocked || expectedRevision !== syncedRevision) {
      alert("The live session changed while loading. Please press Load Program again.");
      return;
    }
    const savedProgram = snapshot.val();

    if (savedProgram && isSavedProgramForPreset(savedProgram, preset)) {
      loadSavedProgram(savedProgram, preset.name);
      return;
    }

    loadSavedProgram({ presetId: preset.id, serviceName: preset.name, program: [] }, preset.name);

    if (showEmptyAlert) {
      alert(`No saved program found for ${preset.name}. This slot is ready for a new program.`);
    }
  }, { onlyOnce: true });
}

function isSavedProgramForPreset(savedProgram, preset) {
  if (!savedProgram) return false;
  if (savedProgram.presetId) return savedProgram.presetId === preset.id;

  return normalizeName(savedProgram.serviceName) === normalizeName(preset.name);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function loadSavedProgram(savedProgram, fallbackServiceName) {
  if (!connected || !sessionReady || controlsLocked) return;
  if (state.program.length && !confirm("Replace the live running order and return to the beginning? This will stop the current timer.")) return;
  const program = Array.isArray(savedProgram?.program) ? savedProgram.program : [];

  state = normalizeSession({
    ...state,
    serviceName: savedProgram?.serviceName || fallbackServiceName || "",
    program,
    currentIndex: 0,
    remainingMs: program[0] ? program[0].duration * 60 * 1000 : 0,
    isRunning: false,
    endTime: null,
    message: state.message
  });

  clearEditor();
  syncFormFromState();
  persistSession();
  refreshUi();
}

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
    return Math.max(0, session.endTime - (Date.now() + serverOffset));
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
    state.endTime = rebaseTimer ? Date.now() + serverOffset + remainingMs : state.endTime;
  } else {
    state.endTime = null;
  }

  if (!connected || !sessionReady) return;
  const expectedRevision = syncedRevision;
  const proposed = { ...state, updatedAt: Math.max(Date.now() + serverOffset, expectedRevision + 1) };
  return runTransaction(ref(db, SESSION_PATH), current => {
    if ((current?.updatedAt || 0) !== expectedRevision) return;
    return proposed;
  }, { applyLocally: false }).then(result => {
    state = normalizeSession(result.snapshot.val() || createDefaultSession());
    syncedRevision = state.updatedAt;
    syncFormFromState();
    refreshUi();
    if (!result.committed) alert("The live session changed on another device. Please try your edit again.");
    return result.committed;
  }).catch(reportSyncError);
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
  if (document.activeElement !== elements.serviceName) elements.serviceName.value = state.serviceName;

  document.body.classList.toggle("message-visible", Boolean(state.message.trim()));

  renderList();
  updateEditorState();
  renderLiveOverview();
}

function renderList() {
  const programKey = JSON.stringify([state.program, state.currentIndex]);
  if (programKey === renderedProgramKey) { applyLockStateToButtons(); return; }
  renderedProgramKey = programKey;
  elements.programList.innerHTML = "";

  if (state.program.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "program-empty";
    emptyState.innerText = "No segments yet. Add your first item to build the service flow.";
    elements.programList.appendChild(emptyState);
    applyLockStateToButtons();
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

    const insertButton = document.createElement("button");
    insertButton.className = "mini-btn";
    insertButton.type = "button";
    insertButton.dataset.lockable = "true";
    insertButton.innerText = "Add After";
    insertButton.addEventListener("click", () => window.prepareInsertAfter(index));

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-btn mini-btn-danger";
    deleteButton.type = "button";
    deleteButton.dataset.lockable = "true";
    deleteButton.innerText = "Delete";
    deleteButton.addEventListener("click", () => window.deleteItem(index));

    actions.append(editButton, insertButton, deleteButton);
    li.append(indexBadge, copy, duration, actions);
    elements.programList.appendChild(li);
  });

  applyLockStateToButtons();
}

function updateEditorState() {
  if (editingIndex >= 0) {
    elements.addItemBtn.innerText = "Save Item Changes";
    elements.cancelEditBtn.style.display = "block";
  } else if (insertAfterIndex >= 0) {
    const itemNumber = Math.min(insertAfterIndex + 1, state.program.length);
    elements.addItemBtn.innerText = `Add After Item ${itemNumber}`;
    elements.cancelEditBtn.style.display = "block";
  } else {
    elements.addItemBtn.innerText = "Add Program Item";
    elements.cancelEditBtn.style.display = "none";
  }
}

function clearEditor() {
  editingIndex = -1;
  insertAfterIndex = -1;
  elements.title.value = "";
  elements.speaker.value = "";
  elements.duration.value = "";
}

function syncFormFromState() {
  if (document.activeElement !== elements.serviceName) elements.serviceName.value = state.serviceName;
  if (document.activeElement !== elements.liveMessage) elements.liveMessage.value = state.message;
}

function loadCurrentItemDuration() {
  const current = getCurrentItem();
  state.remainingMs = current ? current.duration * 60 * 1000 : 0;

  if (state.isRunning) {
    state.endTime = Date.now() + serverOffset + state.remainingMs;
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
    state.endTime = Date.now() + serverOffset + nextRemaining;
  }
}

function moveToProgramItem(nextIndex) {
  if (state.program.length === 0 || nextIndex < 0 || nextIndex >= state.program.length) return;

  const willKeepRunning = state.isRunning;
  state.currentIndex = nextIndex;
  state.remainingMs = state.program[nextIndex].duration * 60 * 1000;
  state.isRunning = willKeepRunning;
  state.endTime = willKeepRunning ? Date.now() + state.remainingMs : null;
  persistSession({ rebaseTimer: willKeepRunning });
  refreshUi();
}

function advanceToNextItem() {
  if (state.program.length === 0) return;

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

  moveToProgramItem(nextIndex);
}



function applyLockStateToButtons() {
  document.querySelectorAll("[data-lockable='true']").forEach((button) => {
    button.disabled = controlsLocked || !connected || !sessionReady;
  });
  if (elements.lockToggle) elements.lockToggle.disabled = !connected || !sessionReady;
  const status = document.getElementById("connectionStatus");
  status.innerText = connected ? (sessionReady ? "Connected" : "Syncing…") : (hasConnected ? "Reconnecting… · controls offline" : "Connecting… · controls offline");
  status.className = `connection-status ${connected && sessionReady ? 'is-connected' : 'is-offline'}`;
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

function reportSyncError(error) {
  console.error("Timer synchronization failed", error);
  alert("Could not update the live timer. Check your connection and try again.");
}

function timerAction(action, amount = 0) {
  if (!connected || !sessionReady || (controlsLocked && action !== "advance")) return Promise.resolve();
  return runTransaction(ref(db, SESSION_PATH), current =>
    applyTimerAction(current, action, Date.now() + serverOffset, amount),
    { applyLocally: false }
  ).catch(reportSyncError);
}
window.startTimer = () => timerAction("start");
window.pauseTimer = () => timerAction("pause");
window.resetTimer = () => {
  if (!connected || !sessionReady || controlsLocked) return;
  if (state.program.length && !confirm("Reset the live service to the beginning? This will stop the current timer for everyone.")) return;
  const expectedRevision = syncedRevision;
  return runTransaction(ref(db, SESSION_PATH), current => {
    if ((current?.updatedAt || 0) !== expectedRevision) return;
    return applyTimerAction(current, "reset", Date.now() + serverOffset);
  }, { applyLocally: false }).then(result => {
    if (!result.committed) alert("The live session changed. Check the timer before resetting again.");
  }).catch(reportSyncError);
};
window.adjustCurrentTime = minutes => timerAction("adjust", minutes);
window.previousItem = () => timerAction("previous");
window.nextItem = () => timerAction("next");
function autoAdvance() {
  if (advancingToNext) return;
  advancingToNext = true;
  timerAction("advance").finally(() => { advancingToNext = false; });
}

function renderLiveOverview() {
  const overview = getOverview(state, Date.now() + serverOffset);
  const write = (id, text) => { document.getElementById(id).innerText = text; };
  write('runStatus', overview.status);
  document.getElementById('runStatus').className = `run-status ${state.isRunning ? 'is-running' : ''}`;
  write('liveTitle', overview.current?.title || (overview.complete ? 'Service complete' : 'Ready'));
  write('liveSpeaker', overview.current?.speaker || 'Awaiting Speaker');
  const seconds = Math.ceil(overview.remaining / 1000);
  write('liveTimer', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
  document.getElementById('liveTimer').className = `live-timer ${getTimerPresentation().color}`;
  document.getElementById('segmentProgress').style.width = `${overview.progress}%`;
  write('nextSegment', overview.next?.title || (overview.complete ? 'Thank you — service complete' : overview.current ? 'Final segment' : 'Add a program to begin'));
  write('nextSpeaker', overview.next ? [overview.next.speaker, `${overview.next.duration} min`].filter(Boolean).join(' · ') : '');
  const time = value => value == null ? '—' : new Date(value).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false});
  write('segmentEnd', time(overview.segmentEnd));
  write('serviceEnd', time(overview.serviceEnd));
  write('finishHint', state.isRunning ? 'Estimated finish times · update with time adjustments' : overview.complete ? 'All segments have finished.' : 'Finish times appear when the timer is running.');
}

const viewToggle = document.getElementById('viewToggle');
function setLiveView(live) {
  document.body.classList.toggle('live-mode', live);
  viewToggle.innerText = live ? 'Setup view' : 'Live view';
  viewToggle.setAttribute('aria-pressed', String(live));
  document.getElementById('setupPanel').open = !live;
  localStorage.setItem('stageTimerLiveView', String(live));
}
const savedLiveView = localStorage.getItem('stageTimerLiveView');
setLiveView(savedLiveView == null ? window.matchMedia('(max-width: 1100px)').matches : savedLiveView === 'true');
viewToggle.addEventListener('click', () => setLiveView(!document.body.classList.contains('live-mode')));

window.exportProgram = function () {
  if (!state.program.length) { alert('Add or load a program before downloading a backup.'); return; }
  const data = { type:'stage-timer-program', version:1, serviceName:state.serviceName, program:state.program, exportedAt:new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(state.serviceName || 'church-service').replace(/[^a-z0-9]+/gi, '-').slice(0,80)}-backup.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.getElementById('backupFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Choose a program backup smaller than 1 MB.');
    const backup = readProgramBackup(await file.text());
    loadSavedProgram(backup, 'Imported Service');
  } catch (error) { alert(error.message || 'Could not read this program backup.'); }
});

watchDisplaySettings();
async function updateDisplaySetting(patch) {
  if (!connected || !sessionReady || controlsLocked) return;
  const status = document.getElementById('settingsStatus');
  status.innerText = 'Saving display settings…';
  try {
    await runTransaction(ref(db, 'displaySettings'), current => ({...(current || {}), ...patch}), {applyLocally:false});
    status.innerText = 'Display settings saved.';
  } catch (error) { status.innerText = 'Could not save. Check your connection and try again.'; console.error(error); }
}
document.getElementById('displayTheme').addEventListener('change', event => updateDisplaySetting({theme:event.target.value}));
document.getElementById('displaySize').addEventListener('change', event => updateDisplaySetting({size:event.target.value}));
document.getElementById('removeLogo').addEventListener('click', () => updateDisplaySetting({logo:''}));
document.getElementById('logoFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 200 * 1024) {
    alert('Choose a PNG, JPG or WebP logo up to 200 KB.'); return;
  }
  const reader = new FileReader();
  reader.onload = () => updateDisplaySetting({logo:reader.result});
  reader.onerror = () => alert('Could not read the logo. Please try another image.');
  reader.readAsDataURL(file);
});

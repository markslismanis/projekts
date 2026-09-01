// ---------- Data ----------
const EXERCISES = {
  "Upper Body": [
    "Chest Fly", "Wide Chest Press", "Seated Dips", "Lat Pulldown",
    "Seated Cable Row", "Seated Chest Supported Row" , "Seated Lateral Raises", "Tricep Pushdown",
    "Crossbody Tricep Extension", "Overhead Tricep Extension", "Preacher Curl", "Bicep curl", "Reverse Curl (forearm)"
  ],
  "Lower Body": [
    "Squat", "Bulgarian Split Squat", "Romanian Deadlift",
    "Leg Extension", "Leg Curl", "Calf Raise", "Hip Thrust",
    "Hip Abduction" 
  ]
};
// Custom split offers everything from both lists, in one dropdown
EXERCISES["Custom"] = [...EXERCISES["Upper Body"], ...EXERCISES["Lower Body"]];

const CREATE_NEW = "__create_new__";

// Backend API base — matches app.py's route prefixes:
const API_ROOT = "/api";
const SAVE_BASE = `${API_ROOT}/save`;
const WORKOUTS_BASE = `${API_ROOT}/workouts`;

// ---------- Auth-aware fetch wrapper ----------
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not logged in — redirecting");
  }
  return res;
}

// ---------- Elements ----------
const loginScreen = document.getElementById("login-screen");
const splitScreen = document.getElementById("split-screen");
const workoutScreen = document.getElementById("workout-screen");
const splitTitle = document.getElementById("split-title");
const exerciseSelect = document.getElementById("exercise-select");
const customInput = document.getElementById("custom-exercise-input");
const addBtn = document.getElementById("add-exercise-btn");
const exerciseList = document.getElementById("exercise-list");
const backBtn = document.getElementById("back-btn");
const template = document.getElementById("exercise-template");

let currentSplit = null;

// ---------- Screen switching ----------
function showScreen(screen) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
}

// ---------- Initial auth check ----------
async function checkAuthAndInit() {
  try {
    const res = await fetch(`${API_ROOT}/me`);
    if (res.ok) {
      showScreen(splitScreen);
    }
  } catch (err) {
    console.error("Could not reach backend to check login status", err);
  }
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    exerciseList.innerHTML = "";
    showScreen(loginScreen);
    checkAuthAndInit();
  }
});

// ---------- Split selection ----------
document.querySelectorAll(".split-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentSplit = btn.dataset.split;
    startWorkout(currentSplit);
  });
});

async function startWorkout(split) {
  splitTitle.textContent = split;
  populateExerciseSelect(split);
  exerciseList.innerHTML = ""; // Clear cards when switching screens
  await loadState(split);
  showScreen(workoutScreen);
}

function populateExerciseSelect(split) {
  const list = EXERCISES[split] || [];
  exerciseSelect.style.display = "block";
  exerciseSelect.innerHTML =
    list.map(name => `<option value="${name}">${name}</option>`).join("") +
    `<option value="${CREATE_NEW}">+ Create New Exercise</option>`;
  exerciseSelect.value = list[0] ?? CREATE_NEW;
  toggleCustomInput();
}

function toggleCustomInput() {
  if (exerciseSelect.value === CREATE_NEW) {
    customInput.style.display = "block";
    customInput.focus();
  } else {
    customInput.style.display = "none";
    customInput.value = "";
  }
}

exerciseSelect.addEventListener("change", toggleCustomInput);

customInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

// ---------- Add exercises ----------
addBtn.addEventListener("click", async () => {
  const name = exerciseSelect.value === CREATE_NEW
    ? customInput.value.trim()
    : exerciseSelect.value;

  if (!name) return;

  let previousSessionSets = null;

  // Fetch performance from previous session to populate high-transparency ghost values
  try {
    const res = await apiFetch(
      `${WORKOUTS_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`
    );
    if (res.ok) {
      const data = await res.json();
      previousSessionSets = data.sets || null; 
    }
  } catch (err) {
    console.error("Could not fetch previous session data", err);
  }

  // Pass null for current session, and previousSessionSets for ghost values
  addExerciseCard(name, null, previousSessionSets);

  // Reset dropdown menu selection
  const list = EXERCISES[currentSplit] || [];
  exerciseSelect.value = list[0] ?? CREATE_NEW;
  toggleCustomInput();
});

/**
 * Builds one exercise card.
 * currentSets: sets saved during active session, or null
 * lastSets: sets from previous session to render as transparent ghost values
 */
function addExerciseCard(name, currentSets, lastSets) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".exercise-card");
  const saveBtn = node.querySelector(".save-btn");
  card.querySelector(".exercise-name").textContent = name;

  const repsInputs = node.querySelectorAll(".reps-input");
  const weightInputs = node.querySelectorAll(".weight-input");

  repsInputs.forEach((input, i) => {
    const weightInput = weightInputs[i];

    if (currentSets && currentSets[i]) {
      // Current session active data
      input.value = currentSets[i].reps ?? "";
      weightInput.value = currentSets[i].weight ?? "";
    } else if (lastSets && lastSets[i]) {
      // Previous session data pre-filled with high-transparency styling
      if (lastSets[i].reps !== null && lastSets[i].reps !== undefined) {
        input.value = lastSets[i].reps;
        input.classList.add("previous-session-val");
      }
      if (lastSets[i].weight !== null && lastSets[i].weight !== undefined) {
        weightInput.value = lastSets[i].weight;
        weightInput.classList.add("previous-session-val");
      }
    }

    // Clear ghost value when field is focused/clicked
    [input, weightInput].forEach(inp => {
      inp.addEventListener("focus", () => {
        if (inp.classList.contains("previous-session-val")) {
          inp.value = "";
          inp.classList.remove("previous-session-val");
        }
      });
    });
  });

  // ---- Save button state management ----
  function markUnsaved() {
    saveBtn.classList.remove("is-saved", "is-error", "is-saving");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
  function markSaving() {
    saveBtn.classList.remove("is-saved", "is-error");
    saveBtn.classList.add("is-saving");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }
  function markSaved() {
    saveBtn.classList.remove("is-saving", "is-error");
    saveBtn.classList.add("is-saved");
    saveBtn.disabled = false;
    saveBtn.textContent = "Saved";
  }
  function markErrorState() {
    saveBtn.classList.remove("is-saving", "is-saved");
    saveBtn.classList.add("is-error");
    saveBtn.disabled = false;
    saveBtn.textContent = "Retry";
  }

  if (currentSets && currentSets.length) {
    markSaved();
  } else {
    markUnsaved();
  }

  // Any edit removes transparent class & marks card as unsaved
  [...repsInputs, ...weightInputs].forEach(input => {
    input.addEventListener("input", () => {
      input.classList.remove("previous-session-val");
      markUnsaved();
    });
  });

  // ---- Save handler ----
  saveBtn.addEventListener("click", async () => {
    const sets = [...repsInputs].map((repsInput, i) => ({
      reps: repsInput.classList.contains("previous-session-val") ? "" : repsInput.value,
      weight: weightInputs[i].classList.contains("previous-session-val") ? "" : weightInputs[i].value,
    }));

    markSaving();
    try {
      const res = await apiFetch(
        `${SAVE_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sets }),
        }
      );
      if (!res.ok) {
        markErrorState();
        return;
      }
      markSaved();
    } catch (err) {
      console.error("Could not reach backend", err);
      markErrorState();
    }
  });

  // ---- Remove handler ----
  node.querySelector(".remove-exercise-btn").addEventListener("click", async () => {
    if (!confirm(`Remove "${name}" and its logged history? This can't be undone.`)) return;
    try {
      const res = await apiFetch(
        `${WORKOUTS_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) return alert("Could not delete from the server.");
    } catch (err) {
      return alert("Could not reach backend server.");
    }
    card.remove();
  });

  const toggleCollapse = () => card.classList.toggle("collapsed");
  node.querySelector(".collapse-toggle-btn").addEventListener("click", toggleCollapse);
  node.querySelector(".exercise-name").addEventListener("click", toggleCollapse);

  exerciseList.appendChild(node);
}

// ---------- Navigation ----------
backBtn.addEventListener("click", () => {
  showScreen(splitScreen);
});

// ---------- Load session state: Clear cards for a fresh start ----------
async function loadState(split) {
  exerciseList.innerHTML = "";
}

// ---------- Kick things off ----------
checkAuthAndInit();
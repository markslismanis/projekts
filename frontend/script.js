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

// Backend API base — matches app.py's own route prefixes:
//   POST   /save/<split>/<exercise>       -> saving
//   GET    /workouts/<split>              -> flat list of every row in a split
//   GET    /workouts/<split>/<exercise>   -> {sets, last} for one exercise
//   DELETE /workouts/<split>/<exercise>   -> wipes one exercise's history
const API_ROOT = "/api";
const SAVE_BASE = `${API_ROOT}/save`;
const WORKOUTS_BASE = `${API_ROOT}/workouts`;

// ---------- Elements ----------
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
addBtn.addEventListener("click", () => {
  const name = exerciseSelect.value === CREATE_NEW
    ? customInput.value.trim()
    : exerciseSelect.value;

  if (!name) return;

  // Freshly added by hand -> no current values, no "last time" hint yet
  addExerciseCard(name, null, null);

  // Reset the picker back to the first real option after adding
  const list = EXERCISES[currentSplit] || [];
  exerciseSelect.value = list[0] ?? CREATE_NEW;
  toggleCustomInput();
});

/**
 * Builds one exercise card.
 * currentSets: sets to pre-fill into the inputs (from the most recent save), or null
 * lastSets: sets to show as placeholder hints ("what you did last time"), or null
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
      input.value = currentSets[i].reps ?? "";
      weightInput.value = currentSets[i].weight ?? "";
    }

    // "Last time" values show as placeholder text — visible only while the field is empty
    if (lastSets && lastSets[i]) {
      if (lastSets[i].reps !== null && lastSets[i].reps !== undefined) {
        input.placeholder = String(lastSets[i].reps);
      }
      if (lastSets[i].weight !== null && lastSets[i].weight !== undefined) {
        weightInput.placeholder = String(lastSets[i].weight);
      }
    }
  });

  // ---- This card's own Save button state (independent of every other card) ----
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

  // If we loaded existing data for this exercise, it's already saved on the backend.
  // Freshly added exercises (currentSets is null) start as unsaved.
  if (currentSets && currentSets.length) {
    markSaved();
  } else {
    markUnsaved();
  }

  // Any edit marks this specific card as unsaved again
  [...repsInputs, ...weightInputs].forEach(input => {
    input.addEventListener("input", markUnsaved);
  });

  // ---- Save this exercise only -> POST /save/<split>/<exercise> ----
  saveBtn.addEventListener("click", async () => {
    const sets = [...repsInputs].map((repsInput, i) => ({
      reps: repsInput.value,
      weight: weightInputs[i].value,
    }));

    markSaving();
    try {
      const res = await fetch(
        `${SAVE_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sets }),
        }
      );
      if (!res.ok) {
        console.error("Save failed with status", res.status);
        markErrorState();
        return;
      }
      markSaved();
    } catch (err) {
      console.error("Could not reach backend — is app.py running?", err);
      markErrorState();
    }
  });

  // ---- Remove -> DELETE /workouts/<split>/<exercise> ----
  node.querySelector(".remove-exercise-btn").addEventListener("click", async () => {
    if (!confirm(`Remove "${name}" and its logged history? This can't be undone.`)) return;
    try {
      const res = await fetch(
        `${WORKOUTS_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        alert("Could not delete from the server. Try again.");
        return;
      }
    } catch (err) {
      alert("Could not reach the backend to delete. Is app.py running?");
      return;
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

// ---------- Load existing exercises + their history for this split ----------
//
// app.py's GET /workouts/<split> returns a FLAT list of every individual row
// (one entry per set, not grouped by exercise) — unlike the exercise-specific
// route, which already returns {sets, last}. So here we:
//   1. fetch the flat list to discover which exercises exist in this split
//   2. for each distinct exercise name, fetch its {sets, last} individually
async function loadState(split) {
  exerciseList.innerHTML = "";
  try {
    const res = await fetch(`${WORKOUTS_BASE}/${encodeURIComponent(split)}`);
    if (!res.ok) return;
    const rows = await res.json();

    // Pull out distinct exercise names, keeping the order they first appear in
    const exerciseNames = [];
    rows.forEach(row => {
      if (!exerciseNames.includes(row.exercise)) {
        exerciseNames.push(row.exercise);
      }
    });

    // Fetch each exercise's current + last sets, one request per exercise
    for (const name of exerciseNames) {
      const exRes = await fetch(
        `${WORKOUTS_BASE}/${encodeURIComponent(split)}/${encodeURIComponent(name)}`
      );
      if (!exRes.ok) continue;
      const { sets, last } = await exRes.json();
      addExerciseCard(name, sets, last);
    }
  } catch (err) {
    console.error("Could not reach backend — is app.py running?", err);
    alert("Could not load your workouts. Make sure the backend server is running.");
  }
}

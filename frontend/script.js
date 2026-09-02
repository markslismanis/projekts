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
EXERCISES["Custom"] = [...EXERCISES["Upper Body"], ...EXERCISES["Lower Body"]];

const CREATE_NEW = "__create_new__";

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
const dataScreen = document.getElementById("data-screen");
const splitTitle = document.getElementById("split-title");
const exerciseSelect = document.getElementById("exercise-select");
const customInput = document.getElementById("custom-exercise-input");
const addBtn = document.getElementById("add-exercise-btn");
const exerciseList = document.getElementById("exercise-list");
const backBtn = document.getElementById("back-btn");
const dataBackBtn = document.getElementById("data-back-btn");
const template = document.getElementById("exercise-template");

const viewTableBtn = document.getElementById("view-table-btn");
const viewOverloadBtn = document.getElementById("view-overload-btn");
const dataCategoryFilter = document.getElementById("data-category-filter");
const workoutDataBody = document.getElementById("workout-data-body");
const tableViewContainer = document.getElementById("table-view-container");
const overloadViewContainer = document.getElementById("overload-view-container");
const overloadCardsContainer = document.getElementById("overload-cards-container");

let currentSplit = null;
let currentDataView = "Table";
let cachedWorkoutLogs = [];

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
    if (currentSplit === "Data") {
      openDataScreen();
    } else {
      startWorkout(currentSplit);
    }
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
addBtn.addEventListener("click", async () => {
  const name = exerciseSelect.value === CREATE_NEW
    ? customInput.value.trim()
    : exerciseSelect.value;

  if (!name) return;

  // Don't add a duplicate card if this exercise is already showing
  const alreadyShown = [...exerciseList.querySelectorAll(".exercise-name")]
    .some(el => el.textContent === name);
  if (alreadyShown) {
    const list = EXERCISES[currentSplit] || [];
    exerciseSelect.value = list[0] ?? CREATE_NEW;
    toggleCustomInput();
    return;
  }

  let previousSessionSets = null;

  try {
    const res = await apiFetch(
      `${WORKOUTS_BASE}/${encodeURIComponent(currentSplit)}/${encodeURIComponent(name)}`
    );
    if (res.ok) {
      const data = await res.json();
      // This exercise's most recent saved sets become the "last time" hint
      // for this freshly-added card (it has no current/unsaved values yet).
      previousSessionSets = data.sets && data.sets.length ? data.sets : data.last;
    }
  } catch (err) {
    console.error("Could not fetch previous session data", err);
  }

  addExerciseCard(name, null, previousSessionSets);

  const list = EXERCISES[currentSplit] || [];
  exerciseSelect.value = list[0] ?? CREATE_NEW;
  toggleCustomInput();
});

/**
 * Builds one exercise card.
 * currentSets: this session's already-saved values, shown as real input values (bold/saved state)
 * lastSets: previous session's values, shown as highlighted-but-editable hints —
 *           clicking into a hinted field clears the hint so the user can type fresh numbers,
 *           but leaving it untouched and hitting Save still saves the shown (hinted) value.
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
    } else if (lastSets && lastSets[i]) {
      if (lastSets[i].reps !== null && lastSets[i].reps !== undefined && lastSets[i].reps !== "") {
        input.value = lastSets[i].reps;
        input.classList.add("previous-session-val");
      }
      if (lastSets[i].weight !== null && lastSets[i].weight !== undefined && lastSets[i].weight !== "") {
        weightInput.value = lastSets[i].weight;
        weightInput.classList.add("previous-session-val");
      }
    }

    [input, weightInput].forEach(inp => {
      inp.addEventListener("focus", function () {
        if (this.classList.contains("previous-session-val")) {
          this.value = "";
          this.classList.remove("previous-session-val");
        }
      });
    });
  });

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

  [...repsInputs, ...weightInputs].forEach(input => {
    input.addEventListener("input", () => {
      input.classList.remove("previous-session-val");
      markUnsaved();
    });
  });

  // ---- Save this exercise -> POST /save/<split>/<exercise> ----
  // Sends whatever is actually showing in each field — including untouched
  // "last time" hints. That means clicking Save without editing anything
  // logs the same numbers as last time, which is the expected behavior for
  // "I did the same as before."
  saveBtn.addEventListener("click", async () => {
    const sets = [...repsInputs].map((repsInput, i) => ({
      reps: repsInput.value,
      weight: weightInputs[i].value,
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
        console.error("Save failed with status", res.status);
        markErrorState();
        return;
      }
      // Values just saved are now the "current" state — clear the hint styling
      // so they read as confirmed rather than still-a-suggestion.
      [...repsInputs, ...weightInputs].forEach(inp => inp.classList.remove("previous-session-val"));
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
      const res = await apiFetch(
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

// ---------- Load existing exercises + their history for this split ----------
//
// Runs every time a split is opened. GET /workouts/<split> returns a FLAT
// list of every individual saved row for that split — one entry per set,
// not grouped by exercise — so here we:
//   1. fetch the flat list to discover which exercises exist in this split
//   2. for each distinct exercise name, fetch its {sets, last} individually
//      and render a card: current session bold/saved, previous session as
//      the editable "last time" hint.
async function loadState(split) {
  exerciseList.innerHTML = "";
  try {
    const res = await apiFetch(`${WORKOUTS_BASE}/${encodeURIComponent(split)}`);
    if (!res.ok) return;
    const rows = await res.json();

    const exerciseNames = [];
    rows.forEach(row => {
      if (!exerciseNames.includes(row.exercise)) {
        exerciseNames.push(row.exercise);
      }
    });

    for (const name of exerciseNames) {
      const exRes = await apiFetch(
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

// ---------- Data screen ----------
async function openDataScreen() {
  showScreen(dataScreen);
  dataCategoryFilter.value = "All";
  currentDataView = "Table";
  viewTableBtn.classList.add("active");
  viewOverloadBtn.classList.remove("active");
  tableViewContainer.style.display = "block";
  overloadViewContainer.style.display = "none";

  workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading logs...</td></tr>`;

  try {
    const res = await apiFetch(WORKOUTS_BASE);
    if (res.ok) {
      cachedWorkoutLogs = await res.json();
    } else {
      cachedWorkoutLogs = [];
      workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Failed to load data.</td></tr>`;
      return; // don't let renderCurrentView() overwrite this with "no logs found"
    }
  } catch (err) {
    console.error("Error fetching data logs:", err);
    cachedWorkoutLogs = [];
    workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Error reaching server.</td></tr>`;
    return;
  }

  renderCurrentView();
}

function switchDataView(view) {
  currentDataView = view;
  viewTableBtn.classList.toggle("active", view === "Table");
  viewOverloadBtn.classList.toggle("active", view === "ProgressiveOverload");
  tableViewContainer.style.display = view === "Table" ? "block" : "none";
  overloadViewContainer.style.display = view === "Table" ? "none" : "block";
  renderCurrentView();
}

function renderCurrentView() {
  const selectedCategory = dataCategoryFilter.value;
  if (currentDataView === "Table") {
    renderDataTable(cachedWorkoutLogs, selectedCategory);
  } else {
    renderProgressiveOverload(cachedWorkoutLogs, selectedCategory);
  }
}

viewTableBtn.addEventListener("click", () => switchDataView("Table"));
viewOverloadBtn.addEventListener("click", () => switchDataView("ProgressiveOverload"));
dataCategoryFilter.addEventListener("change", renderCurrentView);

function renderDataTable(logs, selectedCategory) {
  workoutDataBody.innerHTML = "";

  const filtered = selectedCategory === "All"
    ? logs
    : logs.filter(item => item.split === selectedCategory);

  if (!filtered || filtered.length === 0) {
    workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No workout logs found.</td></tr>`;
    return;
  }

  filtered.forEach(log => {
    const tr = document.createElement("tr");

    const dateFormatted = log.timestamp
      ? new Date(log.timestamp.replace(" ", "T")).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
      : "N/A";

    const sets = log.sets || [];
    const getSetText = (i) => {
      const s = sets[i];
      if (!s || (!s.reps && !s.weight)) return "-";
      return `${s.weight || 0}kg × ${s.reps || 0}`;
    };

    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td><strong>${log.split || '-'}</strong></td>
      <td>${log.exercise || '-'}</td>
      <td class="set-cell">${getSetText(0)}</td>
      <td class="set-cell">${getSetText(1)}</td>
      <td class="set-cell">${getSetText(2)}</td>
      <td class="set-cell">${getSetText(3)}</td>
    `;
    workoutDataBody.appendChild(tr);
  });
}

function renderProgressiveOverload(logs, selectedCategory) {
  overloadCardsContainer.innerHTML = "";

  const filtered = selectedCategory === "All"
    ? logs
    : logs.filter(item => item.split === selectedCategory);

  if (!filtered || filtered.length === 0) {
    overloadCardsContainer.innerHTML = `<p style="text-align:center; color: var(--text-faint);">No workout logs found for this category.</p>`;
    return;
  }

  const exerciseMap = {};
  filtered.forEach(log => {
    const key = `${log.split || 'Custom'} - ${log.exercise}`;
    if (!exerciseMap[key]) exerciseMap[key] = [];
    exerciseMap[key].push(log);
  });

  let candidatesCount = 0;

  Object.keys(exerciseMap).forEach(key => {
    const history = exerciseMap[key];
    history.sort((a, b) => new Date((b.timestamp || "").replace(" ", "T")) - new Date((a.timestamp || "").replace(" ", "T")));

    const latest = history[0];
    const previous = history[1] || null;

    const set2 = (latest.sets && latest.sets[1]) ? latest.sets[1] : null;
    const set2Reps = set2 ? parseInt(set2.reps, 10) : 0;

    if (set2Reps > 8) {
      candidatesCount++;
      const currentWeight = set2.weight ? parseFloat(set2.weight) : 0;
      const recommendedWeight = currentWeight > 0 ? currentWeight + 2.5 : null;

      let recText = recommendedWeight
        ? `Hit ${set2Reps} reps on Set 2! Increase weight from <strong>${currentWeight}kg</strong> &rarr; <strong>${recommendedWeight}kg</strong> next session.`
        : `Hit ${set2Reps} reps on Set 2! Increase load or reps for next workout.`;

      const formatSet = (setObj) => {
        if (!setObj || (!setObj.reps && !setObj.weight)) return "-";
        return `${setObj.weight || 0}kg × ${setObj.reps || 0}`;
      };

      const renderSessionRow = (label, logObj) => {
        if (!logObj) {
          return `<tr><td><strong>${label}</strong></td><td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
        }
        const dateStr = logObj.timestamp
          ? new Date(logObj.timestamp.replace(" ", "T")).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '';
        const s = logObj.sets || [];
        return `<tr>
          <td><strong>${label}</strong><br><small style="color:var(--text-faint);">${dateStr}</small></td>
          <td>${formatSet(s[0])}</td>
          <td>${formatSet(s[1])}</td>
          <td>${formatSet(s[2])}</td>
          <td>${formatSet(s[3])}</td>
        </tr>`;
      };

      const card = document.createElement("div");
      card.className = "overload-card";
      card.innerHTML = `
        <div class="overload-header">
          <div>
            <div class="overload-title">${latest.exercise}</div>
            <small style="color: var(--text-faint);">${latest.split || 'Custom'}</small>
          </div>
          <div class="overload-badge">Ready for Overload</div>
        </div>
        <p style="margin-bottom: 12px; font-size: 0.9rem; color: var(--text-dim);">${recText}</p>
        <div class="overload-table-wrapper">
          <table class="overload-table">
            <thead>
              <tr><th>Session</th><th>Set 1</th><th>Set 2</th><th>Set 3</th><th>Set 4</th></tr>
            </thead>
            <tbody>
              ${renderSessionRow('Last Session', latest)}
              ${renderSessionRow('Previous Session', previous)}
            </tbody>
          </table>
        </div>
      `;
      overloadCardsContainer.appendChild(card);
    }
  });

  if (candidatesCount === 0) {
    overloadCardsContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; background: var(--surface); border-radius: 4px; border: 1px solid var(--border);">
        <h2 style="margin: 0 0 6px;">No Overload Targets Found</h2>
        <p style="color: var(--text-faint); margin: 0;">
          None of your logged exercises exceeded 8 reps on Set 2 (first working set) in their latest session.
        </p>
      </div>`;
  }
}

// ---------- Navigation ----------
backBtn.addEventListener("click", () => {
  showScreen(splitScreen);
});

dataBackBtn.addEventListener("click", () => {
  showScreen(splitScreen);
});

// ---------- Kick off ----------
checkAuthAndInit();
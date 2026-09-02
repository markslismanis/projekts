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

const API_ROOT = "";
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

const viewToggleBtns = document.querySelectorAll(".view-toggle-btn");
const dataCategoryFilter = document.getElementById("data-category-filter");
const workoutDataBody = document.getElementById("workout-data-body");
const tableViewContainer = document.getElementById("table-view-container");
const overloadViewContainer = document.getElementById("overload-view-container");
const overloadCardsContainer = document.getElementById("overload-cards-container");

let currentSplit = null;
let cachedWorkoutLogs = [];
let currentDataView = "Table";

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
  exerciseList.innerHTML = "";
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

  addExerciseCard(name, null, previousSessionSets);

  const list = EXERCISES[currentSplit] || [];
  exerciseSelect.value = list[0] ?? CREATE_NEW;
  toggleCustomInput();
});

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
      inp.addEventListener("focus", function() {
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

// ---------- Data View Logic ----------
async function openDataScreen() {
  showScreen(dataScreen);
  dataCategoryFilter.value = "All";
  currentDataView = "Table";
  viewToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.view === "Table"));
  toggleDataView();
  
  workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading logs...</td></tr>`;

  try {
    const res = await apiFetch(WORKOUTS_BASE);
    if (res.ok) {
      cachedWorkoutLogs = await res.json();
      renderCurrentView();
    } else {
      workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Failed to load data.</td></tr>`;
    }
  } catch (err) {
    console.error("Error fetching data logs:", err);
    workoutDataBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Error reaching server.</td></tr>`;
  }
}

function toggleDataView() {
  if (currentDataView === "Table") {
    tableViewContainer.style.display = "block";
    overloadViewContainer.style.display = "none";
  } else {
    tableViewContainer.style.display = "none";
    overloadViewContainer.style.display = "block";
  }
}

function renderCurrentView() {
  const mode = currentDataView;
  const selectedCategory = dataCategoryFilter.value;

  if (mode === "Table") {
    renderDataTable(cachedWorkoutLogs, selectedCategory);
  } else {
    renderProgressiveOverload(cachedWorkoutLogs, selectedCategory);
  }
}

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
      ? new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
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
    overloadCardsContainer.innerHTML = `<p style="text-align:center;">No workout logs found for this category.</p>`;
    return;
  }

  // Group workouts by unique exercise key (split + exercise name)
  const exerciseMap = {};
  filtered.forEach(log => {
    const key = `${log.split || 'Custom'} - ${log.exercise}`;
    if (!exerciseMap[key]) {
      exerciseMap[key] = [];
    }
    exerciseMap[key].push(log);
  });

  let candidatesCount = 0;

  Object.keys(exerciseMap).forEach(key => {
    const history = exerciseMap[key];
    
    // Sort descending by timestamp so history[0] is the latest session
    history.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const latest = history[0];
    const previous = history[1] || null;

    // Set 1 is a warmup set -> Check Set 2 (sets[1]) for the first working set
    const set2 = (latest.sets && latest.sets[1]) ? latest.sets[1] : null;
    const set2Reps = set2 ? parseInt(set2.reps, 10) : 0;

    // Trigger condition: Set 2 (first working set) reps > 8
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
          return `<tr>
            <td><strong>${label}</strong></td>
            <td>-</td><td>-</td><td>-</td><td>-</td>
          </tr>`;
        }
        const dateStr = logObj.timestamp 
          ? new Date(logObj.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '';
        const sets = logObj.sets || [];
        return `<tr>
          <td><strong>${label}</strong> <br><small style="color:var(--text-faint);">${dateStr}</small></td>
          <td>${formatSet(sets[0])}</td>
          <td>${formatSet(sets[1])}</td>
          <td>${formatSet(sets[2])}</td>
          <td>${formatSet(sets[3])}</td>
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
          <div class="overload-badge">⚡ Ready for Overload</div>
        </div>
        
        <p style="margin-bottom: 12px; font-size: 0.95rem; color: var(--text-main);">${recText}</p>

        <div class="overload-table-wrapper">
          <table class="overload-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Set 1 (Warmup)</th>
                <th>Set 2</th>
                <th>Set 3</th>
                <th>Set 4</th>
              </tr>
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
      <div style="text-align: center; padding: 20px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color);">
        <h3>No Progressive Overload Targets Found</h3>
        <p style="color: var(--text-faint); margin-top: 6px;">
          None of your logged exercises exceeded 8 reps on Set 2 (first working set) in their latest session.
        </p>
      </div>`;
  }
}

viewToggleBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view === currentDataView) return;
    currentDataView = btn.dataset.view;
    viewToggleBtns.forEach(b => b.classList.toggle("active", b === btn));
    toggleDataView();
    renderCurrentView();
  });
});

dataCategoryFilter.addEventListener("change", () => {
  renderCurrentView();
});

// ---------- Navigation ----------
backBtn.addEventListener("click", () => {
  showScreen(splitScreen);
});

dataBackBtn.addEventListener("click", () => {
  showScreen(splitScreen);
});

// ---------- Load session state ----------
async function loadState(split) {
  exerciseList.innerHTML = "";
}

// ---------- Kick off ----------
checkAuthAndInit();
(function () {
const STORAGE_KEY = "infogrid-sprint-tracker-v2";
const SYNC_KEY = "infogrid-firebase-sync-v1";
const SPRINT_START = new Date(2026, 7, 10);
const SPRINT_END = new Date(2026, 8, 30);

const PEOPLE = {
  varsha: { name: "Varsha", age: 24 },
  siddharth: { name: "Siddharth", age: 25 },
};

const OUTCOME_LABELS = {
  connected: "Connected (owner)",
  busy: "Busy",
  voicemail: "Voicemail",
  failed: "Failed",
  gatekeeper: "Gatekeeper",
};

const DEFAULT_GOALS = [
  {
    id: "g-sales",
    title: "Sales calls (min 200)",
    owner: "both",
    target: 200,
    unit: "sales calls",
    category: "sales",
    manual: 0,
  },
  {
    id: "g-ads",
    title: "Learn & practice running ads",
    owner: "both",
    target: 40,
    unit: "ad sessions",
    category: "ads",
    manual: 0,
  },
  {
    id: "g-connected",
    title: "Owner connects (spoke with decision maker)",
    owner: "both",
    target: 40,
    unit: "owner connects",
    category: null,
    manual: 0,
    outcome: "connected",
  },
];

const CALL_RING = 2 * Math.PI * 28;
const DUO_CIRC = 2 * Math.PI * 52;

const STATUS_LINES = [
  "Infogrid AI · log today's outreach",
  "200-call sprint · stay on pace",
  "Outcomes unlock conversion averages",
  "Ads + calls compound · one session daily",
];

let syncing = false;
let applyingRemote = false;
let db = null;
let dbRef = null;
let saveTimer = null;

// Placeholders — initialized after helpers + DOM are ready
let state = { days: {}, goals: structuredClone(DEFAULT_GOALS), updatedAt: Date.now() };
let selectedDate = startOfDay(new Date());
let calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let els = {
  sprintRange: document.getElementById("sprintRange"),
  combinedPct: document.getElementById("combinedPct"),
  ringVarsha: document.getElementById("ringVarsha"),
  ringSid: document.getElementById("ringSid"),
  bothDone: document.getElementById("bothDone"),
  daysLogged: document.getElementById("daysLogged"),
  daysLeft: document.getElementById("daysLeft"),
  totalCalls: document.getElementById("totalCalls"),
  callTarget: document.getElementById("callTarget"),
  callPct: document.getElementById("callPct"),
  callBar: document.getElementById("callBar"),
  callRing: document.getElementById("callRing"),
  needPerDay: document.getElementById("needPerDay"),
  avgPerDay: document.getElementById("avgPerDay"),
  paceStatus: document.getElementById("paceStatus"),
  meetingsBooked: document.getElementById("meetingsBooked"),
  teamHoursToday: document.getElementById("teamHoursToday"),
  streak: document.getElementById("streak"),
  selectedDateLabel: document.getElementById("selectedDateLabel"),
  dateBar: document.getElementById("dateBar"),
  calendar: document.getElementById("calendar"),
  monthLabel: document.getElementById("monthLabel"),
  monthSummary: document.getElementById("monthSummary"),
  goalsGrid: document.getElementById("goalsGrid"),
  goalForm: document.getElementById("goalForm"),
  syncStatus: document.getElementById("syncStatus"),
  syncHint: document.getElementById("syncHint"),
  vaultInput: document.getElementById("vaultInput"),
  configInput: document.getElementById("configInput"),
  liveClock: document.getElementById("liveClock"),
  jarvisLine: document.getElementById("jarvisLine"),
  avgBoard: document.getElementById("avgBoard"),
  logsKpis: document.getElementById("logsKpis"),
  monthlyCallsChart: document.getElementById("monthlyCallsChart"),
  outcomesBreakdown: document.getElementById("outcomesBreakdown"),
  areaBreakdown: document.getElementById("areaBreakdown"),
  operatorCompare: document.getElementById("operatorCompare"),
  activityFeed: document.getElementById("activityFeed"),
};

function migrateGoals(s) {
  if (!s.goals) s.goals = structuredClone(DEFAULT_GOALS);
  const sales = s.goals.find((g) => g.id === "g-sales" || g.category === "sales");
  if (sales && sales.target < 200) {
    sales.target = 200;
    sales.title = "Sales calls (min 200)";
  }
  if (!s.goals.some((g) => g.id === "g-connected" || g.outcome === "connected")) {
    const connectedGoal = DEFAULT_GOALS.find((g) => g.id === "g-connected");
    if (connectedGoal) s.goals.push(structuredClone(connectedGoal));
  }
  // drop old goals
  s.goals = s.goals.filter((g) => g.id !== "g-agency" && g.id !== "g-meetings");
}

function salesGoalTarget() {
  const g = state.goals.find((g) => g.id === "g-sales" || g.category === "sales");
  return g?.target || 200;
}

function sprintTotals() {
  const totalDays = daysBetween(SPRINT_START, SPRINT_END) + 1;
  const today = clampToSprint(new Date());
  const elapsed = Math.max(1, daysBetween(SPRINT_START, today) + 1);
  const left = Math.max(0, daysBetween(today, SPRINT_END));
  return { totalDays, elapsed, left };
}

function callPace() {
  const target = salesGoalTarget();
  const total = countCategory(null, "sales");
  const { totalDays, elapsed, left } = sprintTotals();
  const remaining = Math.max(0, target - total);
  const needPerDay = left > 0 ? remaining / left : remaining;
  const avgPerDay = total / elapsed;
  const plannedPerDay = target / totalDays;
  const onPace = avgPerDay + 0.05 >= plannedPerDay || total >= target;
  const pct = Math.min(100, Math.round((total / target) * 100));
  return {
    target,
    total,
    remaining,
    needPerDay,
    avgPerDay,
    plannedPerDay,
    onPace,
    pct,
    totalDays,
    elapsed,
    left,
  };
}

function countOutcome(outcome) {
  let n = 0;
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      for (const t of state.days[k][person].tasks) {
        if (t.done && t.outcome === outcome) n += 1;
      }
    }
  }
  return n;
}

function countOutcomePerson(personFilter, outcome) {
  let n = 0;
  for (const k of Object.keys(state.days)) {
    for (const t of state.days[k][personFilter]?.tasks || []) {
      if (t.done && t.outcome === outcome) n += 1;
    }
  }
  return n;
}

// —— Persistence ——
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // migrate v1 if present
    const v1 = localStorage.getItem("infogrid-sprint-tracker-v1");
    return v1 ? JSON.parse(v1) : null;
  } catch {
    return null;
  }
}

function saveLocal() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persist(pushCloud = true) {
  saveLocal();
  if (pushCloud) queueCloudPush();
}

function queueCloudPush() {
  if (!dbRef || applyingRemote) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      syncing = true;
      setSyncUi("live", "CLOUD LIVE · SYNCING");
      await dbRef.set(state);
      setSyncUi("live", "CLOUD LIVE");
      els.syncHint.textContent = `Status: cloud linked · last push ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error(err);
      setSyncUi("error", "SYNC ERROR");
      els.syncHint.textContent = `Push failed: ${err.message}`;
    } finally {
      syncing = false;
    }
  }, 400);
}

function setSyncUi(mode, label) {
  els.syncStatus.classList.remove("is-live", "is-error");
  if (mode === "live") els.syncStatus.classList.add("is-live");
  if (mode === "error") els.syncStatus.classList.add("is-error");
  els.syncStatus.querySelector("span").textContent = label;
}

function loadSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSyncConfig(cfg) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
}

function isCloudLive() {
  return !!(dbRef && loadSyncConfig()?.config && loadSyncConfig()?.vault);
}

function showCloudGate(show) {
  const gate = document.getElementById("cloudGate");
  if (!gate) return;
  const dismissed = localStorage.getItem("infogrid-gate-dismissed") === "1";
  gate.hidden = !show || dismissed || isCloudLive();
}

async function tryLoadHostedCloudConfig() {
  try {
    const res = await fetch("./cloud-config.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.config?.apiKey || !data?.vault) return null;
    return data;
  } catch {
    return null;
  }
}

function downloadCloudConfigFile() {
  const saved = loadSyncConfig();
  if (!saved?.config || !saved?.vault) {
    alert("Connect cloud first, then download the config file for Netlify.");
    return;
  }
  const blob = new Blob(
    [JSON.stringify({ vault: saved.vault, config: saved.config }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cloud-config.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyTeammateInvite() {
  const saved = loadSyncConfig();
  const vault = els.vaultInput.value.trim() || saved?.vault;
  let config = saved?.config;
  if (!config) {
    try {
      config = JSON.parse(els.configInput.value);
    } catch {
      alert("Connect cloud (or paste a valid Firebase config) first.");
      return;
    }
  }
  if (!vault || !config?.apiKey) {
    alert("Need vault code + Firebase config.");
    return;
  }
  const payload = JSON.stringify({ vault, config }, null, 2);
  navigator.clipboard.writeText(payload).then(
    () => {
      els.syncHint.textContent =
        "Invite copied. Teammate: open Sync → paste into Firebase config box → set same vault → Connect.";
      alert("Invite copied. Send it to your teammate (chat/email). They paste it in Sync and Connect.");
    },
    () => {
      prompt("Copy this invite JSON:", payload);
    }
  );
}

function maybeParseInvitePaste(raw) {
  try {
    const data = JSON.parse(raw);
    if (data.vault && data.config) {
      els.vaultInput.value = data.vault;
      els.configInput.value = JSON.stringify(data.config, null, 2);
      return true;
    }
  } catch {
    /* plain firebase config */
  }
  return false;
}

async function connectCloud(config, vault) {
  if (dbRef) {
    dbRef.off();
    dbRef = null;
  }
  const appName = "infogrid-main";
  try {
    await firebase.app(appName).delete();
  } catch {
    /* no existing app */
  }
  const app = firebase.initializeApp(config, appName);
  db = firebase.database(app);
  const safeVault = vault.replace(/[.#$\[\]]/g, "-");
  dbRef = db.ref(`vaults/${safeVault}`);

  return new Promise((resolve, reject) => {
    let first = true;
    dbRef.on(
      "value",
      (snap) => {
        const remote = snap.val();
        if (first) {
          first = false;
          if (!remote) {
            dbRef
              .set(state)
              .then(() => {
                setSyncUi("live", "CLOUD LIVE");
                els.syncHint.textContent = `Status: cloud linked · vault “${safeVault}” seeded from this Mac`;
                resolve();
              })
              .catch(reject);
            return;
          }
          if ((remote.updatedAt || 0) >= (state.updatedAt || 0)) {
            applyingRemote = true;
            state = remote;
            if (!state.goals) state.goals = structuredClone(DEFAULT_GOALS);
            if (!state.days) state.days = {};
            saveLocal();
            applyingRemote = false;
            renderAll();
          } else {
            dbRef.set(state);
          }
          setSyncUi("live", "CLOUD LIVE");
          els.syncHint.textContent = `Status: cloud linked · vault “${safeVault}” · live for both Macs`;
          resolve();
          return;
        }
        if (!remote || syncing) return;
        if ((remote.updatedAt || 0) <= (state.updatedAt || 0)) return;
        applyingRemote = true;
        state = remote;
        if (!state.goals) state.goals = structuredClone(DEFAULT_GOALS);
        if (!state.days) state.days = {};
        saveLocal();
        applyingRemote = false;
        renderAll();
        els.jarvisLine.textContent = "Incoming sync · remote operator updated the vault";
      },
      (err) => {
        setSyncUi("error", "SYNC ERROR");
        els.syncHint.textContent = err.message;
        reject(err);
      }
    );
  });
}

function disconnectCloud() {
  if (dbRef) dbRef.off();
  dbRef = null;
  db = null;
  localStorage.removeItem(SYNC_KEY);
  setSyncUi("", "LOCAL");
  els.syncHint.textContent = "Status: local only. Data is on this browser until cloud is connected.";
  els.vaultInput.value = "";
  els.configInput.value = "";
}

// —— Date helpers ——
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function keyFor(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function clampToSprint(d) {
  const t = startOfDay(d).getTime();
  if (t < SPRINT_START.getTime()) return new Date(SPRINT_START);
  if (t > SPRINT_END.getTime()) return new Date(SPRINT_END);
  return startOfDay(d);
}
function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}
function fmtLong(d) {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtShort(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function uid() {
  return crypto.randomUUID?.() || `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function ensureDay(k) {
  if (!state.days[k]) {
    state.days[k] = {
      varsha: { tasks: [], notes: "", sessions: [] },
      siddharth: { tasks: [], notes: "", sessions: [] },
    };
  }
  for (const person of ["varsha", "siddharth"]) {
    const p = state.days[k][person];
    if (!p.sessions) p.sessions = [];
    if (!Array.isArray(p.tasks)) p.tasks = [];
    if (typeof p.notes !== "string") p.notes = "";
  }
  return state.days[k];
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function sessionMs(person, dayKey, now = Date.now()) {
  const day = state.days[dayKey];
  if (!day) return 0;
  let ms = 0;
  for (const s of day[person].sessions || []) {
    const start = new Date(s.in).getTime();
    const end = s.out ? new Date(s.out).getTime() : now;
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) ms += end - start;
  }
  return ms;
}

function openSession(person, dayKey) {
  const sessions = ensureDay(dayKey)[person].sessions;
  return sessions.find((s) => !s.out) || null;
}

function clockIn(person) {
  const k = keyFor(selectedDate);
  const day = ensureDay(k);
  if (openSession(person, k)) {
    alert("Already clocked in. Clock out first.");
    return;
  }
  day[person].sessions.push({ id: uid(), in: new Date().toISOString(), out: null });
  persist();
  renderAll();
  els.jarvisLine.textContent = `${PEOPLE[person].name} clocked in`;
}

function clockOut(person) {
  const k = keyFor(selectedDate);
  ensureDay(k);
  const open = openSession(person, k);
  if (!open) {
    alert("Not clocked in.");
    return;
  }
  open.out = new Date().toISOString();
  persist();
  renderAll();
  els.jarvisLine.textContent = `${PEOPLE[person].name} clocked out · ${fmtDuration(sessionMs(person, k))}`;
}

function totalHoursForDay(dayKey) {
  return sessionMs("varsha", dayKey) + sessionMs("siddharth", dayKey);
}

function totalHoursSprint(personFilter = null) {
  let ms = 0;
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      if (personFilter && personFilter !== person) continue;
      ms += sessionMs(person, k);
    }
  }
  return ms;
}

// —— Stats ——
function dayStats(person, k) {
  const day = state.days[k];
  if (!day) return { total: 0, done: 0, pct: 0 };
  const tasks = day[person].tasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function countCategory(personFilter, category) {
  let n = 0;
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      if (personFilter && personFilter !== person) continue;
      for (const t of state.days[k][person].tasks) {
        if (t.category === category) n += 1;
      }
    }
  }
  return n;
}

function personSprintPct(person) {
  let total = 0;
  let done = 0;
  for (const k of Object.keys(state.days)) {
    const d = parseKey(k);
    if (d < SPRINT_START || d > SPRINT_END) continue;
    const s = dayStats(person, k);
    total += s.total;
    done += s.done;
  }
  const goalBoost = goalCompletionFor(person);
  if (total === 0 && goalBoost === 0) return 0;
  if (total === 0) return goalBoost;
  return Math.round((done / total) * 70 + goalBoost * 0.3);
}

function goalCompletionFor(person) {
  const goals = state.goals.filter((g) => g.owner === "both" || g.owner === person);
  if (!goals.length) return 0;
  return Math.round(
    goals.reduce((sum, g) => sum + Math.min(100, (countTowardGoal(g) / g.target) * 100), 0) /
      goals.length
  );
}

function countTowardGoal(goal) {
  let auto = 0;
  for (const k of Object.keys(state.days)) {
    const day = state.days[k];
    for (const person of ["varsha", "siddharth"]) {
      if (goal.owner !== "both" && goal.owner !== person) continue;
      for (const t of day[person].tasks) {
        if (!t.done) continue;
        if (goal.outcome) {
          if (t.outcome === goal.outcome) auto += 1;
          continue;
        }
        if (goal.category && t.category === goal.category) auto += 1;
        else if (!goal.category) auto += 1;
      }
    }
  }
  return auto + (goal.manual || 0);
}

function combinedSprintPct() {
  return Math.round((personSprintPct("varsha") + personSprintPct("siddharth")) / 2);
}

function countLoggedDays() {
  let n = 0;
  for (const k of Object.keys(state.days)) {
    const day = state.days[k];
    const has =
      day.varsha.tasks.length > 0 ||
      day.siddharth.tasks.length > 0 ||
      (day.varsha.notes || "").trim() ||
      (day.siddharth.notes || "").trim();
    if (has) n += 1;
  }
  return n;
}

function bothLoggedToday() {
  const day = state.days[keyFor(selectedDate)];
  if (!day) return false;
  return day.varsha.tasks.length > 0 && day.siddharth.tasks.length > 0;
}

function currentStreak() {
  let streak = 0;
  let cursor = startOfDay(new Date());
  if (cursor > SPRINT_END) cursor = new Date(SPRINT_END);
  while (cursor >= SPRINT_START) {
    const k = keyFor(cursor);
    const day = state.days[k];
    const ok =
      day &&
      (day.varsha.tasks.length > 0 || day.siddharth.tasks.length > 0);
    if (!ok) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function monthlySalesBreakdown() {
  const map = {};
  for (const k of Object.keys(state.days)) {
    const d = parseKey(k);
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (!map[label]) map[label] = { varsha: 0, siddharth: 0, total: 0 };
    for (const person of ["varsha", "siddharth"]) {
      const c = state.days[k][person].tasks.filter((t) => t.category === "sales").length;
      map[label][person] += c;
      map[label].total += c;
    }
  }
  return map;
}

function outcomeCounts() {
  const counts = {};
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      for (const t of state.days[k][person].tasks) {
        if (t.category !== "sales") continue;
        const o = t.outcome || "unspecified";
        counts[o] = (counts[o] || 0) + 1;
      }
    }
  }
  return counts;
}

function areaCounts() {
  const counts = {};
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      for (const t of state.days[k][person].tasks) {
        if (t.category !== "sales") continue;
        const area = (t.area || "").trim() || "Unspecified";
        counts[area] = (counts[area] || 0) + 1;
      }
    }
  }
  return counts;
}

function allActivity() {
  const items = [];
  for (const k of Object.keys(state.days)) {
    for (const person of ["varsha", "siddharth"]) {
      for (const t of state.days[k][person].tasks) {
        items.push({
          date: k,
          person,
          title: t.title,
          category: t.category,
          outcome: t.outcome,
          area: t.area,
          createdAt: t.createdAt || k,
        });
      }
    }
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items.slice(0, 40);
}

// —— Render ——
function setRing(el, circ, pct) {
  if (!el) return;
  el.style.strokeDasharray = String(circ);
  el.style.strokeDashoffset = String(circ - (Math.min(100, Math.max(0, pct)) / 100) * circ);
}

function renderHeader() {
  const pace = callPace();
  const booked = countOutcome("connected");
  const v = personSprintPct("varsha");
  const s = personSprintPct("siddharth");
  els.combinedPct.textContent = `${combinedSprintPct()}%`;
  setRing(els.ringVarsha, DUO_CIRC, v);
  setRing(els.ringSid, DUO_CIRC, s);
  els.bothDone.textContent = bothLoggedToday() ? "Yes" : "Not yet";
  els.bothDone.style.color = bothLoggedToday() ? "var(--ok)" : "";
  els.daysLogged.textContent = String(countLoggedDays());
  els.daysLeft.textContent = String(pace.left);
  els.totalCalls.textContent = String(pace.total);
  els.callTarget.textContent = String(pace.target);
  els.callPct.textContent = `${pace.pct}%`;
  els.callBar.style.width = `${pace.pct}%`;
  setRing(els.callRing, CALL_RING, pace.pct);
  els.needPerDay.textContent = pace.needPerDay.toFixed(1);
  els.avgPerDay.textContent = pace.avgPerDay.toFixed(1);
  els.paceStatus.textContent = pace.total >= pace.target ? "Goal hit" : pace.onPace ? "On pace" : "Behind";
  els.paceStatus.className = `pace-chip${pace.total >= pace.target || pace.onPace ? " ok" : " behind"}`;
  els.meetingsBooked.textContent = String(booked);
  els.streak.textContent = String(currentStreak());
  if (els.teamHoursToday) {
    els.teamHoursToday.textContent = fmtDuration(totalHoursForDay(keyFor(selectedDate)));
  }
}

function renderPersonDay(person) {
  const k = keyFor(selectedDate);
  const day = ensureDay(k);
  const list = document.getElementById(`tasks-${person}`);
  const empty = document.getElementById(`empty-${person}`);
  const notes = document.getElementById(`notes-${person}`);
  const pctEl = document.getElementById(person === "varsha" ? "varshaDayPct" : "sidDayPct");

  list.innerHTML = "";
  day[person].tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = `task-item${task.done ? " is-done" : ""}`;
    li.innerHTML = `
      <input class="task-check" type="checkbox" ${task.done ? "checked" : ""} />
      <div class="task-meta">
        <span class="task-title"></span>
        <span class="task-cat"></span>
      </div>
      <button class="task-delete" type="button" aria-label="Delete">×</button>
    `;
    li.querySelector(".task-title").textContent = task.title;
    const outcome = task.outcome ? ` · ${OUTCOME_LABELS[task.outcome] || task.outcome}` : "";
    const area = task.area ? ` · ${task.area}` : "";
    li.querySelector(".task-cat").textContent = `${task.category}${outcome}${area}`;
    li.querySelector(".task-check").addEventListener("change", (e) => {
      task.done = e.target.checked;
      persist();
      renderAll();
    });
    li.querySelector(".task-delete").addEventListener("click", () => {
      day[person].tasks = day[person].tasks.filter((t) => t.id !== task.id);
      persist();
      renderAll();
    });
    list.appendChild(li);
  });

  empty.hidden = day[person].tasks.length > 0;
  if (document.activeElement !== notes) notes.value = day[person].notes || "";
  const stats = dayStats(person, k);
  pctEl.textContent = `${stats.done}/${stats.total} · ${stats.pct}%`;

  renderTimebox(person, k);
}

function renderTimebox(person, dayKey) {
  const open = openSession(person, dayKey);
  const sessions = ensureDay(dayKey)[person].sessions;
  const lastClosed = [...sessions].reverse().find((s) => s.out);
  const firstIn = sessions[0]?.in || open?.in || null;
  const lastOut = open ? null : lastClosed?.out || null;

  const stateEl = document.getElementById(`sessionState-${person}`);
  const inEl = document.getElementById(`clockIn-${person}`);
  const outEl = document.getElementById(`clockOut-${person}`);
  const durEl = document.getElementById(`duration-${person}`);
  const live = document.getElementById(`live-${person}`);
  const box = document.querySelector(`.timebox[data-time="${person}"]`);
  const btnIn = document.querySelector(`.btn-in[data-person="${person}"]`);
  const btnOut = document.querySelector(`.btn-out[data-person="${person}"]`);

  if (!stateEl) return;

  stateEl.textContent = open ? "On shift · live" : sessions.length ? "Off shift" : "Off shift";
  inEl.textContent = fmtTime(open?.in || firstIn);
  outEl.textContent = open ? "Live" : fmtTime(lastOut);
  durEl.textContent = fmtDuration(sessionMs(person, dayKey));
  if (live) live.hidden = !open;
  if (box) box.classList.toggle("is-live", !!open);
  if (btnIn) btnIn.disabled = !!open;
  if (btnOut) btnOut.disabled = !open;
}

function renderToday() {
  els.selectedDateLabel.textContent = fmtLong(selectedDate);
  renderPersonDay("varsha");
  renderPersonDay("siddharth");
}

function renderMonth() {
  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  els.monthLabel.textContent = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = keyFor(startOfDay(new Date()));
  const selectedKey = keyFor(selectedDate);

  els.calendar.innerHTML = "";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
    const h = document.createElement("div");
    h.className = "cal-head";
    h.textContent = d;
    els.calendar.appendChild(h);
  });

  for (let i = 0; i < startPad; i++) {
    const blank = document.createElement("button");
    blank.className = "cal-day";
    blank.disabled = true;
    blank.type = "button";
    els.calendar.appendChild(blank);
  }

  let vTasks = 0,
    sTasks = 0,
    vSales = 0,
    sSales = 0,
    vAds = 0,
    sAds = 0,
    bothDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(y, m, day);
    const k = keyFor(date);
    const inSprint = date >= SPRINT_START && date <= SPRINT_END;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    if (!inSprint) btn.disabled = true;
    if (k === todayKey) btn.classList.add("is-today");
    if (k === selectedKey) btn.classList.add("is-selected");

    const dayData = state.days[k];
    const hasV = dayData?.varsha.tasks.length > 0;
    const hasS = dayData?.siddharth.tasks.length > 0;
    if (dayData) {
      vTasks += dayData.varsha.tasks.length;
      sTasks += dayData.siddharth.tasks.length;
      vSales += dayData.varsha.tasks.filter((t) => t.category === "sales").length;
      sSales += dayData.siddharth.tasks.filter((t) => t.category === "sales").length;
      vAds += dayData.varsha.tasks.filter((t) => t.category === "ads").length;
      sAds += dayData.siddharth.tasks.filter((t) => t.category === "ads").length;
      if (hasV && hasS) bothDays += 1;
    }

    btn.innerHTML = `<span class="num">${day}</span><span class="pips"></span>`;
    const pips = btn.querySelector(".pips");
    if (hasV) {
      const p = document.createElement("i");
      p.className = "pip pip--varsha";
      pips.appendChild(p);
    }
    if (hasS) {
      const p = document.createElement("i");
      p.className = "pip pip--sid";
      pips.appendChild(p);
    }
    if (inSprint) {
      btn.addEventListener("click", () => {
        selectedDate = date;
        switchView("today");
        renderAll();
      });
    }
    els.calendar.appendChild(btn);
  }

  els.monthSummary.innerHTML = `
    <div class="summary-card"><h3>Varsha tasks</h3><strong>${vTasks}</strong></div>
    <div class="summary-card"><h3>Siddharth tasks</h3><strong>${sTasks}</strong></div>
    <div class="summary-card"><h3>Sales calls</h3><strong>${vSales + sSales}</strong></div>
    <div class="summary-card"><h3>Ad sessions</h3><strong>${vAds + sAds}</strong></div>
    <div class="summary-card"><h3>Days both logged</h3><strong>${bothDays}</strong></div>
  `;
}

function barRows(container, rows, green = false) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  container.innerHTML = rows
    .map(
      (r) => `
      <div class="bar-row">
        <span>${r.label}</span>
        <div class="bar-track${green ? " green" : ""}"><i style="width:${Math.round((r.value / max) * 100)}%"></i></div>
        <span>${r.value}</span>
      </div>`
    )
    .join("");
}

function renderLogs() {
  const pace = callPace();
  const totalSales = pace.total;
  const booked = countOutcome("connected");
  const vSales = countCategory("varsha", "sales");
  const sSales = countCategory("siddharth", "sales");
  const conversion = totalSales ? Math.round((booked / totalSales) * 100) : 0;
  const vShare = totalSales ? Math.round((vSales / totalSales) * 100) : 0;
  const sShare = totalSales ? Math.round((sSales / totalSales) * 100) : 0;
  const gatekeepers = countOutcome("gatekeeper");
  const voicemails = countOutcome("voicemail");

  els.avgBoard.innerHTML = `
    <div class="avg-card highlight">
      <h3>Call pace to ${pace.target}</h3>
      <strong>${pace.avgPerDay.toFixed(1)} <small>/ day actual</small></strong>
      <p>Need <b>${pace.needPerDay.toFixed(1)}</b>/day · plan was <b>${pace.plannedPerDay.toFixed(1)}</b>/day · ${pace.left} days left</p>
    </div>
    <div class="avg-card">
      <h3>Owner connect rate</h3>
      <strong>${conversion}%</strong>
      <p>${booked} owner connects from ${totalSales} cold calls</p>
    </div>
    <div class="avg-card">
      <h3>Per person avg</h3>
      <strong>${(pace.avgPerDay / 2).toFixed(1)} <small>/ day each</small></strong>
      <p>Varsha ${vSales} · Siddharth ${sSales} · share ${vShare}% / ${sShare}%</p>
    </div>
    <div class="avg-card">
      <h3>Hours worked (sprint)</h3>
      <strong>${fmtDuration(totalHoursSprint())}</strong>
      <p>Varsha ${fmtDuration(totalHoursSprint("varsha"))} · Sid ${fmtDuration(totalHoursSprint("siddharth"))}</p>
    </div>
  `;

  els.logsKpis.innerHTML = `
    <div class="kpi-card"><h3>Total cold calls</h3><strong>${totalSales}</strong></div>
    <div class="kpi-card"><h3>Owner connected</h3><strong>${booked}</strong></div>
    <div class="kpi-card"><h3>Busy</h3><strong>${countOutcome("busy")}</strong></div>
    <div class="kpi-card"><h3>Voicemail</h3><strong>${voicemails}</strong></div>
    <div class="kpi-card"><h3>Failed</h3><strong>${countOutcome("failed")}</strong></div>
    <div class="kpi-card"><h3>Gatekeeper</h3><strong>${gatekeepers}</strong></div>
  `;

  const monthly = monthlySalesBreakdown();
  const monthRows = Object.keys(monthly)
    .sort((a, b) => new Date(a) - new Date(b))
    .map((label) => ({ label, value: monthly[label].total }));
  if (!monthRows.length) monthRows.push({ label: "No data", value: 0 });
  barRows(els.monthlyCallsChart, monthRows);

  const outcomes = outcomeCounts();
  const outcomeRows = Object.keys(OUTCOME_LABELS).map((key) => ({
    label: OUTCOME_LABELS[key],
    value: outcomes[key] || 0,
  }));
  outcomeRows.push({ label: "Unspecified", value: outcomes.unspecified || 0 });
  barRows(els.outcomesBreakdown, outcomeRows);

  const areas = areaCounts();
  const areaRows = Object.keys(areas)
    .sort((a, b) => areas[b] - areas[a])
    .map((label) => ({ label, value: areas[label] }));
  if (!areaRows.length) areaRows.push({ label: "No areas yet", value: 0 });
  barRows(els.areaBreakdown, areaRows);

  barRows(
    els.operatorCompare,
    [
      { label: "Varsha calls", value: vSales },
      { label: "Sid calls", value: sSales },
      { label: "Varsha owner", value: countOutcomePerson("varsha", "connected") },
      { label: "Sid owner", value: countOutcomePerson("siddharth", "connected") },
    ],
    true
  );

  const feed = allActivity();
  els.activityFeed.innerHTML = feed.length
    ? feed
        .map((item) => {
          const who = PEOPLE[item.person].name;
          const out = item.outcome ? ` · ${OUTCOME_LABELS[item.outcome] || item.outcome}` : "";
          const area = item.area ? ` · ${item.area}` : "";
          return `<li>
            <span class="when">${item.date}</span>
            <span class="who${item.person === "siddharth" ? " sid" : ""}">${who}</span>
            <span>${item.title} <small style="color:var(--muted)">(${item.category}${out}${area})</small></span>
          </li>`;
        })
        .join("")
    : `<li><span class="when">—</span><span class="who">System</span><span>No activity logged yet.</span></li>`;
}

function renderGoals() {
  els.goalsGrid.innerHTML = "";
  state.goals.forEach((goal) => {
    const current = countTowardGoal(goal);
    const pct = Math.min(100, Math.round((current / goal.target) * 100));
    const { left } = sprintTotals();
    const remaining = Math.max(0, goal.target - current);
    const need = left > 0 ? (remaining / left).toFixed(1) : String(remaining);
    const card = document.createElement("article");
    card.className = "goal-card";
    const ownerLabel =
      goal.owner === "both" ? "Both" : PEOPLE[goal.owner]?.name || goal.owner;
    card.innerHTML = `
      <div class="goal-top">
        <div>
          <h3></h3>
          <div class="goal-owner"></div>
        </div>
        <div class="goal-progress-text"></div>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="goal-pace">Need <b>${need}</b> / day to finish on time</div>
      <div class="goal-actions">
        <button type="button" data-act="plus">+1</button>
        <button type="button" data-act="minus">−1</button>
        <button type="button" data-act="edit">Edit target</button>
        <button type="button" data-act="delete">Remove</button>
      </div>
    `;
    card.querySelector("h3").textContent = goal.title;
    card.querySelector(".goal-owner").textContent = `${ownerLabel} · auto from daily logs`;
    card.querySelector(".goal-progress-text").textContent = `${current}/${goal.target} ${goal.unit} · ${pct}%`;
    card.querySelector('[data-act="plus"]').onclick = () => {
      goal.manual = (goal.manual || 0) + 1;
      persist();
      renderAll();
    };
    card.querySelector('[data-act="minus"]').onclick = () => {
      goal.manual = Math.max(0, (goal.manual || 0) - 1);
      persist();
      renderAll();
    };
    card.querySelector('[data-act="edit"]').onclick = () => {
      const next = Number(prompt(`New target for “${goal.title}”`, String(goal.target)));
      if (!Number.isFinite(next) || next < 1) return;
      goal.target = Math.round(next);
      persist();
      renderAll();
    };
    card.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm(`Remove goal “${goal.title}”?`)) return;
      state.goals = state.goals.filter((g) => g.id !== goal.id);
      persist();
      renderAll();
    };
    els.goalsGrid.appendChild(card);
  });
}

function renderAll() {
  renderHeader();
  renderToday();
  renderMonth();
  renderLogs();
  renderGoals();
}

// —— Actions ——
function addTask(person, title, category, outcome = "", area = "") {
  const trimmed = title.trim();
  if (!trimmed) return;
  const day = ensureDay(keyFor(selectedDate));
  day[person].tasks.push({
    id: uid(),
    title: trimmed,
    category,
    outcome: category === "sales" ? outcome || "" : "",
    area: category === "sales" ? (area || "").trim() : "",
    done: true,
    createdAt: new Date().toISOString(),
  });
  persist();
  renderAll();
  els.jarvisLine.textContent = `Logged for ${PEOPLE[person].name}: ${trimmed}`;
}

document.querySelectorAll(".task-form").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(
      form.dataset.person,
      form.title.value,
      form.category.value,
      form.outcome.value,
      form.area.value
    );
    form.reset();
    form.category.value = "sales";
    form.title.focus();
  });
});

document.querySelectorAll(".person").forEach((card) => {
  const person = card.dataset.person;
  card.querySelectorAll(".quick-actions button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      if (cat === "custom") {
        card.querySelector(".task-form").title.focus();
        return;
      }
      if (cat === "sales") {
        const form = card.querySelector(".task-form");
        form.category.value = "sales";
        form.title.value = btn.dataset.quick || "Cold call";
        form.outcome.focus();
        return;
      }
      addTask(person, btn.dataset.quick, cat);
    });
  });
});

document.querySelectorAll("[data-clock]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const person = btn.dataset.person;
    if (btn.dataset.clock === "in") clockIn(person);
    else clockOut(person);
  });
});

["varsha", "siddharth"].forEach((person) => {
  const ta = document.getElementById(`notes-${person}`);
  let timer;
  ta.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureDay(keyFor(selectedDate))[person].notes = ta.value;
      persist();
      renderHeader();
    }, 300);
  });
});

document.getElementById("prevDay").onclick = () => {
  const next = new Date(selectedDate);
  next.setDate(next.getDate() - 1);
  selectedDate = clampToSprint(next);
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderAll();
};
document.getElementById("nextDay").onclick = () => {
  const next = new Date(selectedDate);
  next.setDate(next.getDate() + 1);
  selectedDate = clampToSprint(next);
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderAll();
};
document.getElementById("jumpToday").onclick = () => {
  selectedDate = clampToSprint(new Date());
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderAll();
};
document.getElementById("prevMonth").onclick = () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderMonth();
};
document.getElementById("nextMonth").onclick = () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderMonth();
};

function switchView(name) {
  document.querySelectorAll(".rail-btn").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("is-active", on);
  });
  document.querySelectorAll(".view").forEach((v) => {
    const on = v.id === `view-${name}`;
    v.classList.toggle("is-active", on);
    v.hidden = !on;
  });
  els.dateBar.hidden = name !== "today";
}

document.querySelectorAll(".rail-btn").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

els.goalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(els.goalForm);
  const unit = fd.get("unit");
  const category =
    unit === "sales calls" ? "sales" : unit === "ad sessions" ? "ads" : null;
  state.goals.push({
    id: uid(),
    title: String(fd.get("title")).trim(),
    owner: fd.get("owner"),
    target: Number(fd.get("target")) || 1,
    unit,
    category,
    manual: 0,
  });
  els.goalForm.reset();
  els.goalForm.target.value = "200";
  persist();
  renderGoals();
  renderHeader();
});

document.getElementById("syncForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  // Allow pasting full invite { vault, config }
  maybeParseInvitePaste(els.configInput.value.trim());
  const vault = els.vaultInput.value.trim();
  let config;
  try {
    const raw = JSON.parse(els.configInput.value);
    config = raw.config && raw.apiKey === undefined ? raw.config : raw;
    if (!config.apiKey || !config.databaseURL) {
      throw new Error("Config must include apiKey and databaseURL");
    }
  } catch (err) {
    alert(`Invalid Firebase config: ${err.message}`);
    return;
  }
  try {
    setSyncUi("live", "CONNECTING…");
    await connectCloud(config, vault);
    saveSyncConfig({ config, vault });
    localStorage.removeItem("infogrid-gate-dismissed");
    showCloudGate(false);
    els.jarvisLine.textContent = "Cloud linked · both devices can sync anytime";
  } catch (err) {
    alert(`Could not connect: ${err.message}`);
    setSyncUi("error", "SYNC ERROR");
  }
});

document.getElementById("copyInvite")?.addEventListener("click", copyTeammateInvite);
document.getElementById("downloadCloudConfig")?.addEventListener("click", downloadCloudConfigFile);
document.getElementById("gateOpenSync")?.addEventListener("click", () => {
  document.getElementById("cloudGate").hidden = true;
  switchView("sync");
});
document.getElementById("gateDismiss")?.addEventListener("click", () => {
  localStorage.setItem("infogrid-gate-dismissed", "1");
  showCloudGate(false);
});

document.getElementById("disconnectSync").onclick = () => {
  if (!confirm("Disconnect cloud sync on this device?")) return;
  disconnectCloud();
  showCloudGate(true);
};

document.getElementById("exportData").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `infogrid-sprint-${keyFor(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("importData").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.days || !data.goals) throw new Error("Invalid file");
    state = data;
    persist();
    renderAll();
    alert("Backup imported.");
  } catch {
    alert("Could not import that file.");
  }
  e.target.value = "";
});

document.getElementById("clearData").onclick = async () => {
  if (!confirm("Purge ALL tracker data? This clears local and the cloud vault if connected.")) return;
  state = { days: {}, goals: structuredClone(DEFAULT_GOALS), updatedAt: Date.now() };
  saveLocal();
  if (dbRef) {
    try {
      await dbRef.set(state);
    } catch (err) {
      alert(`Cloud purge failed: ${err.message}`);
    }
  }
  renderAll();
};

// Boot
(function boot() {
  const loaded = loadLocal();
  if (loaded) {
    state = loaded;
    migrateGoals(state);
    saveLocal();
  }
  selectedDate = clampToSprint(startOfDay(new Date()));
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  els.sprintRange.textContent = `${fmtShort(SPRINT_START)} – ${fmtShort(SPRINT_END)}, ${SPRINT_END.getFullYear()}`;
  if (els.callRing) {
    els.callRing.style.strokeDasharray = String(CALL_RING);
    els.callRing.style.strokeDashoffset = String(CALL_RING);
  }
  [els.ringVarsha, els.ringSid].forEach((el) => {
    if (!el) return;
    el.style.strokeDasharray = String(DUO_CIRC);
    el.style.strokeDashoffset = String(DUO_CIRC);
  });

  setInterval(() => {
    els.liveClock.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
  }, 1000);
  setInterval(() => {
    els.jarvisLine.textContent =
      STATUS_LINES[Math.floor(Math.random() * STATUS_LINES.length)];
  }, 12000);
  setInterval(() => {
    const k = keyFor(selectedDate);
    for (const person of ["varsha", "siddharth"]) {
      if (!openSession(person, k)) continue;
      const durEl = document.getElementById(`duration-${person}`);
      if (durEl) durEl.textContent = fmtDuration(sessionMs(person, k));
      if (els.teamHoursToday) {
        els.teamHoursToday.textContent = fmtDuration(totalHoursForDay(k));
      }
    }
  }, 1000);
})();

// Auto-reconnect: localStorage invite, or hosted cloud-config.json
(async () => {
  let saved = loadSyncConfig();
  if (!saved?.config || !saved?.vault) {
    const hosted = await tryLoadHostedCloudConfig();
    if (hosted) {
      saved = hosted;
      saveSyncConfig(hosted);
      els.vaultInput.value = hosted.vault;
      els.configInput.value = JSON.stringify(hosted.config, null, 2);
    }
  }
  if (saved?.config && saved?.vault) {
    els.vaultInput.value = saved.vault;
    els.configInput.value = JSON.stringify(saved.config, null, 2);
    try {
      setSyncUi("live", "CONNECTING…");
      await connectCloud(saved.config, saved.vault);
      showCloudGate(false);
    } catch (err) {
      setSyncUi("error", "SYNC ERROR");
      els.syncHint.textContent = `Reconnect failed: ${err.message}`;
      showCloudGate(true);
    }
  } else {
    showCloudGate(true);
  }
  renderAll();
})();

})();

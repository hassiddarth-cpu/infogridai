(function () {
const STORAGE_KEY = "infogrid-sprint-tracker-v2";
const SYNC_KEY = "infogrid-firebase-sync-v1";
const SPRINT_START = new Date(2026, 7, 10);
const SPRINT_END = new Date(2026, 8, 30);

const PEOPLE = {
  varsha: { name: "Varsha", age: 24, birthday: { month: 2, day: 21 } },
  siddharth: { name: "Siddharth", age: 25, birthday: { month: 1, day: 27 } },
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
  "Infogrid Coach · celebrate skills, punish silence",
  "200-call sprint · every missed dial is lost ground",
  "New skill? Log it — coach will congratulate you",
  "Open leads don’t age well · update stages today",
];

let syncing = false;
let applyingRemote = false;
let db = null;
let dbRef = null;
let saveTimer = null;

// Placeholders — initialized after helpers + DOM are ready
let state = {
  days: {},
  goals: structuredClone(DEFAULT_GOALS),
  callLists: { varsha: [], siddharth: [] },
  updatedAt: Date.now(),
};
let callFilter = "all";
let coachFlash = null;
let coachFlashUntil = 0;
let coachUnread = 0;
let coachAutoCloseTimer = null;
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
  sprintHoursTotal: document.getElementById("sprintHoursTotal"),
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
  coachMood: document.getElementById("coachMood"),
  coachChat: document.getElementById("coachChat"),
  coachBadge: document.getElementById("coachBadge"),
  liveClock: document.getElementById("liveClock"),
  jarvisLine: document.getElementById("jarvisLine"),
  cdMonth: document.getElementById("cdMonth"),
  cdYear: document.getElementById("cdYear"),
  cdVarshaBday: document.getElementById("cdVarshaBday"),
  cdSidBday: document.getElementById("cdSidBday"),
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
  if (!s.callLists) s.callLists = { varsha: [], siddharth: [] };
  if (!Array.isArray(s.callLists.varsha)) s.callLists.varsha = [];
  if (!Array.isArray(s.callLists.siddharth)) s.callLists.siddharth = [];
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
      if (els.syncHint) els.syncHint.textContent = `Status: cloud linked · last push ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error(err);
      setSyncUi("error", "SYNC ERROR");
      if (els.syncHint) els.syncHint.textContent = `Push failed: ${err.message}`;
    } finally {
      syncing = false;
    }
  }, 400);
}

function setSyncUi(mode, label) {
  if (!els.syncStatus) return;
  if (mode === "error") {
    els.syncStatus.classList.remove("is-live");
    els.syncStatus.classList.add("is-error");
    els.syncStatus.querySelector("span").textContent = label || "SYNC ERROR";
    return;
  }
  els.syncStatus.classList.remove("is-error");
  els.syncStatus.classList.add("is-live");
  els.syncStatus.querySelector("span").textContent = "COACH ON";
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

function showCloudGate(_show) {
  /* Sync / cloud onboarding UI removed */
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
  const vault = (els.vaultInput?.value || "").trim() || saved?.vault;
  let config = saved?.config;
  if (!config && els.configInput?.value) {
    try {
      config = JSON.parse(els.configInput.value);
    } catch {
      alert("No Firebase config saved.");
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
      if (els.syncHint) els.syncHint.textContent =
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
      if (els.vaultInput) els.vaultInput.value = data.vault;
      if (els.configInput) els.configInput.value = JSON.stringify(data.config, null, 2);
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
                if (els.syncHint) els.syncHint.textContent = `Status: cloud linked · vault “${safeVault}” seeded from this Mac`;
                resolve();
              })
              .catch(reject);
            return;
          }
          if ((remote.updatedAt || 0) >= (state.updatedAt || 0)) {
            applyingRemote = true;
            state = remote;
            migrateGoals(state);
            if (!state.goals) state.goals = structuredClone(DEFAULT_GOALS);
            if (!state.days) state.days = {};
            saveLocal();
            applyingRemote = false;
            renderAll();
          } else {
            dbRef.set(state);
          }
          setSyncUi("live", "CLOUD LIVE");
          if (els.syncHint) els.syncHint.textContent = `Status: cloud linked · vault “${safeVault}” · live for both Macs`;
          resolve();
          return;
        }
        if (!remote || syncing) return;
        if ((remote.updatedAt || 0) <= (state.updatedAt || 0)) return;
        applyingRemote = true;
        state = remote;
        migrateGoals(state);
        if (!state.goals) state.goals = structuredClone(DEFAULT_GOALS);
        if (!state.days) state.days = {};
        saveLocal();
        applyingRemote = false;
        renderAll();
        els.jarvisLine.textContent = "Incoming sync · remote operator updated the vault";
      },
      (err) => {
        setSyncUi("error", "SYNC ERROR");
        if (els.syncHint) els.syncHint.textContent = err.message;
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
  setSyncUi("", "COACH ON");
  if (els.syncHint) els.syncHint.textContent = "Status: local only.";
  if (els.vaultInput) els.vaultInput.value = "";
  if (els.configInput) els.configInput.value = "";
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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${keyFor(d)} ${fmtTime(iso)}`;
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function nextMonthEnd(from = new Date()) {
  return new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
}

function nextYearEnd(from = new Date()) {
  return new Date(from.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function nextBirthday(month, day, from = new Date()) {
  const today = startOfDay(from);
  let target = new Date(from.getFullYear(), month - 1, day, 0, 0, 0, 0);
  if (target < today) {
    target = new Date(from.getFullYear() + 1, month - 1, day, 0, 0, 0, 0);
  }
  return target;
}

function formatCountdown(target, now = new Date()) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "Done";
  const days = Math.ceil(ms / 86400000);
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function formatBirthdayLine(target, now = new Date()) {
  if (isSameCalendarDay(now, target)) return "Birthday today";
  const days = Math.ceil((startOfDay(target) - startOfDay(now)) / 86400000);
  if (days === 1) return "Birthday tomorrow";
  return `Birthday in ${days} days`;
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function tickCountdowns() {
  const now = new Date();
  if (els.cdMonth) els.cdMonth.textContent = formatCountdown(nextMonthEnd(now), now);
  if (els.cdYear) els.cdYear.textContent = formatCountdown(nextYearEnd(now), now);

  for (const person of ["varsha", "siddharth"]) {
    const { month, day } = PEOPLE[person].birthday;
    const next = nextBirthday(month, day, now);
    const line = document.getElementById(`bdayLine-${person}`);
    if (!line) continue;
    const label = `${String(day).padStart(2, "0")} ${next.toLocaleString("en-GB", { month: "short" })}`;
    line.textContent = `${label} · ${formatBirthdayLine(next, now)}`;
  }
}

function sessionMs(person, dayKey, now = Date.now()) {
  // Hours that fall on this calendar day (overnight sessions split at midnight)
  const dayStart = startOfDay(parseKey(dayKey)).getTime();
  const dayEnd = dayStart + 86400000;
  let ms = 0;
  for (const k of Object.keys(state.days || {})) {
    for (const s of state.days[k]?.[person]?.sessions || []) {
      const start = new Date(s.in).getTime();
      const end = s.out ? new Date(s.out).getTime() : now;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const a = Math.max(start, dayStart);
      const b = Math.min(end, dayEnd);
      if (b > a) ms += b - a;
    }
  }
  return ms;
}

function sessionDurationMs(s, now = Date.now()) {
  const start = new Date(s.in).getTime();
  const end = s.out ? new Date(s.out).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

/** Open shift anywhere (supports overnight across days). */
function findOpenSession(person) {
  let best = null;
  for (const dayKey of Object.keys(state.days || {})) {
    const sessions = state.days[dayKey]?.[person]?.sessions || [];
    for (const s of sessions) {
      if (s.out) continue;
      if (!best || new Date(s.in).getTime() > new Date(best.session.in).getTime()) {
        best = { dayKey, session: s };
      }
    }
  }
  return best;
}

function openSession(person, dayKey) {
  const sessions = ensureDay(dayKey)[person].sessions;
  return sessions.find((s) => !s.out) || null;
}

function renderSessionLog(person, dayKey) {
  const list = document.getElementById(`sessionLog-${person}`);
  const sprintEl = document.getElementById(`sessionSprint-${person}`);
  if (!list) return;
  const sessions = ensureDay(dayKey)[person].sessions || [];
  const openFound = findOpenSession(person);
  const rows = [];

  if (openFound && openFound.dayKey !== dayKey) {
    const s = openFound.session;
    const open = !s.out;
    rows.push(`<li class="session-log__row${open ? " is-live" : ""} session-log__row--carry">
      <span class="session-log__idx">↺</span>
      <span class="session-log__in" title="${fmtDateTime(s.in)}">${fmtDateTime(s.in)}</span>
      <span class="session-log__out">${open ? '<span class="live-tag">Live · clock out anytime</span>' : fmtDateTime(s.out)}</span>
      <span class="session-log__dur">${fmtDuration(sessionDurationMs(s))}</span>
    </li>`);
  }

  if (!sessions.length && !rows.length) {
    list.innerHTML = `<li class="session-log__empty">No clock sessions yet for this day.</li>`;
  } else {
    rows.push(
      ...sessions.map((s, i) => {
        const open = !s.out;
        const inLabel = keyFor(new Date(s.in)) !== dayKey ? fmtDateTime(s.in) : fmtTime(s.in);
        const outLabel = open
          ? '<span class="live-tag">Live</span>'
          : keyFor(new Date(s.out)) !== dayKey
            ? fmtDateTime(s.out)
            : fmtTime(s.out);
        return `<li class="session-log__row${open ? " is-live" : ""}">
          <span class="session-log__idx">#${i + 1}</span>
          <span class="session-log__in" title="${fmtDateTime(s.in)}">${inLabel}</span>
          <span class="session-log__out">${outLabel}</span>
          <span class="session-log__dur">${fmtDuration(sessionDurationMs(s))}</span>
        </li>`;
      })
    );
    list.innerHTML = rows.join("");
  }
  if (sprintEl) {
    sprintEl.innerHTML = `Sprint total · <b>${fmtDuration(totalHoursSprint(person))}</b>`;
  }
}

function clockIn(person) {
  if (findOpenSession(person)) {
    alert("Already clocked in — including an overnight shift. Clock out first.");
    return;
  }
  // Store on the calendar day of the clock-in moment (selected day if browsing history)
  const k = keyFor(selectedDate);
  const day = ensureDay(k);
  day[person].sessions.push({ id: uid(), in: new Date().toISOString(), out: null });
  persist();
  renderAll();
  celebrate(`${PEOPLE[person].name} clocked in. Best of luck this session — make the hours count.`, "good");
}

function clockOut(person) {
  const found = findOpenSession(person);
  if (!found) {
    alert("Not clocked in.");
    return;
  }
  found.session.out = new Date().toISOString();
  persist();
  renderAll();
  const started = keyFor(new Date(found.session.in));
  const ended = keyFor(new Date(found.session.out));
  const overnight = started !== ended ? ` (overnight ${started} → ${ended})` : "";
  els.jarvisLine.textContent = `${PEOPLE[person].name} clocked out · ${fmtDuration(sessionDurationMs(found.session))}${overnight}`;
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
      for (const s of state.days[k][person].sessions || []) {
        const dur = fmtDuration(sessionDurationMs(s));
        items.push({
          date: k,
          person,
          title: s.out
            ? `Clock out · ${dur} session`
            : `Clock in · live (${dur} so far)`,
          category: "hours",
          outcome: null,
          area: `${fmtTime(s.in)} → ${s.out ? fmtTime(s.out) : "live"}`,
          createdAt: s.out || s.in,
        });
      }
    }
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items.slice(0, 50);
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
  if (els.sprintHoursTotal) {
    const sprintMs = totalHoursSprint();
    els.sprintHoursTotal.textContent = fmtDuration(sprintMs);
    els.sprintHoursTotal.title = `Varsha ${fmtDuration(totalHoursSprint("varsha"))} · Siddharth ${fmtDuration(totalHoursSprint("siddharth"))}`;
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
  const openFound = findOpenSession(person);
  const open = openFound?.session || null;
  const openDayKey = openFound?.dayKey || null;
  const sessions = ensureDay(dayKey)[person].sessions;
  const lastClosed = [...sessions].reverse().find((s) => s.out);
  const firstIn = open?.in || sessions[0]?.in || null;
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

  if (open && openDayKey && openDayKey !== dayKey) {
    stateEl.textContent = `On shift · since ${openDayKey}`;
  } else if (open) {
    stateEl.textContent = "On shift · live";
  } else {
    stateEl.textContent = "Off shift";
  }
  inEl.textContent = open
    ? (openDayKey !== dayKey ? fmtDateTime(open.in) : fmtTime(open.in))
    : fmtTime(firstIn);
  outEl.textContent = open ? "Live" : fmtTime(lastOut);
  // Live overnight: show full shift length; otherwise hours that land on this day
  durEl.textContent = open
    ? fmtDuration(sessionDurationMs(open))
    : fmtDuration(sessionMs(person, dayKey));
  if (live) live.hidden = !open;
  if (box) box.classList.toggle("is-live", !!open);
  if (btnIn) btnIn.disabled = !!open;
  if (btnOut) btnOut.disabled = !open;
  renderSessionLog(person, dayKey);
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
    bothDays = 0,
    monthConnects = 0;

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
      monthConnects += dayData.varsha.tasks.filter((t) => t.outcome === "connected").length;
      monthConnects += dayData.siddharth.tasks.filter((t) => t.outcome === "connected").length;
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
    <div class="summary-card"><h3>Owner connects</h3><strong>${monthConnects}</strong></div>
  `;

  const dailyV = [];
  const dailyS = [];
  const outcomeMonth = { connected: 0, busy: 0, voicemail: 0, failed: 0, gatekeeper: 0 };
  let hoursV = 0;
  let hoursS = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(y, m, day);
    const k = keyFor(date);
    const dayData = state.days[k];
    const v = dayData ? dayData.varsha.tasks.filter((t) => t.category === "sales").length : 0;
    const s = dayData ? dayData.siddharth.tasks.filter((t) => t.category === "sales").length : 0;
    dailyV.push(v);
    dailyS.push(s);
    hoursV += sessionMs("varsha", k);
    hoursS += sessionMs("siddharth", k);
    if (dayData) {
      for (const person of ["varsha", "siddharth"]) {
        for (const t of dayData[person].tasks) {
          if (t.outcome && outcomeMonth[t.outcome] != null) outcomeMonth[t.outcome] += 1;
        }
      }
    }
  }

  const monthDaily = document.getElementById("monthDailyChart");
  if (monthDaily) {
    monthDaily.innerHTML = svgLineSeries([
      { name: "Varsha", color: "#4aa3ff", points: dailyV },
      { name: "Siddharth", color: "#ff5ec8", points: dailyS },
    ]);
  }
  const monthCompare = document.getElementById("monthCompareChart");
  if (monthCompare) {
    monthCompare.innerHTML = svgDualBars([
      { label: "Tasks", a: vTasks, b: sTasks },
      { label: "Sales", a: vSales, b: sSales },
      { label: "Ads", a: vAds, b: sAds },
    ]);
  }
  const monthOutcome = document.getElementById("monthOutcomeChart");
  if (monthOutcome) {
    monthOutcome.innerHTML = svgDonut([
      { label: "Connected", value: outcomeMonth.connected, color: "#3dd68c" },
      { label: "Busy", value: outcomeMonth.busy, color: "#f5c542" },
      { label: "Voicemail", value: outcomeMonth.voicemail, color: "#4aa3ff" },
      { label: "Failed", value: outcomeMonth.failed, color: "#ff6b7a" },
      { label: "Gatekeeper", value: outcomeMonth.gatekeeper, color: "#ff5ec8" },
    ]);
  }
  const monthHours = document.getElementById("monthHoursChart");
  if (monthHours) {
    monthHours.innerHTML = svgDualBars([
      {
        label: "Hours",
        a: Math.round(hoursV / 3600000 * 10) / 10,
        b: Math.round(hoursS / 3600000 * 10) / 10,
      },
    ]);
  }
}


// —— Chart helpers (SVG) ——
function chartEmpty(msg = "No data yet") {
  return `<div class="chart-empty">${escapeHtml(msg)}</div>`;
}

function svgDualBars(groups) {
  // groups: [{ label, a, b }]
  if (!groups.length) return chartEmpty();
  const w = 360, h = 160, pad = 28, gap = 10;
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const slot = (w - pad * 2) / groups.length;
  const barW = Math.max(6, (slot - gap) / 2);
  let bars = "";
  groups.forEach((g, i) => {
    const x0 = pad + i * slot;
    const ha = (g.a / max) * (h - pad - 20);
    const hb = (g.b / max) * (h - pad - 20);
    bars += `<rect x="${x0}" y="${h - pad - ha}" width="${barW}" height="${ha}" rx="3" fill="#4aa3ff"/>`;
    bars += `<rect x="${x0 + barW + 3}" y="${h - pad - hb}" width="${barW}" height="${hb}" rx="3" fill="#ff5ec8"/>`;
    bars += `<text x="${x0 + barW}" y="${h - 8}" text-anchor="middle" fill="#93a0bb" font-size="9">${escapeHtml(g.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${bars}
    <text x="${pad}" y="14" fill="#4aa3ff" font-size="10">Varsha</text>
    <text x="${pad + 52}" y="14" fill="#ff5ec8" font-size="10">Siddharth</text>
  </svg>`;
}

function svgLineSeries(seriesList) {
  // seriesList: [{ name, color, points: number[] }], labels optional via length
  const points = seriesList[0]?.points || [];
  if (!points.length) return chartEmpty();
  const w = 420, h = 160, pad = 28;
  const all = seriesList.flatMap((s) => s.points);
  const max = Math.max(1, ...all);
  const n = Math.max(...seriesList.map((s) => s.points.length));
  const xAt = (i) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const yAt = (v) => h - pad - (v / max) * (h - pad - 16);
  let paths = "";
  seriesList.forEach((s) => {
    const d = s.points.map((v, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(v)}`).join(" ");
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round"/>`;
    s.points.forEach((v, i) => {
      paths += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3" fill="${s.color}"/>`;
    });
  });
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${paths}</svg>`;
}

function svgDonut(segments) {
  // [{ label, value, color }]
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return chartEmpty();
  const r = 46, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = (s.value / total) * circ;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16"
      stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return el;
  }).join("");
  const legend = segments.map((s, i) =>
    `<text x="150" y="${28 + i * 16}" fill="${s.color}" font-size="11">${escapeHtml(s.label)} · ${s.value}</text>`
  ).join("");
  return `<svg viewBox="0 0 300 140" role="img">${arcs}
    <circle cx="${cx}" cy="${cy}" r="30" fill="#0a0e1c"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#f2f5ff" font-size="14" font-weight="700">${total}</text>
    ${legend}</svg>`;
}

function svgHBars(rows, color = "#4aa3ff") {
  if (!rows.length) return chartEmpty();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const rowH = 26;
  const w = 360, h = rows.length * rowH + 10;
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${rows.map((r, i) => {
    const y = i * rowH + 4;
    const bw = Math.max(2, (r.value / max) * 200);
    return `<text x="0" y="${y + 12}" fill="#93a0bb" font-size="10">${escapeHtml(r.label)}</text>
      <rect x="110" y="${y}" width="${bw}" height="14" rx="4" fill="${r.color || color}"/>
      <text x="${120 + bw}" y="${y + 12}" fill="#f2f5ff" font-size="10">${r.value}</text>`;
  }).join("")}</svg>`;
}

function svgFunnel(steps) {
  if (!steps.length) return chartEmpty();
  const max = Math.max(1, ...steps.map((s) => s.value));
  const w = 420, h = steps.length * 34 + 8;
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${steps.map((s, i) => {
    const bw = 80 + (s.value / max) * 280;
    const x = (w - bw) / 2;
    const y = i * 34 + 4;
    return `<rect x="${x}" y="${y}" width="${bw}" height="26" rx="8" fill="${s.color}"/>
      <text x="${w / 2}" y="${y + 17}" text-anchor="middle" fill="#061018" font-size="11" font-weight="700">${escapeHtml(s.label)} · ${s.value}</text>`;
  }).join("")}</svg>`;
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
  const busy = countOutcome("busy");
  const voicemails = countOutcome("voicemail");
  const failed = countOutcome("failed");
  const gatekeepers = countOutcome("gatekeeper");
  const vHours = totalHoursSprint("varsha");
  const sHours = totalHoursSprint("siddharth");

  if (els.avgBoard) {
    els.avgBoard.innerHTML = `
      <div class="avg-card highlight">
        <h3>Call pace to ${pace.target}</h3>
        <strong>${pace.avgPerDay.toFixed(1)} <small>/ day</small></strong>
        <p>Need <b>${pace.needPerDay.toFixed(1)}</b>/day · ${pace.left} days left</p>
      </div>
      <div class="avg-card">
        <h3>Owner connect rate</h3>
        <strong>${conversion}%</strong>
        <p>${booked} connects / ${totalSales} calls</p>
      </div>
      <div class="avg-card">
        <h3>Share</h3>
        <strong>${vShare}% / ${sShare}%</strong>
        <p>Varsha ${vSales} · Siddharth ${sSales}</p>
      </div>
      <div class="avg-card">
        <h3>Sprint hours</h3>
        <strong>${fmtDuration(vHours + sHours)}</strong>
        <p>V ${fmtDuration(vHours)} · S ${fmtDuration(sHours)}</p>
      </div>
    `;
  }

  if (els.logsKpis) {
    els.logsKpis.innerHTML = `
      <div class="kpi-card"><h3>Cold calls</h3><strong>${totalSales}</strong></div>
      <div class="kpi-card"><h3>Connected</h3><strong>${booked}</strong></div>
      <div class="kpi-card"><h3>Busy</h3><strong>${busy}</strong></div>
      <div class="kpi-card"><h3>Voicemail</h3><strong>${voicemails}</strong></div>
      <div class="kpi-card"><h3>Failed</h3><strong>${failed}</strong></div>
      <div class="kpi-card"><h3>Gatekeeper</h3><strong>${gatekeepers}</strong></div>
      <div class="kpi-card"><h3>Open leads</h3><strong>${(state.callLists?.varsha||[]).filter(l=>!l.stage).length + (state.callLists?.siddharth||[]).filter(l=>!l.stage).length}</strong></div>
      <div class="kpi-card"><h3>Streak</h3><strong>${currentStreak()}</strong></div>
    `;
  }

  const daily = dailySalesSeries(14);
  const trendEl = els.monthlyCallsChart;
  if (trendEl) {
    trendEl.innerHTML = svgLineSeries([
      { name: "Varsha", color: "#4aa3ff", points: daily.varsha },
      { name: "Siddharth", color: "#ff5ec8", points: daily.siddharth },
      { name: "Total", color: "#3dd68c", points: daily.total },
    ]);
  }

  const outcomes = outcomeCounts();
  const donutEl = els.outcomesBreakdown;
  if (donutEl) {
    donutEl.innerHTML = svgDonut([
      { label: "Connected", value: outcomes.connected || 0, color: "#3dd68c" },
      { label: "Busy", value: outcomes.busy || 0, color: "#f5c542" },
      { label: "Voicemail", value: outcomes.voicemail || 0, color: "#4aa3ff" },
      { label: "Failed", value: outcomes.failed || 0, color: "#ff6b7a" },
      { label: "Gatekeeper", value: outcomes.gatekeeper || 0, color: "#ff5ec8" },
    ]);
  }

  const teamEl = els.operatorCompare;
  if (teamEl) {
    teamEl.innerHTML = svgDualBars([
      { label: "Calls", a: vSales, b: sSales },
      { label: "Owner", a: countOutcomePerson("varsha", "connected"), b: countOutcomePerson("siddharth", "connected") },
      { label: "Skills", a: countCategory("varsha", "skill") + countCategory("varsha", "learning") + countCategory("varsha", "ads"), b: countCategory("siddharth", "skill") + countCategory("siddharth", "learning") + countCategory("siddharth", "ads") },
    ]);
  }

  const areas = areaCounts();
  const areaRows = Object.keys(areas)
    .sort((a, b) => areas[b] - areas[a])
    .slice(0, 8)
    .map((label) => ({ label, value: areas[label], color: "#4aa3ff" }));
  const areaEl = els.areaBreakdown;
  if (areaEl) areaEl.innerHTML = svgHBars(areaRows.length ? areaRows : [{ label: "No areas", value: 0 }]);

  const hoursEl = document.getElementById("hoursChart");
  if (hoursEl) {
    hoursEl.innerHTML = svgDualBars([
      { label: "Hours", a: Math.round(vHours / 3600000 * 10) / 10, b: Math.round(sHours / 3600000 * 10) / 10 },
    ]);
  }

  const paceEl = document.getElementById("paceChart");
  if (paceEl) {
    paceEl.innerHTML = svgHBars([
      { label: "Actual/day", value: Math.round(pace.avgPerDay * 10) / 10, color: "#3dd68c" },
      { label: "Need/day", value: Math.round(pace.needPerDay * 10) / 10, color: "#f5c542" },
      { label: "Plan/day", value: Math.round(pace.plannedPerDay * 10) / 10, color: "#4aa3ff" },
      { label: "Total calls", value: totalSales, color: "#ff5ec8" },
    ]);
  }

  const funnelEl = document.getElementById("funnelChart");
  if (funnelEl) {
    const openLeads =
      (state.callLists?.varsha || []).filter((l) => !l.stage).length +
      (state.callLists?.siddharth || []).filter((l) => !l.stage).length;
    funnelEl.innerHTML = svgFunnel([
      { label: "Open leads", value: openLeads, color: "#93a0bb" },
      { label: "Calls logged", value: totalSales, color: "#4aa3ff" },
      { label: "Gatekeeper", value: gatekeepers, color: "#ff5ec8" },
      { label: "Owner connected", value: booked, color: "#3dd68c" },
    ]);
  }

  const cumEl = document.getElementById("cumulativeChart");
  if (cumEl) {
    const cum = cumulativeSalesSeries();
    cumEl.innerHTML = svgLineSeries([
      { name: "Varsha", color: "#4aa3ff", points: cum.varsha },
      { name: "Siddharth", color: "#ff5ec8", points: cum.siddharth },
      { name: "Team", color: "#3dd68c", points: cum.total },
    ]);
  }

  const skillsEl = document.getElementById("skillsChart");
  if (skillsEl) {
    skillsEl.innerHTML = svgDualBars([
      {
        label: "Skills",
        a: countCategory("varsha", "skill") + countCategory("varsha", "learning"),
        b: countCategory("siddharth", "skill") + countCategory("siddharth", "learning"),
      },
      {
        label: "Ads",
        a: countCategory("varsha", "ads"),
        b: countCategory("siddharth", "ads"),
      },
    ]);
  }

  const listEl = document.getElementById("listHealthChart");
  if (listEl) {
    const vL = state.callLists?.varsha || [];
    const sL = state.callLists?.siddharth || [];
    listEl.innerHTML = svgDualBars([
      { label: "Open", a: vL.filter((l) => !l.stage).length, b: sL.filter((l) => !l.stage).length },
      { label: "Staged", a: vL.filter((l) => !!l.stage).length, b: sL.filter((l) => !!l.stage).length },
      { label: "Owner", a: vL.filter((l) => l.stage === "connected").length, b: sL.filter((l) => l.stage === "connected").length },
    ]);
  }

  const rateEl = document.getElementById("connectRateChart");
  if (rateEl) {
    const vRate = vSales ? Math.round((countOutcomePerson("varsha", "connected") / vSales) * 100) : 0;
    const sRate = sSales ? Math.round((countOutcomePerson("siddharth", "connected") / sSales) * 100) : 0;
    rateEl.innerHTML = svgHBars([
      { label: "Varsha %", value: vRate, color: "#4aa3ff" },
      { label: "Sid %", value: sRate, color: "#ff5ec8" },
      { label: "Team %", value: conversion, color: "#3dd68c" },
    ]);
  }

  const weekEl = document.getElementById("weeklyStackChart");
  if (weekEl) {
    weekEl.innerHTML = svgWeeklyStack(weeklySalesBuckets());
  }

  const feed = allActivity();
  if (els.activityFeed) {
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
}

function dailySalesSeries(days = 14) {
  const varsha = [];
  const siddharth = [];
  const total = [];
  const end = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const k = keyFor(d);
    const day = state.days[k];
    const v = day ? day.varsha.tasks.filter((t) => t.category === "sales").length : 0;
    const s = day ? day.siddharth.tasks.filter((t) => t.category === "sales").length : 0;
    varsha.push(v);
    siddharth.push(s);
    total.push(v + s);
  }
  return { varsha, siddharth, total };
}


function cumulativeSalesSeries() {
  const days = dailySalesSeries(21);
  const out = { varsha: [], siddharth: [], total: [] };
  let av = 0, as_ = 0, at = 0;
  for (let i = 0; i < days.varsha.length; i++) {
    av += days.varsha[i];
    as_ += days.siddharth[i];
    at += days.total[i];
    out.varsha.push(av);
    out.siddharth.push(as_);
    out.total.push(at);
  }
  return out;
}

function weeklySalesBuckets() {
  const buckets = [];
  const end = startOfDay(new Date());
  for (let w = 5; w >= 0; w--) {
    let v = 0, s = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(end);
      day.setDate(end.getDate() - (w * 7 + d));
      const k = keyFor(day);
      const data = state.days[k];
      if (!data) continue;
      v += data.varsha.tasks.filter((t) => t.category === "sales").length;
      s += data.siddharth.tasks.filter((t) => t.category === "sales").length;
    }
    buckets.push({ label: `W-${w === 0 ? "now" : w}`, a: v, b: s });
  }
  return buckets;
}

function svgWeeklyStack(buckets) {
  return svgDualBars(buckets);
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

// —— Calling lists (Excel / CSV) ——
const CALL_HEADER_MAP = {
  businessname: "businessName",
  business: "businessName",
  name: "businessName",
  company: "businessName",
  companyname: "businessName",
  address: "address",
  phone: "phone",
  phonenumber: "phone",
  phoneno: "phone",
  mobile: "phone",
  googlemaplink: "mapLink",
  googlemapslink: "mapLink",
  googlemaps: "mapLink",
  googlemap: "mapLink",
  maplink: "mapLink",
  map: "mapLink",
  maps: "mapLink",
  stage: "stage",
  result: "stage",
  outcome: "stage",
  status: "stage",
  person: "person",
  caller: "person",
};

function normalizeHeaderKey(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeStage(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!s) return "";
  if (OUTCOME_LABELS[s]) return s;
  if (s.includes("owner") || s.includes("connect")) return "connected";
  if (s.includes("busy")) return "busy";
  if (s.includes("voice") || s === "vm") return "voicemail";
  if (s.includes("fail") || s.includes("wrong") || s.includes("not owner") || s.includes("customer")) {
    return "failed";
  }
  if (s.includes("gate") || s.includes("reception")) return "gatekeeper";
  return "";
}

function normalizePersonKey(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (s.startsWith("var")) return "varsha";
  if (s.startsWith("sid")) return "siddharth";
  return "";
}

function sheetNameToPerson(name, index) {
  const key = normalizePersonKey(name);
  if (key) return key;
  if (index === 0) return "varsha";
  if (index === 1) return "siddharth";
  return "";
}

function rowsToLeads(rows) {
  if (!rows?.length) return [];
  const headers = rows[0].map((h) => CALL_HEADER_MAP[normalizeHeaderKey(h)] || "");
  const leads = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.some((c) => String(c || "").trim())) continue;
    const obj = {
      businessName: "",
      address: "",
      phone: "",
      mapLink: "",
      stage: "",
      person: "",
    };
    headers.forEach((field, idx) => {
      if (!field) return;
      obj[field] = String(row[idx] ?? "").trim();
    });
    if (!obj.businessName && !obj.phone) continue;
    leads.push({
      id: uid(),
      businessName: obj.businessName || "Untitled business",
      address: obj.address || "",
      phone: obj.phone || "",
      mapLink: obj.mapLink || "",
      stage: normalizeStage(obj.stage),
      person: normalizePersonKey(obj.person),
      updatedAt: Date.now(),
    });
  }
  return leads;
}

function parseCsvText(text) {
  const wb = XLSX.read(text, { type: "string", FS: "," });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

async function parseCallWorkbook(file) {
  if (typeof XLSX === "undefined") {
    throw new Error("Sheet library failed to load. Refresh and try again.");
  }
  const name = (file.name || "").toLowerCase();
  const isCsv = name.endsWith(".csv") || file.type === "text/csv";
  const lists = { varsha: [], siddharth: [] };

  if (isCsv) {
    const text = await file.text();
    const rows = parseCsvText(text);
    const leads = rowsToLeads(rows);
    const hasPersonCol = leads.some((l) => l.person);
    if (hasPersonCol) {
      for (const lead of leads) {
        const p = lead.person || "varsha";
        if (lists[p]) lists[p].push({ ...lead, person: undefined });
      }
    } else {
      const choice = prompt(
        "CSV has one sheet. Type varsha or siddharth for this file (or cancel).",
        "varsha"
      );
      const p = normalizePersonKey(choice);
      if (!p) throw new Error("Cancelled or invalid person for CSV.");
      lists[p] = leads.map(({ person, ...rest }) => rest);
    }
    return lists;
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const named = { varsha: false, siddharth: false };

  wb.SheetNames.forEach((sheetName, index) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    const leads = rowsToLeads(rows);
    const hasPersonCol = leads.some((l) => l.person);
    if (hasPersonCol) {
      for (const lead of leads) {
        const p = lead.person;
        if (!p || !lists[p]) continue;
        const { person: _p, ...rest } = lead;
        lists[p].push(rest);
        named[p] = true;
      }
      return;
    }
    const person = sheetNameToPerson(sheetName, index);
    if (!person || !lists[person]) return;
    if (index >= 2 && !normalizePersonKey(sheetName)) return;
    lists[person] = leads.map(({ person: _p, ...rest }) => rest);
    named[person] = true;
  });

  return lists;
}

function applyCallLists(incoming, append) {
  migrateGoals(state);
  for (const person of ["varsha", "siddharth"]) {
    const next = incoming[person] || [];
    if (!next.length && append) continue;
    state.callLists[person] = append
      ? [...(state.callLists[person] || []), ...next]
      : next;
  }
  persist();
  renderAll();
  coachAfterSheetUpload(incoming);
}

function setLeadStage(person, leadId, stage) {
  migrateGoals(state);
  const lead = (state.callLists[person] || []).find((l) => l.id === leadId);
  if (!lead) return;
  const prev = lead.stage || "";
  lead.stage = stage || "";
  lead.updatedAt = Date.now();
  if (stage && stage !== prev) {
    const areaGuess = (lead.address || "").split(",")[0]?.trim() || "";
    addTask(person, lead.businessName || "Cold call", "sales", stage, areaGuess);
    return;
  }
  if (!stage && prev) {
    celebrate(
      `${PEOPLE[person].name}: “${lead.businessName}” is back to not called. Half-updated lists waste the sprint — finish the stage.`,
      "bad"
    );
  }
  persist();
  renderCalling();
  renderCoach();
}

function renderCalling() {
  migrateGoals(state);
  for (const person of ["varsha", "siddharth"]) {
    const listEl = document.getElementById(`callList-${person}`);
    const emptyEl = document.getElementById(`callEmpty-${person}`);
    const countEl = document.getElementById(`callCount-${person}`);
    if (!listEl) continue;
    listEl.innerHTML = "";
    let leads = state.callLists[person] || [];
    if (callFilter === "open") leads = leads.filter((l) => !l.stage);
    if (callFilter === "done") leads = leads.filter((l) => !!l.stage);
    if (countEl) {
      const total = (state.callLists[person] || []).length;
      const open = (state.callLists[person] || []).filter((l) => !l.stage).length;
      countEl.textContent = `${total} leads · ${open} open`;
    }
    if (emptyEl) emptyEl.hidden = leads.length > 0;
    for (const lead of leads) {
      const card = document.createElement("article");
      card.className = "call-card";
      const phoneHref = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : "";
      const mapHref = lead.mapLink || "";
      card.innerHTML = `
        <h4></h4>
        <p class="call-meta"></p>
        <div class="call-links"></div>
        <div class="call-stage">
          <label>Stage</label>
          <select>
            <option value="">Not called</option>
            <option value="connected">Owner connected</option>
            <option value="busy">Busy</option>
            <option value="voicemail">Voicemail</option>
            <option value="failed">Failed</option>
            <option value="gatekeeper">Gatekeeper</option>
          </select>
        </div>`;
      card.querySelector("h4").textContent = lead.businessName;
      card.querySelector(".call-meta").textContent = lead.address || "No address";
      const links = card.querySelector(".call-links");
      if (phoneHref) {
        const a = document.createElement("a");
        a.href = phoneHref;
        a.textContent = lead.phone;
        links.appendChild(a);
      } else {
        const span = document.createElement("span");
        span.textContent = "No phone";
        links.appendChild(span);
      }
      if (mapHref) {
        const a = document.createElement("a");
        a.href = mapHref;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Map";
        links.appendChild(a);
      }
      const select = card.querySelector("select");
      select.value = lead.stage || "";
      select.onchange = () => setLeadStage(person, lead.id, select.value);
      listEl.appendChild(card);
    }
  }

  const vList = state.callLists.varsha || [];
  const sList = state.callLists.siddharth || [];
  const stageKeys = ["connected", "busy", "voicemail", "failed", "gatekeeper"];
  const progressEl = document.getElementById("callingProgressChart");
  if (progressEl) {
    progressEl.innerHTML = svgDualBars([
      { label: "Total", a: vList.length, b: sList.length },
      { label: "Open", a: vList.filter((l) => !l.stage).length, b: sList.filter((l) => !l.stage).length },
      { label: "Done", a: vList.filter((l) => !!l.stage).length, b: sList.filter((l) => !!l.stage).length },
    ]);
  }
  const stageEl = document.getElementById("callingStageChart");
  if (stageEl) {
    stageEl.innerHTML = svgDualBars(
      stageKeys.map((key) => ({
        label: OUTCOME_LABELS[key].split(" ")[0],
        a: vList.filter((l) => l.stage === key).length,
        b: sList.filter((l) => l.stage === key).length,
      }))
    );
  }
  const todayEl = document.getElementById("callingTodayChart");
  if (todayEl) {
    const todayKey = keyFor(startOfDay(new Date()));
    const v = personDayStats("varsha", todayKey);
    const s = personDayStats("siddharth", todayKey);
    todayEl.innerHTML = svgDualBars([
      { label: "Calls", a: v.sales, b: s.sales },
      { label: "Owner", a: v.connects, b: s.connects },
      { label: "Skills", a: v.skills, b: s.skills },
    ]);
  }
}

function downloadCallTemplate() {
  if (typeof XLSX === "undefined") {
    alert("Sheet library failed to load. Refresh and try again.");
    return;
  }
  const headers = ["Business name", "Address", "Phone number", "Google map link", "Stage"];
  const sample = [
    headers,
    ["Acme Dental", "Houston, TX", "7135550100", "https://maps.google.com/?q=Houston", ""],
    ["Blue Cafe", "Dallas, TX", "2145550199", "https://maps.google.com/?q=Dallas", "busy"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sample), "Varsha");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), "Siddharth");
  XLSX.writeFile(wb, "infogrid-calling-template.xlsx");
}

function exportCallListsExcel() {
  if (typeof XLSX === "undefined") {
    alert("Sheet library failed to load. Refresh and try again.");
    return;
  }
  migrateGoals(state);
  const wb = XLSX.utils.book_new();
  for (const [person, sheetName] of [
    ["varsha", "Varsha"],
    ["siddharth", "Siddharth"],
  ]) {
    const rows = [
      ["Business name", "Address", "Phone number", "Google map link", "Stage"],
      ...(state.callLists[person] || []).map((l) => [
        l.businessName,
        l.address,
        l.phone,
        l.mapLink,
        OUTCOME_LABELS[l.stage] || l.stage || "",
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  XLSX.writeFile(wb, `infogrid-calling-${keyFor(new Date())}.xlsx`);
}


function setCoachOpen(open, opts = {}) {
  const { autoCloseMs = 0, compact = false } = opts;
  const panel = document.getElementById("aiCoach");
  const fab = document.getElementById("coachFab");
  if (!panel) return;
  clearTimeout(coachAutoCloseTimer);
  panel.hidden = !open;
  panel.classList.toggle("is-compact", !!(open && compact));
  if (fab) fab.classList.toggle("is-open", !!open);
  if (open) {
    coachUnread = 0;
    if (els.coachBadge) els.coachBadge.hidden = true;
    if (autoCloseMs > 0) {
      coachAutoCloseTimer = setTimeout(() => {
        setCoachOpen(false);
      }, autoCloseMs);
    }
  }
}

function bumpCoachBadge() {
  coachUnread += 1;
  if (!els.coachBadge) return;
  const panel = document.getElementById("aiCoach");
  if (panel && !panel.hidden) {
    els.coachBadge.hidden = true;
    coachUnread = 0;
    return;
  }
  els.coachBadge.hidden = false;
  els.coachBadge.textContent = String(Math.min(coachUnread, 9));
}

function showCoachToast(message, kind = "good") {
  const toast = document.getElementById("coachToast");
  if (!toast) return;
  toast.hidden = false;
  toast.classList.toggle("is-warn", kind === "bad");
  toast.innerHTML = `<small>Infogrid Coach</small><span>${escapeHtml(String(message || "").slice(0, 180))}</span>`;
  clearTimeout(showCoachToast._timer);
  // Stay visible 5–10s then tuck away
  showCoachToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 8000);
}

function celebrate(message, kind = "good") {
  coachFlash = { message, kind };
  coachFlashUntil = Date.now() + 10000;
  if (els.jarvisLine) els.jarvisLine.textContent = message;
  bumpCoachBadge();
  // Compact toast only — never cover the page with the full chat panel
  showCoachToast(message, kind);
  renderCoach();
}

function dayWinnerMessage() {
  const todayKey = keyFor(startOfDay(new Date()));
  const v = personDayStats("varsha", todayKey);
  const s = personDayStats("siddharth", todayKey);
  const vScore = v.sales * 2 + v.connects * 3 + v.skills + (v.clocked ? 1 : 0);
  const sScore = s.sales * 2 + s.connects * 3 + s.skills + (s.clocked ? 1 : 0);
  if (vScore === 0 && sScore === 0) {
    return "Nobody is ahead yet today — first dials or skills win the board.";
  }
  if (vScore === sScore) {
    return `Tie day: Varsha and Siddharth are even (score ${vScore}). Best of luck pulling ahead.`;
  }
  if (vScore > sScore) {
    return `Day leader: Varsha (score ${vScore} vs ${sScore}). Congrats — best of luck keeping the lead.`;
  }
  return `Day leader: Siddharth (score ${sScore} vs ${vScore}). Congrats — best of luck keeping the lead.`;
}

function coachAfterSheetUpload(incoming) {
  const v = incoming.varsha || [];
  const s = incoming.siddharth || [];
  const vDone = v.filter((l) => l.stage).length;
  const sDone = s.filter((l) => l.stage).length;
  const vConn = v.filter((l) => l.stage === "connected").length;
  const sConn = s.filter((l) => l.stage === "connected").length;
  const parts = [
    `Sheet loaded · Varsha ${v.length} leads (${vDone} staged) · Siddharth ${s.length} leads (${sDone} staged).`,
  ];
  if (vDone || sDone) {
    if (vDone > sDone) {
      parts.push(`Congrats Varsha — more completed stages on this upload (${vDone} vs ${sDone}). Best of luck clearing the rest.`);
    } else if (sDone > vDone) {
      parts.push(`Congrats Siddharth — more completed stages on this upload (${sDone} vs ${vDone}). Best of luck clearing the rest.`);
    } else {
      parts.push(`Nice — both completed ${vDone} staged lead(s) on this sheet. Best of luck finishing open rows.`);
    }
  } else {
    parts.push("Fresh list with no stages yet — dial and update stages to earn congratulations.");
  }
  if (vConn || sConn) {
    parts.push(`Owner connects in sheet: Varsha ${vConn} · Siddharth ${sConn}.`);
  }
  parts.push(dayWinnerMessage());
  celebrate(parts.join(" "), "good");
}

function personDayStats(person, dayKey) {
  const day = state.days[dayKey]?.[person];
  const tasks = day?.tasks || [];
  const sales = tasks.filter((t) => t.category === "sales").length;
  const skills = tasks.filter((t) => ["skill", "learning", "ads"].includes(t.category)).length;
  const connects = tasks.filter((t) => t.outcome === "connected").length;
  const openLeads = (state.callLists?.[person] || []).filter((l) => !l.stage).length;
  const staged = (state.callLists?.[person] || []).filter((l) => !!l.stage).length;
  const hours = sessionMs(person, dayKey);
  const clocked = !!findOpenSession(person) || (day?.sessions || []).length > 0;
  return { sales, skills, connects, openLeads, staged, hours, clocked, tasks: tasks.length };
}

function buildCoachBriefing() {
  const good = [];
  const bad = [];
  const todayKey = keyFor(startOfDay(new Date()));
  const pace = callPace();
  const teamSalesToday =
    personDayStats("varsha", todayKey).sales + personDayStats("siddharth", todayKey).sales;

  if (pace.total >= pace.target) {
    good.push(`Team hit the ${pace.target}-call goal. That’s Infogrid-level execution — protect the win.`);
  } else if (pace.onPace) {
    good.push(
      `On pace for ${pace.target} calls (avg ${pace.avgPerDay.toFixed(1)}/day). Keep the cadence; best of luck staying ahead.`
    );
  } else {
    bad.push(
      `Behind pace: need ~${pace.needPerDay.toFixed(1)}/day and you’re averaging ${pace.avgPerDay.toFixed(1)}. Quiet days compound into lost deals.`
    );
  }

  if (teamSalesToday > 0) {
    good.push(`Today’s dials: ${teamSalesToday} sales call(s) logged. Momentum is real — don’t waste it.`);
  }

  for (const person of ["varsha", "siddharth"]) {
    const name = PEOPLE[person].name;
    const s = personDayStats(person, todayKey);
    if (s.skills > 0) {
      good.push(
        `Congrats ${name} — ${s.skills} new skill/learning log(s) today. Best of luck turning that into sharper calls.`
      );
    }
    if (s.connects > 0) {
      good.push(`Good news: ${name} got ${s.connects} owner connect(s) today. That’s the money conversation.`);
    }
    if (s.sales > 0) {
      good.push(`${name} put in ${s.sales} call(s) today. Respect the grind — best of luck on the next one.`);
    }
    if (s.clocked && s.hours > 0) {
      good.push(`${name} is on the clock (${fmtDuration(s.hours)}). Time invested — make the list pay.`);
    }

    if (s.sales === 0 && s.openLeads > 0) {
      bad.push(
        `${name}: ${s.openLeads} lead(s) still waiting. Not calling is wasted list work — every untouched number is a lost shot at revenue.`
      );
    } else if (s.sales === 0 && s.tasks === 0) {
      bad.push(
        `${name} hasn’t logged calling or updates today. Effort you skip now is progress you can’t get back this sprint.`
      );
    }
    if (s.openLeads > 8 && s.sales < 3) {
      bad.push(
        `${name}: big open queue (${s.openLeads}) vs low dials. Pipeline goes cold — that’s opportunity leaking out.`
      );
    }
    if (!s.clocked && s.sales === 0 && s.skills === 0) {
      bad.push(
        `${name}: no clock-in, no calls, no skills posted. The day is burning — remind yourself what silence costs.`
      );
    }
  }

  if (!good.length) {
    good.push("Fresh board. First call or new skill today earns the first congratulations — go claim it.");
  }
  if (!bad.length) {
    bad.push("No major leaks right now. Stay sharp so we don’t invent wasted hours later.");
  }

  // Cap length for UI
  return { good: good.slice(0, 5), bad: bad.slice(0, 5) };
}

function renderCoach() {
  const chat = els.coachChat || document.getElementById("coachChat");
  if (!chat) return;
  const { good, bad } = buildCoachBriefing();
  const todayKey = keyFor(startOfDay(new Date()));
  const v = personDayStats("varsha", todayKey);
  const s = personDayStats("siddharth", todayKey);
  const moodBits = [];
  if (v.sales + s.sales > 0) moodBits.push("calls moving");
  if (v.skills + s.skills > 0) moodBits.push("skills landing");
  if (v.openLeads + s.openLeads > 0 && v.sales + s.sales === 0) moodBits.push("leads going cold");
  if (els.coachMood) {
    els.coachMood.textContent = moodBits.length
      ? `Live · ${moodBits.join(" · ")}`
      : "Live · waiting for today’s first move";
  }

  const bubbles = [];
  if (coachFlash && Date.now() < coachFlashUntil) {
    const cls = coachFlash.kind === "bad" ? "coach-bubble--bad" : "coach-bubble--flash";
    bubbles.push(`<div class="coach-bubble coach-bubble--bot ${cls}"><small>Update</small>${escapeHtml(coachFlash.message)}</div>`);
  }
  for (const line of good.slice(0, 1)) {
    bubbles.push(`<div class="coach-bubble coach-bubble--bot coach-bubble--good"><small>Good news</small>${escapeHtml(line)}</div>`);
  }
  for (const line of bad.slice(0, 1)) {
    bubbles.push(`<div class="coach-bubble coach-bubble--bot coach-bubble--bad"><small>Reality check</small>${escapeHtml(line)}</div>`);
  }
  if (!bubbles.length) {
    bubbles.push(`<div class="coach-bubble coach-bubble--bot"><small>Coach</small>Waiting on today’s first move. Updates also pop above this button.</div>`);
  }
  chat.innerHTML = bubbles.join("");
  chat.scrollTop = chat.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAll() {
  renderHeader();
  renderToday();
  renderCalling();
  renderMonth();
  renderLogs();
  renderGoals();
  renderCoach();
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
  const name = PEOPLE[person].name;
  if (category === "skill" || category === "learning") {
    celebrate(
      `Congrats ${name}! New skill “${trimmed}” is locked in. Best of luck using it on the next call.`,
      "good"
    );
  } else if (category === "ads") {
    celebrate(
      `Nice work ${name} — ads skill/session “${trimmed}” logged. Best of luck turning spend into pipeline.`,
      "good"
    );
  } else if (category === "sales" && outcome === "connected") {
    celebrate(
      `Good news — ${name} connected with an owner on “${trimmed}”. That’s the win. Best of luck closing the loop.`,
      "good"
    );
  } else if (category === "sales") {
    celebrate(
      `${name} logged a call on “${trimmed}”${outcome ? ` · ${OUTCOME_LABELS[outcome] || outcome}` : ""}. Keep dialing — luck favors volume.`,
      "good"
    );
  } else {
    if (els.jarvisLine) els.jarvisLine.textContent = `Logged for ${name}: ${trimmed}`;
  }
  renderAll();
}

document.querySelectorAll(".task-form").forEach((form) => {
  const panel = form.closest(".log-panel");
  const syncSalesFields = () => {
    const isSales = form.category.value === "sales";
    form.classList.toggle("is-sales", isSales);
  };
  form.category?.addEventListener("change", syncSalesFields);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.classList.remove("is-error");
    const title = form.title.value.trim();
    const category = form.category.value;
    const outcome = form.outcome.value;
    const area = form.area.value;
    if (!title) {
      form.classList.add("is-error");
      form.title.focus();
      return;
    }
    if (category === "sales" && !outcome) {
      form.classList.add("is-error");
      form.outcome.focus();
      return;
    }
    addTask(form.dataset.person, title, category, outcome, area);
    resetLogPanel(panel);
    flashLogSaved(panel);
  });
});

function flashLogSaved(panel) {
  const flash = panel?.querySelector(".log-flash");
  if (!flash) return;
  flash.hidden = false;
  flash.textContent = "Saved ✓";
  clearTimeout(flashLogSaved._t);
  flashLogSaved._t = setTimeout(() => {
    flash.hidden = true;
  }, 1600);
}

function resetLogPanel(panel) {
  if (!panel) return;
  const form = panel.querySelector(".task-form");
  const callLogger = panel.querySelector(".call-logger");
  const area = panel.querySelector(".call-area");
  panel.querySelectorAll(".quick-actions button").forEach((b) => b.classList.remove("is-active"));
  if (callLogger) callLogger.hidden = true;
  if (area) area.value = "";
  if (form) {
    form.hidden = true;
    form.reset();
    form.dataset.mode = "idle";
    form.classList.remove("is-error", "is-sales");
    form.category.value = "sales";
  }
}

function openLogMode(panel, mode) {
  const form = panel.querySelector(".task-form");
  const callLogger = panel.querySelector(".call-logger");
  const label = form?.querySelector("[data-label]");
  panel.querySelectorAll(".quick-actions button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.cat === mode);
  });
  if (mode === "sales") {
    form.hidden = true;
    callLogger.hidden = false;
    callLogger.querySelector(".outcome-chips button")?.focus();
    return;
  }
  callLogger.hidden = true;
  form.hidden = false;
  form.dataset.mode = mode;
  form.classList.remove("is-error", "is-sales");
  if (mode === "ads") {
    form.category.value = "ads";
    if (label) label.textContent = "What ad learning?";
    form.title.placeholder = "e.g. Meta ads targeting basics";
    form.title.value = "";
  } else if (mode === "skill") {
    form.category.value = "skill";
    if (label) label.textContent = "What skill did you learn?";
    form.title.placeholder = "e.g. Objection handling";
    form.title.value = "";
  } else {
    form.category.value = "other";
    if (label) label.textContent = "What did you do?";
    form.title.placeholder = "Type the task…";
    form.title.value = "";
    form.classList.toggle("is-sales", form.category.value === "sales");
  }
  form.title.focus();
}

document.querySelectorAll(".log-panel").forEach((panel) => {
  const person = panel.dataset.log;
  panel.querySelectorAll(".quick-actions button").forEach((btn) => {
    btn.addEventListener("click", () => openLogMode(panel, btn.dataset.cat));
  });
  panel.querySelectorAll(".log-cancel").forEach((btn) => {
    btn.addEventListener("click", () => resetLogPanel(panel));
  });
  panel.querySelectorAll(".outcome-chips button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const outcome = btn.dataset.outcome;
      const area = panel.querySelector(".call-area")?.value || "";
      addTask(person, "Cold call", "sales", outcome, area);
      resetLogPanel(panel);
      flashLogSaved(panel);
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


function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelCell(value, type = "String") {
  if (type === "Number" && (value === "" || value == null || Number.isNaN(Number(value)))) {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function excelRowsForPerson(personKey) {
  const header = [
    "Date",
    "Entry",
    "Category",
    "Title",
    "Outcome",
    "Area",
    "Done",
    "Clock In",
    "Clock Out",
    "Duration",
    "Day Notes",
  ];
  const rows = [header];
  const keys = Object.keys(state.days || {}).sort();
  for (const dayKey of keys) {
    const person = state.days[dayKey]?.[personKey];
    if (!person) continue;
    const notes = person.notes || "";
    let wrote = false;
    for (const t of person.tasks || []) {
      rows.push([
        dayKey,
        "task",
        t.category || "",
        t.title || "",
        OUTCOME_LABELS[t.outcome] || t.outcome || "",
        t.area || "",
        t.done ? "yes" : "no",
        "",
        "",
        "",
        notes,
      ]);
      wrote = true;
    }
    for (const s of person.sessions || []) {
      const ms = sessionDurationMs(s);
      rows.push([
        dayKey,
        "session",
        "hours",
        s.out ? "Clock session" : "Clock session (open)",
        "",
        "",
        "",
        fmtDateTime(s.in),
        s.out ? fmtDateTime(s.out) : "open",
        fmtDuration(ms),
        notes,
      ]);
      wrote = true;
    }
    if (!wrote && notes.trim()) {
      rows.push([dayKey, "notes", "", "", "", "", "", "", "", "", notes]);
    }
  }
  return rows;
}

function buildExcelXml() {
  const sheets = [
    { name: "Varsha", person: "varsha" },
    { name: "Siddharth", person: "siddharth" },
  ];
  const worksheets = sheets
    .map(({ name, person }) => {
      const rows = excelRowsForPerson(person)
        .map((row) => `<Row>${row.map((cell) => excelCell(cell)).join("")}</Row>`)
        .join("");
      return `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${rows}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`;
}

function downloadExcel() {
  const xml = buildExcelXml();
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `infogrid-sprint-${keyFor(new Date())}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
  els.jarvisLine.textContent = "Excel downloaded · Sheet1 Varsha · Sheet2 Siddharth";
}

document.getElementById("exportExcel").onclick = () => downloadExcel();

document.getElementById("coachFab")?.addEventListener("click", () => {
  const panel = document.getElementById("aiCoach");
  const willOpen = !panel || panel.hidden;
  if (willOpen) {
    const toast = document.getElementById("coachToast");
    if (toast) toast.hidden = true;
    setCoachOpen(true, { autoCloseMs: 10000, compact: true });
    renderCoach();
  } else {
    setCoachOpen(false);
  }
});
document.getElementById("coachClose")?.addEventListener("click", () => setCoachOpen(false));

document.getElementById("downloadCallTemplate").onclick = () => downloadCallTemplate();
document.getElementById("exportCallLists").onclick = () => exportCallListsExcel();

document.getElementById("importCallSheet").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const hint = document.getElementById("callImportHint");
  try {
    const append = !!document.getElementById("callAppendMode")?.checked;
    const lists = await parseCallWorkbook(file);
    const v = lists.varsha?.length || 0;
    const s = lists.siddharth?.length || 0;
    if (!v && !s) throw new Error("No rows found. Check headers and sheets.");
    applyCallLists(lists, append);
    if (hint) {
      hint.textContent = `Imported · Varsha ${v} · Siddharth ${s}${append ? " (appended)" : " (replaced)"}`;
    }
    els.jarvisLine.textContent = "Calling lists updated from sheet";
    switchView("calling");
  } catch (err) {
    alert(err.message || "Could not import that sheet.");
    if (hint) hint.textContent = err.message || "Import failed.";
  }
  e.target.value = "";
});

document.querySelectorAll("[data-call-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    callFilter = btn.dataset.callFilter;
    document.querySelectorAll("[data-call-filter]").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });
    renderCalling();
  });
});

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
  state = { days: {}, goals: structuredClone(DEFAULT_GOALS), callLists: { varsha: [], siddharth: [] }, updatedAt: Date.now() };
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
  const hint = document.querySelector(".sprint-today-hint");
  if (hint) {
    hint.textContent = `Today is ${fmtLong(startOfDay(new Date()))} · use Today tab date bar to log`;
  }
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
    tickCountdowns();
    if (coachFlash && Date.now() >= coachFlashUntil) renderCoach();
  }, 1000);
  tickCountdowns();
  setInterval(() => {
    els.jarvisLine.textContent =
      STATUS_LINES[Math.floor(Math.random() * STATUS_LINES.length)];
  }, 12000);
  setInterval(() => {
    const k = keyFor(selectedDate);
    let live = false;
    for (const person of ["varsha", "siddharth"]) {
      if (!findOpenSession(person)) continue;
      live = true;
      renderTimebox(person, k);
    }
    if (live) {
      if (els.teamHoursToday) {
        els.teamHoursToday.textContent = fmtDuration(totalHoursForDay(k));
      }
      if (els.sprintHoursTotal) {
        els.sprintHoursTotal.textContent = fmtDuration(totalHoursSprint());
      }
    }
  }, 1000);


  // Keep robot coach fixed on viewport even if layouts change
  const dock = document.getElementById("coachDock");
  if (dock && dock.parentElement !== document.body) {
    document.body.appendChild(dock);
  }
  // Paint today immediately (don't wait on cloud reconnect)
  renderAll();
  setCoachOpen(false);

})();

// Silent cloud reconnect (no Sync UI) if config already saved / hosted
(async () => {
  let saved = loadSyncConfig();
  if (!saved?.config || !saved?.vault) {
    const hosted = await tryLoadHostedCloudConfig();
    if (hosted) {
      saved = hosted;
      saveSyncConfig(hosted);
    }
  }
  if (saved?.config && saved?.vault) {
    try {
      setSyncUi("live", "CONNECTING…");
      await connectCloud(saved.config, saved.vault);
    } catch (err) {
      console.warn("Cloud reconnect failed", err);
      setSyncUi("", "COACH ON");
    }
  } else {
    setSyncUi("", "COACH ON");
  }
  renderAll();
})();

})();

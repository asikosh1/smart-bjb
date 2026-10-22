// Shared helpers — grading logic is isolated here so it can be moved to Cloud Function later

/** Greeting based on current hour (Asia/Almaty) */
export function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "Қайырлы таң";
  if (h >= 11 && h < 17) return "Қайырлы күн";
  if (h >= 17 && h < 22) return "Қайырлы кеш";
  return "Қайырлы түн";
}

/** Level by percent */
export function getLevel(percent) {
  if (percent >= 85) return "Жоғары";
  if (percent >= 65) return "Жақсы";
  if (percent >= 40) return "Орта";
  return "Төмен";
}

export function getLevelDescription(level) {
  const map = {
    "Жоғары": "Тақырыпты жақсы меңгерген",
    "Жақсы": "Көп бөлігі дұрыс, аздаған қате бар",
    "Орта": "Қайталау қажет",
    "Төмен": "Қосымша түсіндіру қажет",
  };
  return map[level] || "";
}

export function getLevelBadgeClass(level) {
  const map = {
    "Жоғары": "badge-high",
    "Жақсы": "badge-good",
    "Орта": "badge-mid",
    "Төмен": "badge-low",
  };
  return map[level] || "badge-low";
}

/** Format seconds as mm:ss or "X мин Y сек" */
export function formatDurationSec(sec) {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} сек`;
  if (s === 0) return `${m} мин`;
  return `${m} мин ${s} сек`;
}

export function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("kk-KZ", { year: "numeric", month: "short", day: "numeric" });
}

/** Generate random id */
export function genId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Grade closed questions (single + short + matching).
 * Open questions are skipped (need manual grading).
 * Matching: answers[q.id] = array of selected right-index per left row.
 * Correct if selected index === original pair index. Partial points per pair.
 * Returns { score, totalGraded, pendingOpen }
 */
export function gradeAnswers(questions, answers) {
  let score = 0;
  let totalGraded = 0;
  let pendingOpen = 0;
  for (const q of questions) {
    if (q.type === "open") {
      pendingOpen += 1;
      continue;
    }
    totalGraded += q.points;
    const given = answers[q.id];
    if (given == null || given === "" || (Array.isArray(given) && given.length === 0)) continue;
    if (q.type === "single") {
      // correct is option index
      if (String(given) === String(q.correct)) score += q.points;
    } else if (q.type === "short") {
      // case-insensitive, trim
      const a = String(given).trim().toLowerCase();
      const c = String(q.correct).trim().toLowerCase();
      if (a === c) score += q.points;
    } else if (q.type === "matching") {
      const pairs = q.pairs || [];
      if (Array.isArray(given) && pairs.length) {
        let correctCount = 0;
        for (let pi = 0; pi < pairs.length; pi++) {
          if (String(given[pi]) === String(pi)) correctCount++;
        }
        score += (correctCount / pairs.length) * q.points;
      }
    }
  }
  // round to 2 decimals to avoid float noise
  score = Math.round(score * 100) / 100;
  return { score, totalGraded, pendingOpen };
}

/** Total points of all questions */
export function totalPoints(questions) {
  return questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
}

/** Escape HTML */
export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/** Debounce */
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Get query param */
export function qp(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Simple toast helper (also see notify.js) */
export function showToast(msg, ms = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

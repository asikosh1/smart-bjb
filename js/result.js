// result.html — live stats, table, hardest questions, manual + AI grading, events + notify
import { requireTeacher, doSignOut } from "./auth.js";
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  qp,
  esc,
  formatDurationSec,
  formatDate,
  getLevel,
  getLevelBadgeClass,
  totalPoints,
  showToast,
  gradeAnswers,
} from "./utils.js";
import {
  initVoiceToggle,
  setVoiceEnabled,
  isVoiceEnabled,
  requestNotificationPermission,
  notifyLeave,
} from "./notify.js";
import { gradeAllOpenAnswers } from "./ai.js";

const assessmentId = qp("a");
const elLoading = document.getElementById("state-loading");
const elError = document.getElementById("state-error");
const elErrorText = document.getElementById("error-text");
const elContent = document.getElementById("content");

function showError(msg) {
  if (elLoading) elLoading.classList.add("hidden");
  if (elContent) elContent.classList.add("hidden");
  if (elError) elError.classList.remove("hidden");
  if (elErrorText) elErrorText.textContent = msg;
}

if (!assessmentId) {
  showError("Сілтеме қате: ?a= параметрі жоқ.");
  throw new Error("missing a");
}

// Require teacher (email/password) — result is teacher-only
const user = await requireTeacher("index.html");
if (!user) throw new Error("not authed");

document.getElementById("btn-logout")?.classList.remove("hidden");
document.getElementById("btn-logout")?.addEventListener("click", () => doSignOut().then(() => (location.href = "index.html")));

// Load assessment
let assessment;
try {
  const snap = await getDoc(doc(db, "assessments", assessmentId));
  if (!snap.exists()) throw new Error("БЖБ табылмады");
  assessment = { id: snap.id, ...snap.data() };
  if (assessment.ownerUid !== user.uid) {
    showError("Бұл БЖБ сізге тиесілі емес. Тек иесі нәтижені көре алады.");
    throw new Error("not owner");
  }
} catch (e) {
  if (elError.classList.contains("hidden")) showError(e.message || String(e));
  throw e;
}

// Show meta
if (elLoading) elLoading.classList.add("hidden");
if (elContent) elContent.classList.remove("hidden");
const rTopic = document.getElementById("r-topic");
const rMeta = document.getElementById("r-meta");
if (rTopic) rTopic.textContent = assessment.topic || "—";
if (rMeta) {
  const tp = assessment.totalPoints ?? totalPoints(assessment.questions || []);
  rMeta.textContent = `${assessment.type} · ${assessment.subject || "—"} · ${formatDurationSec(assessment.durationSec)} · ${tp} балл · ${formatDate(assessment.createdAt)}`;
}

// Link copy
document.getElementById("btn-copy-link")?.addEventListener("click", async () => {
  const url = `${location.origin}/student.html?a=${assessmentId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Сілтеме көшірілді");
  } catch {
    prompt("Сілтеме:", url);
  }
});

// Voice toggle + notify permission
const toggleVoice = document.getElementById("toggle-voice");
const btnNotify = document.getElementById("btn-enable-notify");
const initialVoice = initVoiceToggle();
if (toggleVoice) {
  toggleVoice.checked = initialVoice;
  toggleVoice.addEventListener("change", () => {
    setVoiceEnabled(toggleVoice.checked);
    showToast(toggleVoice.checked ? "Дауыс қосылды" : "Дауыс өшірілді");
  });
}
if (btnNotify) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    btnNotify.textContent = "Хабарлама қосулы ✓";
    btnNotify.disabled = true;
  }
  btnNotify.addEventListener("click", async () => {
    const ok = await requestNotificationPermission();
    if (ok) {
      showToast("Хабарлама қосылды");
      btnNotify.textContent = "Хабарлама қосулы ✓";
      btnNotify.disabled = true;
      if (toggleVoice && !toggleVoice.checked) {
        setVoiceEnabled(true);
        toggleVoice.checked = true;
      } else if (toggleVoice && toggleVoice.checked) {
        setVoiceEnabled(true);
      }
    } else {
      showToast("Хабарламаға рұқсат берілмеді");
    }
  });
  document.addEventListener("click", () => {
    if (toggleVoice && toggleVoice.checked) setVoiceEnabled(true);
  }, { once: true });
}

// Data state
let submissions = [];
let events = [];
let initialEventsLoaded = false;
let seenEventIds = new Set();

// Submissions listener
const subCol = collection(db, "assessments", assessmentId, "submissions");
const subUnsub = onSnapshot(subCol, (snap) => {
  submissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderStats();
  renderTable();
  renderHardQuestions();
  renderGrading();
}, (err) => {
  console.error("submissions snapshot error", err);
  showToast("Дерек жүктеу қатесі: " + (err.message || err.code));
});

// Events listener
const evCol = collection(db, "assessments", assessmentId, "events");
let evQuery;
try {
  evQuery = query(evCol, orderBy("at", "asc"));
} catch {
  evQuery = evCol;
}
const evUnsub = onSnapshot(evQuery, (snap) => {
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!initialEventsLoaded) {
    events = docs;
    docs.forEach((e) => seenEventIds.add(e.id));
    initialEventsLoaded = true;
    renderEvents();
    return;
  }
  for (const e of docs) {
    if (seenEventIds.has(e.id)) continue;
    seenEventIds.add(e.id);
    events.push(e);
    if (e.type === "left") {
      const name = e.studentName || "Оқушы";
      notifyLeave(name);
    }
  }
  events.sort((a, b) => {
    const av = a.at?.toMillis?.() || 0;
    const bv = b.at?.toMillis?.() || 0;
    return av - bv;
  });
  renderEvents();
}, (err) => {
  console.error("events snapshot error", err);
});

// Render functions
function renderStats() {
  const total = submissions.length;
  const submitted = submissions.filter((s) => s.status === "submitted").length;
  const scores = submissions.filter((s) => s.status === "submitted").map((s) => Number(s.score) || 0);
  const percents = submissions.filter((s) => s.status === "submitted").map((s) => Number(s.percent) || 0);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const avgPercent = percents.length ? (percents.reduce((a, b) => a + b, 0) / percents.length).toFixed(1) + "%" : "—";
  const elCount = document.getElementById("stat-count");
  const elAvgScore = document.getElementById("stat-avg-score");
  const elAvgPercent = document.getElementById("stat-avg-percent");
  const elSub = document.getElementById("stat-submitted");
  if (elCount) elCount.textContent = String(total);
  if (elAvgScore) elAvgScore.textContent = String(avgScore);
  if (elAvgPercent) elAvgPercent.textContent = String(avgPercent);
  if (elSub) elSub.textContent = String(submitted);
}

function renderTable() {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;
  if (submissions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="small muted" style="text-align:center;padding:24px">Әзірге қатысушы жоқ — сілтемені оқушыларға беріңіз</td></tr>`;
    return;
  }
  const sorted = [...submissions].sort((a, b) => {
    if (a.status !== b.status) return a.status === "submitted" ? -1 : 1;
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  });
  tbody.innerHTML = sorted
    .map((s, idx) => {
      const level = s.level || getLevel(Number(s.percent) || 0);
      const badgeClass = getLevelBadgeClass(level);
      const awaySec = s.totalAwayMs != null ? Math.round(Number(s.totalAwayMs) / 1000) : "—";
      const leaveCount = s.leaveCount != null ? String(s.leaveCount) : "—";
      const statusText = s.status === "submitted" ? "Жіберді" : "Орындауда";
      const scoreText = s.status === "submitted" ? String(s.score ?? "—") : "—";
      const percentText = s.status === "submitted" ? `${s.percent ?? 0}%` : "—";
      return `<tr>
        <td>${idx + 1}</td>
        <td style="font-weight:600">${esc(s.studentName || "—")}</td>
        <td>${esc(scoreText)}</td>
        <td>${esc(percentText)}</td>
        <td><span class="badge ${badgeClass}">${esc(level)}</span></td>
        <td>${esc(leaveCount)}</td>
        <td>${esc(String(awaySec))}</td>
        <td><span class="pill" style="font-size:11px">${esc(statusText)}</span></td>
        <td><button class="btn btn-ghost btn-small btn-detail" data-id="${esc(s.id)}" aria-label="Толығырақ">Толық</button></td>
      </tr>`;
    })
    .join("");
  tbody.querySelectorAll(".btn-detail").forEach((btn) => {
    btn.addEventListener("click", () => showSubmissionDetail(btn.dataset.id));
  });
}

function showSubmissionDetail(subId) {
  const s = submissions.find((x) => x.id === subId);
  if (!s) return;
  const qs = assessment.questions || [];
  const overrides = s.scoreOverrides || {};
  let html = `<div style="text-align:left">`;
  html += `<p><b>${esc(s.studentName || "—")}</b> · ${esc(s.status === "submitted" ? "Жіберді" : "Орындауда")} · Шыққаны: ${esc(String(s.leaveCount ?? 0))} · Сыртта: ${Math.round(Number(s.totalAwayMs || 0)/1000)} сек</p>`;
  html += `<div style="margin-top:12px">`;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const ans = s.answers ? s.answers[q.id] : undefined;
    let ansText = ans == null || ans === "" ? "<i style='color:var(--subtle)'>Жауап жоқ</i>" : esc(String(ans));
    if (q.type === "single" && ans != null && ans !== "") {
      const opt = q.options ? q.options[Number(ans)] : undefined;
      ansText = esc(opt != null ? opt : String(ans));
    }
    const override = overrides[q.id];
    const overrideText = override != null ? ` · <b style="color:var(--accent)">Балл өзгертілді: ${override}</b>` : "";
    html += `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="small muted">#${i + 1} · ${q.points} балл · ${q.type === "single" ? "Бір жауапты" : q.type === "short" ? "Қысқа" : q.type === "matching" ? "Сәйкестендіру" : "Ашық"}${overrideText}</div>
      <div style="font-weight:600;margin:4px 0">${esc(q.text)}</div>
      <div>Жауабы: ${ansText}</div>`;
    if (q.type === "single") html += `<div class="small muted">Дұрыс: ${esc(q.options ? q.options[Number(q.correct)] : String(q.correct))}</div>`;
    else if (q.type === "short") html += `<div class="small muted">Дұрыс: ${esc(String(q.correct))}</div>`;
    else if (q.type === "matching") {
      const pairs = q.pairs || [];
      html += `<div class="small muted">Дұрыс жұптар: ${pairs.map(p => esc(p.left + " → " + p.right)).join(", ")}</div>`;
    }
    else html += `<div class="small muted">Ашық сұрақ — төменде бағалаңыз</div>`;
    html += `</div>`;
  }
  html += `</div></div>`;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop open";
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:640px"><h3>Оқушы жауабы</h3><div style="max-height:60vh;overflow:auto">${html}</div><div class="modal-actions"><button class="btn btn-secondary" data-close>Жабу</button></div></div>`;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-close]")) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

function renderHardQuestions() {
  const container = document.getElementById("hard-questions");
  if (!container) return;
  const qs = assessment.questions || [];
  const submitted = submissions.filter((s) => s.status === "submitted");
  if (submitted.length === 0 || qs.length === 0) {
    container.textContent = "Әзірге дерек жоқ — кемінде 1 оқушы жіберген соң есептеледі.";
    return;
  }
  const stats = qs
    .filter((q) => q.type !== "open")
    .map((q) => {
      let wrong = 0;
      let total = 0;
      for (const s of submitted) {
        const ans = s.answers ? s.answers[q.id] : undefined;
        if (ans == null || ans === "") {
          wrong += 1;
          total += 1;
          continue;
        }
        let correct = false;
        if (q.type === "single") correct = String(ans) === String(q.correct);
        else if (q.type === "short") correct = String(ans).trim().toLowerCase() === String(q.correct).trim().toLowerCase();
        else if (q.type === "matching") {
          const pairs = q.pairs || [];
          if (Array.isArray(ans) && pairs.length) {
            let cc = 0;
            for (let pi = 0; pi < pairs.length; pi++) {
              if (String(ans[pi]) === String(pi)) cc++;
            }
            correct = cc === pairs.length;
          }
        }
        if (!correct) wrong += 1;
        total += 1;
      }
      const rate = total ? (wrong / total) * 100 : 0;
      return { q, wrong, total, rate };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  if (stats.length === 0) {
    container.textContent = "Ашық сұрақтар ғана — қателік статистикасы жоқ.";
    return;
  }
  container.innerHTML = stats
    .map((s) => {
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span>#${assessment.questions.indexOf(s.q) + 1} ${esc(s.q.text.slice(0, 80))}${s.q.text.length > 80 ? "…" : ""}</span>
        <span style="white-space:nowrap;font-weight:700;color:${s.rate >= 50 ? "var(--danger)" : "var(--muted)"}">${s.wrong}/${s.total} · ${s.rate.toFixed(0)}% қате</span>
      </div>`;
    })
    .join("");
}


function relevantInputsFor(subId, container) {
  return Array.from(container.querySelectorAll("[data-grade]")).filter((el) => el.dataset.grade.startsWith(subId + ":"));
}

let showReviewed = false;

function renderGrading() {
  const card = document.getElementById("open-grading-card");
  const container = document.getElementById("open-grading");
  if (!card || !container) return;
  const qs = assessment.questions || [];
  const submitted = submissions.filter((s) => s.status === "submitted");
  if (submitted.length === 0) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");

  // Toggle button for showing reviewed submissions
  const toggleBtnHtml = `<button class="btn btn-secondary btn-small" id="toggle-reviewed">${showReviewed ? "Hide Reviewed" : "Show Reviewed"}</button>`;

  container.innerHTML = toggleBtnHtml + submitted
    .map((s) => {
      const overrides = s.scoreOverrides || {};
      const aiGrades = s.aiGrades || {};
      const isReviewed = !!s.reviewed;
      if (isReviewed) {
        // Render reviewed entry with unreview button
        return `<div style="border:1px solid var(--border);border-radius:12px;padding:8px;margin-bottom:12px">
          <span>${esc(s.studentName || "—")} (тексерілді)</span>
          <button class="btn btn-primary btn-small" data-unmark-reviewed="${esc(s.id)}" style="margin-left:8px">↺ Қайта бағалау</button>
        </div>`;
      }
      // Hide reviewed entries unless showReviewed is true
      if (s.reviewed && !showReviewed) return "";
      return `<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px">
        <button class="btn btn-danger btn-small" data-mark-reviewed="${esc(s.id)}" style="float:right">✖</button>
        <div style="font-weight:700">${esc(s.studentName || "—")} · ${s.score ?? 0} балл · ${s.percent ?? 0}%</div>
        ${qs
          .map((q, qi) => {
            const ans = s.answers ? s.answers[q.id] : undefined;
            let ansDisplay = "";
            if (q.type === "single") {
              const opt = q.options ? q.options[Number(ans)] : undefined;
              ansDisplay = opt != null ? esc(opt) : (ans == null || ans === "" ? "<i style='color:var(--subtle)'>Жауап жоқ</i>" : esc(String(ans)));
            } else if (q.type === "matching") {
              const pairs = q.pairs || [];
              if (Array.isArray(ans)) {
                ansDisplay = ans.map((v, pi) => {
                  const left = pairs[pi]?.left || `#${pi + 1}`;
                  const rightIdx = parseInt(v, 10);
                  const right = !isNaN(rightIdx) && pairs[rightIdx] ? pairs[rightIdx].right : "—";
                  const isCorrect = String(v) === String(pi);
                  return `<span style="color:${isCorrect ? "var(--accent)" : "var(--danger)"}">${esc(left)} → ${esc(right)}${isCorrect ? " ✓" : " ✕"}</span>`;
                }).join("<br>");
              } else {
                ansDisplay = "<i style='color:var(--subtle)'>Жауап жоқ</i>";
              }
            } else {
              ansDisplay = ans == null || ans === "" ? "<i style='color:var(--subtle)'>Жауап жоқ</i>" : esc(String(ans));
            }

            const autoGrade = gradeAnswers([q], { [q.id]: ans }).score;
            const override = overrides[q.id];
            const curVal = override != null ? override : (q.type === "open" && aiGrades[q.id]?.score != null ? aiGrades[q.id].score : (ans == null || ans === "" ? "" : autoGrade));

            const typeLabel = q.type === "single" ? "Бір жауапты" : q.type === "short" ? "Қысқа" : q.type === "matching" ? "Сәйкестендіру" : "Ашық";
            const aiFeedback = q.type === "open" && aiGrades[q.id]?.feedback
              ? `<div class="small" style="margin-top:6px;padding:8px;background:#EFF6FF;border-radius:8px;color:#1E40AF">🤖 AI: ${esc(aiGrades[q.id].feedback)}</div>`
              : "";

            return `<div style="margin-top:12px;padding:12px;background:var(--row-bg);border-radius:10px">
              <div class="small muted">#${qi + 1} · ${typeLabel} · ${q.points} баллға дейін${override != null ? ` · <b style="color:var(--accent)">өзгертілді</b>` : ""}</div>
              <div style="font-weight:600;margin:4px 0">${esc(q.text)}</div>
              <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px;white-space:pre-wrap;min-height:36px">${ansDisplay}</div>
              ${q.type === "single" ? `<div class="small muted">Дұрысы: ${esc(q.options ? q.options[Number(q.correct)] : String(q.correct))}</div>` : ""}
              ${q.type === "short" ? `<div class="small muted">Дұрысы: ${esc(String(q.correct))}</div>` : ""}
              ${aiFeedback}
              <div class="flex gap8" style="margin-top:8px;align-items:center">
                <label class="small" style="font-weight:600">Балл:</label>
                <input type="number" class="input" style="max-width:100px;min-height:40px" min="0" max="${q.points}" value="${esc(String(curVal))}" data-grade="${esc(s.id)}:${esc(q.id)}" placeholder="0–${q.points}" />
                <span class="small muted">/ ${q.points}</span>
                <span class="small muted" style="margin-left:auto">Авто: ${ans == null || ans === "" ? 0 : autoGrade}</span>
              </div>
            </div>`;
          })
          .join("")}
        <div class="flex gap8 mt16 wrap">
          <button class="btn btn-primary btn-small" data-save-open="${esc(s.id)}">Сақтау</button>
          <button class="btn btn-secondary btn-small" data-ai-grade="${esc(s.id)}">🤖 AI-мен бағалау</button>
        </div>
        <span class="small muted" data-status="${esc(s.id)}" style="margin-left:8px"></span>
      </div>`;
    })
    .join("");

  // Event listeners
  document.getElementById("toggle-reviewed").addEventListener("click", () => {
    showReviewed = !showReviewed;
    renderGrading();
  });

  container.querySelectorAll("[data-save-open]").forEach((btn) => {
    btn.addEventListener("click", async () => saveGrades(btn.dataset.saveOpen, false));
  });
  container.querySelectorAll("[data-ai-grade]").forEach((btn) => {
    btn.addEventListener("click", async () => saveGrades(btn.dataset.aiGrade, true));
  });
  container.querySelectorAll("[data-mark-reviewed]").forEach((btn) => {
    btn.addEventListener("click", async () => markReviewed(btn.dataset.markReviewed));
  });
  container.querySelectorAll("[data-unmark-reviewed]").forEach((btn) => {
    btn.addEventListener("click", async () => unmarkReviewed(btn.dataset.unmarkReviewed));
  });
}

async function markReviewed(subId) {
  try {
    await updateDoc(doc(db, "assessments", assessmentId, "submissions", subId), { reviewed: true });
    renderGrading();
  } catch (e) {
    console.error(e);
    showToast("Тексеруді белгілеу қатесі: " + (e.message || e.code));
  }
}

async function unmarkReviewed(subId) {
  try {
    await updateDoc(doc(db, "assessments", assessmentId, "submissions", subId), { reviewed: false });
    renderGrading();
  } catch (e) {
    console.error(e);
    showToast("Тексеруді алып тастау қатесі: " + (e.message || e.code));
  }
}

async function saveGrades(subId, useAI) {
  const container = document.getElementById("open-grading");
  const s = submissions.find((x) => x.id === subId);
  if (!s || !container) return;
  const qs = assessment.questions || [];
  const statusEl = container.querySelector(`[data-status="${subId}"]`);
  const saveBtn = container.querySelector(`[data-save-open="${subId}"]`);
  const aiBtn = container.querySelector(`[data-ai-grade="${subId}"]`);

  try {
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Сақталуда..."; }
    if (aiBtn) { aiBtn.disabled = true; aiBtn.textContent = "AI жұмыс істеп жатыр..."; }
    if (statusEl) statusEl.textContent = useAI ? "AI бағалауда..." : "Сақталуда...";

    const overrides = { ...(s.scoreOverrides || {}) };
    const aiGrades = { ...(s.aiGrades || {}) };
    const aiResults = {};

    // AI grading for open questions (only if requested)
    if (useAI) {
      const openQs = qs.filter((q) => q.type === "open");
      if (openQs.length === 0) {
        if (statusEl) statusEl.textContent = "Ашық сұрақ жоқ";
        showToast("Ашық сұрақ жоқ");
        return;
      }
      try {
        Object.assign(aiResults, await gradeAllOpenAnswers(qs, s.answers || {}));
        for (const [qid, result] of Object.entries(aiResults)) {
          if (result.score != null) {
            aiGrades[qid] = result;
          }
        }
        // Update inputs to show AI scores before manual collection
        for (const inp of Array.from(container.querySelectorAll("[data-grade]")).filter((el) => el.dataset.grade.startsWith(subId + ":"))) {
          const qid = inp.dataset.grade.split(":")[1];
          if (aiResults[qid]?.score != null) {
            inp.value = String(aiResults[qid].score);
          }
        }
        showToast("AI бағалау аяқталды");
      } catch (e) {
        if (statusEl) statusEl.textContent = "AI қатесі: " + (e.message || "");
        showToast("AI қатесі: " + (e.message || ""));
        return;
      }
    }

    // Collect manual overrides from inputs
    for (const inp of relevantInputsFor(subId, container)) {
      const qid = inp.dataset.grade.split(":")[1];
      const q = qs.find((x) => x.id === qid);
      if (!q) continue;
      if (inp.value === "") {
        // Don't delete AI score when useAI and input was updated with it
        if (!(useAI && aiResults[qid]?.score != null)) {
          delete overrides[qid];
        }
      } else {
        const v = Math.max(0, Math.min(Number(q.points), parseInt(inp.value, 10) || 0));
        overrides[qid] = v;
      }
    }

    // AI scores win over any stale input values
    if (useAI) {
      for (const [qid, result] of Object.entries(aiGrades)) {
        if (result.score != null) {
          overrides[qid] = result.score;
        }
      }
    }

    // Recompute total: use overrides when present, otherwise auto-grade closed / AI open
    let totalScore = 0;
    for (const q of qs) {
      const ans = s.answers ? s.answers[q.id] : undefined;
      if (overrides[q.id] != null) {
        totalScore += Number(overrides[q.id]);
      } else if (q.type === "open") {
        // ungraded open question — 0
        totalScore += 0;
      } else {
        totalScore += gradeAnswers([q], { [q.id]: ans }).score;
      }
    }
    totalScore = Math.round(totalScore * 100) / 100;
    const tp = assessment.totalPoints ?? totalPoints(qs);
    const percent = tp ? Math.round((totalScore / tp) * 100) : 0;
    const level = getLevel(percent);

    await updateDoc(doc(db, "assessments", assessmentId, "submissions", subId), {
      scoreOverrides: overrides,
      aiGrades,
      score: totalScore,
      percent,
      level,
    });
    if (statusEl) statusEl.textContent = "Сақталды ✓";
    showToast("Баға сақталды");
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Қате: " + (e.message || e.code);
    showToast("Сақтау қатесі: " + (e.message || e.code));
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Сақтау"; }
    if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = "🤖 AI-мен бағалау"; }
  }
}

function renderEvents() {
  const el = document.getElementById("events-list");
  if (!el) return;
  if (events.length === 0) {
    el.textContent = "Әзірге оқиға жоқ";
    return;
  }
  const recent = [...events].slice(-20).reverse();
  el.innerHTML = recent
    .map((e) => {
      const time = e.at?.toDate ? e.at.toDate().toLocaleTimeString("kk-KZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
      const icon = e.type === "left" ? "⚠️" : "↩️";
      const text = e.type === "left" ? "сайттан шықты" : "қайтып келді";
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${icon} <b>${esc(e.studentName || "—")}</b> ${esc(text)}</span>
        <span class="small muted">${esc(time)}</span>
      </div>`;
    })
    .join("");
}

// CSV download
document.getElementById("btn-csv")?.addEventListener("click", () => {
  if (submissions.length === 0) {
    showToast("Жүктейтін дерек жоқ");
    return;
  }
  const headers = ["Аты-жөні", "Балл", "Пайыз", "Деңгей", "Шыққаны", "Сыртта (сек)", "Күйі"];
  const rows = submissions.map((s) => {
    const level = s.level || getLevel(Number(s.percent) || 0);
    const awaySec = s.totalAwayMs != null ? Math.round(Number(s.totalAwayMs) / 1000) : "";
    return [
      s.studentName || "",
      s.score ?? "",
      s.percent != null ? String(s.percent) + "%" : "",
      level,
      s.leaveCount ?? "",
      awaySec,
      s.status === "submitted" ? "Жіберді" : "Орындауда",
    ];
  });
  const tp = assessment.totalPoints ?? totalPoints(assessment.questions || []);
  const count = submissions.length;
  const subCount = submissions.filter((s) => s.status === "submitted").length;
  const avgScore = submissions.filter((s) => s.status === "submitted").reduce((a, s) => a + (Number(s.score) || 0), 0) / Math.max(1, subCount);
  const avgPercent = submissions.filter((s) => s.status === "submitted").reduce((a, s) => a + (Number(s.percent) || 0), 0) / Math.max(1, subCount);

  let csv = "";
  csv += `Тақырып,${csvEsc(assessment.topic || "")}\n`;
  csv += `Пән,${csvEsc(assessment.subject || "")}\n`;
  csv += `Түрі,${csvEsc(assessment.type || "")}\n`;
  csv += `Ең жоғары балл,${tp}\n`;
  csv += `Қатысты,${count}\n`;
  csv += `Жіберді,${subCount}\n`;
  csv += `Орташа балл,${avgScore.toFixed(1)}\n`;
  csv += `Орташа пайыз,${avgPercent.toFixed(1)}%\n`;
  csv += `\n`;
  csv += headers.map(csvEsc).join(",") + "\n";
  for (const r of rows) csv += r.map(csvEsc).join(",") + "\n";

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `natizhe-${assessmentId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function csvEsc(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

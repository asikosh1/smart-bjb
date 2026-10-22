// student.html — student login via Firestore + anonymous Firebase auth for writes + test + leave detection
import { ensureAnonAuth, loginStudent, getStudentSession, setStudentSession, clearStudentSession } from "./auth.js";
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  qp,
  esc,
  formatDurationSec,
  formatTimer,
  gradeAnswers,
  getLevel,
  getLevelDescription,
  getLevelBadgeClass,
  totalPoints,
  showToast,
} from "./utils.js";

const assessmentId = qp("a");
const elLoading = document.getElementById("state-loading");
const elError = document.getElementById("state-error");
const elErrorText = document.getElementById("error-text");
const elStepAuth = document.getElementById("step-auth");
const elStepInfo = document.getElementById("step-info");
const elStepTest = document.getElementById("step-test");
const elStepResult = document.getElementById("step-result");

function showError(msg) {
  if (elLoading) elLoading.classList.add("hidden");
  if (elError) elError.classList.remove("hidden");
  if (elErrorText) elErrorText.textContent = msg;
  [elStepAuth, elStepInfo, elStepTest, elStepResult].forEach((e) => e && e.classList.add("hidden"));
}

// Always ensure anonymous auth for Firestore access (students query + assessment read)
let currentUser = null;
try {
  currentUser = await ensureAnonAuth();
} catch (e) {
  // If no assessmentId, we still show the login form; auth error only blocks test flow
  if (assessmentId) {
    showError("Авторизация қатесі: " + (e.message || e.code) + " — Firebase Console → Authentication → Anonymous қосылғанын тексеріңіз.");
    throw e;
  }
}

// Load assessment only if ID is present
let assessment = null;
if (assessmentId) {
  try {
    const snap = await getDoc(doc(db, "assessments", assessmentId));
    if (!snap.exists()) {
      showError("БЖБ табылмады. Сілтеме ескірген болуы мүмкін.");
      throw new Error("not found");
    }
    assessment = { id: snap.id, ...snap.data() };
    if (assessment.status !== "published") {
      showError("Бұл БЖБ әлі жарияланбаған. Мұғалім жариялаған соң қайта кіріңіз.");
      throw new Error("not published");
    }
  } catch (e) {
    if (elError.classList.contains("hidden")) {
      showError("Жүктеу қатесі: " + (e.message || e.code));
    }
    throw e;
  }
  if (elLoading) elLoading.classList.add("hidden");
} else {
  // No test ID — still show the login form so the student can sign in
  if (elLoading) elLoading.classList.add("hidden");
  if (elStepAuth) elStepAuth.classList.remove("hidden");
  const hint = document.createElement("p");
  hint.className = "small muted";
  hint.style.marginBottom = "12px";
  hint.textContent = "Тест сілтемесінсіз кірдіңіз. Мұғалім берген сілтемені ашыңыз: student.html?a=ТЕСТ_ID. Тіркелу жоқ — тек логин/пароль.";
  elStepAuth?.prepend(hint);
}

if (elLoading) elLoading.classList.add("hidden");

// ----- Auth UI (LOGIN ONLY — no registration) -----
const authLogged = document.getElementById("auth-logged");
const authLoggedName = document.getElementById("auth-logged-name");
const authLoggedLogin = document.getElementById("auth-logged-login");
const btnContinueLogged = document.getElementById("btn-continue-logged");
const btnLogoutStudent = document.getElementById("btn-logout-student");
const authForms = document.getElementById("auth-forms");
const formLogin = document.getElementById("form-login");
const loginErr = document.getElementById("login-error");

let studentSession = getStudentSession(); // {id, name, login, ...}
let submissionId = null;
let submissionData = null;
let studentName = "";
let pendingAnswers = {};
let timerInterval = null;
let remainingSec = assessment?.durationSec || 600;
let leaveCount = 0;
let totalAwayMs = 0;
let awayStart = null;
let lastEventTime = 0;
let lastEventType = null;

// LS keys per student+assessment
function lsSubKey() {
  const sid = studentSession ? studentSession.id : currentUser.uid;
  return `smart-bjb:sub:${assessmentId}:${sid}`;
}
function lsAnswersKey(subId) {
  return `smart-bjb:answers:${assessmentId}:${subId}`;
}

function showStepAuth() {
  if (elStepAuth) elStepAuth.classList.remove("hidden");
  if (elStepInfo) elStepInfo.classList.add("hidden");
  if (elStepTest) elStepTest.classList.add("hidden");
  if (elStepResult) elStepResult.classList.add("hidden");
  updateAuthUI();
}

function updateAuthUI() {
  studentSession = getStudentSession();
  const logged = !!(studentSession && studentSession.login);
  if (authLogged) authLogged.classList.toggle("hidden", !logged);
  if (authForms) authForms.classList.toggle("hidden", logged);
  if (logged && authLoggedName) authLoggedName.textContent = studentSession.name || studentSession.login;
  if (logged && authLoggedLogin) authLoggedLogin.textContent = "@" + studentSession.login;
}

btnLogoutStudent?.addEventListener("click", () => {
  clearStudentSession();
  studentSession = null;
  submissionId = null;
  submissionData = null;
  updateAuthUI();
});

// If already logged, show "Continue" to skip login
btnContinueLogged?.addEventListener("click", async () => {
  if (!studentSession) return;
  await afterAuth();
});

// Login (only — registration removed)
formLogin?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginErr) loginErr.textContent = "";
  const login = document.getElementById("login-login").value.trim();
  const pass = document.getElementById("login-pass").value;
  if (!login || !pass) { if (loginErr) loginErr.textContent = "Логин мен парольді толтырыңыз"; return; }
  try {
    if (loginErr) loginErr.textContent = "Тексерілуде...";
    const stu = await loginStudent(login, pass);
    if (!stu) { if (loginErr) loginErr.textContent = "Логин немесе пароль қате"; return; }
    setStudentSession({ id: stu.id, name: stu.name, login: stu.login, password: stu.password, teacherUid: stu.teacherUid || null });
    studentSession = getStudentSession();
    if (loginErr) loginErr.textContent = "";
    showToast("Сәтті кірдіңіз");
    await afterAuth();
  } catch (err) {
    if (loginErr) loginErr.textContent = err.message || String(err);
  }
});

// After auth -> check existing submission, show info card
async function afterAuth() {
  if (!studentSession) { showStepAuth(); return; }
  if (!assessmentId || !assessment) {
    showStepAuth();
    updateAuthUI();
    const errEl = document.getElementById("login-error");
    if (errEl) errEl.textContent = "Кірдіңіз, бірақ тест сілтемесі жоқ. Мұғалім берген сілтемені ашыңыз: student.html?a=...";
    return;
  }
  studentName = studentSession.name || studentSession.login;
  submissionId = localStorage.getItem(lsSubKey()) || null;
  submissionData = null;
  pendingAnswers = {};

  // Check existing submission for this student+assessment
  if (submissionId) {
    try {
      const s = await getDoc(doc(db, "assessments", assessmentId, "submissions", submissionId));
      if (s.exists()) {
        const d = s.data();
        const belongsToMe = (d.studentId === studentSession.id) || (d.studentUid === currentUser.uid) || (d.studentUid === studentSession.id);
        if (d.status === "submitted" && belongsToMe) {
          showResultFromData(d, assessment.questions || []);
          return;
        }
        if (d.status === "in_progress" && belongsToMe) {
          submissionData = { id: s.id, ...d };
          leaveCount = d.leaveCount || 0;
          totalAwayMs = d.totalAwayMs || 0;
          try {
            const localAns = JSON.parse(localStorage.getItem(lsAnswersKey(submissionId)) || "null");
            if (localAns) pendingAnswers = localAns;
            else if (d.answers) pendingAnswers = { ...d.answers };
          } catch {}
        } else if (!belongsToMe) {
          submissionId = null;
          submissionData = null;
        }
      }
    } catch {}
  }

  showInfoCard();
}

function showInfoCard() {
  if (elStepAuth) elStepAuth.classList.add("hidden");
  if (elStepInfo) elStepInfo.classList.remove("hidden");
  const tp = assessment.totalPoints ?? totalPoints(assessment.questions || []);
  const elTopic = document.getElementById("info-topic");
  const elTeacher = document.getElementById("info-teacher");
  const elSubject = document.getElementById("info-subject");
  const elTopic2 = document.getElementById("info-topic2");
  const elCount = document.getElementById("info-count");
  const elPoints = document.getElementById("info-points");
  const elDur = document.getElementById("info-duration");
  if (elTopic) elTopic.textContent = assessment.topic || "—";
  if (elTeacher) elTeacher.textContent = assessment.teacherName || "—";
  if (elSubject) elSubject.textContent = assessment.subject || "—";
  if (elTopic2) elTopic2.textContent = assessment.topic || "—";
  if (elCount) elCount.textContent = String((assessment.questions || []).length);
  if (elPoints) elPoints.textContent = String(tp);
  if (elDur) elDur.textContent = formatDurationSec(assessment.durationSec);

  const sNameEl = document.getElementById("info-student-name");
  const sLoginEl = document.getElementById("info-student-login");
  if (sNameEl) sNameEl.textContent = studentSession ? (studentSession.name || "—") : "—";
  if (sLoginEl) sLoginEl.textContent = studentSession ? "(@" + studentSession.login + ")" : "";

  const btnStart = document.getElementById("btn-start");
  if (btnStart) btnStart.textContent = (submissionData && submissionData.status === "in_progress") ? "Жалғастыру" : "Бастау";
}

document.getElementById("btn-change-student")?.addEventListener("click", () => {
  clearStudentSession();
  studentSession = null;
  submissionId = null;
  submissionData = null;
  if (elStepInfo) elStepInfo.classList.add("hidden");
  showStepAuth();
});

// Initial: if already logged, go to afterAuth; else show auth
if (studentSession && studentSession.login) {
  (async () => {
    try {
      const fresh = await loginStudent(studentSession.login, studentSession.password);
      if (!fresh) {
        clearStudentSession();
        studentSession = null;
        showStepAuth();
        return;
      }
      if (fresh.name !== studentSession.name) {
        setStudentSession({ ...studentSession, name: fresh.name });
        studentSession = getStudentSession();
      }
    } catch {}
    await afterAuth();
  })();
} else {
  showStepAuth();
}

// ----- Test flow -----
const btnStart = document.getElementById("btn-start");
btnStart?.addEventListener("click", async () => {
  if (!studentSession) {
    showToast("Алдымен кіріңіз");
    showStepAuth();
    return;
  }
  btnStart.disabled = true;
  btnStart.textContent = "Жүктелуде...";
  try {
    if (!submissionId || (submissionData && submissionData.status === "submitted")) {
      const ref = await addDoc(collection(db, "assessments", assessmentId, "submissions"), {
        studentId: studentSession.id,
        studentUid: studentSession.id,
        studentName: studentSession.name || studentSession.login,
        studentLogin: studentSession.login,
        answers: {},
        score: 0,
        percent: 0,
        level: "",
        status: "in_progress",
        startedAt: serverTimestamp(),
        submittedAt: null,
        leaveCount: 0,
        totalAwayMs: 0,
        assessmentType: assessment.type,
      });
      submissionId = ref.id;
      localStorage.setItem(lsSubKey(), submissionId);
      leaveCount = 0;
      totalAwayMs = 0;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(lsAnswersKey(submissionId)) || "null");
      if (saved && typeof saved === "object") pendingAnswers = saved;
      else if (submissionData?.answers) pendingAnswers = { ...submissionData.answers };
    } catch {}
    startTest();
  } catch (e) {
    console.error(e);
    showToast("Бастау қатесі: " + (e.message || e.code));
    btnStart.disabled = false;
    btnStart.textContent = "Бастау";
  }
});

function startTest() {
  if (elStepInfo) elStepInfo.classList.add("hidden");
  if (elStepTest) elStepTest.classList.remove("hidden");
  remainingSec = assessment.durationSec || 600;
  const savedRemaining = localStorage.getItem(`smart-bjb:remaining:${assessmentId}:${submissionId}`);
  if (savedRemaining) {
    const v = parseInt(savedRemaining, 10);
    if (!isNaN(v) && v > 0 && v < remainingSec) remainingSec = v;
  }
  renderQuestions();
  startTimer();
  attachLeaveListeners();
  const firstInput = document.querySelector("#questions input, #questions textarea, #questions select");
  if (firstInput) firstInput.focus();
}

function renderQuestions() {
  const container = document.getElementById("questions");
  if (!container) return;
  const qs = assessment.questions || [];
  container.innerHTML = qs
    .map((q, idx) => {
      const val = pendingAnswers[q.id];

      // ---- MEDIA (image / video / YouTube) ----
      let mediaHtml = "";
      if (q.media && q.media.url) {
        const mtype = q.media.type || (function inferMediaType(url) {
          if (!url) return "";
          const u = String(url).toLowerCase();
          if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|#|$)/.test(u)) return "image";
          if (/(youtube\.com|youtu\.be|vimeo)/.test(u) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/.test(u)) return "video";
          return "image";
        })(q.media.url);
        if (mtype === "image") {
          mediaHtml = `<img src="${esc(q.media.url)}" alt="Сурет" style="max-width:100%;border-radius:10px;margin:8px 0" />`;
        } else if (mtype === "video") {
          const ytMatch = String(q.media.url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
          if (ytMatch) {
            mediaHtml = `<iframe width="100%" height="300" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="border-radius:10px;margin:8px 0"></iframe>`;
          } else {
            mediaHtml = `<video src="${esc(q.media.url)}" controls style="max-width:100%;border-radius:10px;margin:8px 0"></video>`;
          }
        }
      }


      // ---- INPUT by type ----
      let inputHtml = "";
      if (q.type === "single") {
        inputHtml = `
          <div class="q-options" role="radiogroup" aria-label="Сұрақ ${idx + 1}">
            ${(q.options || [])
              .map(
                (opt, oi) => `
              <label class="flex gap8" style="align-items:center;padding:10px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:${String(val) === String(oi) ? "var(--row-bg)" : "var(--card)"}">
                <input type="radio" name="q-${esc(q.id)}" value="${oi}" ${String(val) === String(oi) ? "checked" : ""} />
                <span>${esc(opt)}</span>
              </label>`
              )
              .join("")}
          </div>`;
      } else if (q.type === "short") {
        inputHtml = `<input type="text" class="input" data-qid="${esc(q.id)}" value="${esc(val || "")}" placeholder="Жауабыңызды жазыңыз" />`;
      } else if (q.type === "matching") {
        const pairs = q.pairs || [];
        const rights = pairs.map((p) => p.right);
        // shuffle right answers so order is not obvious
        const shuffled = rights
          .map((text, i) => ({ text, i }))
          .sort(() => Math.random() - 0.5);
        if (!Array.isArray(pendingAnswers[q.id])) pendingAnswers[q.id] = [];
        inputHtml = `<div class="matching-grid">` +
          pairs
            .map((pair, pi) => {
              const selected = pendingAnswers[q.id][pi];
              return `
              <div class="matching-row">
                <span class="matching-left">${esc(pair.left)}</span>
                <select class="input" data-matching="${esc(q.id)}:${pi}">
                  <option value="">— таңдаңыз —</option>
                  ${shuffled
                    .map(
                      (item) =>
                        `<option value="${item.i}" ${String(selected) === String(item.i) ? "selected" : ""}>${esc(item.text)}</option>`
                    )
                    .join("")}
                </select>
              </div>`;
            })
            .join("") +
          `</div>`;
      } else {
        inputHtml = `<textarea class="textarea" data-qid="${esc(q.id)}" placeholder="Жауаптарыңызды жазыңыз...">${esc(val || "")}</textarea>`;
      }

      const typeLabel =
        q.type === "single" ? "Бір жауапты" :
        q.type === "short" ? "Қысқа жауап" :
        q.type === "matching" ? "Сәйкестендіру" : "Ашық";

      return `
      <div class="q-card">
        <div class="flex between gap8">
          <span class="small muted">#${idx + 1} · ${q.points} балл</span>
          <span class="pill" style="font-size:11px">${typeLabel}</span>
        </div>
        ${mediaHtml}
        <p style="font-weight:600;margin:10px 0 12px;white-space:pre-line">${esc(q.text)}</p>
        ${inputHtml}
      </div>`;
    })
    .join("");

  container.querySelectorAll("input[type='radio']").forEach((el) => {
    el.addEventListener("change", () => {
      const qid = el.name.replace("q-", "");
      pendingAnswers[qid] = el.value;
      persistAnswers();
    });
  });
  container.querySelectorAll("input[data-qid], textarea[data-qid]").forEach((el) => {
    el.addEventListener("input", () => {
      pendingAnswers[el.dataset.qid] = el.value;
      persistAnswers();
    });
  });
  // matching select handler
  container.querySelectorAll("select[data-matching]").forEach((el) => {
    el.addEventListener("change", () => {
      const [qid, pi] = el.dataset.matching.split(":");
      if (!Array.isArray(pendingAnswers[qid])) pendingAnswers[qid] = [];
      pendingAnswers[qid][parseInt(pi, 10)] = el.value;
      persistAnswers();
    });
  });
}

function persistAnswers() {
  if (!submissionId) return;
  try {
    localStorage.setItem(lsAnswersKey(submissionId), JSON.stringify(pendingAnswers));
    debouncedFirestoreSync();
  } catch {}
}

const debouncedFirestoreSync = (() => {
  let t = null;
  return () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!submissionId) return;
      try {
        await updateDoc(doc(db, "assessments", assessmentId, "submissions", submissionId), {
          answers: pendingAnswers,
        });
      } catch (_) {}
    }, 800);
  };
})();

function startTimer() {
  const valEl = document.getElementById("timer-value");
  const timerEl = document.getElementById("timer");
  function tick() {
    if (valEl) valEl.textContent = formatTimer(remainingSec);
    if (timerEl) timerEl.classList.toggle("warn", remainingSec <= 60);
    try {
      localStorage.setItem(`smart-bjb:remaining:${assessmentId}:${submissionId}`, String(remainingSec));
    } catch {}
    if (remainingSec <= 0) {
      clearInterval(timerInterval);
      showToast("Уақыт бітті — жауаптар жіберілуде");
      doSubmit(true);
      return;
    }
    remainingSec -= 1;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

// Leave detection
function attachLeaveListeners() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) handleLeave("visibility");
    else handleReturn("visibility");
  });
  window.addEventListener("blur", () => handleLeave("blur"));
  window.addEventListener("focus", () => handleReturn("focus"));
}

async function handleLeave(source) {
  if (!submissionId) return;
  const now = Date.now();
  if (now - lastEventTime < 1000) return;
  if (lastEventType === "left") return;
  lastEventType = "left";
  lastEventTime = now;
  awayStart = now;
  leaveCount += 1;
  const sName = studentSession ? (studentSession.name || studentSession.login) : "Оқушы";
  try {
    await addDoc(collection(db, "assessments", assessmentId, "events"), {
      submissionId,
      studentName: sName,
      studentLogin: studentSession ? studentSession.login : "",
      type: "left",
      at: serverTimestamp(),
      source,
    });
  } catch (e) { console.warn("event write failed", e); }
  try {
    await updateDoc(doc(db, "assessments", assessmentId, "submissions", submissionId), { leaveCount, totalAwayMs });
  } catch (e) { console.warn("submission leave update failed", e); }
}

async function handleReturn(source) {
  if (!submissionId) return;
  const now = Date.now();
  if (now - lastEventTime < 1000) return;
  if (lastEventType !== "left") return;
  lastEventType = "returned";
  lastEventTime = now;
  if (awayStart != null) {
    totalAwayMs += now - awayStart;
    awayStart = null;
  }
  const sName = studentSession ? (studentSession.name || studentSession.login) : "Оқушы";
  try {
    await addDoc(collection(db, "assessments", assessmentId, "events"), {
      submissionId,
      studentName: sName,
      studentLogin: studentSession ? studentSession.login : "",
      type: "returned",
      at: serverTimestamp(),
      source,
    });
  } catch (e) { console.warn("event write failed", e); }
  try {
    await updateDoc(doc(db, "assessments", assessmentId, "submissions", submissionId), { totalAwayMs });
  } catch (e) { console.warn("submission return update failed", e); }
}

// Submit
let submitting = false;
document.getElementById("btn-submit")?.addEventListener("click", () => doSubmit(false));

async function doSubmit(isAuto) {
  if (submitting) return;
  if (!submissionId) {
    showToast("Қате: submission табылмады");
    return;
  }
  if (!isAuto && !confirm("Жауаптарды жіберу керек пе? Кейін өзгерту мүмкін емес.")) return;

  submitting = true;
  const btn = document.getElementById("btn-submit");
  if (btn) { btn.disabled = true; btn.textContent = "Жіберілуде..."; }
  clearInterval(timerInterval);

  if (awayStart != null) {
    totalAwayMs += Date.now() - awayStart;
    awayStart = null;
  }

  const qs = assessment.questions || [];
  const tp = assessment.totalPoints ?? totalPoints(qs);
  const grading = gradeAnswers(qs, pendingAnswers);
  const score = grading.score;
  const percent = tp ? Math.round((score / tp) * 100) : 0;
  const level = getLevel(percent);

  try {
    await updateDoc(doc(db, "assessments", assessmentId, "submissions", submissionId), {
      answers: pendingAnswers,
      score,
      percent,
      level,
      status: "submitted",
      submittedAt: serverTimestamp(),
      leaveCount,
      totalAwayMs,
      totalPoints: tp,
      gradedPoints: grading.totalGraded,
      pendingOpen: grading.pendingOpen,
    });
    try { localStorage.removeItem(`smart-bjb:remaining:${assessmentId}:${submissionId}`); } catch {}
    showResultFromData({ score, percent, level, answers: pendingAnswers, pendingOpen: grading.pendingOpen }, qs);
  } catch (e) {
    console.error(e);
    showToast("Жіберу қатесі: " + (e.message || e.code));
    if (btn) { btn.disabled = false; btn.textContent = "Жіберу"; }
    submitting = false;
  }
}

function showResultFromData(data, qs) {
  // Ensure retake button hidden initially; will be shown after result rendering
  const btnRetakeInit = document.getElementById("btn-retake");
  if (btnRetakeInit) btnRetakeInit.classList.add("hidden");
  // Reveal retake button after showing result
  const btnRetake = document.getElementById("btn-retake");
  if (btnRetake) {
    btnRetake.classList.remove("hidden");
    // Ensure we don't register multiple listeners
    btnRetake.replaceWith(btnRetake.cloneNode(true));
    const freshBtn = document.getElementById("btn-retake");
    freshBtn.addEventListener("click", async () => {
      // Delete previous submission (optional) and clear local state
      if (submissionId) {
        try { await deleteDoc(doc(db, "assessments", assessmentId, "submissions", submissionId)); } catch (e) { console.error(e); }
        localStorage.removeItem(lsSubKey());
        localStorage.removeItem(lsAnswersKey(submissionId));
      }
      submissionId = null;
      submissionData = null;
      pendingAnswers = {};
      leaveCount = 0;
      totalAwayMs = 0;
      // Hide result, show info card again for a fresh start
      elStepResult?.classList.add("hidden");
      if (elStepInfo) elStepInfo.classList.remove("hidden");
      const btnStart = document.getElementById("btn-start");
      if (btnStart) btnStart.textContent = "Бастау";
    });
  }

  if (elStepTest) elStepTest.classList.add("hidden");
  if (elStepAuth) elStepAuth.classList.add("hidden");
  if (elStepInfo) elStepInfo.classList.add("hidden");
  if (elLoading) elLoading.classList.add("hidden");
  if (elStepResult) elStepResult.classList.remove("hidden");

  const scoreEl = document.getElementById("result-score");
  const percentEl = document.getElementById("result-percent");
  const badgeEl = document.getElementById("result-badge");
  const descEl = document.getElementById("result-desc");
  const breakdownEl = document.getElementById("result-breakdown");

  const tp = assessment.totalPoints ?? totalPoints(qs);
  const score = data.score ?? 0;
  const percent = data.percent ?? (tp ? Math.round((score / tp) * 100) : 0);
  const level = data.level || getLevel(percent);

  if (scoreEl) scoreEl.textContent = `${score} / ${tp}`;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (badgeEl) badgeEl.innerHTML = `<span class="badge ${getLevelBadgeClass(level)}" style="font-size:15px;padding:6px 14px">${esc(level)}</span>`;
  if (descEl) descEl.textContent = getLevelDescription(level);

  if (breakdownEl) {
    if (data.pendingOpen > 0) {
      breakdownEl.innerHTML = `<p class="small muted" style="background:var(--row-bg);padding:12px;border-radius:10px">Ашық сұрақтар мұғалім тексерген соң қорытынды балл жаңарады.</p>`;
    } else {
      breakdownEl.innerHTML = "";
    }
    const rows = (qs || [])
      .map((q, idx) => {
        if (q.type === "open") return "";
        const given = data.answers ? data.answers[q.id] : pendingAnswers[q.id];
        let correct = false;
        let pointsEarned = 0;
        if (q.type === "single") {
          correct = String(given) === String(q.correct);
          pointsEarned = correct ? q.points : 0;
        } else if (q.type === "short") {
          correct = String(given || "").trim().toLowerCase() === String(q.correct).trim().toLowerCase();
          pointsEarned = correct ? q.points : 0;
        } else if (q.type === "matching") {
          const pairs = q.pairs || [];
          if (Array.isArray(given) && pairs.length) {
            let correctCount = 0;
            for (let pi = 0; pi < pairs.length; pi++) {
              if (String(given[pi]) === String(pi)) correctCount++;
            }
            pointsEarned = Math.round((correctCount / pairs.length) * q.points * 100) / 100;
            correct = pointsEarned >= q.points;
          }
        }
        const color = correct ? "var(--accent)" : pointsEarned > 0 ? "#d97706" : "var(--danger)";
        const mark = correct ? "✓" : pointsEarned > 0 ? "◐" : "✕";
        return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span>#${idx + 1} ${esc(q.text.slice(0, 60))}${q.text.length > 60 ? "…" : ""}</span>
          <span style="font-weight:700;color:${color}">${mark} ${pointsEarned}/${q.points}</span>
        </div>`;
      })
      .join("");
    if (rows) breakdownEl.innerHTML += `<div style="margin-top:12px">${rows}</div>`;
  }
}

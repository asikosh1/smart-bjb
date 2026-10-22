// admin.js — static password gate first; Firebase loaded lazily AFTER login
// so a Firebase/CDN failure can never block the admin login form.
import { showToast } from "./utils.js";

const ADMIN_PASSWORD = "8sf@AAofjmm(*_)2";
const SESSION_KEY = "smart-bjb:adminSession";

const elLogin = document.getElementById("admin-login");
const elPanel = document.getElementById("admin-panel");
const elError = document.getElementById("admin-login-error");
const passInput = document.getElementById("admin-pass");
const loginBtn = document.getElementById("admin-login-btn");

function isLoggedIn() {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}
function setLoggedIn() { try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {} }

function showPanel() {
  if (elLogin) elLogin.classList.add("hidden");
  if (elPanel) elPanel.classList.remove("hidden");
  bindTabs();
  // Data loads are best-effort; a Firebase failure must not break the panel shell.
  loadTeachers().catch(() => {});
  loadStudents().catch(() => {});
  loadAssessments().catch(() => {});
}

// Bind the login gate immediately — no Firebase involved.
loginBtn?.addEventListener("click", () => {
  const pass = passInput?.value || "";
  if (pass === ADMIN_PASSWORD) {
    if (elError) elError.textContent = "";
    setLoggedIn();
    showPanel();
  } else {
    if (elError) elError.textContent = "Құпиясөз қате";
  }
});
passInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginBtn?.click(); });

if (isLoggedIn()) showPanel();

function bindTabs() {
  document.querySelectorAll("[data-section]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-section]").forEach((t) => t.classList.toggle("active", t === tab));
      ["teachers", "students", "assessments"].forEach((s) => {
        const el = document.getElementById(`admin-section-${s}`);
        if (el) el.classList.toggle("hidden", s !== tab.dataset.section);
      });
    });
  });
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

// ---- Lazy Firebase access (only after login) ----
let _firestoreMod = null;
async function fs() {
  if (!_firestoreMod) {
    _firestoreMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  }
  return _firestoreMod;
}
let _fbMod = null;
async function fb() {
  if (!_fbMod) {
    _fbMod = await import("./firebase.js");
  }
  return _fbMod;
}

function sectionError(el, msg) {
  if (!el) return;
  el.innerHTML = `<div class="card"><p class="small" style="color:var(--danger)">${esc(msg)}</p></div>`;
}

// ---- Teachers ----
async function loadTeachers() {
  const el = document.getElementById("admin-section-teachers");
  if (!el) return;
  let teachers = [];
  try {
    const { MOCK } = await fb();
    if (MOCK) {
      const m = JSON.parse(localStorage.getItem("smart-bjb:mock-db")) || {};
      teachers = m.teachers || [];
    } else {
      teachers = [];
    }
  } catch (e) {
    sectionError(el, "Мұғалімдерді жүктеу мүмкін емес: " + (e.message || e));
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Мұғалімдер (${teachers.length})</h3>
      ${teachers.length === 0 ? `<p class="small muted">Firebase Auth арқылы мұғалімдер тізімі көрсетілмейді</p>` : ""}
      ${teachers.map((t, i) => `
        <div class="flex between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span>#${i + 1} ${esc(t.displayName || t.email || t.id)}</span>
          <span class="small muted">ID: ${esc(t.id)}</span>
        </div>`).join("")}
    </div>`;
}

// ---- Students ----
async function loadStudents() {
  const el = document.getElementById("admin-section-students");
  if (!el) return;
  let students = [];
  try {
    const { MOCK, db } = await fb();
    if (MOCK) {
      const m = JSON.parse(localStorage.getItem("smart-bjb:mock-db")) || {};
      students = m.students || [];
    } else {
      const { collection, getDocs } = await fs();
      const snap = await getDocs(collection(db, "students"));
      students = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    sectionError(el, "Оқушыларды жүктеу мүмкін емес: " + (e.message || e));
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Оқушылар (${students.length})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Аты-жөні</th><th>Логин</th><th>Пароль</th><th>Әрекет</th></tr></thead>
          <tbody>
            ${students.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(s.name)}</td>
                <td>${esc(s.login)}</td>
                <td>${esc(s.password)}</td>
                <td><button class="btn btn-ghost btn-small" data-del-student="${esc(s.id)}">Жою</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  el.querySelectorAll("[data-del-student]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delStudent;
      if (!confirm("Оқушыны жойғыңыз келе ме?")) return;
      try {
        const { MOCK, db } = await fb();
        if (MOCK) {
          const m = JSON.parse(localStorage.getItem("smart-bjb:mock-db")) || {};
          m.students = (m.students || []).filter((s) => s.id !== id);
          localStorage.setItem("smart-bjb:mock-db", JSON.stringify(m));
          loadStudents();
        } else {
          const { collection, getDocs, doc, deleteDoc } = await fs();
          await deleteDoc(doc(db, "students", id));
          showToast("Оқушы жойылды");
          loadStudents();
        }
      } catch (e) {
        showToast("Жою қатесі: " + (e.message || e));
      }
    });
  });
}

// ---- Assessments ----
async function loadAssessments() {
  const el = document.getElementById("admin-section-assessments");
  if (!el) return;
  let assessments = [];
  try {
    const { MOCK, db } = await fb();
    if (MOCK) {
      const m = JSON.parse(localStorage.getItem("smart-bjb:mock-db")) || {};
      assessments = m.assessments || [];
    } else {
      const { collection, getDocs } = await fs();
      const snap = await getDocs(collection(db, "assessments"));
      assessments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    sectionError(el, "Тесттерді жүктеу мүмкін емес: " + (e.message || e));
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Тесттер (${assessments.length})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Түрі</th><th>Пән</th><th>Тақырып</th><th>Сұрақ</th><th>Статус</th><th>Әрекет</th></tr></thead>
          <tbody>
            ${assessments.map((a, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(a.type || "")}</td>
                <td>${esc(a.subject || "")}</td>
                <td>${esc(a.topic || "")}</td>
                <td>${(a.questions || []).length}</td>
                <td>${a.status === "published" ? "Жарияланған" : "Жоба"}</td>
                <td>
                  <a href="create.html?id=${esc(a.id)}" class="btn btn-ghost btn-small">Өңдеу</a>
                  <button class="btn btn-ghost btn-small" data-del-ass="${esc(a.id)}">Жою</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  el.querySelectorAll("[data-del-ass]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delAss;
      if (!confirm("Тестті және оған тіркелген жауаптарды жойғыңыз келе ме?")) return;
      try {
        const { MOCK, db } = await fb();
        if (MOCK) {
          const m = JSON.parse(localStorage.getItem("smart-bjb:mock-db")) || {};
          m.assessments = (m.assessments || []).filter((a) => a.id !== id);
          m.submissions = (m.submissions || []).filter((s) => s.assessmentId !== id);
          m.events = (m.events || []).filter((e) => e.assessmentId !== id);
          localStorage.setItem("smart-bjb:mock-db", JSON.stringify(m));
          loadAssessments();
        } else {
          const { collection, getDocs, doc, deleteDoc } = await fs();
          const subsSnap = await getDocs(collection(db, "assessments", id, "submissions"));
          for (const d of subsSnap.docs) await deleteDoc(d.ref);
          const evSnap = await getDocs(collection(db, "assessments", id, "events"));
          for (const d of evSnap.docs) await deleteDoc(d.ref);
          await deleteDoc(doc(db, "assessments", id));
          showToast("Тест жойылды");
          loadAssessments();
        }
      } catch (e) {
        showToast("Жою қатесі: " + (e.message || e));
      }
    });
  });
}

// teacher.html logic: greeting, assessments list, tabs, info/share modals, students CRUD
import { requireTeacher, doSignOut, teacherCreateStudent } from "./auth.js";
import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGreeting, formatDurationSec, formatDate, esc, showToast, totalPoints } from "./utils.js";

const user = await requireTeacher("index.html");
if (!user) throw new Error("not authed");

// Greeting
const gText = document.getElementById("g-text");
const gSub = document.getElementById("g-sub");
const gAvatar = document.getElementById("g-avatar");
const avatar = document.getElementById("avatar");
const userNameEl = document.getElementById("user-name");

const displayName = user.displayName || user.email || "Мұғалім";
const greeting = getGreeting();
if (gText) gText.textContent = `${greeting}, ${displayName}!`;
if (gSub) gSub.textContent = "Бүгінгі БЖБ/ТЖБ-ларыңыз және оқушылар төменде";
if (userNameEl) userNameEl.textContent = displayName;

function setAvatar(el, name, photoURL) {
  if (!el) return;
  el.innerHTML = "";
  if (photoURL) {
    const img = document.createElement("img");
    img.src = photoURL;
    img.alt = name;
    el.appendChild(img);
  } else {
    el.textContent = name.trim().charAt(0).toUpperCase();
  }
}
setAvatar(gAvatar, displayName, user.photoURL);
setAvatar(avatar, displayName, user.photoURL);

document.getElementById("btn-logout")?.addEventListener("click", () => doSignOut().then(() => location.href = "index.html"));

// ========== Main tabs: assessments / students ==========
const mainTabs = document.querySelectorAll("[data-main]");
const sectionAssessments = document.getElementById("section-assessments");
const sectionStudents = document.getElementById("section-students");

mainTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mainTabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    const which = tab.dataset.main;
    if (sectionAssessments) sectionAssessments.classList.toggle("hidden", which !== "assessments");
    if (sectionStudents) sectionStudents.classList.toggle("hidden", which !== "students");
    if (which === "students") loadStudents();
  });
});

// ========== Assessments list ==========
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const loadingEl = document.getElementById("loading");
let allAssessments = [];
let activeFilter = "all";

document.querySelectorAll("[data-filter]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    activeFilter = tab.dataset.filter;
    renderAssessments();
  });
});

function filteredAssessments() {
  if (activeFilter === "all") return allAssessments;
  return allAssessments.filter((a) => a.type === activeFilter);
}

function renderAssessments() {
  const items = filteredAssessments();
  if (loadingEl) loadingEl.classList.add("hidden");
  if (!items.length) {
    if (listEl) listEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.classList.remove("hidden");
      if (activeFilter !== "all" && allAssessments.length) {
        emptyEl.querySelector("p").textContent = `${activeFilter} бойынша ештеңе табылмады.`;
      } else {
        emptyEl.querySelector("p").textContent = "Әзірге БЖБ/ТЖБ жоқ. Алғашқысын жасаңыз!";
      }
    }
    return;
  }
  if (emptyEl) emptyEl.classList.add("hidden");
  if (!listEl) return;
  listEl.innerHTML = items
    .map((a) => {
      const statusClass = a.status === "published" ? "pill-published" : "pill-draft";
      const statusText = a.status === "published" ? "Жарияланған" : "Жоба";
      const dur = formatDurationSec(a.durationSec);
      const tp = a.totalPoints ?? totalPoints(a.questions || []);
      return `
      <div class="row" data-id="${esc(a.id)}">
        <div class="row-main">
          <div class="row-title">${esc(a.topic || "Атаусыз")}</div>
          <div class="row-meta">${esc(a.subject || "—")} · ${esc(a.type)} · ${esc(dur)} · ${tp} балл</div>
        </div>
        <div class="row-actions">
          <span class="pill pill-type">${esc(a.type)}</span>
          <span class="pill ${statusClass}">${esc(statusText)}</span>
          <button class="icon-btn btn-info" aria-label="Ақпарат" data-info="${esc(a.id)}">ⓘ</button>
          ${a.status === "published"
            ? `<button class="icon-btn btn-share" aria-label="Бөлісу" data-share="${esc(a.id)}" title="Бөлісу">↗</button>
               <a class="btn btn-secondary btn-small" href="result.html?a=${esc(a.id)}">Нәтиже</a>
               <a class="btn btn-ghost btn-small" href="create.html?id=${esc(a.id)}">Өңдеу</a>`
            : `<a class="btn btn-secondary btn-small" href="create.html?id=${esc(a.id)}">Өңдеу</a>
               <button class="btn btn-primary btn-small btn-publish" data-publish="${esc(a.id)}">Жариялау</button>`
          }
          <button class="btn btn-ghost btn-small btn-delete" data-delete="${esc(a.id)}" aria-label="Жою">Жою</button>
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-info]").forEach((b) => b.addEventListener("click", () => openInfo(b.dataset.info)));
  listEl.querySelectorAll("[data-share]").forEach((b) => b.addEventListener("click", () => openShare(b.dataset.share)));
  listEl.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => handleDelete(b.dataset.delete)));
  listEl.querySelectorAll("[data-publish]").forEach((b) => b.addEventListener("click", () => handlePublish(b.dataset.publish)));
}

// Firestore subscription for assessments
const qAss = query(collection(db, "assessments"), where("ownerUid", "==", user.uid), orderBy("createdAt", "desc"));
onSnapshot(
  qAss,
  (snap) => {
    allAssessments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAssessments();
  },
  (err) => {
    console.error(err);
    if (loadingEl) loadingEl.textContent = "Жүктеу қатесі: " + (err.message || err.code);
    if (err.code === "failed-precondition" || /index/i.test(err.message)) {
      const q2 = query(collection(db, "assessments"), where("ownerUid", "==", user.uid));
      onSnapshot(q2, (snap2) => {
        allAssessments = snap2.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
          const av = a.createdAt?.toMillis?.() || 0;
          const bv = b.createdAt?.toMillis?.() || 0;
          return bv - av;
        });
        renderAssessments();
      });
    }
  }
);

// Info modal
const infoBackdrop = document.getElementById("info-backdrop");
const infoGrid = document.getElementById("info-grid");
const infoClose = document.getElementById("info-close");

function openInfo(id) {
  const a = allAssessments.find((x) => x.id === id);
  if (!a || !infoGrid || !infoBackdrop) return;
  const tp = a.totalPoints ?? totalPoints(a.questions || []);
  infoGrid.innerHTML = `
    <dt>Мұғалім</dt><dd>${esc(a.teacherName || "—")}</dd>
    <dt>Пән</dt><dd>${esc(a.subject || "—")}</dd>
    <dt>Тақырып</dt><dd>${esc(a.topic || "—")}</dd>
    <dt>Түрі</dt><dd>${esc(a.type)}</dd>
    <dt>Сұрақ саны</dt><dd>${(a.questions || []).length}</dd>
    <dt>Ең жоғары балл</dt><dd>${tp}</dd>
    <dt>Уақыты</dt><dd>${esc(formatDurationSec(a.durationSec))}</dd>
    <dt>Күні</dt><dd>${esc(formatDate(a.createdAt))}</dd>
    <dt>Статус</dt><dd>${a.status === "published" ? "Жарияланған" : "Жоба"}</dd>
  `;
  infoBackdrop.classList.add("open");
  infoBackdrop.setAttribute("aria-hidden", "false");
}
infoClose?.addEventListener("click", () => {
  infoBackdrop.classList.remove("open");
  infoBackdrop.setAttribute("aria-hidden", "true");
});
infoBackdrop?.addEventListener("click", (e) => {
  if (e.target === infoBackdrop) infoBackdrop.classList.remove("open");
});

// Share modal + QR
const shareBackdrop = document.getElementById("share-backdrop");
const shareLink = document.getElementById("share-link");
const shareQr = document.getElementById("share-qr");
const shareCopy = document.getElementById("share-copy");
const shareDownload = document.getElementById("share-download");
const shareOpenStudent = document.getElementById("share-open-student");
const shareOpenResult = document.getElementById("share-open-result");
const shareClose = document.getElementById("share-close");
let currentShareUrl = "";
let currentQrCanvas = null;

async function openShare(id) {
  currentShareUrl = `${location.origin}/student.html?a=${id}`;
  if (shareLink) shareLink.value = currentShareUrl;
  if (shareOpenStudent) shareOpenStudent.href = currentShareUrl;
  if (shareOpenResult) shareOpenResult.href = `${location.origin}/result.html?a=${id}`;
  if (shareQr) {
    shareQr.innerHTML = '<canvas id="qr-canvas" width="220" height="220" aria-label="QR-код"></canvas>';
    const canvas = document.getElementById("qr-canvas");
    currentQrCanvas = canvas;
    try {
      if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
        await window.QRCode.toCanvas(canvas, currentShareUrl, { width: 220, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } });
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 220, 220);
          ctx.drawImage(img, 0, 0, 220, 220);
        };
        img.onerror = () => {
          shareQr.innerHTML = `<p class="small muted">QR жүктелмеді. Сілтемені көшіріп алыңыз.</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(currentShareUrl)}" alt="QR" style="max-width:220px" />`;
        };
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(currentShareUrl)}`;
      }
    } catch (e) {
      console.error(e);
      shareQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(currentShareUrl)}" alt="QR" />`;
      currentQrCanvas = null;
    }
  }
  shareBackdrop.classList.add("open");
  shareBackdrop.setAttribute("aria-hidden", "false");
}

shareCopy?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentShareUrl);
    showToast("Сілтеме көшірілді");
  } catch {
    shareLink?.select();
    document.execCommand("copy");
    showToast("Сілтеме көшірілді");
  }
});

shareDownload?.addEventListener("click", () => {
  if (!currentQrCanvas) {
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(currentShareUrl)}`, "_blank");
    return;
  }
  const url = currentQrCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "qr.png";
  a.click();
});

shareClose?.addEventListener("click", () => {
  shareBackdrop.classList.remove("open");
  shareBackdrop.setAttribute("aria-hidden", "true");
});
shareBackdrop?.addEventListener("click", (e) => {
  if (e.target === shareBackdrop) shareBackdrop.classList.remove("open");
});

async function handleDelete(id) {
  if (!confirm("Осы БЖБ/ТЖБ жойылсын ба?")) return;
  try {
    await deleteDoc(doc(db, "assessments", id));
    showToast("Жойылды");
  } catch (e) {
    console.error(e);
    showToast("Жою қатесі: " + (e.message || e.code));
  }
}

async function handlePublish(id) {
  try {
    await updateDoc(doc(db, "assessments", id), { status: "published" });
    showToast("Жарияланды");
    openShare(id);
  } catch (e) {
    console.error(e);
    showToast("Жариялау қатесі: " + (e.message || e.code));
  }
}

// Load QR lib
(function loadQrLib() {
  if (window.QRCode) return;
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
  s.async = true;
  document.head.appendChild(s);
})();

// ========== STUDENTS CRUD ==========
const studentsTbody = document.getElementById("students-tbody");
const studentsCountEl = document.getElementById("students-count");
const formAddStudent = document.getElementById("form-add-student");
const stAddError = document.getElementById("st-add-error");
const stAddOk = document.getElementById("st-add-ok");
const btnRefreshStudents = document.getElementById("btn-refresh-students");

let studentsCache = [];

async function loadStudents() {
  if (!studentsTbody) return;
  studentsTbody.innerHTML = `<tr><td colspan="5" class="small muted" style="text-align:center;padding:24px">Жүктелуде...</td></tr>`;
  try {
    // Students belonging to this teacher: teacherUid == user.uid
    // Also show students without teacherUid that were auto-registered? We show all with teacherUid==uid plus those with teacherUid==null filtered client-side is not needed.
    // Prototype: show where teacherUid == user.uid and also login-based students that teacher created will have teacherUid.
    // We also query all students where teacherUid == user.uid (firestore requires index for where)
    const qSt = query(collection(db, "students"), where("teacherUid", "==", user.uid));
    const snap = await getDocs(qSt);
    studentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStudents();
  } catch (e) {
    console.error(e);
    // Fallback: get all and filter client side (prototype)
    try {
      const snap2 = await getDocs(collection(db, "students"));
      studentsCache = snap2.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.teacherUid === user.uid);
      renderStudents();
    } catch (e2) {
      studentsTbody.innerHTML = `<tr><td colspan="5" class="small muted" style="text-align:center;padding:24px">Жүктеу қатесі: ${esc(e.message || e.code)}</td></tr>`;
    }
  }
}

function renderStudents() {
  if (!studentsTbody) return;
  if (studentsCountEl) studentsCountEl.textContent = `${studentsCache.length} оқушы`;
  if (studentsCache.length === 0) {
    studentsTbody.innerHTML = `<tr><td colspan="5" class="small muted" style="text-align:center;padding:24px">Әзірге оқушы жоқ — жоғарыдан қосыңыз</td></tr>`;
    return;
  }
  studentsTbody.innerHTML = studentsCache
    .map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="font-weight:600">${esc(s.name || "—")}</td>
      <td><code>${esc(s.login || "—")}</code></td>
      <td><code>${esc(s.password || "—")}</code></td>
      <td>
        <div class="flex gap8">
          <button class="btn btn-ghost btn-small btn-st-edit" data-id="${esc(s.id)}" aria-label="Өңдеу">Өңдеу</button>
          <button class="btn btn-ghost btn-small btn-st-del" data-id="${esc(s.id)}" aria-label="Жою" style="color:var(--danger)">Жою</button>
        </div>
      </td>
    </tr>
  `).join("");

  studentsTbody.querySelectorAll(".btn-st-edit").forEach((btn) => btn.addEventListener("click", () => openEditStudent(btn.dataset.id)));
  studentsTbody.querySelectorAll(".btn-st-del").forEach((btn) => btn.addEventListener("click", () => deleteStudent(btn.dataset.id)));
}

formAddStudent?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (stAddError) stAddError.textContent = "";
  if (stAddOk) stAddOk.textContent = "";
  const name = document.getElementById("st-name").value.trim();
  const login = document.getElementById("st-login").value.trim();
  const pass = document.getElementById("st-pass").value;
  if (!name || !login || !pass) {
    if (stAddError) stAddError.textContent = "Барлық өрісті толтырыңыз";
    return;
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) {
    if (stAddError) stAddError.textContent = "Логин: 3–32 таңба, тек латын әріп/сан/_ . -";
    return;
  }
  if (pass.length < 4) {
    if (stAddError) stAddError.textContent = "Пароль кемінде 4 таңба";
    return;
  }
  try {
    if (stAddOk) stAddOk.textContent = "Қосылуда...";
    await teacherCreateStudent({ name, login, password: pass, teacherUid: user.uid });
    if (stAddOk) stAddOk.textContent = "Оқушы қосылды ✓";
    if (stAddError) stAddError.textContent = "";
    formAddStudent.reset();
    await loadStudents();
    showToast("Оқушы қосылды");
    setTimeout(() => { if (stAddOk) stAddOk.textContent = ""; }, 2000);
  } catch (err) {
    if (stAddError) stAddError.textContent = err.message || String(err);
    if (stAddOk) stAddOk.textContent = "";
  }
});

btnRefreshStudents?.addEventListener("click", () => loadStudents());

// Student link copy
const btnCopyStudentLink = document.getElementById("btn-copy-student-link");
const studentLinkPreview = document.getElementById("student-link-preview");
if (studentLinkPreview) studentLinkPreview.textContent = `${location.origin}/student-auth.html`;
btnCopyStudentLink?.addEventListener("click", async () => {
  const url = `${location.origin}/student-auth.html`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Сілтеме көшірілді");
  } catch {
    prompt("Сілтеме:", url);
  }
});

// Edit student modal
const editBackdrop = document.getElementById("edit-student-backdrop");
const editName = document.getElementById("edit-st-name");
const editLogin = document.getElementById("edit-st-login");
const editPass = document.getElementById("edit-st-pass");
const editError = document.getElementById("edit-st-error");
const editCancel = document.getElementById("edit-st-cancel");
const editSave = document.getElementById("edit-st-save");
let editingId = null;

function openEditStudent(id) {
  const s = studentsCache.find((x) => x.id === id);
  if (!s) return;
  editingId = id;
  if (editName) editName.value = s.name || "";
  if (editLogin) editLogin.value = s.login || "";
  if (editPass) editPass.value = s.password || "";
  if (editError) editError.textContent = "";
  editBackdrop?.classList.add("open");
  editBackdrop?.setAttribute("aria-hidden", "false");
}

editCancel?.addEventListener("click", () => {
  editBackdrop?.classList.remove("open");
  editingId = null;
});
editBackdrop?.addEventListener("click", (e) => {
  if (e.target === editBackdrop) { editBackdrop.classList.remove("open"); editingId = null; }
});

editSave?.addEventListener("click", async () => {
  if (!editingId) return;
  const name = (editName?.value || "").trim();
  const login = (editLogin?.value || "").trim();
  const pass = editPass?.value || "";
  if (!name || !login || !pass) {
    if (editError) editError.textContent = "Барлық өрісті толтырыңыз";
    return;
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) {
    if (editError) editError.textContent = "Логин форматы қате";
    return;
  }
  if (pass.length < 4) {
    if (editError) editError.textContent = "Пароль кемінде 4 таңба";
    return;
  }
  // Check login uniqueness if changed
  const orig = studentsCache.find((x) => x.id === editingId);
  if (login !== orig?.login) {
    try {
      const qDup = query(collection(db, "students"), where("login", "==", login));
      const snapDup = await getDocs(qDup);
      const exists = snapDup.docs.some((d) => d.id !== editingId);
      if (exists) {
        if (editError) editError.textContent = "Бұл логин бос емес";
        return;
      }
    } catch {}
  }
  try {
    editSave.disabled = true;
    editSave.textContent = "Сақталуда...";
    await updateDoc(doc(db, "students", editingId), { name, login, password: pass });
    showToast("Оқушы жаңартылды");
    editBackdrop?.classList.remove("open");
    editingId = null;
    await loadStudents();
  } catch (e) {
    if (editError) editError.textContent = e.message || String(e);
  } finally {
    editSave.disabled = false;
    editSave.textContent = "Сақтау";
  }
});

async function deleteStudent(id) {
  if (!confirm("Осы оқушыны жою керек пе?")) return;
  try {
    await deleteDoc(doc(db, "students", id));
    showToast("Оқушы жойылды");
    await loadStudents();
  } catch (e) {
    showToast("Жою қатесі: " + (e.message || String(e)));
  }
}

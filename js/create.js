// create.html — assessment builder
import { requireTeacher, doSignOut } from "./auth.js";
import { db } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { genId, totalPoints, showToast, esc, formatDurationSec } from "./utils.js";

const user = await requireTeacher("index.html");
if (!user) throw new Error("not authed");

function inferMediaType(url) {
  if (!url) return "";
  const u = String(url).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|#|$)/.test(u)) return "image";
  if (/(youtube\.com|youtu\.be|vimeo)/.test(u) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/.test(u)) return "video";
  return "image";
}

document.getElementById("btn-logout")?.addEventListener("click", () => doSignOut().then(() => (location.href = "index.html")));

const params = new URLSearchParams(location.search);
const editId = params.get("id");
const isEdit = !!editId;

const form = document.getElementById("form");
const fType = document.getElementById("f-type");
const fSubject = document.getElementById("f-subject");
const fTopic = document.getElementById("f-topic");
const fMin = document.getElementById("f-min");
const fSec = document.getElementById("f-sec");
const durationPreview = document.getElementById("duration-preview");
const questionsEl = document.getElementById("questions");
const formStatus = document.getElementById("form-status");
const pageTitle = document.getElementById("page-title");

if (isEdit && pageTitle) pageTitle.textContent = "БЖБ/ТЖБ өңдеу";

// Questions state:
// {id, type:"single"|"short"|"open"|"matching", text, options:[], correct, points,
//  media:{type:"",url:""}, pairs:[{left,right}]}
let questions = [];

function durationSec() {
  const m = Math.max(0, parseInt(fMin.value || "0", 10));
  const s = Math.max(0, Math.min(59, parseInt(fSec.value || "0", 10)));
  return m * 60 + s;
}

function updateDurationPreview() {
  if (!durationPreview) return;
  const sec = durationSec();
  durationPreview.textContent = sec ? `Барлығы: ${formatDurationSec(sec)}` : "Уақытты енгізіңіз";
}
fMin?.addEventListener("input", updateDurationPreview);
fSec?.addEventListener("input", updateDurationPreview);
updateDurationPreview();

function addQuestion(type) {
  const q = {
    id: genId(),
    type,
    text: "",
    options: type === "single" ? ["", "", ""] : [],
    correct: type === "single" ? 0 : "",
    points: 1,
    media: { type: "", url: "" },
    pairs: type === "matching" ? [{ left: "", right: "" }] : [],
  };
  questions.push(q);
  renderQuestions();
}

function removeQuestion(id) {
  questions = questions.filter((q) => q.id !== id);
  renderQuestions();
}

function moveQuestion(id, dir) {
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) return;
  const nIdx = idx + dir;
  if (nIdx < 0 || nIdx >= questions.length) return;
  const [q] = questions.splice(idx, 1);
  questions.splice(nIdx, 0, q);
  renderQuestions();
}

function renderQuestions() {
  if (!questionsEl) return;
  if (questions.length === 0) {
    questionsEl.innerHTML = `<p class="small muted" style="padding:12px;border:1px dashed var(--border);border-radius:10px">Әзірге сұрақ жоқ. Төмендегі батырмалармен қосыңыз.</p>`;
    return;
  }
  questionsEl.innerHTML = questions
    .map((q, idx) => {
      const typeLabel =
        q.type === "single" ? "Бір жауапты" :
        q.type === "short" ? "Қысқа жауап" :
        q.type === "matching" ? "Сәйкестендіру" : "Ашық сұрақ";
      const typeBadge = `<span class="pill" style="font-size:11px">${typeLabel}</span>`;

      // media block — infer type from URL when not set explicitly
      const mtype = q.media?.type || inferMediaType(q.media?.url || "");
      const mediaBlock = `
        <div class="form-group" style="margin-top:10px">
          <label>Сурет / Видео (қалауыңызша — файл жүктеңіз немесе URL енгізіңіз)</label>
          <div class="flex gap8 wrap" style="align-items:center">
            <input type="file" accept="image/*,video/*" data-upload="${q.id}" class="input" style="flex:1;min-width:180px" />
            <input type="text" class="input" data-media-url="${q.id}" value="${esc(q.media?.url || "")}" placeholder="немесе https://... URL" style="flex:2;min-width:200px" />
            <select class="input" data-media-type="${q.id}" style="width:auto">
              <option value="" ${!q.media?.type ? "selected" : ""}>Түрі</option>
              <option value="image" ${mtype === "image" ? "selected" : ""}>Сурет</option>
              <option value="video" ${mtype === "video" ? "selected" : ""}>Видео</option>
            </select>
          </div>
          ${
            q.media?.url
              ? mtype === "image"
                ? `<img src="${esc(q.media.url)}" style="max-height:120px;margin-top:8px;border-radius:8px" alt="" />`
                : `<video src="${esc(q.media.url)}" controls style="max-height:120px;margin-top:8px"></video>`
              : ""
          }
        </div>`;

      let body = "";
      if (q.type === "single") {
        body = `
          <div class="q-options">
            ${q.options
              .map(
                (opt, oi) => `
              <div class="q-option">
                <input type="radio" name="correct-${q.id}" value="${oi}" ${String(q.correct) === String(oi) ? "checked" : ""} aria-label="Дұрыс жауап ${oi + 1}" />
                <input type="text" class="input" data-opt="${q.id}:${oi}" value="${esc(opt)}" placeholder="Нұсқа ${oi + 1}" />
                ${q.options.length > 3 ? `<button type="button" class="btn btn-ghost btn-small" data-rm-opt="${q.id}:${oi}" aria-label="Нұсқаны жою">✕</button>` : ""}
              </div>`
              )
              .join("")}
            <div class="flex gap8">
              ${q.options.length < 5 ? `<button type="button" class="btn btn-ghost btn-small" data-add-opt="${q.id}">+ Нұсқа</button>` : ""}
              <span class="small muted" style="align-self:center">Дұрысын белгілеңіз (дөңгелек)</span>
            </div>
          </div>`;
      } else if (q.type === "short") {
        body = `
          <div class="form-group" style="margin-top:10px">
            <label>Дұрыс жауап (дәл сәйкестік, регистр ескерілмейді)</label>
            <input type="text" class="input" data-correct="${q.id}" value="${esc(q.correct)}" placeholder="Мысалы: Алматы" />
          </div>`;
      } else if (q.type === "matching") {
        const pairsHtml = (q.pairs || [])
          .map(
            (p, pi) => `
          <div class="flex gap8" style="margin-top:6px">
            <input type="text" class="input" placeholder="Сол жақ (термин)" value="${esc(p.left)}" data-pair-left="${q.id}:${pi}" />
            <input type="text" class="input" placeholder="Оң жақ (жауап)" value="${esc(p.right)}" data-pair-right="${q.id}:${pi}" />
            ${q.pairs.length > 2 ? `<button type="button" class="btn btn-ghost btn-small" data-rm-pair="${q.id}:${pi}" aria-label="Жұпты жою">✕</button>` : ""}
          </div>`
          )
          .join("");
        body = `
          <div class="form-group" style="margin-top:10px">
            <label>Жұптар (сол жақ — оң жақ)</label>
            ${pairsHtml}
            <button type="button" class="btn btn-ghost btn-small" data-add-pair="${q.id}">+ Жұп қосу</button>
          </div>`;
      } else {
        body = `<p class="small muted" style="margin-top:10px">Ашық сұрақ — оқушы еркін жазады, сіз қолмен бағалайсыз.</p>`;
      }

      return `
      <div class="q-card" data-qid="${q.id}">
        <div class="q-head">
          <div class="flex gap8" style="align-items:center">
            <span class="small muted">#${idx + 1}</span>
            ${typeBadge}
          </div>
          <div class="q-actions">
            <button type="button" class="icon-btn btn-small" data-move="${q.id}:-1" aria-label="Жоғары" title="Жоғары">↑</button>
            <button type="button" class="icon-btn btn-small" data-move="${q.id}:1" aria-label="Төмен" title="Төмен">↓</button>
            <button type="button" class="btn btn-ghost btn-small" data-remove="${q.id}" aria-label="Сұрақты жою">Жою</button>
          </div>
        </div>
        <div class="form-group">
          <label>Сұрақ мәтіні</label>
          <textarea class="textarea" data-text="${q.id}" placeholder="Сұрақты жазыңыз..." required>${esc(q.text)}</textarea>
        </div>
        ${mediaBlock}
        ${body}
        <div class="form-group" style="margin-top:12px;max-width:160px">
          <label>Балл</label>
          <input type="number" class="input" data-points="${q.id}" min="1" max="100" value="${q.points}" />
        </div>
      </div>`;
    })
    .join("");

  // ---- Bind events ----
  questionsEl.querySelectorAll("[data-text]").forEach((el) => {
    el.addEventListener("input", () => {
      const q = questions.find((x) => x.id === el.dataset.text);
      if (q) q.text = el.value;
    });
  });
  questionsEl.querySelectorAll("[data-points]").forEach((el) => {
    el.addEventListener("input", () => {
      const q = questions.find((x) => x.id === el.dataset.points);
      if (q) q.points = Math.max(1, parseInt(el.value || "1", 10));
    });
  });
  questionsEl.querySelectorAll("[data-correct]").forEach((el) => {
    el.addEventListener("input", () => {
      const q = questions.find((x) => x.id === el.dataset.correct);
      if (q) q.correct = el.value;
    });
  });
  questionsEl.querySelectorAll("[data-opt]").forEach((el) => {
    el.addEventListener("input", () => {
      const [qid, oi] = el.dataset.opt.split(":");
      const q = questions.find((x) => x.id === qid);
      if (q) q.options[parseInt(oi, 10)] = el.value;
    });
  });
  questionsEl.querySelectorAll("[name^='correct-']").forEach((el) => {
    el.addEventListener("change", () => {
      const qid = el.name.replace("correct-", "");
      const q = questions.find((x) => x.id === qid);
      if (q) q.correct = parseInt(el.value, 10);
    });
  });
  questionsEl.querySelectorAll("[data-add-opt]").forEach((el) => {
    el.addEventListener("click", () => {
      const q = questions.find((x) => x.id === el.dataset.addOpt);
      if (q && q.options.length < 5) {
        q.options.push("");
        renderQuestions();
      }
    });
  });
  questionsEl.querySelectorAll("[data-rm-opt]").forEach((el) => {
    el.addEventListener("click", () => {
      const [qid, oi] = el.dataset.rmOpt.split(":");
      const q = questions.find((x) => x.id === qid);
      if (q && q.options.length > 3) {
        q.options.splice(parseInt(oi, 10), 1);
        if (q.correct >= q.options.length) q.correct = 0;
        renderQuestions();
      }
    });
  });
  // matching pairs
  questionsEl.querySelectorAll("[data-add-pair]").forEach((el) => {
    el.addEventListener("click", () => {
      const q = questions.find((x) => x.id === el.dataset.addPair);
      if (q) {
        q.pairs = q.pairs || [];
        q.pairs.push({ left: "", right: "" });
        renderQuestions();
      }
    });
  });
  questionsEl.querySelectorAll("[data-rm-pair]").forEach((el) => {
    el.addEventListener("click", () => {
      const [qid, pi] = el.dataset.rmPair.split(":");
      const q = questions.find((x) => x.id === qid);
      if (q && q.pairs && q.pairs.length > 2) {
        q.pairs.splice(parseInt(pi, 10), 1);
        renderQuestions();
      }
    });
  });
  questionsEl.querySelectorAll("[data-pair-left]").forEach((el) => {
    el.addEventListener("input", () => {
      const [qid, pi] = el.dataset.pairLeft.split(":");
      const q = questions.find((x) => x.id === qid);
      if (q && q.pairs) q.pairs[parseInt(pi, 10)].left = el.value;
    });
  });
  questionsEl.querySelectorAll("[data-pair-right]").forEach((el) => {
    el.addEventListener("input", () => {
      const [qid, pi] = el.dataset.pairRight.split(":");
      const q = questions.find((x) => x.id === qid);
      if (q && q.pairs) q.pairs[parseInt(pi, 10)].right = el.value;
    });
  });
  // media url / type
  questionsEl.querySelectorAll("[data-media-url]").forEach((el) => {
    el.addEventListener("input", () => {
      const q = questions.find((x) => x.id === el.dataset.mediaUrl);
      if (q) { q.media = q.media || {}; q.media.url = el.value; }
    });
  });
  questionsEl.querySelectorAll("[data-media-type]").forEach((el) => {
    el.addEventListener("change", () => {
      const q = questions.find((x) => x.id === el.dataset.mediaType);
      if (q) { q.media = q.media || {}; q.media.type = el.value; }
    });
  });
  // file upload to Firebase Storage
  questionsEl.querySelectorAll("[data-upload]").forEach((el) => {
    el.addEventListener("change", async () => {
      const file = el.files?.[0];
      if (!file) return;
      const q = questions.find((x) => x.id === el.dataset.upload);
      if (!q) return;
      try {
        showToast("Жүктелуде...");
        const storage = getStorage();
        const path = `question-media/${user.uid}/${Date.now()}_${file.name}`;
        const fileRef = storageRef(storage, path);
        const snapshot = await uploadBytesResumable(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        q.media = q.media || {};
        q.media.url = url;
        q.media.type = file.type.startsWith("image") ? "image" : "video";
        renderQuestions();
        showToast("Файл жүктелді");
      } catch (e) {
        console.error(e);
        showToast("Жүктеу қатесі: " + (e.message || e.code));
      }
    });
  });
  questionsEl.querySelectorAll("[data-remove]").forEach((el) => {
    el.addEventListener("click", () => removeQuestion(el.dataset.remove));
  });
  questionsEl.querySelectorAll("[data-move]").forEach((el) => {
    el.addEventListener("click", () => {
      const [qid, dir] = el.dataset.move.split(":");
      moveQuestion(qid, parseInt(dir, 10));
    });
  });
}

// Add question buttons
document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => addQuestion(btn.dataset.add));
});

// Load existing if edit
if (isEdit) {
  try {
    if (formStatus) formStatus.textContent = "Жүктелуде...";
    const snap = await getDoc(doc(db, "assessments", editId));
    if (!snap.exists()) {
      if (formStatus) formStatus.textContent = "БЖБ табылмады.";
    } else {
      const data = snap.data();
      if (data.ownerUid !== user.uid) {
        if (formStatus) formStatus.textContent = "Бұл БЖБ сізге тиесілі емес.";
        form.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = true));
      } else {
        fType.value = data.type || "БЖБ";
        fSubject.value = data.subject || "";
        fTopic.value = data.topic || "";
        const sec = data.durationSec || 900;
        fMin.value = Math.floor(sec / 60);
        fSec.value = sec % 60;
        updateDurationPreview();
        questions = (data.questions || []).map((q) => ({
          ...q,
          media: q.media || { type: "", url: "" },
          pairs: q.pairs || [],
        }));
        renderQuestions();
        if (formStatus) formStatus.textContent = "";
      }
    }
  } catch (e) {
    console.error(e);
    if (formStatus) formStatus.textContent = "Жүктеу қатесі: " + (e.message || e.code);
  }
} else {
  renderQuestions();
}

// Form submit
let submitting = false;
let pendingStatus = "draft";
form?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[type='submit']");
  if (btn) pendingStatus = btn.dataset.action || "draft";
});

// Prevent Enter from implicitly submitting the form on single-line inputs;
// textarea keeps its default newline behaviour.
form?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;

  // Validation
  const subject = fSubject.value.trim();
  const topic = fTopic.value.trim();
  const durSec = durationSec();
  if (!subject) {
    showToast("Пәнді енгізіңіз");
    fSubject.focus();
    return;
  }
  if (!topic) {
    showToast("Тақырыпты енгізіңіз");
    fTopic.focus();
    return;
  }
  if (durSec < 10) {
    showToast("Уақыт кемінде 10 секунд болуы керек");
    return;
  }
  if (questions.length === 0) {
    showToast("Кемінде 1 сұрақ қосыңыз");
    return;
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.text.trim()) {
      showToast(`${i + 1}-сұрақ мәтіні бос`);
      return;
    }
    if (q.type === "single") {
      const filled = q.options.filter((o) => o.trim()).length;
      if (filled < 3) {
        showToast(`${i + 1}-сұрақ: кемінде 3 нұсқа толтырыңыз`);
        return;
      }
      if (q.options.some((o) => !o.trim())) {
        showToast(`${i + 1}-сұрақ: барлық нұсқаларды толтырыңыз`);
        return;
      }
    }
    if (q.type === "short" && !String(q.correct).trim()) {
      showToast(`${i + 1}-сұрақ: дұрыс жауапты енгізіңіз`);
      return;
    }
    if (q.type === "matching") {
      const pairs = (q.pairs || []).filter((p) => p.left.trim() && p.right.trim());
      if (pairs.length < 2) {
        showToast(`${i + 1}-сұрақ: кемінде 2 толтырылған жұп керек`);
        return;
      }
    }
  }

  submitting = true;
  if (formStatus) formStatus.textContent = "Сақталуда...";

  const payload = {
    ownerUid: user.uid,
    type: fType.value,
    subject,
    topic,
    durationSec: durSec,
    status: pendingStatus,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text.trim(),
      options: q.type === "single" ? q.options.map((o) => o.trim()) : [],
      correct: q.correct,
      points: Math.max(1, parseInt(q.points, 10) || 1),
      media: q.media && q.media.url ? { type: q.media.type || "image", url: q.media.url } : null,
      pairs: q.type === "matching" ? (q.pairs || []).filter((p) => p.left.trim() && p.right.trim()) : [],
    })),
    totalPoints: totalPoints(questions),
    teacherName: user.displayName || user.email || "Мұғалім",
    createdAt: serverTimestamp(),
  };

  try {
    let id = editId;
    if (isEdit) {
      const { createdAt, ...rest } = payload;
      await updateDoc(doc(db, "assessments", editId), { ...rest, updatedAt: serverTimestamp() });
    } else {
      const ref = await addDoc(collection(db, "assessments"), payload);
      id = ref.id;
    }
    if (formStatus) formStatus.textContent = pendingStatus === "published" ? "Жарияланды!" : "Сақталды!";
    showToast(pendingStatus === "published" ? "Жарияланды" : "Жоба сақталды");

    if (pendingStatus === "published") {
      showShareModal(id);
    } else {
      setTimeout(() => (location.href = "teacher.html"), 600);
    }
  } catch (err) {
    console.error(err);
    if (formStatus) formStatus.textContent = "Қате: " + (err.message || err.code);
    showToast("Сақтау қатесі: " + (err.message || err.code));
  } finally {
    submitting = false;
  }
});

// Share modal
const shareBackdrop = document.getElementById("share-backdrop");
const shareLink = document.getElementById("share-link");
const shareQr = document.getElementById("share-qr");
const shareCopy = document.getElementById("share-copy");
const shareDownload = document.getElementById("share-download");
const shareResult = document.getElementById("share-result");
const shareClose = document.getElementById("share-close");
let shareUrl = "";
let qrCanvas = null;

function showShareModal(id) {
  shareUrl = `${location.origin}/student.html?a=${id}`;
  if (shareLink) shareLink.value = shareUrl;
  if (shareResult) shareResult.href = `${location.origin}/result.html?a=${id}`;
  if (shareQr) {
    shareQr.innerHTML = '<canvas id="qr-canvas2" width="220" height="220" aria-label="QR-код"></canvas>';
    qrCanvas = document.getElementById("qr-canvas2");
    if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
      window.QRCode.toCanvas(qrCanvas, shareUrl, { width: 220, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } }).catch(() => {
        fallbackQr();
      });
    } else {
      fallbackQr();
    }
  }
  shareBackdrop?.classList.add("open");
  shareBackdrop?.setAttribute("aria-hidden", "false");
}

function fallbackQr() {
  if (!shareQr) return;
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.alt = "QR-код";
  img.style.maxWidth = "220px";
  img.onload = () => {
    if (!qrCanvas) return;
    const ctx = qrCanvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 220, 220);
    ctx.drawImage(img, 0, 0, 220, 220);
  };
  img.src = url;
  if (!qrCanvas) shareQr.innerHTML = `<img src="${url}" alt="QR" />`;
}

shareCopy?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast("Сілтеме көшірілді");
  } catch {
    shareLink?.select();
    document.execCommand("copy");
    showToast("Сілтеме көшірілді");
  }
});
shareDownload?.addEventListener("click", () => {
  if (!qrCanvas) {
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(shareUrl)}`, "_blank");
    return;
  }
  const a = document.createElement("a");
  a.href = qrCanvas.toDataURL("image/png");
  a.download = "qr.png";
  a.click();
});
shareClose?.addEventListener("click", () => {
  shareBackdrop?.classList.remove("open");
  location.href = "teacher.html";
});
shareBackdrop?.addEventListener("click", (e) => {
  if (e.target === shareBackdrop) shareBackdrop.classList.remove("open");
});

// Load QR lib
(function () {
  if (window.QRCode) return;
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
  s.async = true;
  document.head.appendChild(s);
})();

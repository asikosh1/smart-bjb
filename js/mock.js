// Mock backend for local-network testing WITHOUT Firebase
// Intercepts Firestore SDK calls via window.__SMART_BJB_MOCK__
// Enable: localStorage.setItem("smart-bjb:useMock", "1") and reload
// Disable: localStorage.removeItem("smart-bjb:useMock") and reload
// Or: http://.../index.html?mock=1  (auto-enables)

(function () {
  const KEY = "smart-bjb:mock-db";
  const USE_KEY = "smart-bjb:useMock";

  // auto-enable via ?mock=1 or ?mock=0
  try {
    const p = new URLSearchParams(location.search);
    if (p.get("mock") === "1") localStorage.setItem(USE_KEY, "1");
    if (p.get("mock") === "0") localStorage.removeItem(USE_KEY);
  } catch {}

  function loadDB() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return seedDB();
  }

  function saveDB(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function seedDB() {
    const db = {
      // Single demo teacher (email+password)
      teachers: [
        { id: "t_demo", email: "demo@mектеп.kz", password: "demo1234", displayName: "Демо Мұғалім" }
      ],
      // Demo students (linked to demo teacher)
      students: [
        { id: "s1", name: "Аян Нұрланұлы", login: "ayan_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() },
        { id: "s2", name: "Айзере Берікқызы", login: "aizere_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() },
        { id: "s3", name: "Ерасыл Қайратұлы", login: "erasyl_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() }
      ],
      assessments: [
        {
          id: "ass_demo",
          ownerUid: "t_demo",
          type: "БЖБ",
          subject: "Математика",
          topic: "Квадрат теңдеулер",
          durationSec: 600,
          status: "published",
          questions: [
            { id: "q1", type: "single", text: "x² = 9 теңдеуінің шешімі?", options: ["x=3", "x=±3", "x=9", "Шешімі жоқ"], correct: 1, points: 2 },
            { id: "q2", type: "short", text: "Квадрат теңдеудің дискриминант формуласы?", correct: "D=b²-4ac", points: 2 },
            { id: "q3", type: "open", text: "Квадрат теңдеуді шешу жолын мысалмен түсіндір.", options: [], correct: "", points: 3 }
          ],
          totalPoints: 7,
          teacherName: "Демо Мұғалім",
          createdAt: nowIso()
        },
        {
          id: "ass_draft",
          ownerUid: "t_demo",
          type: "ТЖБ",
          subject: "Физика",
          topic: "Механика",
          durationSec: 900,
          status: "draft",
          questions: [
            { id: "q1", type: "single", text: "Күш өлшем бірлігі?", options: ["Джоуль", "Ньютон", "Паскаль", "Ватт"], correct: 1, points: 1 }
          ],
          totalPoints: 1,
          teacherName: "Демо Мұғалім",
          createdAt: nowIso()
        }
      ],
      submissions: [
        // one submitted demo
        { id: "sub1", assessmentId: "ass_demo", studentId: "s1", studentUid: "s1", studentName: "Аян Нұрланұлы", studentLogin: "ayan_8a", answers: { q1: "1", q2: "d=b²-4ac", q3: "ах²+вх+с=0 ..." }, score: 4, percent: 57, level: "Орта", status: "submitted", startedAt: nowIso(), submittedAt: nowIso(), leaveCount: 1, totalAwayMs: 12000, totalPoints: 7, gradedPoints: 4, pendingOpen: 1, openScores: {} }
      ],
      events: [
        { id: "ev1", assessmentId: "ass_demo", submissionId: "sub1", studentName: "Аян Нұрланұлы", studentLogin: "ayan_8a", type: "left", at: nowIso(), source: "visibility" }
      ]
    };
    saveDB(db);
    return db;
  }

  function isMockEnabled() {
    try { return localStorage.getItem(USE_KEY) === "1"; } catch { return false; }
  }

  function ensureMock() {
    if (!isMockEnabled()) return;
    const db = loadDB();
    // expose helpers
    window.__SMART_BJB_MOCK__ = {
      enabled: true,
      db,
      save() { saveDB(this.db); },
      reset() {
        localStorage.removeItem(KEY);
        this.db = seedDB();
        saveDB(this.db);
        location.reload();
      },
      export() {
        return JSON.stringify(this.db, null, 2);
      },
      import(jsonStr) {
        const parsed = JSON.parse(jsonStr);
        this.db = parsed;
        saveDB(this.db);
        location.reload();
      },
      genId: uid,
      nowIso,
    };
    console.log("[mock] Smart-БЖБ mock enabled. Demo: demo@mектеп.kz / demo1234 ; students: ayan_8a / 1111");
  }

  ensureMock();

  // Backup helpers (regardless of mock mode): expose backup utils
  window.__SMART_BJB_BACKUP__ = {
    downloadBackup() {
      const mockEnabled = isMockEnabled();
      let data;
      if (mockEnabled && window.__SMART_BJB_MOCK__) {
        data = window.__SMART_BJB_MOCK__.db;
      } else {
        // fallback: dump localStorage keys
        data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("smart-bjb:")) {
            try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = localStorage.getItem(k); }
          }
        }
        data._note = "Firebase режимінде толық бэкап Firestore-дан жасалады (mock емес). Бұл — тек localStorage дампы.";
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `smart-bjb-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };
})();

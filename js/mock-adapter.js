// Mock adapter — emulates Auth + Firestore on top of localStorage for offline/local-network testing
// Usage: ?mock=1  or  localStorage.setItem("smart-bjb:useMock","1")
// This file is the single source of mock behavior; js/mock.js just seeds data.
// Pages use MOCK flag from firebase.js and call these helpers instead of Firebase when enabled.

const DB_KEY = "smart-bjb:mock-db";
const SESSION_KEY = "smart-bjb:mock-session"; // { uid, email, displayName } for teacher

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function nowIso() { return new Date().toISOString(); }

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // fallback seed (also in mock.js)
  return {
    teachers: [{ id: "t_demo", email: "demo@mектеп.kz", password: "demo1234", displayName: "Демо Мұғалім" }],
    students: [
      { id: "s1", name: "Аян Нұрланұлы", login: "ayan_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() },
      { id: "s2", name: "Айзере Берікқызы", login: "aizere_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() },
      { id: "s3", name: "Ерасыл Қайратұлы", login: "erasyl_8a", password: "1111", teacherUid: "t_demo", createdAt: nowIso() }
    ],
    assessments: [
      { id: "ass_demo", ownerUid: "t_demo", type: "БЖБ", subject: "Математика", topic: "Квадрат теңдеулер", durationSec: 600, status: "published", questions: [{ id:"q1", type:"single", text:"x² = 9 шешімі?", options:["x=3","x=±3","x=9","Шешімі жоқ"], correct:1, points:2 },{ id:"q2", type:"short", text:"Дискриминант формуласы?", correct:"D=b²-4ac", points:2 },{ id:"q3", type:"open", text:"Мысалмен түсіндір.", options:[], correct:"", points:3 }], totalPoints:7, teacherName:"Демо Мұғалім", createdAt: nowIso() },
      { id: "ass_draft", ownerUid: "t_demo", type:"ТЖБ", subject:"Физика", topic:"Механика", durationSec:900, status:"draft", questions:[{id:"q1",type:"single", text:"Күш өлшемі?", options:["Дж","Н","Па","Вт"], correct:1, points:1}], totalPoints:1, teacherName:"Демо Мұғалім", createdAt: nowIso() }
    ],
    submissions: [{ id:"sub1", assessmentId:"ass_demo", studentId:"s1", studentUid:"s1", studentName:"Аян Нұрланұлы", studentLogin:"ayan_8a", answers:{q1:"1",q2:"d=b²-4ac",q3:"..."}, score:4, percent:57, level:"Орта", status:"submitted", startedAt:nowIso(), submittedAt:nowIso(), leaveCount:1, totalAwayMs:12000, totalPoints:7 }],
    events: [{ id:"ev1", assessmentId:"ass_demo", submissionId:"sub1", studentName:"Аян Нұрланұлы", studentLogin:"ayan_8a", type:"left", at: nowIso(), source:"visibility" }]
  };
}
function saveDB(db){ try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch{} }

function getSession(){
  try{ const r=localStorage.getItem(SESSION_KEY); return r?JSON.parse(r):null; }catch{ return null; }
}
function setSession(s){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }catch{} }
function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch{} }

export const MockAuth = {
  getSession, setSession, clearSession,
  currentUser(){
    const s=getSession(); if(!s) return null;
    return { uid:s.uid||s.id, email:s.email||"", displayName:s.displayName||s.name||"", isAnonymous:false };
  },
  async signInWithGoogle(){
    // mock Google = demo teacher
    const s={ uid:"t_demo", email:"demo@mектеп.kz", displayName:"Демо Мұғалім" };
    setSession(s);
    return { user: { uid:s.uid, email:s.email, displayName:s.displayName, isAnonymous:false } };
  },
  async signInWithEmail(email, password){
    const db=loadDB();
    const t=db.teachers.find(x=>x.email===email && x.password===password);
    if(!t) throw Object.assign(new Error("Email немесе пароль қате"),{code:"auth/invalid-credential"});
    const s={ uid:t.id, email:t.email, displayName:t.displayName };
    setSession(s);
    return { user:{ uid:s.uid, email:s.email, displayName:s.displayName, isAnonymous:false } };
  },
  async signUpWithEmail(email, password){
    if(!email||!password) throw new Error("Email/пароль толтырыңыз");
    if(password.length<6) throw Object.assign(new Error("Пароль кемінде 6 таңба"),{code:"auth/weak-password"});
    const db=loadDB();
    if(db.teachers.some(x=>x.email===email)) throw Object.assign(new Error("Бұл email тіркелген"),{code:"auth/email-already-in-use"});
    const t={ id: uid(), email, password, displayName: email.split("@")[0] };
    db.teachers.push(t); saveDB(db);
    const s={ uid:t.id, email:t.email, displayName:t.displayName };
    setSession(s);
    return { user:{ uid:s.uid, email:s.email, displayName:s.displayName, isAnonymous:false } };
  },
  async signOut(){ clearSession(); },
};

export const MockDB = {
  loadDB, saveDB, uid, nowIso,
  // students
  findStudent(login, password){
    const db=loadDB();
    return db.students.find(s=>s.login===login && s.password===password) || null;
  },
  addStudent({name,login,password,teacherUid}){
    const db=loadDB();
    if(db.students.some(s=>s.login===login)) throw new Error("Бұл логин бос емес");
    const s={ id: uid(), name, login, password, teacherUid: teacherUid||null, createdAt: nowIso() };
    db.students.push(s); saveDB(db); return s;
  },
  studentsByTeacher(teacherUid){
    return loadDB().students.filter(s=>s.teacherUid===teacherUid);
  },
  deleteStudent(id){
    const db=loadDB(); db.students=db.students.filter(s=>s.id!==id); saveDB(db);
  },
  updateStudent(id, patch){
    const db=loadDB(); const s=db.students.find(x=>x.id===id); if(!s) throw new Error("Оқушы табылмады");
    Object.assign(s,patch); saveDB(db); return s;
  },
  // assessments
  assessmentsByOwner(ownerUid){
    return loadDB().assessments.filter(a=>a.ownerUid===ownerUid).sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  },
  getAssessment(id){ return loadDB().assessments.find(a=>a.id===id)||null; },
  addAssessment(doc){
    const db=loadDB(); const a={ id: uid(), ...doc, createdAt: nowIso() }; db.assessments.push(a); saveDB(db); return a;
  },
  updateAssessment(id, patch){
    const db=loadDB(); const a=db.assessments.find(x=>x.id===id); if(!a) throw new Error("БЖБ табылмады");
    Object.assign(a,patch); saveDB(db); return a;
  },
  deleteAssessment(id){
    const db=loadDB(); db.assessments=db.assessments.filter(a=>a.id!==id); db.submissions=db.submissions.filter(s=>s.assessmentId!==id); db.events=db.events.filter(e=>e.assessmentId!==id); saveDB(db);
  },
  // submissions/events
  submissionsByAssessment(assessmentId){
    return loadDB().submissions.filter(s=>s.assessmentId===assessmentId);
  },
  addSubmission(doc){
    const db=loadDB(); const s={ id: uid(), ...doc, startedAt: nowIso() }; db.submissions.push(s); saveDB(db); return s;
  },
  updateSubmission(id, patch){
    const db=loadDB(); const s=db.submissions.find(x=>x.id===id); if(!s) throw new Error("Submission табылмады");
    Object.assign(s,patch); saveDB(db); return s;
  },
  addEvent(doc){
    const db=loadDB(); const e={ id: uid(), ...doc, at: nowIso() }; db.events.push(e); saveDB(db); return e;
  },
  eventsByAssessment(aid){
    return loadDB().events.filter(e=>e.assessmentId===aid).sort((a,b)=>(a.at||"").localeCompare(b.at||""));
  }
};

// expose for console
try{
  window.__SMART_BJB_MOCK__ = { MockAuth, MockDB, loadDB, saveDB };
}catch{}

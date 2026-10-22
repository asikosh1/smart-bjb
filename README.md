# Smart-БЖБ/ТЖБ

Мұғалімдерге **БЖБ/ТЖБ** құрып, сілтеме/QR-код арқылы оқушыларға беруге, нәтижені автоматты тексеріп талдауға арналған веб-сайт. Интерфейс толығымен қазақ тілінде.

- **Стек:** Vanilla HTML + CSS + JS (ES modules), Firebase v10 (Auth + Firestore, CDN), QR — `qrcode` CDN. Build жоқ, npm жоқ.
- **Мұғалім:** Google **немесе** Email/Пароль (Firebase Auth) арқылы кіреді, тек өз БЖБ-ларын көреді. Кабинетте **Оқушылар** қойындысы бар — қарау, қосу, өшіру, пароль өзгерту.
- **Оқушы:** Мұғалім жіберген сілтеме (`student.html?a=ID`) бойынша логин/парольмен кіреді/тіркеледі. Сыныптың барлық оқушысын мұғалім алдын ала қоса алады, оқушылар дайын логин/парольмен кіре береді.
- **Сынып ұғымы жоқ.** Әр БЖБ бөлек сілтемеге ие. Оқушылар мұғалімге байланады (`students.teacherUid`).

## Құрылым

```
index.html            — кіреберіс: мұғалім Google / Email+пароль, оқушыға сілтеме
student-auth.html     — оқушы кіру/тіркелу (логин+пароль)
teacher.html          — кабинет: Менің БЖБ-ларым + Оқушылар (CRUD)
create.html           — БЖБ/ТЖБ құру/өңдеу
student.html?a=ID     — оқушы: логин/пароль → ақпарат → тест → нәтиже
result.html?a=ID      — нәтиже + live (onSnapshot), CSV
css/style.css
js/firebase-config.js — бос шаблон, өзің толтырасың
js/firebase.js        — initializeApp (+ secondaryApp)
js/auth.js            — Google + Email/Password + students (Firestore plain) + Anonymous
js/teacher.js, js/create.js, js/student.js, js/result.js, js/notify.js, js/utils.js
firestore.rules
firebase.json
```

## Локалды іске қосу

```bash
cd smart-bjb
# js/firebase-config.js толтыр (төмен қара)
npx serve
# немесе
python -m http.server 8000
# http://localhost:3000 немесе http://localhost:8000
```

## Firebase-ді нөлден баптау

### 1. Жоба ашу
https://console.firebase.google.com → **Add project** → атын енгіз (мысалы `smart-bjb`).

### 2. Web app + конфиг
Project Overview → **</> (Web)** → App nickname → **Register app** → `firebaseConfig`-ты көшіріп `js/firebase-config.js` ішіне қой:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 3. Authentication
**Build → Authentication → Get started → Sign-in method:**
- **Google** → Enable → Support email → Save
- **Email/Password** → Enable → Save (мұғалім логин/пароль үшін)
- **Anonymous** → Enable → Save (Firestore-қа жазу үшін; оқушылар Firestore plain болғандықтан да қажет — assessment оқу, student іздеу)

**Settings → Authorized domains** ішінде `localhost` бар екенін тексер.

### 4. Firestore
**Build → Firestore Database → Create database → Start in test mode** → Location `europe-west3` → Enable.

Коллекциялар код арқылы құрылады: `assessments`, `assessments/{id}/submissions`, `assessments/{id}/events`, `students`.

### 5. Firestore Rules
**Firestore Database → Rules** қойындысына `firestore.rules` ішін көшіріп **Publish** бас.

Немесе CLI:

```bash
npm i -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

### 6. Hosting

```bash
firebase login
firebase init hosting
# public directory: .
# single-page app: No
# builds: No
firebase deploy --only hosting
# https://<project-id>.web.app
```

## Қалай қолданылады

### Мұғалім
1. `index.html` → **Google** немесе **Email/пароль** (алдымен Тіркелу) → `teacher.html`.
2. **Менің БЖБ-ларым** → **+ Жаңа БЖБ** → өрістер + сұрақтар → **Жариялау** → Бөлісу терезесінен сілтемені көшіріп / QR жүктеп оқушыларға жібер.
3. **Оқушылар** қойындысы → **Жаңа оқушы қосу** (аты-жөні, логин, пароль) → тізімде **Өңдеу** (аты/логин/пароль өзгерту) және **Жою**. Сілтеме бойынша өздігінен тіркелген оқушылар да осында көрінеді.
4. Жарияланған БЖБ жанындағы **Нәтиже** → `result.html?a=ID` → орташа балл, кесте, ең қате сұрақтар, ашық сұраққа қолмен балл, CSV.

### Оқушы
1. Мұғалім жіберген сілтемені ашады: `student.html?a=ID` (немесе `student-auth.html?a=ID`).
2. Логин/парольмен **Кіру** — тіркелмеген болса **Тіркелу** (аты-жөні, логин, пароль). Мұғалім алдын ала қосқан болса — дайын логин/парольмен кіре береді.
3. Ақпарат картасы → **Бастау** → тест → **Жіберу** → балл/пайыз/деңгей.
4. Келесі БЖБ-ға сол логин/парольмен қайта кіреді.

## Сұрақ түрлері

- **Бір жауапты** — 3–5 нұсқа, біреуі дұрыс.
- **Қысқа жауап** — дәл сәйкестік (trim + регистр ескерілмейді).
- **Ашық** — мұғалім `result.html`-да қолмен бағалайды.

## Бағалау

| Пайыз | Деңгей | Түс | Сипаттама |
|-------|--------|-----|-----------|
| 0–39% | Төмен | #FEE2E2 | Қосымша түсіндіру қажет |
| 40–64% | Орта | #FEF3C7 | Қайталау қажет |
| 65–84% | Жақсы | #DBEAFE | Көп бөлігі дұрыс, аздаған қате бар |
| 85–100% | Жоғары | #DCFCE7 | Тақырыпты жақсы меңгерген |

`js/utils.js → gradeAnswers()` — Cloud Function-қа көшіруге дайын бөлек функция.

## «Сайттан шықса — хабар»

- `student.html` тест кезінде `visibilitychange` + `blur` тыңдайды, 1с дебаунс, `events` + `leaveCount`/`totalAwayMs`.
- Оқушыға: «Сайттан шығу мұғалімге хабарланады».
- `result.html` `events`-ке `onSnapshot`: тост/баннер + Notification API («Хабарламаны қосу») + `speechSynthesis` `kk-KZ`→`ru-RU`→WebAudio beep, дауыс тумблері.

## Деректер моделі

```
assessments/{id}: ownerUid, type, subject, topic, durationSec, status, questions[], totalPoints, teacherName, createdAt
assessments/{id}/submissions/{subId}: studentId, studentUid, studentName, studentLogin, answers, score, percent, level, status, startedAt, submittedAt, leaveCount, totalAwayMs
assessments/{id}/events/{eventId}: submissionId, studentName, studentLogin, type, at
students/{id}: name, login (unique), password (plain, прототип), teacherUid, createdAt
```

## Firestore Rules қысқаша

- `students`: кез келген аутентификацияланған (anonymous та) оқи/жаза алады (прототип). Кейін мұғалімге шектеу қосуға болады.
- `assessments`: жарияланғанды кез келген аутентификацияланған оқиды, жобаны тек иесі.
- `submissions`/`events`: прототип — кез келген аутентификацияланған жаза/оқи алады, мұғалімнің нәтиже беті жұмыс істеуі үшін. Кейін `teacherUid`/`ownerUid` бойынша қатаңдатуға болады.

Толық: `firestore.rules`.

## Дизайн

Noto Sans, фон #F8FAFC, карточка ақ, жиек #E2E8F0, радиус 16/10px, көк #1D4ED8, жасыл #16A34A.

## Белгілі шектеулер (адал)

1. **Дұрыс жауап клиентте.** DevTools арқылы көрінеді — прототип үшін қабылданды, кейін Cloud Functions-қа көшіру.
2. **Хабар тек бет ашық кезде.** `result.html` жабық болса хабар келмейді — кейін FCM керек.
3. **Қазақ дауысы** барлық құрылғыда жоқ — `ru-RU` немесе дыбыс сигналына түседі.
4. **Кездейсоқ шығулар** болуы мүмкін — жүйе «көшірді» деп шешпейді, тек санақ пен уақыт көрсетеді.
5. **Оқушы паролі ашық мәтінде** (`students.password`). Прототип үшін ғана — кейін Firebase Auth-та сақтау керек. Firestore rules прототиптік (App Check жоқ).
6. **Оқушы логині ғаламдық бірегей** (барлық мұғалім арасында). Әр сыныпқа префикс қолдану ұсынылады (мысалы `8a_ayan`).
7. **Студенттер тізімі** `teacherUid == currentTeacher` бойынша сүзіледі — өздігінен тіркелген оқушының `teacherUid`-і БЖБ иесіне жазылады.

## Лицензия

Оқу/ғылыми жоба — еркін қолдануға болады.

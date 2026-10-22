# Локалды желіде тексеру — қадам-қадам

Бұл файл — телефоның/ноутбугың бір Wi-Fi-да болса, Firebaseсіз-ақ демо дерекпен тексеру нұсқаулығы.

## 1-нұсқа: Mock режим (интернетсіз, Firebase конфигсіз)

Mock — барлық дерек `localStorage`-та, Firebase қажет емес.

1. Браузерде аш:
   ```
   http://localhost:8000/index.html?mock=1
   ```
   Немесе кез келген бетке `?mock=1` қоссаң — автоматты қосылады. Өшіру: `?mock=0`.

2. Демо аккаунттар (mock ішінде дайын):
   - **Мұғалім:** `demo@mектеп.kz` / `demo1234`  (немесе Google батырмасы mock-та да жұмыс істейді)
   - **Оқушылар (мұғалім алдын ала қосқан):**
     - `ayan_8a` / `1111` — Аян Нұрланұлы
     - `aizere_8a` / `1111` — Айзере Берікқызы
     - `erasyl_8a` / `1111` — Ерасыл Қайратұлы
   - Жаңа оқушыны `student.html?a=ass_demo` бетінде **Тіркелу** арқылы қоса аласың.

3. Дайын БЖБ:
   - `ass_demo` — Математика / Квадрат теңдеулер (published, 3 сұрақ, 7 балл) — сілтеме: `student.html?a=ass_demo`
   - `ass_draft` — Физика / Механика (draft)

4. Тексеру сценарийі:
   - Ноутбукте: `index.html?mock=1` → мұғалім болып кір → **Оқушылар** қойындысын аш → 1 оқушы қос → **Менің БЖБ-ларым** → `Квадрат теңдеулер` → **Бөлісу** → сілтемені көшір
   - Телефонда (сол Wi-Fi): сілтемені аш → логин/парольмен кір → Бастау → басқа бетке шығып қайт → ноутбуктегі `result.html?a=ass_demo` бетінде тост+дыбыс шығу керек

5. Mock-ты басқару (браузер консолінде):
   ```js
   __SMART_BJB_MOCK__.db              // барлық дерек
   __SMART_BJB_MOCK__.export()        // JSON көшіру
   __SMART_BJB_MOCK__.reset()         // демоға қайтару
   __SMART_BJB_BACKUP__.downloadBackup() // бэкап JSON жүктеу
   localStorage.removeItem("smart-bjb:mock-db") // толық тазалау
   ```

## 2-нұсқа: Нақты Firebase-пен локалды желіде (телефоннан кіру)

1. `js/firebase-config.js` толтыр (Firebase Console → Project settings → Web app → Config).
2. Firebase Console → **Authentication → Sign-in method**: Google + Email/Password + Anonymous — үшеуін Enable.
3. **Firestore → Rules** → `firestore.rules` ішін Publish.
4. Серверді көтер — кез келген бірі:
   ```bash
   # Windows
   python -m http.server 8000
   # немесе
   npx serve
   # немесе екі рет басу: start-local.bat
   ```
5. Ноутбуктың локалды IP-ін біл:
   ```bash
   ipconfig
   # IPv4 Address. . . . . . . . . . . . : 192.168.x.x  ← осыны ал
   ```
6. Телефон сол Wi-Fi-да болса:
   ```
   http://192.168.x.x:8000/index.html
   http://192.168.x.x:8000/student.html?a=ASSESSMENT_ID
   ```
   Ескерту: Windows Firewall сұраса → **Allow access** бас.

7. Егер телефоннан ашылмаса:
   - Firewall → Inbound rules → Python/Node-ға рұқсат
   - Телефон мен ноутбук бір Wi-Fi-да ма тексер (мобильный интернет емес)
   - `http` (https емес) қолдан — локалды IP https талап етпейді

## Backup

- **Қолмен:** кез келген бетте консольде `__SMART_BJB_BACKUP__.downloadBackup()` — JSON жүктеледі.
- **Файлмен:** `backups/` папкасындағы `smart-bjb-backup-*.json` — үлгі.
- Қалпына келтіру: mock режимде `__SMART_BJB_MOCK__.import(jsonString)` немесе `localStorage` + Firestore-ға қолмен импорт.

## Порттар

- `8000` — `python -m http.server 8000`
- `3000` — `npx serve` (әдепкі)
- Басқа порт керек болса: `python -m http.server 8080` → `http://192.168.x.x:8080/...`
